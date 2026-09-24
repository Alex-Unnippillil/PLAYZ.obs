// SPDX-License-Identifier: GPL-2.0-or-later
//! Crash reconciliation for exports. Receipts prove byte identity for one job,
//! not authenticity against another process running as the same Windows user.
use crate::{
    contracts::ExportRequest,
    error::{Error, Result},
    media::Control,
    paths,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;

const RECEIPT_LIMIT: u64 = 16 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    schema_version: u32,
    binding_sha256: String,
    output_sha256: String,
    bytes: u64,
}

pub(crate) struct ExportReceipt {
    path: PathBuf,
    binding: String,
}

impl ExportReceipt {
    pub(crate) fn new(
        master: &Path,
        output: &Path,
        temporary: &Path,
        request: &ExportRequest,
    ) -> Result<Self> {
        for path in [master, output, temporary] {
            paths::local_path(path)?;
        }
        if output.parent() != temporary.parent()
            || output == temporary
            || master == output
            || master == temporary
        {
            return Err(
                "Export paths must be distinct; temporary and final clips must share a folder"
                    .into(),
            );
        }
        // Store only a digest of the paths/intent, never raw user paths or titles.
        // The persistent temporary filename contains the full job UUID in Core.
        let binding = hex(&Sha256::digest(serde_json::to_vec(&(
            "PLAYZ export receipt v1",
            master,
            output,
            temporary,
            &request.recording_id,
            request.start_ms,
            request.end_ms,
            &request.mode,
        ))?));
        Ok(Self {
            path: temporary.with_extension("receipt.json"),
            binding,
        })
    }

    async fn read(&self) -> Result<Option<Receipt>> {
        paths::local_path(&self.path)?;
        let file = match tokio::fs::File::open(&self.path).await {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        if !file.metadata().await?.is_file() {
            return Err(
                "Export receipt is not a regular file; existing files were preserved".into(),
            );
        }
        let mut bytes = Vec::new();
        file.take(RECEIPT_LIMIT + 1).read_to_end(&mut bytes).await?;
        if bytes.len() as u64 > RECEIPT_LIMIT {
            return Err("Export receipt exceeds 16 KiB; existing files were preserved".into());
        }
        let receipt: Receipt = serde_json::from_slice(&bytes).map_err(|_| {
            Error::Message("Export receipt is invalid; existing files were preserved".into())
        })?;
        if receipt.schema_version != 1
            || receipt.binding_sha256 != self.binding
            || receipt.bytes == 0
            || receipt.output_sha256.len() != 64
            || !receipt
                .output_sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return Err(
                "Export receipt does not match this job; existing files were preserved".into(),
            );
        }
        Ok(Some(receipt))
    }

    /// Returns false only when no receipt exists. Invalid/mismatched receipts
    /// fail closed, including when the destination happens to be playable.
    pub(crate) async fn verify(&self, path: &Path, control: &Control) -> Result<bool> {
        control.checkpoint()?;
        let Some(receipt) = self.read().await? else {
            return Ok(false);
        };
        let (bytes, digest) = hash_file(path, control).await?;
        if bytes != receipt.bytes || digest != receipt.output_sha256 {
            return Err("Export bytes do not match this job's receipt; the file was preserved and not adopted".into());
        }
        Ok(true)
    }

    pub(crate) async fn exists(&self) -> Result<bool> {
        Ok(self.read().await?.is_some())
    }

    /// Flush the encoded file and commit its receipt before publication. A
    /// crash after publication but before the SQLite update is then recoverable.
    pub(crate) async fn save(&self, temporary: &Path, control: &Control) -> Result<()> {
        control.checkpoint()?;
        // Refuse to replace a foreign/corrupt receipt. A matching receipt may be
        // refreshed when a paused/cancelled export has to encode from scratch.
        self.read().await?;
        let (bytes, digest) = hash_file(temporary, control).await?;
        let file = tokio::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(temporary)
            .await?;
        file.sync_all().await?;
        drop(file);
        control.checkpoint()?;
        let receipt = Receipt {
            schema_version: 1,
            binding_sha256: self.binding.clone(),
            output_sha256: digest,
            bytes,
        };
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || paths::atomic_json(&path, &receipt))
            .await
            .map_err(|_| Error::Message("Export receipt writer failed".into()))??;
        control.checkpoint()
    }
}

