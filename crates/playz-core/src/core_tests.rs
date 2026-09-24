// SPDX-License-Identifier: GPL-2.0-or-later
use super::*;

#[tokio::test]
async fn stop_transaction_failure_clears_busy_and_preserves_master() {
    let directory = tempfile::tempdir().unwrap();
    let videos = directory.path().join("videos");
    let core = Core::open(
        directory.path().join("absent-runtime"),
        directory.path().join("data"),
        videos.clone(),
    )
    .await
    .unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let folder = videos.join(&id);
    std::fs::create_dir_all(&folder).unwrap();
    let master = folder.join("master.mkv");
    std::fs::write(&master, b"preserved interrupted master").unwrap();
    core.library
        .insert(
            Recording {
                id: id.clone(),
                title: "Database fault fixture".into(),
                created_at: chrono::Utc::now().to_rfc3339(),
                phase: Phase::Recording,
                duration_ms: 1000.0,
                bytes: "28".into(),
                favorite: false,
                tags: vec![],
                notes: String::new(),
                source_label: "fault fixture".into(),
                capture_kind: "window".into(),
                has_playback: false,
                resume_ms: 0.0,
                error: None,
            },
            uuid::Uuid::new_v4().to_string(),
            master.clone(),
        )
        .await
        .unwrap();
    core.change(|s| {
        s.phase = Phase::Recording;
        s.recording_id = Some(id.clone());
    });
    core.busy.store(true, Ordering::Release);
    // Exercise the actual SQLite failure boundary, without pretending that a
    // synthetic state fixture establishes live recorder/hardware acceptance.
    core.library
        .call(|c| {
            c.execute_batch(
                "CREATE TRIGGER fail_finalizing BEFORE UPDATE OF phase ON recordings
                 WHEN NEW.phase='finalizing'
                 BEGIN SELECT RAISE(FAIL,'injected lifecycle failure'); END;",
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let error = core.stop().await.unwrap_err();
    assert!(error.to_string().contains("injected lifecycle failure"));
    assert!(!core.is_busy());
    assert_eq!(core.snapshot().phase, Phase::Interrupted);
    assert!(!core.snapshot().engine_connected);
    assert_eq!(
        core.library.get(id).await.unwrap().view.phase,
        Phase::Interrupted
    );
    assert_eq!(
        std::fs::read(master).unwrap(),
        b"preserved interrupted master"
    );
    core.shutdown().await.unwrap();
}
