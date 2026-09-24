// SPDX-License-Identifier: GPL-2.0-or-later
use playz_core::{
    contracts::{ExportMode, ExportRequest},
    media::{Control, Media},
};
use std::{fs, sync::atomic::Ordering};

fn request() -> ExportRequest {
    ExportRequest {
        recording_id: uuid::Uuid::new_v4().to_string(),
        start_ms: 0.0,
        end_ms: 1000.0,
        mode: ExportMode::Accurate,
        name: "clip".into(),
    }
}

#[tokio::test]
async fn existing_destination_is_preserved_and_never_adopted() {
    let folder = tempfile::tempdir().unwrap();
    let master = folder.path().join("master.mkv");
    let output = folder.path().join("existing.mp4");
    fs::write(&master, b"original master").unwrap();
    fs::write(&output, b"unrelated user clip").unwrap();
    let result = Media::new(folder.path())
        .export(
            &master,
            &output,
            &folder.path().join("temporary.mp4"),
            &request(),
            Control::default(),
        )
        .await;
    assert!(result.unwrap_err().to_string().contains("not adopted"));
    assert_eq!(fs::read(master).unwrap(), b"original master");
    assert_eq!(fs::read(output).unwrap(), b"unrelated user clip");
}

#[tokio::test]
async fn pre_cancelled_export_never_spawns_or_creates_output() {
    let folder = tempfile::tempdir().unwrap();
    let control = Control::default();
    control.cancel.store(true, Ordering::Release);
    let output = folder.path().join("never-created.mp4");
    let result = Media::new(folder.path())
        .export(
            &folder.path().join("master.mkv"),
            &output,
            &folder.path().join("temporary.mp4"),
            &request(),
            control,
        )
        .await;
    assert!(matches!(result, Err(playz_core::Error::Cancelled)));
    assert!(!output.exists());
}

#[tokio::test]
async fn pre_paused_export_never_spawns_or_creates_output() {
    let folder = tempfile::tempdir().unwrap();
    let control = Control::default();
    control.pause.store(true, Ordering::Release);
    let output = folder.path().join("never-created.mp4");
    let result = Media::new(folder.path())
        .export(
            &folder.path().join("master.mkv"),
            &output,
            &folder.path().join("temporary.mp4"),
            &request(),
            control,
        )
        .await;
    assert!(matches!(result, Err(playz_core::Error::Paused)));
    assert!(!output.exists());
}

#[tokio::test]
async fn corrupt_receipt_never_overwrites_a_destination() {
    let folder = tempfile::tempdir().unwrap();
    let master = folder.path().join("master.mkv");
    let output = folder.path().join("existing.mp4");
    let temporary = folder.path().join("temporary.mp4");
    let receipt = temporary.with_extension("receipt.json");
    fs::write(&master, b"original master").unwrap();
    fs::write(&output, b"unrelated user clip").unwrap();
    fs::write(&receipt, b"{corrupt").unwrap();
    let result = Media::new(folder.path())
        .export(&master, &output, &temporary, &request(), Control::default())
        .await;
    assert!(result.is_err());
    assert_eq!(fs::read(master).unwrap(), b"original master");
    assert_eq!(fs::read(output).unwrap(), b"unrelated user clip");
    assert_eq!(fs::read(receipt).unwrap(), b"{corrupt");
}