async fn hash_file(path: &Path, control: &Control) -> Result<(u64, String)> {
    control.checkpoint()?;
    let path = paths::existing_media(path)?;
    let mut file = tokio::fs::File::open(path).await?;
    let before = file.metadata().await?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 256 * 1024];
    let mut bytes = 0_u64;
    loop {
        control.checkpoint()?;
        let count = file.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        bytes += count as u64;
        if bytes > before.len() {
            return Err("Export changed during verification; existing files were preserved".into());
        }
        digest.update(&buffer[..count]);
    }
    let after = file.metadata().await?;
    control.checkpoint()?;
    if bytes == 0
        || bytes != before.len()
        || bytes != after.len()
        || before.modified()? != after.modified()?
    {
        return Err("Export changed during verification; existing files were preserved".into());
    }
    Ok((bytes, hex(&digest.finalize())))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::ExportMode;
    use std::{fs, sync::atomic::Ordering};

    fn request() -> ExportRequest {
        ExportRequest {
            recording_id: uuid::Uuid::new_v4().to_string(),
            start_ms: 1000.0,
            end_ms: 3000.0,
            mode: ExportMode::Accurate,
            name: "clip".into(),
        }
    }

    #[tokio::test]
    async fn receipt_survives_publication_and_binds_bytes_not_just_size() {
        let d = tempfile::tempdir().unwrap();
        let master = d.path().join("private master.mkv");
        let temporary = d.path().join("clip.tmp.mp4");
        let output = d.path().join("clip.mp4");
        let receipt = ExportReceipt::new(&master, &output, &temporary, &request()).unwrap();
        fs::write(&temporary, b"verified bytes").unwrap();
        assert!(
            !receipt
                .verify(&temporary, &Control::default())
                .await
                .unwrap()
        );
        receipt.save(&temporary, &Control::default()).await.unwrap();
        let json = fs::read_to_string(&receipt.path).unwrap();
        assert!(!json.contains("private master"));
        assert!(!json.contains(&*d.path().to_string_lossy()));
        paths::finalize_new(&temporary, &output).unwrap();
        assert!(receipt.verify(&output, &Control::default()).await.unwrap());
        fs::write(&output, b"tampered bytes").unwrap();
        assert!(receipt.verify(&output, &Control::default()).await.is_err());
        assert_eq!(fs::read(&output).unwrap(), b"tampered bytes");
    }

    #[tokio::test]
    async fn receipt_rejects_other_jobs_paths_and_trim_intents() {
        let d = tempfile::tempdir().unwrap();
        let master = d.path().join("master.mkv");
        let output = d.path().join("clip.mp4");
        let temporary = d.path().join("clip.tmp.mp4");
        let original = request();
        let receipt = ExportReceipt::new(&master, &output, &temporary, &original).unwrap();
        fs::write(&temporary, b"verified bytes").unwrap();
        receipt.save(&temporary, &Control::default()).await.unwrap();
        for changed in [
            ExportRequest {
                start_ms: 0.0,
                ..original.clone()
            },
            ExportRequest {
                end_ms: 4000.0,
                ..original.clone()
            },
            ExportRequest {
                mode: ExportMode::Fast,
                ..original.clone()
            },
            ExportRequest {
                recording_id: uuid::Uuid::new_v4().to_string(),
                ..original.clone()
            },
        ] {
            let other = ExportReceipt::new(&master, &output, &temporary, &changed).unwrap();
            assert!(other.verify(&temporary, &Control::default()).await.is_err());
        }
        for (source, final_path) in [
            (d.path().join("other.mkv"), output.clone()),
            (master.clone(), d.path().join("other.mp4")),
        ] {
            let other = ExportReceipt::new(&source, &final_path, &temporary, &original).unwrap();
            assert!(other.verify(&temporary, &Control::default()).await.is_err());
        }
        let other_temp = d.path().join("another-job.tmp.mp4");
        let other = ExportReceipt::new(&master, &output, &other_temp, &original).unwrap();
        fs::copy(&receipt.path, &other.path).unwrap();
        assert!(other.verify(&temporary, &Control::default()).await.is_err());
        assert_eq!(fs::read(&temporary).unwrap(), b"verified bytes");
    }

    #[tokio::test]
    async fn invalid_receipts_are_bounded_and_preserved() {
        let d = tempfile::tempdir().unwrap();
        let temporary = d.path().join("clip.tmp.mp4");
        let receipt = ExportReceipt::new(
            &d.path().join("master.mkv"),
            &d.path().join("clip.mp4"),
            &temporary,
            &request(),
        )
        .unwrap();
        fs::write(&temporary, b"verified bytes").unwrap();
        for bytes in [
            b"{truncated".to_vec(),
            vec![b' '; RECEIPT_LIMIT as usize + 1],
        ] {
            fs::write(&receipt.path, &bytes).unwrap();
            assert!(
                receipt
                    .verify(&temporary, &Control::default())
                    .await
                    .is_err()
            );
            assert!(receipt.save(&temporary, &Control::default()).await.is_err());
            assert_eq!(fs::read(&receipt.path).unwrap(), bytes);
        }
        fs::remove_file(&receipt.path).unwrap();
        receipt.save(&temporary, &Control::default()).await.unwrap();
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&receipt.path).unwrap()).unwrap();
        value["schema_version"] = serde_json::json!(99);
        paths::atomic_json(&receipt.path, &value).unwrap();
        assert!(
            receipt
                .verify(&temporary, &Control::default())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn pause_and_cancel_interrupt_receipt_work_without_publication() {
        let d = tempfile::tempdir().unwrap();
        let temporary = d.path().join("clip.tmp.mp4");
        let receipt = ExportReceipt::new(
            &d.path().join("master.mkv"),
            &d.path().join("clip.mp4"),
            &temporary,
            &request(),
        )
        .unwrap();
        fs::write(&temporary, b"verified bytes").unwrap();
        let control = Control::default();
        control.pause.store(true, Ordering::Release);
        assert!(matches!(
            receipt.save(&temporary, &control).await,
            Err(Error::Paused)
        ));
        assert!(!receipt.path.exists());
        control.cancel.store(true, Ordering::Release);
        assert!(matches!(
            receipt.verify(&temporary, &control).await,
            Err(Error::Cancelled)
        ));
        assert_eq!(fs::read(&temporary).unwrap(), b"verified bytes");
    }

    #[test]
    fn publication_paths_cannot_alias_or_cross_folders() {
        let d = tempfile::tempdir().unwrap();
        let master = d.path().join("master.mkv");
        let output = d.path().join("clip.mp4");
        assert!(ExportReceipt::new(&master, &output, &master, &request()).is_err());
        assert!(ExportReceipt::new(&master, &output, &output, &request()).is_err());
        assert!(
            ExportReceipt::new(
                &master,
                &output,
                &d.path().join("other/temp.mp4"),
                &request()
            )
            .is_err()
        );
    }
}
