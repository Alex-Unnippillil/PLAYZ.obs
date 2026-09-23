// SPDX-License-Identifier: GPL-2.0-or-later
use crate::error::{Error, Result};
use std::{path::Path, process::Stdio};
use tokio::{io::{AsyncRead, AsyncReadExt}, process::{Child, Command}};

pub fn command(executable: &Path) -> Result<Command> {
    crate::paths::local_path(executable)?;
    if !executable.is_file() { return Err(format!("Required bundled component is missing: {}. Reinstall PLAYZ or run the native bootstrap on your build machine.", executable.file_name().unwrap_or_default().to_string_lossy()).into()); }
    let parent=executable.parent().ok_or("Executable has no installation folder")?;
    let mut c=Command::new(executable);
    c.current_dir(parent).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)] {
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW, not a privileged process
        let system=std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| "C:\\Windows".into());
        c.env("PATH",std::env::join_paths([parent.to_path_buf(),system.join("System32")]).map_err(|_| Error::Message("Invalid runtime path".into()))?);
    }
    Ok(c)
}

pub struct ProcessJob {
    #[cfg(windows)] handle: usize,
}
impl ProcessJob {
    pub fn attach(child: &Child) -> Result<Self> {
        #[cfg(windows)] unsafe {
            use windows::{core::PCWSTR, Win32::{Foundation::{CloseHandle,HANDLE}, System::JobObjects::*}};
            let handle=CreateJobObjectW(None,PCWSTR::null()).map_err(|_| Error::Message("Could not establish recorder process ownership".into()))?;
            let mut limits=JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set=SetInformationJobObject(handle,JobObjectExtendedLimitInformation,&limits as *const _ as *const _,std::mem::size_of_val(&limits) as u32);
            let raw=child.raw_handle().ok_or("Child process handle is unavailable")?;
            if set.is_err() || AssignProcessToJobObject(handle,HANDLE(raw)).is_err() {
                let _=CloseHandle(handle);
                return Err("Could not assign the recorder to a private Windows job; startup refused to avoid orphan processes".into());
            }
            Ok(Self {handle:handle.0 as usize})
        }
        #[cfg(not(windows))] { let _=child; Ok(Self{}) }
    }
}
#[cfg(windows)] impl Drop for ProcessJob {
    fn drop(&mut self) { unsafe { let _=windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(self.handle as *mut _)); } }
}

pub async fn read_bounded(reader: impl AsyncRead + Unpin, maximum: usize) -> Result<Vec<u8>> {
    let mut data=Vec::new(); reader.take(maximum as u64+1).read_to_end(&mut data).await?;
    if data.len()>maximum { return Err("Subprocess output exceeded its bounded protocol limit".into()); }
    Ok(data)
}
pub fn discard_stderr(reader: impl AsyncRead + Unpin + Send + 'static) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move { let mut reader=reader; let _=tokio::io::copy(&mut reader,&mut tokio::io::sink()).await; })
}
