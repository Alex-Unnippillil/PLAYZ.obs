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
        .args(["-map", "0:v:0", "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"])
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
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
    let result = media.export(&master, &clip, &temporary, &request, Control::default()).await.unwrap();
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
    assert!(audio.stdout.chunks_exact(2).any(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() > 1000));
    let cancelled = Control::default();
    cancelled.cancel.store(true, Ordering::Release);
    let cancelled_path = directory.path().join("cancelled.mp4");
    let result = media.export(&master, &cancelled_path, &directory.path().join("cancelled.tmp.mp4"), &request, cancelled).await;
    assert!(result.is_err());
    assert!(!cancelled_path.exists());
    assert_eq!(digest(&master), original);
    println!("Real media passed: {count} frames; source frame IDs {first}..{last}; non-silent audio; master hash unchanged; cancellation preserved source.");
}
