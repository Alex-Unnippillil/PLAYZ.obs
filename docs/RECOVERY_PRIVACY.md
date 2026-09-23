# Recovery, storage and privacy

## Data locations

The Tauri host resolves per-user application-local-data and Videos known folders through Windows APIs; it does not hardcode an English Videos folder. The catalog/settings are stored under the application data directory. The default video root is the resolved Videos folder plus `PLAYZ`, or a local directory explicitly selected in the native picker.

Use a local NTFS volume. Network shares, symbolic links and detected reparse points are refused for managed paths. Do not place the live SQLite database in an actively synchronized cloud folder. Ensure enough room for the original MKV, the MP4 playback copy, temporary exports and the configured free-space reserve.

## Interrupted recording

Keep the entire recording directory. Reopen PLAYZ; interrupted catalog entries remain visible. Use **Recover / prepare playback** from Match review. The original MKV is probed and preserved. A recoverable compatible stream may be remuxed into a new playback asset. A corrupt or incomplete original may not be decodable; the application must not turn missing frames into a claim of continuous footage.

For missing storage, reconnect the drive before recovery. Relink is an explicit picker action for a known recording. Do not choose unrelated media merely because it has a matching duration. Preserve the recording's directory and its manifest when moving it. Do not manually replace existing playback/export files with other media.

On controller failure, Windows job ownership may terminate native capture immediately; last frames and muxer buffers can be lost. Renderer reload is a different event: the Rust controller continues running and owns the capture independently.

## Backups and deletion

**Create catalog backup** uses the SQLite backup API. It does not copy video files. Copy the full recording directory trees separately, preferably when no recording, recovery or export is active. A complete restore requires both the catalog backup and its media. End-user automated restore is not yet exposed; test restoration before adopting a backup as the only copy.

**Remove entry** hides a recording without deleting the master, playback asset or previously exported clips. Undo is available in the current review view. No destructive media-delete button or automatic space-cleaning routine is included.

Do not copy only `library.sqlite` while the WAL is active and assume that is a consistent backup. Never delete originals to fix a corrupt catalog.

## Privacy and network behavior

PLAYZ requires no account, backend or paid API. It does not upload recordings, send telemetry, install a service/driver, add a firewall exception or weaken security software. The installed UI uses bundled static assets. The first preview does not have a network updater or active League connection.

System-output recording can include unrelated applications playing through that output device. Microphone capture is off by default and requires selecting an input. There is no silent microphone substitution.

Diagnostic messages can contain local context. Native stderr is drained and discarded by default; a durable, redacted diagnostic bundle exporter is not yet implemented. Review any screenshot, log or path before sharing it manually. The application does not automatically report crashes or upload diagnostic bundles.

## When something fails

A source error: open the game, refresh devices, explicitly select the same scope and save. Do not widen capture unintentionally. An encoder error: choose another discovered encoder yourself, make a test recording and review its quality/performance. Disk errors: preserve files, free space manually or select another local folder after capture stops. Playback error: use the compatibility profile, inspect Diagnostics and preserve the original before recovery.

An unsigned test installer may trigger Windows trust warnings. Do not disable antivirus or anti-cheat to run it. Public distribution remains blocked until package integrity, licensing, signing and hardware acceptance are completed.
