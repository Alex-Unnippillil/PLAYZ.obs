// SPDX-License-Identifier: GPL-2.0-or-later
// Developer-only integration target. Never included in the NSIS resources.
#[cfg(windows)]
#[tokio::test]
#[ignore = "Run scripts/test-capture.ps1 on an interactive Windows desktop"]
async fn real_selected_window_roundtrip_through_rust_core() {
    use playz_core::{Core, contracts::*, media::Media, paths};
    use serde_json::json;
    use std::{path::PathBuf, time::Duration};
    let runtime = PathBuf::from(std::env::var("PLAYZ_TEST_RUNTIME").unwrap());
    let title = std::env::var("PLAYZ_CAPTURE_TITLE").unwrap();
    let root = PathBuf::from(std::env::var("PLAYZ_CAPTURE_ROOT").unwrap());
    let run = root.join(uuid::Uuid::new_v4().to_string());
    let data = run.join("catalog");
    let videos = run.join("videos");
    let audio = std::env::var("PLAYZ_CAPTURE_AUDIO").as_deref() == Ok("1");
    let core = Core::open(runtime.clone(), data.clone(), videos.clone())
        .await
        .unwrap();
    core.spawn_workers();
    let capabilities = core.capabilities().await.unwrap();
    let target = capabilities
        .targets
        .iter()
        .find(|t| t.kind == "window" && t.label.contains(&title))
        .expect("The exact fixture window was not enumerated");
    assert!(capabilities.encoders.iter().any(|e| e.id == "obs_x264"));
    let mut settings = core.snapshot().settings;
    settings.target_id = target.id.clone();
    settings.target_label = target.label.clone();
    settings.capture_kind = "window".into();
    settings.encoder_id = "obs_x264".into();
    settings.width = 1280;
    settings.height = 720;
    settings.fps = 30;
    settings.bitrate_kbps = 4000;
    settings.desktop_audio = audio;
    settings.microphone_id.clear();
    core.save_settings(settings).await.unwrap();
    let request_id = uuid::Uuid::new_v4().to_string();
    let started = core.start(request_id.clone()).await.unwrap();
    assert_eq!(started.phase, Phase::Recording);
    let recording_id = started.recording_id.unwrap();
    assert_eq!(
        core.start(request_id)
            .await
            .unwrap()
            .recording_id
            .as_deref(),
        Some(recording_id.as_str())
    );
    tokio::time::sleep(Duration::from_secs(6)).await;
    let bookmark = core.live_bookmark().await.unwrap();
    assert_eq!(bookmark.recording_id, recording_id);
    let stopped = core.stop().await.unwrap();
    assert_eq!(stopped.phase, Phase::Ready);
    let master = core.master_path(recording_id.clone()).await.unwrap();
    let playback = core.playback_path(recording_id.clone()).await.unwrap();
    let probe = Media::new(&runtime).probe(&playback).await.unwrap();
    assert!(probe.compatible() && probe.duration_ms >= 5000.0);
    let export = core
        .queue_export(ExportRequest {
            recording_id: recording_id.clone(),
            start_ms: 1000.0,
            end_ms: 3000.0,
            mode: ExportMode::Accurate,
            name: "native-capture-proof".into(),
        })
        .await
        .unwrap();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    loop {
        let jobs = core.library.jobs().await.unwrap();
        let job = jobs.iter().find(|j| j.id == export.id).unwrap();
        assert_ne!(job.state, "failed", "export failure: {:?}", job.error);
        if job.state == "completed" {
            break;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "Export did not complete"
        );
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let clip = core.export_path(export.id).await.unwrap();
    core.shutdown().await.unwrap();
    drop(core);
    let reopened = Core::open(runtime.clone(), data, videos).await.unwrap();
    assert_eq!(
        reopened
            .library
            .get(recording_id.clone())
            .await
            .unwrap()
            .view
            .phase,
        Phase::Ready
    );
    assert_eq!(
        reopened
            .library
            .bookmarks(recording_id.clone())
            .await
            .unwrap()
            .len(),
        1
    );
    assert!(master.is_file() && playback.is_file() && clip.is_file());
    let frame = run.join("captured-window.png");
    let result = std::process::Command::new(runtime.join("media/ffmpeg.exe"))
        .args(["-hide_banner", "-nostdin", "-v", "error", "-ss", "1", "-i"])
        .arg(&playback)
        .args(["-frames:v", "1"])
        .arg(&frame)
        .status()
        .unwrap();
    assert!(result.success() && frame.metadata().unwrap().len() > 1024);
    let decoded = std::process::Command::new(runtime.join("media/ffmpeg.exe"))
        .args(["-v", "error", "-ss", "2", "-i"])
        .arg(&playback)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=160:90",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ])
        .output()
        .unwrap();
    assert!(decoded.status.success() && decoded.stdout.len() == 160 * 90 * 3);
    assert!(
        decoded.stdout.iter().max().unwrap() - decoded.stdout.iter().min().unwrap() > 80,
        "Capture is blank or has insufficient contrast"
    );
    paths::atomic_json(
        &run.join("capture-evidence.json"),
        &json!({
            "schema_version": 1, "capture_scope": "selected_fixture_window", "encoder": "obs_x264",
            "core_start_stop_restart_playback_export": true, "decoded_frame_contrast": true,
            "audio_enabled": audio, "audio_signal_verified": false, "real_game_verified": false,
            "clean_windows_11_install_verified": false, "duration_ms": probe.duration_ms,
            "recording_id": recording_id, "sqlite_runtime": rusqlite::version()
        }),
    )
    .unwrap();
    reopened.shutdown().await.unwrap();
    println!(
        "Actual libobs selected-window capture, restart, local playback asset and accurate export passed. Real game, audio signal and clean-install acceptance remain separate."
    );
}
