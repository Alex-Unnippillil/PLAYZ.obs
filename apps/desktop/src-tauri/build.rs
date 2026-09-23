fn main() {
    let commands = &[
        "app_state",
        "discover_devices",
        "list_recordings",
        "get_recording",
        "start_recording",
        "stop_recording",
        "choose_recording_folder",
        "save_settings",
        "playback_asset",
        "edit_recording",
        "remove_recording",
        "restore_recording",
        "save_resume",
        "list_bookmarks",
        "save_bookmark",
        "delete_bookmark",
        "live_bookmark",
        "queue_export",
        "list_exports",
        "cancel_export",
        "retry_export",
        "reveal_recording",
        "reveal_export",
        "recover_recording",
        "import_media",
        "relink_recording",
        "diagnostics",
        "backup_library",
        "quit_application",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("Tauri configuration and capability validation failed");
}
