# PLAYZ 0.1 — local engineering preview

**A real local build now exists and the installed import/play/export/restart workflow passes.** The full installer is unsigned. This is not a production release: clean Windows 11 offline installation, real-game and captured-audio tests, GPU qualification and sustained-session acceptance remain open. League automation is not enabled.

The exact tested installer, hashes, build source and independently passing installed-workflow run are recorded in [the local preview handoff](docs/LOCAL_PREVIEW_HANDOFF.md). The tested installer is from `553672a973f7d39131707045f75db4fcecaeb608`; later changes through the handoff are test/CI/documentation only, not application code. New CI packages retain their own commit and hash; do not relabel an older artifact.

## Evidence

| Check | Exact source / Actions run | Result and scope |
|---|---|---|
| Native host and protocol | `ee134a144ff348467a05efccaa7745931a4d695a` / `35911118637` | Original C++ adapter compiled against pinned OBS; 1,784 verified C exports; CTest passed. |
| Frontend and dependency audit | `09f528e540f5b86df9db204517b86aa64be23529` / `35912714444` | Frozen install, strict TypeScript, 30 tests in four files, production Vite build and audit passed. Application UI source remains unchanged. |
| Hardened core | `e5a95359195058e05e6dff88cb43f45c52a0c1ac` / `35915948438` | Windows and Ubuntu passed rustfmt, 23 unit/property tests, two export-safety tests, DTO drift and export-parser checks. |
| Actual FFmpeg media | `553672a973f7d39131707045f75db4fcecaeb608` / `35914868736` | Real fixture remux/accurate trim, decoded frame bounds, generated audio signal, cancellation and unchanged original hash passed. |
| Actual selected-window capture | `f4f42448f2e597f4a8c45178337d38cb1e2222b6` / `35914615521` | Rust/libobs capture, finalize, MP4 asset, accurate export and reopened catalog/bookmark passed. 7,733 ms, x264, 720p30, Hyper-V Video. Audio disabled. |
| Bundled SQLite runtime | Same selected-window run | Actual runtime **3.53.2**, queried rather than inferred from wrapper version. |
| Full NSIS installer | Build source `553672a973f7d39131707045f75db4fcecaeb608` | Built successfully; installer SHA-256 `0246b96abc885d6478c43ddb6d7fe2c439270866aed5a20e9f35eea0cf7418c9`. Initial UI driver failed; the exact artifact subsequently passed the independent test below. |
| Actual installed Tauri workflow | Test driver `a4ed28c2b49694207904cd0ab82691bd4ada306e` / `35917885507` | Passed native import picker, WebView2 playhead advancement, real export completion, second-launch single instance, safe idle quit and persisted library after restart. No mock backend. |

Hosted environment is Windows Server 2022, not a clean Windows 11 consumer machine. These checks do not establish game hooking, recorded audio, hardware encoders, all codecs/editions, network-isolated installation or two-hour stability. See `docs/VERIFICATION_LOG.md` and `docs/LOCAL_PREVIEW_HANDOFF.md` for provenance.

## Requirements-to-implementation matrix

| Requirement | Location | Implementation / remaining acceptance |
|---|---|---|
| Local desktop shell | `apps/desktop/src`, `src-tauri/src/main.rs` | Library, Review, Exports, Settings and Diagnostics with real local commands. Basic installed workflow passed; full scaling/accessibility matrix open. |
| Capture backend | `native/recorder`, native bootstrap | Original libobs host; real selected-window capture proven. Specific game mode and GPU families require real-game/hardware tests. No Ascent proprietary wrapper or monitor fallback. |
| Audio and explicit scope | Native discovery/start, Settings/core | Microphone off until selected; system output may include other apps. One mixed track. Captured audio/device-loss acceptance remains open. |
| Supervision and IPC | `recorder.rs`, `core.rs`, `process.rs` | Serialized/idempotent decisions, bounded private inherited handles, owned processes. Renderer-independent capture. Controller failure can interrupt MKV; fault matrix remains open. |
| Durable library | `library.rs`, migrations | Single bounded writer, foreign keys, parameterized SQL, WAL/FULL, runtime version check and consistent backup API. Restart passed; full restore/upgrade/downgrade acceptance open. |
| Manifests/recovery | `core.rs`, `library.rs`, `paths.rs` | Versioned manifests and known interrupted-entry reconciliation. Broader external-move/reparse-race/watch tests remain open. |
| Playback | `media.rs`, scoped asset command, Review | Compatible MKV→MP4 remux and actual packaged playback passed. Seek/speed/volume/fullscreen/resume implemented; multi-gigabyte and edition/codec matrix open. |
| Export | `media.rs`, Review and Export Queue | Actual UI export and decoded accurate-trim tests passed. Fast mode is keyframe-aligned, not exact. Persistent queue/cancel/retry; heavy work pauses/restarts during capture. |
| Output ownership | `media.rs`, `contracts.rs`, `tests/export_safety.rs` | Existing ambiguous output fails closed, never overwritten/adopted; pre-cancel before spawn; Windows filename validation. Receipt-backed automatic final-output adoption not implemented. |
| Editing/bookmarks | Library commands and UI | Titles, tags, notes, favorites, resume and bookmark CRUD/import. Live bookmark survived catalog reopen in capture test. |
| Relink/removal | `paths::registered_relink`, core | Relink requires complete original UUID folder and matching manifest. Unrelated videos use Import. Removal hides entry while preserving media/exports. |
| Shortcuts/tray/quit/instance | Tauri host | Maintained plugins. Installed single-instance/idle-quit/restart passed; active-capture hotkey/tray/fault scenarios still require acceptance. |
| Native/installed fixtures | `tools/capture-fixture`, `scripts/test-installed*`, integration tests | Real application/core/media paths, no shipped test server or mock. Distinct fixture and installed-package evidence. |
| League and synchronization | `league.rs` | Preparatory pure mapping/candidate tests only. No live client, TLS trust bundle, automation or durable backfill. Manual live timing uses encoded frame count, not calibrated exact PTS. |
| Offline packaging | Tauri config, build/package scripts | Full per-user NSIS with WebView2 offline installer mode built and installed. Clean offline Windows 11 acceptance remains separate. |
| Signing/SBOM/source compliance | `third_party`, release checklist | Native hashes/notices recorded. Signing identity absent; complete Rust/npm/native SBOM, corresponding-source and license review remain open. |

## First-build boundaries

SDR H.264/AAC at 720p/1080p, 30/60 fps. No HDR, separate microphone tracks, per-game audio isolation, live meters, automatic encoder fallback or autostart. No cloud/account/telemetry, automatic deletion, updater, publishing or enabled League automation.

A detected encoder is not hardware-qualified. CPU/RAM/GPU impact, A/V drift, two-hour stability and NVIDIA/AMD/Intel coverage are unmeasured. Preserve originals and verify a short recording and export before important sessions. `RELEASE_CHECKLIST.md` remains authoritative for production gates.
