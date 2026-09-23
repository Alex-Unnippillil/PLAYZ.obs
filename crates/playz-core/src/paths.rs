// SPDX-License-Identifier: GPL-2.0-or-later
use crate::error::{Error, Result};
use serde::Serialize;
use std::{fs, io::Write, path::{Component, Path, PathBuf}};

pub fn local_path(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() || path.components().any(|p| matches!(p, Component::ParentDir)) {
        return Err("Choose an absolute local path without parent traversal".into());
    }
    #[cfg(windows)] {
        use std::path::Prefix;
        if matches!(path.components().next(), Some(Component::Prefix(p)) if !matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))) {
            return Err("Network shares and device paths are not supported for the live library".into());
        }
    }
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part);
        if let Ok(metadata) = fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() { return Err("Symbolic links are not supported for managed recording paths".into()); }
            #[cfg(windows)] {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 { return Err("Choose a local folder without junctions, cloud placeholders or reparse points".into()); }
            }
        }
    }
    Ok(path.to_owned())
}
pub fn writable_folder(path: &Path) -> Result<PathBuf> {
    local_path(path)?;
    fs::create_dir_all(path)?;
    local_path(path)?;
    let mut probe = tempfile::NamedTempFile::new_in(path)?;
    probe.write_all(b"PLAYZ write test")?;
    probe.as_file().sync_all()?;
    Ok(fs::canonicalize(path)?)
}
pub fn existing_media(path: &Path) -> Result<PathBuf> {
    local_path(path)?;
    if !path.is_file() { return Err("This media file is missing. Reconnect the drive or use Relink.".into()); }
    if !matches!(path.extension().and_then(|s| s.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("mkv" | "mp4")) {
        return Err("Only local MKV and MP4 media are accepted".into());
    }
    Ok(fs::canonicalize(path)?)
}
pub fn validate_id(id: &str) -> Result<()> { uuid::Uuid::parse_str(id).map(|_| ()).map_err(|_| Error::Message("Invalid local identifier".into())) }
pub fn atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let parent=path.parent().ok_or("Manifest has no parent folder")?;
    local_path(parent)?;
    let mut temp=tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temp,value)?;
    temp.write_all(b"\n")?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|e| Error::Io(e.error))?;
    Ok(())
}
pub fn finalize_new(temporary: &Path, destination: &Path) -> Result<()> {
    local_path(temporary)?; local_path(destination)?;
    if temporary.parent()!=destination.parent() { return Err("Finalization must remain on the same volume and folder".into()); }
    // Hard-link creation atomically refuses an existing destination. Unlike
    // rename-overwrite this cannot destroy a user's file after a race.
    fs::OpenOptions::new().read(true).open(temporary)?.sync_all()?;
    fs::hard_link(temporary,destination)?;
    fs::remove_file(temporary)?;
    Ok(())
}
pub fn reserve_bytes(reserve_gib: u32, bitrate_kbps: u32) -> u64 {
    // Reserve also covers two minutes of configured video + AAC output.
    (u64::from(reserve_gib)*1024*1024*1024).max((u64::from(bitrate_kbps)+192)*1000/8*120)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_traversal() { assert!(local_path(Path::new("relative/clip.mkv")).is_err()); let d=tempfile::tempdir().unwrap(); assert!(local_path(&d.path().join("../outside")).is_err()); }
    #[test] fn atomic_no_overwrite() { let d=tempfile::tempdir().unwrap(); let a=d.path().join("temp.mp4"); let b=d.path().join("final.mp4"); fs::write(&a,b"new").unwrap(); fs::write(&b,b"original").unwrap(); assert!(finalize_new(&a,&b).is_err()); assert_eq!(fs::read(&b).unwrap(),b"original"); fs::remove_file(&b).unwrap(); finalize_new(&a,&b).unwrap(); assert_eq!(fs::read(&b).unwrap(),b"new"); }
    #[test] fn manifest_replacement_is_complete() { let d=tempfile::tempdir().unwrap(); let p=d.path().join("manifest.json"); atomic_json(&p,&serde_json::json!({"version":1})).unwrap(); atomic_json(&p,&serde_json::json!({"version":2})).unwrap(); assert_eq!(serde_json::from_slice::<serde_json::Value>(&fs::read(p).unwrap()).unwrap()["version"],2); }
    #[test] fn reserve_accounts_for_high_bitrate() { assert!(reserve_bytes(1,80000)>1024*1024*1024); }
}
