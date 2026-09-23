// SPDX-License-Identifier: GPL-2.0-or-later
use playz_core::{Core, contracts::*};
use std::sync::Arc;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
type App<'a> = State<'a, Arc<Core>>;
type Reply<T> = Result<T, String>;
fn message(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
pub fn app_state(core: App<'_>) -> Snapshot {
    core.snapshot()
}
#[tauri::command]
pub async fn discover_devices(core: App<'_>) -> Reply<Capabilities> {
    core.capabilities().await.map_err(message)
}
#[tauri::command]
pub async fn list_recordings(
    core: App<'_>,
    query: String,
    offset: u32,
    limit: u32,
    favorites: bool,
) -> Reply<LibraryPage> {
    core.library
        .list(query, offset, limit, favorites)
        .await
        .map_err(message)
}
#[tauri::command]
pub async fn get_recording(core: App<'_>, id: String) -> Reply<Recording> {
    playz_core::paths::validate_id(&id).map_err(message)?;
    Ok(core.library.get(id).await.map_err(message)?.view)
}
#[tauri::command]
pub async fn start_recording(core: App<'_>, request_id: String) -> Reply<Snapshot> {
    core.start(request_id).await.map_err(message)
}
#[tauri::command]
pub async fn stop_recording(core: App<'_>) -> Reply<Snapshot> {
    core.stop().await.map_err(message)
}
#[tauri::command]
pub async fn choose_recording_folder(
    app: tauri::AppHandle,
    core: App<'_>,
) -> Reply<Option<String>> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Choose a local recording folder (NTFS recommended)")
            .blocking_pick_folder()
    })
    .await
    .map_err(message)?;
    match selected {
        Some(file) => Ok(Some(
            core.authorize_folder(file.into_path().map_err(message)?)
                .await
                .map_err(message)?,
        )),
        None => Ok(None),
    }
}
#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    core: App<'_>,
    settings: Settings,
) -> Reply<Settings> {
    let desktop = app.state::<crate::DesktopState>();
    let _gate = desktop.settings_gate.lock().await;
    settings.validate()?;
    if core.is_busy() {
        return Err("Stop recording before changing settings".into());
    }
    let old = core.snapshot().settings;
    if let Err(error) = crate::register_shortcuts(&app, &settings) {
        let _ = crate::register_shortcuts(&app, &old);
        return Err(error);
    }
    match core.save_settings(settings).await {
        Ok(value) => {
            *desktop
                .shortcut_error
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
            Ok(value)
        }
        Err(e) => {
            let _ = crate::register_shortcuts(&app, &old);
            Err(e.to_string())
        }
    }
}
#[tauri::command]
pub async fn playback_asset(app: tauri::AppHandle, core: App<'_>, id: String) -> Reply<String> {
    let path = core.playback_path(id).await.map_err(message)?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(message)?;
    Ok(path.to_string_lossy().to_string())
}
#[tauri::command]
pub async fn edit_recording(core: App<'_>, id: String, details: Details) -> Reply<()> {
    core.edit_details(id, details).await.map_err(message)
}
#[tauri::command]
pub async fn remove_recording(core: App<'_>, id: String) -> Reply<()> {
    if core.snapshot().recording_id.as_deref() == Some(&id) && core.is_busy() {
        return Err("Stop this recording first".into());
    }
    core.library.remove_entry(id).await.map_err(message)
}
#[tauri::command]
pub async fn restore_recording(core: App<'_>, id: String) -> Reply<()> {
    core.library.restore_entry(id).await.map_err(message)
}
#[tauri::command]
pub async fn save_resume(core: App<'_>, id: String, position_ms: f64) -> Reply<()> {
    core.library.resume(id, position_ms).await.map_err(message)
}
#[tauri::command]
pub async fn list_bookmarks(core: App<'_>, id: String) -> Reply<Vec<Bookmark>> {
    core.library.bookmarks(id).await.map_err(message)
}
#[tauri::command]
pub async fn save_bookmark(core: App<'_>, bookmark: Bookmark) -> Reply<Bookmark> {
    core.save_bookmark(bookmark).await.map_err(message)
}
#[tauri::command]
pub async fn delete_bookmark(core: App<'_>, id: String) -> Reply<()> {
    core.library.delete_bookmark(id).await.map_err(message)
}
#[tauri::command]
pub async fn live_bookmark(core: App<'_>) -> Reply<Bookmark> {
    core.live_bookmark().await.map_err(message)
}
#[tauri::command]
pub async fn queue_export(core: App<'_>, request: ExportRequest) -> Reply<ExportJob> {
    core.queue_export(request).await.map_err(message)
}
#[tauri::command]
pub async fn list_exports(core: App<'_>) -> Reply<Vec<ExportJob>> {
    core.library.jobs().await.map_err(message)
}
#[tauri::command]
pub async fn cancel_export(core: App<'_>, id: String) -> Reply<()> {
    core.cancel_export(id).await.map_err(message)
}
#[tauri::command]
pub async fn retry_export(core: App<'_>, id: String) -> Reply<()> {
    core.retry_export(id).await.map_err(message)
}
#[tauri::command]
pub async fn reveal_recording(app: tauri::AppHandle, core: App<'_>, id: String) -> Reply<()> {
    let path = core.master_path(id).await.map_err(message)?;
    app.opener().reveal_item_in_dir(path).map_err(message)
}
#[tauri::command]
pub async fn reveal_export(app: tauri::AppHandle, core: App<'_>, id: String) -> Reply<()> {
    let path = core.export_path(id).await.map_err(message)?;
    app.opener().reveal_item_in_dir(path).map_err(message)
}
#[tauri::command]
pub async fn recover_recording(core: App<'_>, id: String) -> Reply<Recording> {
    core.recover(id).await.map_err(message)
}
#[tauri::command]
pub async fn import_media(app: tauri::AppHandle, core: App<'_>) -> Reply<Option<Recording>> {
    if core.is_busy() {
        return Err("Import after the current recording has stopped".into());
    }
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import local H.264 / AAC media")
            .add_filter("Video", &["mkv", "mp4"])
            .blocking_pick_file()
    })
    .await
    .map_err(message)?;
    match selected {
        Some(file) => Ok(Some(
            core.import_file(file.into_path().map_err(message)?)
                .await
                .map_err(message)?,
        )),
        None => Ok(None),
    }
}
#[tauri::command]
pub async fn relink_recording(app: tauri::AppHandle, core: App<'_>, id: String) -> Reply<bool> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Locate the original recording master")
            .add_filter("Video", &["mkv", "mp4"])
            .blocking_pick_file()
    })
    .await
    .map_err(message)?;
    match selected {
        Some(file) => {
            core.relink(id, file.into_path().map_err(message)?)
                .await
                .map_err(message)?;
            Ok(true)
        }
        None => Ok(false),
    }
}
#[tauri::command]
pub fn diagnostics(app: tauri::AppHandle, core: App<'_>) -> Vec<Diagnostic> {
    let mut d = core.diagnostics();
    if let Some(error) = app
        .state::<crate::DesktopState>()
        .shortcut_error
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
    {
        d.push(Diagnostic {
            name: "Global shortcuts".into(),
            status: "attention".into(),
            detail: error,
        });
    }
    d
}
#[tauri::command]
pub async fn backup_library(app: tauri::AppHandle, core: App<'_>) -> Reply<String> {
    let path = core.backup().await.map_err(message)?;
    app.opener().reveal_item_in_dir(&path).map_err(message)?;
    Ok(
        "Consistent local SQLite backup created. Recordings remain in their original folders."
            .into(),
    )
}
#[tauri::command]
pub fn quit_application(app: tauri::AppHandle) {
    crate::request_quit(app);
}
