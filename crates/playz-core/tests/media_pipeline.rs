// SPDX-License-Identifier: GPL-2.0-or-later
use playz_core::{
    contracts::{ExportMode, ExportRequest},
    media::{Control, Media},
};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, path::PathBuf, process::Command, sync::atomic::Ordering};

fn digest(path: &Path) -> Vec<u8> {
    Sha256::digest(fs::read(path).unwrap()).to_vec()
}
fn decoded_frames(runtime: &Path, path: &Path) -> Vec<u8> {
    let output = Command::new(runtime.join("media/ffmpeg.exe"))
        .args(["-v", "error", "-i"])
        .arg(path)
        .args([
            "-map", "0:v:0", "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    output.stdout
}
fn frame_id(frame: &[u8]) -> u32 {
    (0..8).fold(0, |value, bit| {
        if frame[(72 * 160 + 16 + bit * 18) * 3] > 128 {
            value | (1 << bit)
        } else {
            value
        }
    })
}

#[tokio::test]
#[ignore = "Run scripts/test-media.ps1 with the verified native runtime"]
async fn real_media_pipeline_preserves_master_and_validates_trim_frames() {
    let runtime = PathBuf::from(std::env::var("PLAYZ_TEST_RUNTIME").unwrap());
    let fixture = PathBuf::from(std::env::var("PLAYZ_TEST_MEDIA").unwrap()).join("fixture.mkv");
    let directory = tempfile::tempdir().unwrap();
    let master = directory.path().join("Unicode 勝利 master.mkv");
    fs::copy(fixture, &master).unwrap();
    let original = digest(&master);
    let media = Media::new(&runtime);
    let source = media.probe(&master).await.unwrap();
    assert!(source.compatible());
    assert_eq!((source.width, source.height), (160, 96));
    assert_eq!(source.audio_codec.as_deref(), Some("aac"));
    let playback = directory.path().join("playback.mp4");
    let remuxed = media.remux(&master, &playback).await.unwrap();
    assert!((remuxed.duration_ms - source.duration_ms).abs() < 100.0);
    let request = ExportRequest {
        recording_id: uuid::Uuid::new_v4().to_string(),
        start_ms: 1000.0,
        end_ms: 3000.0,
        mode: ExportMode::Accurate,
        name: "test".into(),
    };
    let clip = directory.path().join("accurate.mp4");
    let temporary = directory.path().join("accurate.tmp.mp4");
    let result = media
        .export(&master, &clip, &temporary, &request, Control::default())
        .await
        .unwrap();
    assert!((result.duration_ms - 2000.0).abs() < 150.0);
    let decoded = decoded_frames(&runtime, &clip);
    let frame_bytes = 160 * 96 * 3;
    assert_eq!(decoded.len() % frame_bytes, 0);
    let count = decoded.len() / frame_bytes;
    assert!((59..=61).contains(&count), "decoded frames: {count}");
    let first = frame_id(&decoded[..frame_bytes]);
    let last = frame_id(&decoded[(count - 1) * frame_bytes..]);
    assert!((29..=31).contains(&first), "first frame: {first}");
    assert!((88..=90).contains(&last), "last frame: {last}");
    let audio = Command::new(runtime.join("media/ffmpeg.exe"))
        .args(["-v", "error", "-i"])
        .arg(&clip)
        .args(["-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1"])
        .output()
        .unwrap();
    assert!(audio.status.success());
    assert!(
        audio
            .stdout
            .chunks_exact(2)
            .any(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() > 1000)
    );
    let cancelled = Control::default();
    cancelled.cancel.store(true, Ordering::Release);
    let cancelled_path = directory.path().join("cancelled.mp4");
    let result = media
        .export(
            &master,
            &cancelled_path,
            &directory.path().join("cancelled.tmp.mp4"),
            &request,
            cancelled,
        )
        .await;
    assert!(result.is_err());
    assert!(!cancelled_path.exists());
    assert_eq!(digest(&master), original);
    println!(
        "Real media passed: {count} frames; source frame IDs {first}..{last}; non-silent audio; master hash unchanged; cancellation preserved source."
    );
}

#[tokio::test]
#[ignore = "Run scripts/test-media.ps1 with the verified native runtime"]
async fn real_export_recovers_both_publication_boundaries_without_reencoding() {
    let runtime = PathBuf::from(std::env::var("PLAYZ_TEST_RUNTIME").unwrap());
    let fixture = PathBuf::from(std::env::var("PLAYZ_TEST_MEDIA").unwrap()).join("fixture.mkv");
    let directory = tempfile::tempdir().unwrap();
    let master = directory.path().join("master.mkv");
    fs::copy(fixture, &master).unwrap();
    let original = digest(&master);
    let media = Media::new(&runtime);
    let request = ExportRequest {
        recording_id: uuid::Uuid::new_v4().to_string(),
        start_ms: 1000.0,
        end_ms: 3000.0,
        mode: ExportMode::Accurate,
        name: "recovery".into(),
    };
    let output = directory.path().join("clip.mp4");
    let temporary = directory.path().join("clip.tmp.mp4");
    media
        .export(&master, &output, &temporary, &request, Control::default())
        .await
        .unwrap();
    let encoded = digest(&output);
    assert!(temporary.with_extension("receipt.json").is_file());
    // A new controller has no encoder executable: success must come from
    // receipt verification and real ffprobe, not silently re-encoding a clip.
    let resumed = Media {
        ffmpeg: directory.path().join("absent-encoder.exe"),
        ffprobe: media.ffprobe.clone(),
    };
    let probe = resumed
        .export(&master, &output, &temporary, &request, Control::default())
        .await
        .unwrap();
    assert!((probe.duration_ms - 2000.0).abs() < 150.0);
    assert_eq!(digest(&output), encoded);
    // Model termination after receipt commit and before output publication.
    fs::rename(&output, &temporary).unwrap();
    resumed
        .export(&master, &output, &temporary, &request, Control::default())
        .await
        .unwrap();
    assert!(!temporary.exists());
    assert_eq!(digest(&output), encoded);
    // Replacing a clip with different bytes of the same length is not adopted.
    let mut changed = fs::read(&output).unwrap();
    let last = changed.len() - 1;
    changed[last] ^= 1;
    fs::write(&output, &changed).unwrap();
    let result = resumed
        .export(&master, &output, &temporary, &request, Control::default())
        .await;
    assert!(result.unwrap_err().to_string().contains("not adopted"));
    assert_eq!(fs::read(&output).unwrap(), changed);
    assert_eq!(digest(&master), original);
    println!(
        "Receipt recovery passed both publication boundaries without FFmpeg; tampering rejected; master unchanged."
    );
}

#[tokio::test]
#[ignore = "Run scripts/test-media.ps1 with the verified native runtime"]
async fn catalog_restart_reconciles_a_published_export() {
    use playz_core::Core;
    use std::{sync::Arc, time::Duration};

    async fn completed(core: &Arc<Core>, id: &str) {
        tokio::time::timeout(Duration::from_secs(45), async {
            loop {
                let job = core.library.job(id.to_owned()).await.unwrap();
                assert_ne!(job.view.state, "failed", "{:?}", job.view.error);
                if job.view.state == "completed" {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        })
        .await
        .unwrap();
    }

    let runtime = PathBuf::from(std::env::var("PLAYZ_TEST_RUNTIME").unwrap());
    let fixture = PathBuf::from(std::env::var("PLAYZ_TEST_MEDIA").unwrap()).join("fixture.mkv");
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let videos = directory.path().join("videos");
    let core = Core::open(runtime.clone(), data.clone(), videos.clone())
        .await
        .unwrap();
    let recording = core.import_file(fixture).await.unwrap();
    let master = core.master_path(recording.id.clone()).await.unwrap();
    let original = digest(&master);
    let job = core
        .queue_export(ExportRequest {
            recording_id: recording.id,
            start_ms: 1000.0,
            end_ms: 3000.0,
            mode: ExportMode::Accurate,
            name: "restart".into(),
        })
        .await
        .unwrap();
    core.spawn_workers();
    completed(&core, &job.id).await;
    let output = core.export_path(job.id.clone()).await.unwrap();
    let encoded = digest(&output);
    core.shutdown().await.unwrap();
    // Restore the durable state observed if termination occurred after output
    // publication and before the database's completed transaction.
    core.library
        .job_state(job.id.clone(), "running", 99.0, None)
        .await
        .unwrap();
    drop(core);
    let reopened = Core::open(runtime, data, videos).await.unwrap();
    assert_eq!(
        reopened
            .library
            .job(job.id.clone())
            .await
            .unwrap()
            .view
            .state,
        "queued"
    );
    reopened.spawn_workers();
    completed(&reopened, &job.id).await;
    reopened.shutdown().await.unwrap();
    assert_eq!(digest(&output), encoded);
    assert_eq!(digest(&master), original);
    println!(
        "Persisted running job reconciled to queued then completed after reopening the real catalog; clip and master hashes unchanged."
    );
}

#[tokio::test]
#[ignore = "Run scripts/test-media.ps1 with the verified native runtime"]
async fn removed_recording_restores_after_core_restart_without_changing_media() {
    use playz_core::{Core, contracts::Bookmark};
    use std::time::Duration;

    let runtime = PathBuf::from(std::env::var("PLAYZ_TEST_RUNTIME").unwrap());
    let fixture = PathBuf::from(std::env::var("PLAYZ_TEST_MEDIA").unwrap()).join("fixture.mkv");
    let directory = tempfile::tempdir().unwrap();
    let data = directory.path().join("data");
    let videos = directory.path().join("videos");
    let core = Core::open(runtime.clone(), data.clone(), videos.clone())
        .await
        .unwrap();
    let recording = core.import_file(fixture).await.unwrap();
    let id = recording.id.clone();
    let master = core.master_path(id.clone()).await.unwrap();
    let playback = core.playback_path(id.clone()).await.unwrap();
    let before_master = digest(&master);
    let before_playback = digest(&playback);
    core.library.resume(id.clone(), 1500.0).await.unwrap();
    let bookmark = core
        .save_bookmark(Bookmark {
            id: uuid::Uuid::new_v4().to_string(),
            recording_id: id.clone(),
            position_ms: 1000.0,
            label: "Preserved highlight".into(),
            note: "Restore without losing metadata".into(),
        })
        .await
        .unwrap();
    let job = core
        .queue_export(ExportRequest {
            recording_id: id.clone(),
            start_ms: 1000.0,
            end_ms: 3000.0,
            mode: ExportMode::Accurate,
            name: "preserved".into(),
        })
        .await
        .unwrap();
    core.spawn_workers();
    tokio::time::timeout(Duration::from_secs(45), async {
        loop {
            let state = core.library.job(job.id.clone()).await.unwrap();
            assert_ne!(state.view.state, "failed", "{:?}", state.view.error);
            if state.view.state == "completed" {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap();
    let output = core.export_path(job.id.clone()).await.unwrap();
    let before_export = digest(&output);
    core.library.remove_entry(id.clone()).await.unwrap();
    core.shutdown().await.unwrap();
    drop(core);
    let reopened = Core::open(runtime, data, videos).await.unwrap();
    let active = reopened.library.list("".into(), 0, 50, false).await.unwrap();
    assert_eq!(active.total, 0);
    let removed = reopened.library.list_removed("fixture".into(), 0, 50, false).await.unwrap();
    assert_eq!(removed.total, 1);
    assert_eq!(removed.items[0].id, id);
    reopened.library.restore_entry(id.clone()).await.unwrap();
    let restored = reopened.library.get(id.clone()).await.unwrap();
    assert_eq!(restored.view.resume_ms, 1500.0);
    assert_eq!(restored.view.phase, playz_core::contracts::Phase::Ready);
    assert_eq!(reopened.library.bookmarks(id.clone()).await.unwrap()[0].id, bookmark.id);
    let asset = reopened.playback_path(id).await.unwrap();
    let probe = reopened.media.probe(&asset).await.unwrap();
    assert!(probe.compatible());
    assert!(probe.duration_ms > 3000.0);
    assert_eq!(reopened.export_path(job.id).await.unwrap(), output);
    reopened.shutdown().await.unwrap();
    assert_eq!(digest(&master), before_master);
    assert_eq!(digest(&playback), before_playback);
    assert_eq!(digest(&output), before_export);
    println!("Removed entry survived Core restart and restored with bookmark/resume/export intact; all three media hashes unchanged.");
}
