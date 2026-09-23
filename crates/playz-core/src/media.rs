// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{contracts::{ExportMode,ExportRequest},error::{Error,Result},paths,process::{self,ProcessJob}};
use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::{ffi::OsString,path::{Path,PathBuf},sync::{Arc,atomic::{AtomicBool,AtomicU64,Ordering}},time::Duration};
use tokio::{io::{AsyncBufReadExt,AsyncReadExt,BufReader},time::{Instant,timeout}};

#[derive(Debug,Clone,Serialize,Deserialize)]
pub struct Probe {pub duration_ms:f64,pub width:u32,pub height:u32,pub video_codec:String,pub audio_codec:Option<String>,pub bytes:u64}
impl Probe {
    pub fn compatible(&self)->bool { self.video_codec=="h264" && self.audio_codec.as_deref().is_none_or(|a|a=="aac") }
}
#[derive(Clone)]pub struct Media {pub ffmpeg:PathBuf,pub ffprobe:PathBuf}
#[derive(Clone)]pub struct Control {pub cancel:Arc<AtomicBool>,pub pause:Arc<AtomicBool>,pub progress_ms:Arc<AtomicU64>}
impl Default for Control {fn default()->Self {Self{cancel:Arc::new(AtomicBool::new(false)),pause:Arc::new(AtomicBool::new(false)),progress_ms:Arc::new(AtomicU64::new(0))}}}
impl Media {
    pub fn new(runtime:&Path)->Self {Self{ffmpeg:runtime.join("media/ffmpeg.exe"),ffprobe:runtime.join("media/ffprobe.exe")}}
    pub async fn probe(&self,path:&Path)->Result<Probe> {
        let path=paths::existing_media(path)?;
        let mut command=process::command(&self.ffprobe)?;
        command.args(["-v","error","-protocol_whitelist","file,pipe","-format_whitelist","matroska,webm,mov,mp4,m4a,3gp,3g2,mj2","-show_entries","format=duration:stream=codec_type,codec_name,width,height","-of","json"]).arg(&path);
        let mut child=command.spawn()?; let _job=ProcessJob::attach(&child)?;
        let stderr=process::discard_stderr(child.stderr.take().ok_or("Probe diagnostic stream is missing")?);
        let output=child.stdout.take().ok_or("Probe response stream is missing")?;
        let result=timeout(Duration::from_secs(20),async {
            let bytes=process::read_bounded(output,1024*1024).await?;
            let status=child.wait().await?;
            if !status.success(){return Err("Media could not be probed. The original is preserved; it may be incomplete or use unsupported codecs.".into());}
            let value:Value=serde_json::from_slice(&bytes)?;
            let streams=value["streams"].as_array().ok_or("Media has no stream information")?;
            let video=streams.iter().find(|s|s["codec_type"]=="video").ok_or("Media contains no video stream")?;
            let audio=streams.iter().find(|s|s["codec_type"]=="audio");
            let seconds=value["format"]["duration"].as_str().and_then(|v|v.parse::<f64>().ok()).ok_or("Media has no usable finalized duration. Recovery may be required.")?;
            let width=video["width"].as_u64().unwrap_or(0); let height=video["height"].as_u64().unwrap_or(0);
            if !seconds.is_finite() || seconds<=0.0 || seconds>172800.0 || width==0 || height==0 || width>16384 || height>16384 {return Err("Media dimensions or duration exceed supported limits".into());}
            Ok(Probe{duration_ms:seconds*1000.0,width:width as u32,height:height as u32,video_codec:video["codec_name"].as_str().unwrap_or("unknown").into(),audio_codec:audio.and_then(|a|a["codec_name"].as_str()).map(str::to_owned),bytes:std::fs::metadata(&path)?.len()})
        }).await;
        stderr.abort();
        match result {Ok(v)=>v,Err(_)=>{let _=child.kill().await;Err("Media inspection timed out; no original file was modified".into())}}
    }
    pub async fn run(&self,args:Vec<OsString>,control:Control)->Result<()> {
        let mut command=process::command(&self.ffmpeg)?;
        command.args(["-hide_banner","-nostdin","-loglevel","error","-nostats","-progress","pipe:1","-n"]).args(args);
        let mut child=command.spawn()?; let _job=ProcessJob::attach(&child)?;
        let stderr=process::discard_stderr(child.stderr.take().ok_or("Media diagnostic stream is missing")?);
        let output=child.stdout.take().ok_or("Media progress stream is missing")?;
        let progress=control.progress_ms.clone();
        let reader=tokio::spawn(async move {
            let mut reader=BufReader::new(output);
            loop {
                let mut line=Vec::new();
                let read=reader.by_ref().take(8193).read_until(b'\n',&mut line).await?;
                if read==0 {break;}
                if line.len()>8192 {return Err(Error::Message("Media progress line exceeded 8 KiB".into()));}
                if let Some(value)=String::from_utf8_lossy(&line).trim().strip_prefix("out_time_us=") {
                    if let Ok(us)=value.parse::<u64>() {progress.store(us/1000,Ordering::Relaxed);}
                }
            }
            Ok::<(),Error>(())
        });
        let deadline=Instant::now()+Duration::from_secs(12*60*60);
        let result=loop {
            if control.cancel.load(Ordering::Relaxed){let _=child.kill().await;break Err(Error::Cancelled);}
            if control.pause.load(Ordering::Relaxed){let _=child.kill().await;break Err(Error::Paused);}
            if Instant::now()>deadline{let _=child.kill().await;break Err(Error::Message("Media job exceeded its deadline".into()));}
            if let Some(status)=child.try_wait()?{break if status.success(){Ok(())}else{Err(Error::Message(format!("Media processing failed (exit {}). The original was not changed.",status.code().unwrap_or(-1))))};}
            tokio::time::sleep(Duration::from_millis(100)).await;
        };
        stderr.abort();
        if result.is_err(){reader.abort();return result;}
        reader.await.map_err(|_|Error::Message("Media progress reader failed".into()))??;
        result
    }
    pub async fn remux(&self,master:&Path,output:&Path)->Result<Probe> {
        let source=self.probe(master).await?;
        if !source.compatible(){return Err("This profile requires H.264 video and AAC audio for offline playback. Original preserved; unsupported conversion was not silently applied.".into());}
        if output.exists(){let existing=self.probe(output).await?;if (existing.duration_ms-source.duration_ms).abs()<1000.0{return Ok(existing);}return Err("Existing playback asset does not match its master. Preserve it and inspect the recording folder.".into());}
        let temporary=output.with_file_name(format!("playback-{}.tmp.mp4",uuid::Uuid::new_v4()));
        let args=remux_arguments(master,&temporary);
        let result=self.run(args,Control::default()).await;
        if result.is_err(){let _=tokio::fs::remove_file(&temporary).await;return result.and(Ok(source));}
        let probe=self.probe(&temporary).await?;
        if !probe.compatible() || (probe.duration_ms-source.duration_ms).abs()>1000.0{return Err("Remux validation failed; the original master remains intact".into());}
        paths::finalize_new(&temporary,output)?;
        Ok(probe)
    }
    pub async fn export(&self,master:&Path,output:&Path,temporary:&Path,request:&ExportRequest,control:Control)->Result<Probe> {
        let source=self.probe(master).await?; request.validate(source.duration_ms)?;
        if !source.compatible(){return Err("This first build exports H.264/AAC sources only".into());}
        if output.exists(){
            let existing=self.probe(output).await?;
            validate_export(&existing,request)?;
            return Ok(existing);
        }
        if temporary.exists(){tokio::fs::remove_file(temporary).await?;}
        self.run(export_arguments(master,temporary,request),control).await?;
        let probe=self.probe(temporary).await?;
        validate_export(&probe,request)?;
        paths::finalize_new(temporary,output)?;
        Ok(probe)
    }
}
fn strings(values:&[&str])->Vec<OsString>{values.iter().map(OsString::from).collect()}
fn input_arguments(master:&Path)->Vec<OsString>{let mut a=strings(&["-protocol_whitelist","file,pipe","-format_whitelist","matroska,webm,mov,mp4,m4a,3gp,3g2,mj2","-i"]);a.push(master.as_os_str().to_owned());a}
pub fn remux_arguments(master:&Path,temporary:&Path)->Vec<OsString>{let mut a=input_arguments(master);a.extend(strings(&["-map","0:v:0","-map","0:a:0?","-c","copy","-movflags","+faststart","-f","mp4"]));a.push(temporary.as_os_str().to_owned());a}
pub fn export_arguments(master:&Path,temporary:&Path,r:&ExportRequest)->Vec<OsString>{
    let mut a=strings(&["-ss",&format!("{:.6}",r.start_ms/1000.0)]);
    a.extend(input_arguments(master));
    a.extend(strings(&["-t",&format!("{:.6}",(r.end_ms-r.start_ms)/1000.0),"-map","0:v:0","-map","0:a:0?","-map_metadata","-1"]));
    match r.mode {
        ExportMode::Accurate=>a.extend(strings(&["-c:v","libx264","-preset","fast","-crf","20","-pix_fmt","yuv420p","-threads","2","-c:a","aac","-b:a","192k","-ar","48000","-ac","2"])),
        ExportMode::Fast=>a.extend(strings(&["-c","copy","-avoid_negative_ts","make_zero"])),
    }
    a.extend(strings(&["-movflags","+faststart","-f","mp4"]));a.push(temporary.as_os_str().to_owned());a
}
fn validate_export(probe:&Probe,r:&ExportRequest)->Result<()> {
    let tolerance=match r.mode{ExportMode::Accurate=>350.0,ExportMode::Fast=>5000.0};
    if !probe.compatible() || (probe.duration_ms-(r.end_ms-r.start_ms)).abs()>tolerance {return Err("Export output did not pass codec/duration validation. Temporary file was preserved for diagnosis.".into());}
    Ok(())
}
#[cfg(test)]mod tests{
    use super::*;
    fn request()->ExportRequest{ExportRequest{recording_id:uuid::Uuid::new_v4().to_string(),start_ms:1234.0,end_ms:9876.0,mode:ExportMode::Accurate,name:"clip".into()}}
    #[test]fn accurate_uses_reencode_and_no_shell(){let a=export_arguments(Path::new("C:/Videos/my game.mkv"),Path::new("C:/Videos/out.mp4"),&request());assert!(a.contains(&"libx264".into()));assert!(a.contains(&"file,pipe".into()));assert!(a.contains(&"C:/Videos/my game.mkv".into()));assert!(!a.contains(&"-y".into()));}
    #[test]fn fast_is_explicit_copy(){let mut r=request();r.mode=ExportMode::Fast;let a=export_arguments(Path::new("x.mkv"),Path::new("y.mp4"),&r);assert!(a.contains(&"copy".into()));assert!(!a.contains(&"libx264".into()));}
}
