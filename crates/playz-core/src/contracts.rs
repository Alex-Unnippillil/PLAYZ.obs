// SPDX-License-Identifier: GPL-2.0-or-later
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Phase { Idle, Preparing, Recording, Finalizing, Ready, Interrupted, Failed }
impl Phase {
    pub fn busy(self) -> bool { matches!(self, Self::Preparing | Self::Recording | Self::Finalizing) }
    pub fn as_str(self) -> &'static str { match self { Self::Idle => "idle", Self::Preparing => "preparing", Self::Recording => "recording", Self::Finalizing => "finalizing", Self::Ready => "ready", Self::Interrupted => "interrupted", Self::Failed => "failed" } }
    pub fn permits(self, next: Self) -> bool {
        use Phase::*;
        self == next || matches!((self, next),
            (Idle | Ready | Failed | Interrupted, Preparing) |
            (Preparing, Recording | Failed | Interrupted) |
            (Recording, Finalizing | Interrupted | Failed) |
            (Finalizing, Ready | Interrupted | Failed) |
            (Idle, Ready) | (Interrupted | Failed | Ready, Finalizing))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub schema_version: u32,
    pub recording_folder: String,
    pub capture_kind: String,
    pub target_id: String,
    pub target_label: String,
    pub encoder_id: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub bitrate_kbps: u32,
    pub desktop_audio: bool,
    pub audio_output_id: String,
    pub microphone_id: String,
    pub hotkey_record: String,
    pub hotkey_bookmark: String,
    pub hide_to_tray: bool,
    pub theme: String,
    pub reserve_gib: u32,
}
impl Settings {
    pub fn new(folder: String) -> Self {
        Self { schema_version: 1, recording_folder: folder, capture_kind: "window".into(), target_id: String::new(), target_label: String::new(), encoder_id: "obs_x264".into(), width: 1920, height: 1080, fps: 30, bitrate_kbps: 10000, desktop_audio: true, audio_output_id: "default".into(), microphone_id: String::new(), hotkey_record: "Control+Shift+F9".into(), hotkey_bookmark: "Control+Shift+F10".into(), hide_to_tray: true, theme: "dark".into(), reserve_gib: 2 }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 { return Err("Settings version is not supported by this build".into()); }
        if !matches!(self.capture_kind.as_str(), "window" | "game") { return Err("Select window or game capture; monitor capture is not enabled".into()); }
        if !matches!((self.width, self.height), (1920, 1080) | (1280, 720)) || !matches!(self.fps, 30 | 60) { return Err("Choose 1080p or 720p at 30 or 60 fps".into()); }
        if !(2000..=80000).contains(&self.bitrate_kbps) || !(1..=100).contains(&self.reserve_gib) { return Err("Bitrate or disk reserve is out of range".into()); }
        if !matches!(self.theme.as_str(), "dark" | "light" | "system") { return Err("Invalid theme".into()); }
        if self.hotkey_record == self.hotkey_bookmark || self.hotkey_record.len() > 80 || self.hotkey_bookmark.len() > 80 { return Err("Choose different valid shortcuts".into()); }
        for text in [&self.target_id, &self.target_label, &self.encoder_id, &self.audio_output_id, &self.microphone_id] {
            if text.len() > 2048 || text.contains('\0') { return Err("Invalid device or target identifier".into()); }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Choice { pub id: String, pub label: String }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CaptureTarget { pub id: String, pub label: String, pub kind: String }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Encoder { pub id: String, pub label: String, pub hardware: bool, pub hardware_validated: bool }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Capabilities { pub protocol: u32, pub engine_version: String, pub targets: Vec<CaptureTarget>, pub encoders: Vec<Encoder>, pub audio_outputs: Vec<Choice>, pub audio_inputs: Vec<Choice> }

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Snapshot {
    pub phase: Phase,
    pub recording_id: Option<String>,
    pub elapsed_ms: f64,
    pub written_bytes: String,
    pub free_bytes: String,
    pub error: Option<String>,
    pub capture_warning: Option<String>,
    pub engine_connected: bool,
    pub settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Recording {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub phase: Phase,
    pub duration_ms: f64,
    pub bytes: String,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub notes: String,
    pub source_label: String,
    pub capture_kind: String,
    pub has_playback: bool,
    pub resume_ms: f64,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct LibraryPage { pub items: Vec<Recording>, pub total: u32 }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct Details { pub title: String, pub favorite: bool, pub tags: Vec<String>, pub notes: String }
impl Details {
    pub fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() || self.title.len() > 180 || self.notes.len() > 10000 || self.tags.len() > 20 || self.tags.iter().any(|t| t.is_empty() || t.len() > 40 || t.contains('\0')) { return Err("Title, tags or notes exceed their limits".into()); }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Bookmark { pub id: String, pub recording_id: String, pub position_ms: f64, pub label: String, pub note: String }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ExportMode { Accurate, Fast }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct ExportRequest { pub recording_id: String, pub start_ms: f64, pub end_ms: f64, pub mode: ExportMode, pub name: String }
impl ExportRequest {
    pub fn validate(&self, duration_ms: f64) -> Result<(), String> {
        if !self.start_ms.is_finite() || !self.end_ms.is_finite() || self.start_ms < 0.0 || self.end_ms - self.start_ms < 250.0 || self.end_ms > duration_ms + 1.0 { return Err("Choose a trim interval of at least 0.25 seconds within this recording".into()); }
        if self.name.trim().is_empty() || self.name.len() > 100 || self.name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) { return Err("Use a filename without path separators or reserved characters".into()); }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExportJob { pub id: String, pub recording_id: String, pub state: String, pub mode: ExportMode, pub start_ms: f64, pub end_ms: f64, pub name: String, pub progress: f64, pub error: Option<String> }
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Diagnostic { pub name: String, pub status: String, pub detail: String }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn state_machine_rejects_shortcuts() { assert!(!Phase::Idle.permits(Phase::Recording)); assert!(Phase::Preparing.permits(Phase::Recording)); assert!(!Phase::Recording.permits(Phase::Ready)); }
    #[test] fn settings_require_explicit_scope() { let mut s = Settings::new("C:\\Videos".into()); s.capture_kind = "monitor".into(); assert!(s.validate().is_err()); }
    #[test] fn settings_default_mic_is_off() { assert!(Settings::new("C:\\Videos".into()).microphone_id.is_empty()); }
    #[test] fn export_rejects_nan_and_traversal() { let mut r = ExportRequest { recording_id: "x".into(), start_ms: f64::NAN, end_ms: 1000.0, mode: ExportMode::Accurate, name: "clip".into() }; assert!(r.validate(2000.0).is_err()); r.start_ms=0.0; r.name="../secret".into(); assert!(r.validate(2000.0).is_err()); }
    #[test] fn unknown_setting_fields_fail() { let mut s = serde_json::to_value(Settings::new("C:\\Videos".into())).unwrap(); s["shell_command"] = "bad".into(); assert!(serde_json::from_value::<Settings>(s).is_err()); }
}
