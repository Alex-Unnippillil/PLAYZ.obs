// SPDX-License-Identifier: GPL-2.0-or-later
use playz_core::{
    contracts::{Bookmark, Details, ExportJob, ExportMode, Phase, Recording},
    library::{Library, StoredJob},
};
use std::{collections::HashSet, fs, path::Path};

async fn insert(library: &Library, folder: &Path, title: &str, phase: Phase) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let directory = folder.join(&id);
    fs::create_dir_all(&directory).unwrap();
    let master = directory.join("master.mkv");
    fs::write(&master, b"preserved master fixture").unwrap();
    library
        .insert(
            Recording {
                id: id.clone(),
                title: title.into(),
                created_at: "2026-09-24T00:00:00Z".into(),
                phase,
                duration_ms: 0.0,
                bytes: "0".into(),
                favorite: false,
                tags: vec![],
                notes: String::new(),
                source_label: "fixture".into(),
                capture_kind: "window".into(),
                has_playback: false,
                resume_ms: 0.0,
                error: None,
            },
            uuid::Uuid::new_v4().to_string(),
            master,
        )
        .await
        .unwrap();
    id
}

#[tokio::test]
async fn collections_are_disjoint_and_removal_and_restore_are_idempotent() {
    let d = tempfile::tempdir().unwrap();
    let library = Library::open(d.path().join("library.sqlite3"))
        .await
        .unwrap();
    let active = insert(&library, d.path(), "Active", Phase::Ready).await;
    let hidden = insert(&library, d.path(), "Hidden", Phase::Ready).await;
    library.remove_entry(hidden.clone()).await.unwrap();
    library.remove_entry(hidden.clone()).await.unwrap();
    let listed = library.list("".into(), 0, 50, false).await.unwrap();
    assert_eq!(listed.total, 1);
    assert_eq!(listed.items[0].id, active);
    let removed = library.list_removed("".into(), 0, 50, false).await.unwrap();
    assert_eq!(removed.total, 1);
    assert_eq!(removed.items[0].id, hidden);
    library.restore_entry(hidden.clone()).await.unwrap();
    library.restore_entry(hidden).await.unwrap();
    assert_eq!(
        library.list("".into(), 0, 50, false).await.unwrap().total,
        2
    );
    assert_eq!(
        library
            .list_removed("".into(), 0, 50, false)
            .await
            .unwrap()
            .total,
        0
    );
}

#[tokio::test]
async fn removal_rejects_active_and_unknown_entries_without_false_success() {
    let d = tempfile::tempdir().unwrap();
    let library = Library::open(d.path().join("library.sqlite3"))
        .await
        .unwrap();
    for phase in [Phase::Preparing, Phase::Recording, Phase::Finalizing] {
        let id = insert(&library, d.path(), "Active capture", phase).await;
        assert!(library.remove_entry(id.clone()).await.is_err());
        assert_eq!(library.get(id).await.unwrap().view.phase, phase);
    }
    assert!(
        library
            .remove_entry(uuid::Uuid::new_v4().to_string())
            .await
            .is_err()
    );
    assert!(
        library
            .restore_entry(uuid::Uuid::new_v4().to_string())
            .await
            .is_err()
    );
    assert_eq!(
        library
            .list_removed("".into(), 0, 50, false)
            .await
            .unwrap()
            .total,
        0
    );
    assert_eq!(
        library.list("".into(), 0, 50, false).await.unwrap().total,
        3
    );
}

#[tokio::test]
async fn search_treats_wildcards_literally_in_both_collections() {
    let d = tempfile::tempdir().unwrap();
    let library = Library::open(d.path().join("library.sqlite3"))
        .await
        .unwrap();
    let special = insert(
        &library,
        d.path(),
        "100% ace_one \\ 勝利 O'Brien",
        Phase::Ready,
    )
    .await;
    insert(&library, d.path(), "1000 aceXone ordinary", Phase::Ready).await;
    for removed in [false, true] {
        if removed {
            library.remove_entry(special.clone()).await.unwrap();
        }
        for query in ["%", "_", "\\", "勝利", "O'Brien", "ACE_one"] {
            let page = if removed {
                library
                    .list_removed(query.into(), 0, 50, false)
                    .await
                    .unwrap()
            } else {
                library.list(query.into(), 0, 50, false).await.unwrap()
            };
            assert_eq!(page.total, 1, "query {query}");
            assert_eq!(page.items[0].id, special);
        }
    }
}

