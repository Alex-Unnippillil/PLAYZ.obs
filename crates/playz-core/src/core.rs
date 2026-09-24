// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    contracts::*,
    error::{Error, Result},
    library::{Library, StoredJob},
    media::{Control, Media},
    paths,
    recorder::Recorder,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{
        Arc, RwLock,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize)]
struct Manifest {
    schema_version: u32,
    recording: Recording,
    master_name: String,
    playback_name: Option<String>,
}

pub struct Core {
    pub library: Library,
    pub media: Media,
    runtime: PathBuf,
    data_folder: PathBuf,
    snapshot: RwLock<Snapshot>,
    operation: Mutex<()>,
    recorder: Mutex<Option<Recorder>>,
    media_gate: Mutex<()>,
    busy: Arc<AtomicBool>,
    closing: AtomicBool,
    approved_folders: Mutex<HashSet<PathBuf>>,
    running_job: Mutex<Option<(String, Control)>>,
}
impl Core {
    pub async fn open(
        runtime: PathBuf,
        data_folder: PathBuf,
        videos: PathBuf,
    ) -> Result<Arc<Self>> {
        paths::writable_folder(&data_folder)?;
        let library = Library::open(data_folder.join("library.sqlite3")).await?;
        let settings = library
            .settings(Settings::new(videos.to_string_lossy().to_string()))
            .await?;
        library.reconcile_states().await?;
        let free = fs2::available_space(Path::new(&settings.recording_folder)).unwrap_or(0);
        let approved = HashSet::from([PathBuf::from(&settings.recording_folder)]);
        let core = Arc::new(Self {
            library,
            media: Media::new(&runtime),
            runtime,
            data_folder,
            snapshot: RwLock::new(Snapshot {
                phase: Phase::Idle,
                recording_id: None,
                elapsed_ms: 0.0,
                written_bytes: "0".into(),
                free_bytes: free.to_string(),
                error: None,
                capture_warning: None,
                engine_connected: false,
                settings,
            }),
            operation: Mutex::new(()),
            recorder: Mutex::new(None),
            media_gate: Mutex::new(()),
            busy: Arc::new(AtomicBool::new(false)),
            closing: AtomicBool::new(false),
            approved_folders: Mutex::new(approved),
            running_job: Mutex::new(None),
        });
        core.reconcile_manifests().await?;
        Ok(core)
    }
    pub fn snapshot(&self) -> Snapshot {
        self.snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
    fn change(&self, f: impl FnOnce(&mut Snapshot)) {
        f(&mut self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner));
    }
    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::Acquire)
    }
    pub fn spawn_workers(self: &Arc<Self>) {
        let weak = Arc::downgrade(self);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let Some(core) = weak.upgrade() else {
                    break;
                };
                if core.closing.load(Ordering::Acquire) {
                    break;
                }
                core.heartbeat().await;
            }
        });
        let weak = Arc::downgrade(self);
        tokio::spawn(async move {
            loop {
                let Some(core) = weak.upgrade() else {
                    break;
                };
                if core.closing.load(Ordering::Acquire) {
                    break;
                }
                if !core.is_busy() {
                    if let Err(e) = core.work_one_export().await {
                        tracing::warn!(kind="export_worker",error=%redact_error(&e),"Export worker operation failed");
                    }
                }
                drop(core);
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
        });
    }
    async fn connect(&self, recorder: &mut Option<Recorder>) -> Result<()> {
        if recorder.as_ref().is_some_and(|r| !r.healthy()) {
            if let Some(mut old) = recorder.take() {
                old.shutdown().await;
            }
        }
        if recorder.is_none() {
            *recorder = Some(Recorder::spawn(
                &self.runtime.join("obs/bin/64bit/playz-recorder.exe"),
            )?);
        }
        Ok(())
    }
    pub async fn capabilities(&self) -> Result<Capabilities> {
        if self.is_busy() {
            return Err("Refresh devices after the current recording is finalized".into());
        }
        let mut recorder = self.recorder.lock().await;
        self.connect(&mut recorder).await?;
        let result = recorder
            .as_mut()
            .ok_or("Recorder could not start")?
            .capabilities()
            .await;
        self.change(|s| s.engine_connected = result.is_ok());
        result
    }
    pub async fn authorize_folder(&self, folder: PathBuf) -> Result<String> {
        if self.is_busy() {
            return Err("Change the recording folder after recording has stopped".into());
        }
        let folder = tokio::task::spawn_blocking(move || paths::writable_folder(&folder))
            .await
            .map_err(|_| Error::Message("Folder validation failed".into()))??;
        self.approved_folders.lock().await.insert(folder.clone());
        Ok(folder.to_string_lossy().to_string())
    }
    pub async fn save_settings(&self, settings: Settings) -> Result<Settings> {
        let _operation = self.operation.lock().await;
        if self.is_busy() {
            return Err(
                "Settings take effect on the next recording; stop first before changing them"
                    .into(),
            );
        }
        settings.validate()?;
        let path = PathBuf::from(&settings.recording_folder);
        if !self.approved_folders.lock().await.contains(&path) {
            return Err("Select the recording folder using the native folder picker".into());
        }
        self.library.save_settings(settings.clone()).await?;
        self.change(|s| s.settings = settings.clone());
        Ok(settings)
    }
    pub async fn start(&self, request_id: String) -> Result<Snapshot> {
        paths::validate_id(&request_id)?;
        let _operation = self.operation.lock().await;
        if self.closing.load(Ordering::Acquire) {
            return Err("PLAYZ is shutting down".into());
        }
        if self.library.by_request(request_id.clone()).await?.is_some() || self.is_busy() {
            return Ok(self.snapshot());
        }
        let settings = self.snapshot().settings;
        settings.validate()?;
        if settings.target_id.is_empty() {
            return Err("Select a specific game or window in Capture settings first".into());
        }
        self.busy.store(true, Ordering::Release);
        self.change(|s| {
            s.phase = Phase::Preparing;
            s.recording_id = None;
            s.elapsed_ms = 0.0;
            s.written_bytes = "0".into();
            s.error = None;
            s.capture_warning = None;
        });
        let _media = self.media_gate.lock().await; // an export sees busy and exits before capture starts
        let result = self.start_inner(request_id, settings).await;
        if let Err(e) = &result {
            self.fail_current(e).await;
        }
        result.map(|_| self.snapshot())
    }
    async fn start_inner(&self, request_id: String, settings: Settings) -> Result<()> {
        let folder = PathBuf::from(&settings.recording_folder);
        let folder = tokio::task::spawn_blocking(move || paths::writable_folder(&folder))
            .await
            .map_err(|_| Error::Message("Recording folder check failed".into()))??;
        let free = fs2::available_space(&folder)?;
        if free < paths::reserve_bytes(settings.reserve_gib, settings.bitrate_kbps) {
            return Err("Insufficient free space for the configured recording reserve. Free space or choose another folder.".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        let directory = folder.join(&id);
        tokio::fs::create_dir(&directory).await?;
        let master = directory.join("master.mkv");
        let record = Recording {
            id: id.clone(),
            title: format!(
                "{} · {}",
                if settings.target_label.is_empty() {
                    "Recording"
                } else {
                    &settings.target_label
                },
                chrono::Local::now().format("%b %d, %H:%M")
            ),
            created_at: chrono::Utc::now().to_rfc3339(),
            phase: Phase::Preparing,
            duration_ms: 0.0,
            bytes: "0".into(),
            favorite: false,
            tags: vec![],
            notes: String::new(),
            source_label: settings.target_label.clone(),
            capture_kind: settings.capture_kind.clone(),
            has_playback: false,
            resume_ms: 0.0,
            error: None,
        };
        self.library
            .insert(record, request_id, master.clone())
            .await?;
        self.change(|s| {
            s.recording_id = Some(id.clone());
            s.free_bytes = free.to_string();
        });
        self.write_manifest(&id).await?;
        let mut recorder = self.recorder.lock().await;
        self.connect(&mut recorder).await?;
        let value=recorder.as_mut().ok_or("Recorder is unavailable")?.request("start",json!({"session_id":id,"kind":settings.capture_kind,"target_id":settings.target_id,"width":settings.width,"height":settings.height,"fps":settings.fps,"bitrate_kbps":settings.bitrate_kbps,"encoder_id":settings.encoder_id,"desktop_audio":settings.desktop_audio,"audio_output_id":settings.audio_output_id,"microphone_id":settings.microphone_id,"path":master.to_string_lossy()}),40).await?;
        if value["active"] != true
            || value["started"] != true
            || parse_counter(&value, "frames") == 0
            || parse_counter(&value, "bytes") == 0
        {
            return Err(
                "Recorder did not confirm encoded output; recording was not marked healthy".into(),
            );
        }
        let elapsed = value["media_ms"].as_f64().unwrap_or(0.0);
        self.library
            .lifecycle(
                id.clone(),
                Phase::Recording,
                None,
                Some(elapsed),
                Some(parse_counter(&value, "bytes")),
                None,
            )
            .await?;
        self.change(|s| {
            s.phase = Phase::Recording;
            s.elapsed_ms = elapsed;
            s.written_bytes = parse_counter(&value, "bytes").to_string();
            s.engine_connected = true;
        });
        drop(recorder);
        self.write_manifest(&id).await?;
        Ok(())
    }
    async fn fail_current(&self, error: &Error) {
        let message = error.to_string();
        let id = self.snapshot().recording_id;
        if let Some(id) = id {
            let _ = self
                .library
                .lifecycle(
                    id.clone(),
                    Phase::Interrupted,
                    Some(message.clone()),
                    None,
                    None,
                    None,
                )
                .await;
            let _ = self.write_manifest(&id).await;
        }
        let mut recorder = self.recorder.lock().await;
        if let Some(mut native) = recorder.take() {
            native.shutdown().await;
        }
        self.change(|s| {
            s.phase = if s.recording_id.is_some() {
                Phase::Interrupted
            } else {
                Phase::Failed
            };
            s.error = Some(message);
            s.engine_connected = false;
        });
        self.busy.store(false, Ordering::Release);
    }
    pub async fn stop(&self) -> Result<Snapshot> {
        let _operation = self.operation.lock().await;
        if !matches!(self.snapshot().phase, Phase::Recording | Phase::Preparing) {
            return Ok(self.snapshot());
        }
        let id = self
            .snapshot()
            .recording_id
            .ok_or("No recording is active")?;
        self.change(|s| s.phase = Phase::Finalizing);
        // A failed lifecycle transaction must enter the same cleanup path as
        // recorder/finalization failures, not leave capture busy indefinitely.
        let result = async {
            self.library
                .lifecycle(id.clone(), Phase::Finalizing, None, None, None, None)
                .await?;
            self.stop_inner(&id).await
        }
        .await;
        if let Err(e) = &result {
            self.fail_current(e).await;
        } else {
            self.busy.store(false, Ordering::Release);
        }
        result.map(|_| self.snapshot())
    }
    async fn stop_inner(&self, id: &str) -> Result<()> {
        let mut recorder = self.recorder.lock().await;
        if let Some(native) = recorder.as_mut() {
            native.request("stop", json!({}), 30).await?;
            native.shutdown().await;
        } else {
            return Err(
                "Recorder connection was lost; use Recover on the interrupted recording".into(),
            );
        }
        *recorder = None;
        drop(recorder);
        let _media = self.media_gate.lock().await;
        self.finalize_recording(id).await?;
        self.change(|s| {
            s.phase = Phase::Ready;
            s.engine_connected = false;
            s.error = None;
            s.capture_warning = None;
        });
        Ok(())
    }
    async fn finalize_recording(&self, id: &str) -> Result<()> {
        let recording = self.library.get(id.to_owned()).await?;
        let master = paths::existing_media(&recording.master)?;
        let source = self.media.probe(&master).await?;
        let output = master
            .parent()
            .ok_or("Recording directory is missing")?
            .join("playback.mp4");
        let playback = self.media.remux(&master, &output).await?;
        self.library
            .lifecycle(
                id.to_owned(),
                Phase::Ready,
                None,
                Some(playback.duration_ms),
                Some(source.bytes),
                Some(output),
            )
            .await?;
        self.write_manifest(id).await?;
        self.change(|s| {
            if s.recording_id.as_deref() == Some(id) {
                s.elapsed_ms = playback.duration_ms;
                s.written_bytes = source.bytes.to_string();
            }
        });
        Ok(())
    }
    pub async fn recover(&self, id: String) -> Result<Recording> {
        paths::validate_id(&id)?;
        let _operation = self.operation.lock().await;
        if self.is_busy() {
            return Err("Recover media after recording and finalization have stopped".into());
        }
        self.busy.store(true, Ordering::Release);
        let _media = self.media_gate.lock().await;
        let result = self.finalize_recording(&id).await;
        self.busy.store(false, Ordering::Release);
        if let Err(e) = &result {
            self.library
                .lifecycle(
                    id.clone(),
                    Phase::Interrupted,
                    Some(e.to_string()),
                    None,
                    None,
                    None,
                )
                .await?;
        }
        result?;
        Ok(self.library.get(id).await?.view)
    }
    pub async fn import_file(&self, source: PathBuf) -> Result<Recording> {
        let _operation = self.operation.lock().await;
        if self.is_busy() {
            return Err("Import media after recording has stopped".into());
        }
        let source = paths::existing_media(&source)?;
        let probe = self.media.probe(&source).await?;
        if !probe.compatible() {
            return Err("Import currently supports H.264 video with optional AAC audio".into());
        }
        self.busy.store(true, Ordering::Release);
        let _media = self.media_gate.lock().await;
        let result = async {
            let root =
                paths::writable_folder(Path::new(&self.snapshot().settings.recording_folder))?;
            if fs2::available_space(&root)?
                < probe
                    .bytes
                    .saturating_mul(2)
                    .saturating_add(1024 * 1024 * 1024)
            {
                return Err("Import needs space for a preserved master and playback asset".into());
            }
            let id = uuid::Uuid::new_v4().to_string();
            let folder = root.join(&id);
            tokio::fs::create_dir(&folder).await?;
            let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("mp4");
            let master = folder.join(format!("master.{extension}"));
            let record = Recording {
                id: id.clone(),
                title: source
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .chars()
                    .take(150)
                    .collect(),
                created_at: chrono::Utc::now().to_rfc3339(),
                phase: Phase::Preparing,
                duration_ms: 0.0,
                bytes: "0".into(),
                favorite: false,
                tags: vec![],
                notes: String::new(),
                source_label: "Imported local media".into(),
                capture_kind: "import".into(),
                has_playback: false,
                resume_ms: 0.0,
                error: None,
            };
            self.library
                .insert(record, uuid::Uuid::new_v4().to_string(), master.clone())
                .await?;
            self.write_manifest(&id).await?;
            tokio::fs::copy(&source, &master).await?;
            self.finalize_recording(&id).await?;
            Ok::<Recording, Error>(self.library.get(id).await?.view)
        }
        .await;
        self.busy.store(false, Ordering::Release);
        result
    }
    pub async fn playback_path(&self, id: String) -> Result<PathBuf> {
        paths::validate_id(&id)?;
        let r = self.library.get(id).await?;
        paths::existing_media(
            &r.playback
                .ok_or("Playback is not ready. Stop or recover the recording first.")?,
        )
    }
    pub async fn master_path(&self, id: String) -> Result<PathBuf> {
        paths::validate_id(&id)?;
        paths::existing_media(&self.library.get(id).await?.master)
    }
    pub async fn export_path(&self, id: String) -> Result<PathBuf> {
        paths::validate_id(&id)?;
        let job = self.library.job(id).await?;
        if job.view.state != "completed" {
            return Err("This export has not completed".into());
        }
        paths::existing_media(&job.output)
    }
    pub async fn edit_details(&self, id: String, details: Details) -> Result<()> {
        paths::validate_id(&id)?;
        self.library.details(id.clone(), details).await?;
        self.write_manifest(&id).await
    }
    pub async fn save_bookmark(&self, bookmark: Bookmark) -> Result<Bookmark> {
        paths::validate_id(&bookmark.id)?;
        paths::validate_id(&bookmark.recording_id)?;
        let recording = self.library.get(bookmark.recording_id.clone()).await?;
        let snapshot = self.snapshot();
        let maximum = if snapshot.recording_id.as_deref() == Some(&bookmark.recording_id)
            && snapshot.phase == Phase::Recording
        {
            snapshot.elapsed_ms + 1000.0
        } else {
            recording.view.duration_ms
        };
        if bookmark.position_ms > maximum {
            return Err("Bookmark is outside recorded coverage".into());
        }
        self.library.bookmark(bookmark).await
    }
    pub async fn live_bookmark(&self) -> Result<Bookmark> {
        let snapshot = self.snapshot();
        if snapshot.phase != Phase::Recording {
            return Err("Start recording before using the live bookmark shortcut".into());
        }
        let id = snapshot.recording_id.ok_or("No recording is active")?;
        let mut recorder = self.recorder.lock().await;
        let value = recorder
            .as_mut()
            .ok_or("Recorder is unavailable")?
            .status()
            .await?;
        if value["active"] != true {
            return Err("Recorder output is no longer active".into());
        }
        let ms = value["media_ms"]
            .as_f64()
            .ok_or("Recorder timeline is unavailable")?;
        self.library.bookmark(Bookmark{id:uuid::Uuid::new_v4().to_string(),recording_id:id,position_ms:ms,label:format!("Bookmark {}",format_time(ms)),note:"Live marker uses encoded-frame elapsed time; hardware timestamp calibration is not yet validated.".into()}).await
    }
    pub async fn relink(&self, id: String, source: PathBuf) -> Result<()> {
        paths::validate_id(&id)?;
        let _operation = self.operation.lock().await;
        if self.is_busy() {
            return Err("Relink after recording has stopped".into());
        }
        let source = paths::registered_relink(&id, &source)?;
        let probe = self.media.probe(&source).await?;
        if !probe.compatible() {
            return Err("Relink requires a compatible H.264/AAC master".into());
        }
        self.library.relink(id, source).await
    }
    pub async fn queue_export(&self, request: ExportRequest) -> Result<ExportJob> {
        paths::validate_id(&request.recording_id)?;
        let recording = self.library.get(request.recording_id.clone()).await?;
        if recording.view.phase != Phase::Ready {
            return Err("Finalize or recover this recording before exporting".into());
        }
        request.validate(recording.view.duration_ms)?;
        paths::existing_media(&recording.master)?;
        let id = uuid::Uuid::new_v4().to_string();
        let folder = recording
            .master
            .parent()
            .ok_or("Recording folder is missing")?
            .join("exports");
        paths::writable_folder(&folder)?;
        let output = folder.join(format!("{}-{}.mp4", request.name.trim(), &id[..8]));
        let temporary = folder.join(format!(".{id}.tmp.mp4"));
        let job = ExportJob {
            id: id.clone(),
            recording_id: request.recording_id,
            state: "queued".into(),
            mode: request.mode,
            start_ms: request.start_ms,
            end_ms: request.end_ms,
            name: output
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            progress: 0.0,
            error: None,
        };
        self.library
            .enqueue(StoredJob {
                view: job.clone(),
                output,
                temporary,
            })
            .await?;
        Ok(job)
    }
    pub async fn cancel_export(&self, id: String) -> Result<()> {
        paths::validate_id(&id)?;
        let running = self.running_job.lock().await;
        if let Some((running_id, control)) = &*running {
            if running_id == &id {
                control.cancel.store(true, Ordering::Release);
                return Ok(());
            }
        }
        let job = self.library.job(id.clone()).await?;
        if matches!(job.view.state.as_str(), "queued" | "running") {
            self.library
                .job_state(id, "cancelled", job.view.progress, None)
                .await?;
        }
        Ok(())
    }
    pub async fn retry_export(&self, id: String) -> Result<()> {
        paths::validate_id(&id)?;
        let job = self.library.job(id.clone()).await?;
        if !matches!(job.view.state.as_str(), "failed" | "cancelled") {
            return Err("Only a failed or cancelled export can be retried".into());
        }
        self.library.job_state(id, "queued", 0.0, None).await
    }
    async fn work_one_export(&self) -> Result<()> {
        let Some(job) = self.library.claim_job().await? else {
            return Ok(());
        };
        let id = job.view.id.clone();
        let control = Control {
            pause: self.busy.clone(),
            ..Control::default()
        };
        {
            let mut running = self.running_job.lock().await;
            *running = Some((id.clone(), control.clone()));
            if self.library.job(id.clone()).await?.view.state == "cancelled" {
                control.cancel.store(true, Ordering::Release);
            }
        }
        let _gate = self.media_gate.lock().await;
        let result=async{
            if control.pause.load(Ordering::Acquire){return Err(Error::Paused);}
            let record=self.library.get(job.view.recording_id.clone()).await?;
            let request=ExportRequest{recording_id:record.view.id,start_ms:job.view.start_ms,end_ms:job.view.end_ms,mode:job.view.mode.clone(),name:"export".into()};
            let process=self.media.export(&record.master,&job.output,&job.temporary,&request,control.clone());tokio::pin!(process);
            loop{tokio::select!{
                result=&mut process=>{result?;break;},
                _=tokio::time::sleep(Duration::from_millis(700))=>{
                    let progress=(control.progress_ms.load(Ordering::Relaxed) as f64/(request.end_ms-request.start_ms)*100.0).clamp(0.0,99.5);
                    self.library.job_state(id.clone(),"running",progress,None).await?;
                }
            }}Ok::<(),Error>(())
        }.await;
        *self.running_job.lock().await = None;
        match result {
            Ok(()) => self.library.job_state(id, "completed", 100.0, None).await?,
            Err(Error::Cancelled) => {
                let _ = tokio::fs::remove_file(&job.temporary).await;
                self.library.job_state(id, "cancelled", 0.0, None).await?;
            }
            Err(Error::Paused) => {
                let _ = tokio::fs::remove_file(&job.temporary).await;
                self.library.job_state(id,"queued",0.0,Some("Paused for recording. The export restarts from its trim-in, not a byte offset.".into())).await?;
            }
            Err(e) => {
                self.library
                    .job_state(id, "failed", 0.0, Some(e.to_string()))
                    .await?
            }
        }
        Ok(())
    }
    async fn heartbeat(&self) {
        let snapshot = self.snapshot();
        if snapshot.phase != Phase::Recording {
            return;
        }
        let result = {
            let mut recorder = self.recorder.lock().await;
            match recorder.as_mut() {
                Some(r) => r.status().await,
                None => Err("Recorder is missing".into()),
            }
        };
        match result {
            Ok(value) => {
                if value["active"] != true {
                    let _operation = self.operation.lock().await;
                    if self.snapshot().phase == Phase::Recording {
                        self.fail_current(&Error::Message("Recorder stopped unexpectedly. The MKV master is preserved; use Recover.".into())).await;
                    }
                    return;
                }
                let free = fs2::available_space(Path::new(&snapshot.settings.recording_folder))
                    .unwrap_or(0);
                self.change(|s|{s.elapsed_ms=value["media_ms"].as_f64().unwrap_or(s.elapsed_ms);s.written_bytes=parse_counter(&value,"bytes").to_string();s.free_bytes=free.to_string();s.capture_warning=if value["video_width"].as_u64().unwrap_or(0)==0{Some("Selected target is unavailable. Capture was not widened to your desktop.".into())}else{None};});
                if free
                    < paths::reserve_bytes(
                        snapshot.settings.reserve_gib,
                        snapshot.settings.bitrate_kbps,
                    )
                {
                    self.change(|s| {
                        s.capture_warning = Some(
                            "Low disk space: stopping safely before the reserve is exhausted"
                                .into(),
                        )
                    });
                    let _ = self.stop().await;
                }
            }
            Err(e) => {
                let _operation = self.operation.lock().await;
                if self.snapshot().phase == Phase::Recording {
                    self.fail_current(&e).await;
                }
            }
        }
    }
    async fn write_manifest(&self, id: &str) -> Result<()> {
        let stored = self.library.get(id.to_owned()).await?;
        let path = stored
            .master
            .parent()
            .ok_or("Recording has no directory")?
            .join("manifest.json");
        let manifest = Manifest {
            schema_version: 1,
            master_name: stored
                .master
                .file_name()
                .ok_or("Missing master filename")?
                .to_string_lossy()
                .to_string(),
            playback_name: stored
                .playback
                .as_ref()
                .and_then(|p| p.file_name())
                .map(|s| s.to_string_lossy().to_string()),
            recording: stored.view,
        };
        tokio::task::spawn_blocking(move || paths::atomic_json(&path, &manifest))
            .await
            .map_err(|_| Error::Message("Manifest write worker failed".into()))?
    }
    async fn reconcile_manifests(&self) -> Result<()> {
        let root = PathBuf::from(&self.snapshot().settings.recording_folder);
        if !root.is_dir() {
            return Ok(());
        }
        paths::local_path(&root)?;
        let mut entries = tokio::fs::read_dir(&root).await?;
        let mut scanned = 0;
        while let Some(entry) = entries.next_entry().await? {
            scanned += 1;
            if scanned > 20000 {
                break;
            }
            if !entry.file_type().await?.is_dir() {
                continue;
            }
            let directory = entry.path();
            if paths::local_path(&directory).is_err() {
                continue;
            }
            let manifest_path = directory.join("manifest.json");
            let metadata = match tokio::fs::metadata(&manifest_path).await {
                Ok(v) => v,
                Err(_) => continue,
            };
            if metadata.len() > 262144 {
                continue;
            }
            let manifest: Manifest = match tokio::fs::read(&manifest_path)
                .await
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
            {
                Some(v) => v,
                None => continue,
            };
            if manifest.schema_version != 1
                || paths::validate_id(&manifest.recording.id).is_err()
                || directory.file_name().and_then(|s| s.to_str()) != Some(&manifest.recording.id)
                || !matches!(manifest.master_name.as_str(), "master.mkv" | "master.mp4")
            {
                continue;
            }
            let master = directory.join(&manifest.master_name);
            if !master.is_file() {
                continue;
            }
            match self.library.get(manifest.recording.id.clone()).await {
                Ok(_) => {}
                Err(Error::Database(rusqlite::Error::QueryReturnedNoRows)) => {
                    let mut view = manifest.recording;
                    view.phase = Phase::Interrupted;
                    view.error=Some("Rediscovered from local manifest. Recover to validate and rebuild playback.".into());
                    let id = view.id.clone();
                    self.library
                        .insert(view.clone(), uuid::Uuid::new_v4().to_string(), master)
                        .await?;
                    self.library
                        .details(
                            id.clone(),
                            Details {
                                title: view.title,
                                favorite: view.favorite,
                                tags: view.tags,
                                notes: view.notes,
                            },
                        )
                        .await?;
                    self.library
                        .lifecycle(
                            id,
                            Phase::Interrupted,
                            view.error,
                            Some(view.duration_ms),
                            None,
                            None,
                        )
                        .await?;
                }
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }
    pub async fn backup(&self) -> Result<PathBuf> {
        let folder = self.data_folder.join("backups");
        paths::writable_folder(&folder)?;
        self.library
            .backup(folder.join(format!("playz-{}.sqlite3", uuid::Uuid::new_v4())))
            .await
    }
    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        let snapshot = self.snapshot();
        let mut result=vec![Diagnostic{name:"SQLite runtime".into(),status:"ok".into(),detail:format!("{} · WAL · FULL durability · dedicated bounded writer",rusqlite::version())},Diagnostic{name:"Privacy".into(),status:"ok".into(),detail:"No application network client, telemetry, account, cloud sync or runtime downloads.".into()},Diagnostic{name:"Hardware acceptance".into(),status:"pending".into(),detail:"This is an unsigned local test build. Windows 11 clean-install, GPU capture and sustained-recording acceptance must be recorded on real hardware.".into()},Diagnostic{name:"League automation".into(),status:"not_enabled".into(),detail:"Clock/candidate logic is unit-tested separately. Automatic League recording, TLS trust and real-session validation are not implemented in this first local build.".into()},Diagnostic{name:"Recording storage".into(),status:if snapshot.free_bytes=="0"{"attention"}else{"ok"}.into(),detail:format!("{} bytes available at the last check. Originals are never deleted automatically.",snapshot.free_bytes)}];
        for (name, path) in [
            (
                "OBS recorder",
                self.runtime.join("obs/bin/64bit/playz-recorder.exe"),
            ),
            ("FFmpeg", self.media.ffmpeg.clone()),
            ("ffprobe", self.media.ffprobe.clone()),
        ] {
            result.push(Diagnostic{name:name.into(),status:if path.is_file(){"present"}else{"missing"}.into(),detail:if path.is_file(){"Bundled executable is present; this does not establish hardware capture success."}else{"Run the native bootstrap on the build machine or reinstall a complete package."}.into()});
        }
        result
    }
    pub async fn shutdown(&self) -> Result<()> {
        self.closing.store(true, Ordering::Release);
        if let Some((_, control)) = &*self.running_job.lock().await {
            control.cancel.store(true, Ordering::Release);
        }
        let result = self.stop().await;
        let mut recorder = self.recorder.lock().await;
        if let Some(mut native) = recorder.take() {
            native.shutdown().await;
        }
        drop(recorder);
        let _gate = self.media_gate.lock().await;
        result.map(|_| ())
    }
}
fn parse_counter(value: &Value, key: &str) -> u64 {
    value[key]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}
fn format_time(ms: f64) -> String {
    let seconds = (ms / 1000.0).max(0.0) as u64;
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}
fn redact_error(error: &Error) -> &'static str {
    match error {
        Error::Database(_) => "database_error",
        Error::Io(_) => "filesystem_error",
        Error::Json(_) => "protocol_error",
        Error::Cancelled => "cancelled",
        Error::Paused => "paused",
        Error::Message(_) => "operation_error",
    }
}

#[cfg(test)]
#[path = "core_tests.rs"]
mod tests;
