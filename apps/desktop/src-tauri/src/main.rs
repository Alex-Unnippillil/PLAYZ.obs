// SPDX-License-Identifier: GPL-2.0-or-later
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(not(windows))]
compile_error!("PLAYZ desktop targets Windows x64. Portable domain tests live in playz-core.");

mod commands;
use playz_core::{
    Core,
    contracts::{Phase, Settings},
};
use std::{
    collections::HashSet,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

struct DesktopState {
    quit_requested: AtomicBool,
    pressed: Mutex<HashSet<u32>>,
    shortcut_error: Mutex<Option<String>>,
    settings_gate: tokio::sync::Mutex<()>,
}
fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn notify(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("playz:notice", message);
    let _ = app
        .notification()
        .builder()
        .title("PLAYZ")
        .body(message)
        .show();
}
fn toggle_recording(app: tauri::AppHandle) {
    let Some(core) = app.try_state::<Arc<Core>>().map(|s| s.inner().clone()) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let result = if matches!(core.snapshot().phase, Phase::Recording | Phase::Preparing) {
            core.stop().await
        } else {
            core.start(uuid::Uuid::new_v4().to_string()).await
        };
        if let Err(e) = result {
            notify(&app, &e.to_string());
        }
        let _ = app.emit("playz:changed", ());
    });
}
fn bookmark(app: tauri::AppHandle) {
    let Some(core) = app.try_state::<Arc<Core>>().map(|s| s.inner().clone()) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        match core.live_bookmark().await {
            Ok(_) => notify(&app, "Bookmark saved locally"),
            Err(e) => notify(&app, &e.to_string()),
        }
        let _ = app.emit("playz:changed", ());
    });
}
fn register_shortcuts(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let record: Shortcut = settings
        .hotkey_record
        .parse()
        .map_err(|_| "Invalid recording shortcut")?;
    let mark: Shortcut = settings
        .hotkey_bookmark
        .parse()
        .map_err(|_| "Invalid bookmark shortcut")?;
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    app.state::<DesktopState>()
        .pressed
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clear();
    app.global_shortcut()
        .register(record)
        .map_err(|_| "Recording shortcut is already used by another application".to_string())?;
    if app.global_shortcut().register(mark).is_err() {
        let _ = app.global_shortcut().unregister_all();
        return Err("Bookmark shortcut is already used by another application".into());
    }
    Ok(())
}
fn finish_quit(app: tauri::AppHandle) {
    let core = app.state::<Arc<Core>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = core.shutdown().await {
            let message = format!(
                "PLAYZ stopped with a recovery warning: {e}\nAny original media has been preserved. Reopen PLAYZ and use Recover."
            );
            app.dialog()
                .message(message)
                .title("PLAYZ recovery notice")
                .show(move |_| app.exit(0));
        } else {
            app.exit(0);
        }
    });
}
fn request_quit(app: tauri::AppHandle) {
    if app
        .state::<DesktopState>()
        .quit_requested
        .swap(true, Ordering::AcqRel)
    {
        return;
    }
    if app.state::<Arc<Core>>().is_busy() {
        let target = app.clone();
        app.dialog().message("Stop and finalize the recording, then quit PLAYZ? This may take a moment. Your original recording will be preserved.").title("Finish recording before quitting").buttons(MessageDialogButtons::OkCancelCustom("Stop and quit".into(),"Keep recording".into())).show(move |yes|{if yes{finish_quit(target);}else{target.state::<DesktopState>().quit_requested.store(false,Ordering::Release);}});
    } else {
        finish_quit(app);
    }
}
fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .with_target(false)
        .init();
    let app=tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|show_window(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event|{
            let Some(state)=app.try_state::<DesktopState>()else{return;};
            let mut pressed=state.pressed.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            if event.state()==ShortcutState::Released{pressed.remove(&shortcut.id());return;}
            if !pressed.insert(shortcut.id()){return;}drop(pressed);
            let Some(core)=app.try_state::<Arc<Core>>()else{return;};let settings=core.snapshot().settings;
            if settings.hotkey_record.parse::<Shortcut>().is_ok_and(|s|s==*shortcut){toggle_recording(app.clone());}
            else if settings.hotkey_bookmark.parse::<Shortcut>().is_ok_and(|s|s==*shortcut){bookmark(app.clone());}
        }).build())
        .manage(DesktopState{quit_requested:AtomicBool::new(false),pressed:Mutex::new(HashSet::new()),shortcut_error:Mutex::new(None),settings_gate:tokio::sync::Mutex::new(())})
        .setup(|app|{
            let mut runtime=app.path().resource_dir()?.join("runtime");
            #[cfg(debug_assertions)]{if !runtime.join("obs").exists(){runtime=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/runtime");}}
            let data=app.path().app_local_data_dir()?;
            let videos=app.path().video_dir()?.join("PLAYZ");
            let core=tauri::async_runtime::block_on(async{let c=Core::open(runtime,data,videos).await?;c.spawn_workers();Ok::<_,playz_core::Error>(c)})?;
            app.manage(core.clone());
            if let Err(e)=register_shortcuts(app.handle(),&core.snapshot().settings){*app.state::<DesktopState>().shortcut_error.lock().unwrap_or_else(std::sync::PoisonError::into_inner)=Some(e);}
            let show=MenuItem::with_id(app,"show","Open PLAYZ",true,None::<&str>)?;
            let record=MenuItem::with_id(app,"record","Start / stop recording",true,None::<&str>)?;
            let mark=MenuItem::with_id(app,"bookmark","Bookmark current moment",true,None::<&str>)?;
            let quit=MenuItem::with_id(app,"quit","Quit safely",true,None::<&str>)?;
            let menu=Menu::with_items(app,&[&show,&record,&mark,&quit])?;
            let mut tray=TrayIconBuilder::new().menu(&menu).tooltip("PLAYZ · Local game recorder").on_menu_event(|app,event|match event.id.as_ref(){"show"=>show_window(app),"record"=>toggle_recording(app.clone()),"bookmark"=>bookmark(app.clone()),"quit"=>request_quit(app.clone()),_=>{}}).on_tray_icon_event(|tray,event|{if matches!(event,TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}){show_window(tray.app_handle());}});
            if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone());}tray.build(app)?;
            if let Some(window)=app.get_webview_window("main"){
                if let(Ok(position),Ok(size),Ok(monitors))=(window.outer_position(),window.outer_size(),window.available_monitors()){
                    let visible=monitors.iter().any(|m|{let p=m.position();let s=m.size();i64::from(position.x)+i64::from(size.width)>i64::from(p.x)+64 && i64::from(position.y)+i64::from(size.height)>i64::from(p.y)+64 && i64::from(position.x)<i64::from(p.x)+i64::from(s.width)-64 && i64::from(position.y)<i64::from(p.y)+i64::from(s.height)-64});
                    if !visible{let _=window.center();}
                }
            }
            Ok(())
        })
        .on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();let app=window.app_handle();if app.state::<Arc<Core>>().snapshot().settings.hide_to_tray{let _=window.hide();}else{request_quit(app.clone());}}})
        .invoke_handler(tauri::generate_handler![commands::app_state,commands::discover_devices,commands::list_recordings,commands::list_removed_recordings,commands::get_recording,commands::start_recording,commands::stop_recording,commands::choose_recording_folder,commands::save_settings,commands::playback_asset,commands::edit_recording,commands::remove_recording,commands::restore_recording,commands::save_resume,commands::list_bookmarks,commands::save_bookmark,commands::delete_bookmark,commands::live_bookmark,commands::queue_export,commands::list_exports,commands::cancel_export,commands::retry_export,commands::reveal_recording,commands::reveal_export,commands::recover_recording,commands::import_media,commands::relink_recording,commands::diagnostics,commands::backup_library,commands::quit_application])
        .build(tauri::generate_context!()).expect("PLAYZ could not initialize. Verify local write access and reinstall the complete application package.");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                api.prevent_exit();
                request_quit(app.clone());
            }
        }
    });
}