#[tokio::test]
async fn removed_pagination_is_stable_bounded_and_searchable_by_notes_and_tags() {
    let d = tempfile::tempdir().unwrap();
    let library = Library::open(d.path().join("library.sqlite3"))
        .await
        .unwrap();
    let mut expected = HashSet::new();
    for index in 0..55 {
        let id = insert(&library, d.path(), "Same timestamp", Phase::Ready).await;
        library
            .details(
                id.clone(),
                Details {
                    title: "Same timestamp".into(),
                    favorite: index == 0,
                    tags: vec!["team_ace".into()],
                    notes: "100% preserved".into(),
                },
            )
            .await
            .unwrap();
        library.remove_entry(id.clone()).await.unwrap();
        expected.insert(id);
    }
    let first = library.list_removed("".into(), 0, 50, false).await.unwrap();
    let last = library
        .list_removed("".into(), 50, 50, false)
        .await
        .unwrap();
    assert_eq!((first.total, last.total), (55, 55));
    assert_eq!((first.items.len(), last.items.len()), (50, 5));
    let actual = first
        .items
        .iter()
        .chain(last.items.iter())
        .map(|r| r.id.clone())
        .collect::<HashSet<_>>();
    assert_eq!(actual, expected);
    for query in ["team_ace", "100%"] {
        assert_eq!(
            library
                .list_removed(query.into(), 0, 50, true)
                .await
                .unwrap()
                .total,
            1
        );
    }
    assert!(
        library
            .list_removed("".into(), 100, 50, false)
            .await
            .unwrap()
            .items
            .is_empty()
    );
    for limit in [0, 201] {
        assert!(
            library
                .list_removed("".into(), 0, limit, false)
                .await
                .is_err()
        );
    }
    assert!(
        library
            .list_removed("x".repeat(201), 0, 50, false)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn backup_and_reopen_preserve_visibility_edits_bookmarks_paths_and_export_jobs() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("library.sqlite3");
    let library = Library::open(path.clone()).await.unwrap();
    let id = insert(&library, d.path(), "Original", Phase::Ready).await;
    let folder = d.path().join(&id);
    let playback = folder.join("playback.mp4");
    let output = folder.join("clip.mp4");
    fs::write(&playback, b"preserved playback").unwrap();
    fs::write(&output, b"preserved clip").unwrap();
    library
        .lifecycle(
            id.clone(),
            Phase::Ready,
            None,
            Some(4000.0),
            Some(24),
            Some(playback.clone()),
        )
        .await
        .unwrap();
    library
        .details(
            id.clone(),
            Details {
                title: "勝利 O'Brien".into(),
                favorite: true,
                tags: vec!["ace".into()],
                notes: "Keep these notes".into(),
            },
        )
        .await
        .unwrap();
    library.resume(id.clone(), 1250.0).await.unwrap();
    let bookmark = Bookmark {
        id: uuid::Uuid::new_v4().to_string(),
        recording_id: id.clone(),
        position_ms: 1000.0,
        label: "Highlight".into(),
        note: "Keep bookmark note".into(),
    };
    library.bookmark(bookmark.clone()).await.unwrap();
    let job_id = uuid::Uuid::new_v4().to_string();
    library
        .enqueue(StoredJob {
            view: ExportJob {
                id: job_id.clone(),
                recording_id: id.clone(),
                state: "completed".into(),
                mode: ExportMode::Accurate,
                start_ms: 1000.0,
                end_ms: 3000.0,
                name: "clip.mp4".into(),
                progress: 100.0,
                error: None,
            },
            output: output.clone(),
            temporary: folder.join("clip.tmp.mp4"),
        })
        .await
        .unwrap();
    library
        .job_state(job_id.clone(), "completed", 100.0, None)
        .await
        .unwrap();
    let before = library.get(id.clone()).await.unwrap();
    library.remove_entry(id.clone()).await.unwrap();
    let backup = library
        .backup(d.path().join("backup.sqlite3"))
        .await
        .unwrap();
    drop(library);
    for database in [path, backup] {
        let reopened = Library::open(database).await.unwrap();
        reopened.reconcile_states().await.unwrap();
        assert_eq!(
            reopened.list("".into(), 0, 50, false).await.unwrap().total,
            0
        );
        assert_eq!(
            reopened
                .list_removed("ace".into(), 0, 50, true)
                .await
                .unwrap()
                .total,
            1
        );
        reopened.restore_entry(id.clone()).await.unwrap();
        let after = reopened.get(id.clone()).await.unwrap();
        assert_eq!(
            serde_json::to_value(&before.view).unwrap(),
            serde_json::to_value(&after.view).unwrap()
        );
        assert_eq!(after.master, before.master);
        assert_eq!(after.playback, Some(playback.clone()));
        let bookmarks = reopened.bookmarks(id.clone()).await.unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].id, bookmark.id);
        assert_eq!(bookmarks[0].note, bookmark.note);
        let job = reopened.job(job_id.clone()).await.unwrap();
        assert_eq!(job.view.state, "completed");
        assert_eq!(job.output, output);
        assert_eq!(
            reopened
                .list("ace".into(), 0, 50, true)
                .await
                .unwrap()
                .total,
            1
        );
    }
    assert_eq!(
        fs::read(&before.master).unwrap(),
        b"preserved master fixture"
    );
    assert_eq!(fs::read(&playback).unwrap(), b"preserved playback");
    assert_eq!(fs::read(&output).unwrap(), b"preserved clip");
}
