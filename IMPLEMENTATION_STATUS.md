# PLAYZ 0.1 — local engineering preview

**A real local build exists with native capture and an installed import/play/export/restart workflow.** Packages remain unsigned. This is not a production release: clean Windows 11 offline installation, real-game and captured-audio tests, GPU qualification and sustained-session acceptance remain open. League automation is not enabled.

The original tested installer, hashes, build source and independently passing installed-workflow run are recorded in [the historical local preview handoff](docs/LOCAL_PREVIEW_HANDOFF.md). That installer is from `553672a973f7d39131707045f75db4fcecaeb608` and does not contain subsequent code increments. New CI packages retain their own commit and hash; do not relabel an older artifact.

## Development increments

The receipt-backed export recovery increment was merged in PR #1 as `f4a6b5c87dee9d188077ea55fff98aa6ac8d035a`; its tested tree is `8d7f35cdeb90461ccb8ffa5535bf89641ad1b146`. Exact package evidence is recorded on that PR, separately from the historical installer below.

PR #2 added **Library > Removed** and was merged as `fbcfc45622d50d547800ff46944ca7bb5cce4c8c`: searchable/paginated removed entries, explicit restoration after restart, literal search text, and atomic removal guards that reject active/missing entries. See [removed-recording behavior and verification](docs/REMOVED_RECORDINGS.md). This restores catalog visibility, not deleted video files or an entire database backup. No schema or dependency change was required.

PR #3 adds the [simplified local UI](docs/UI_EXPERIENCE.md): quality presets with explicit save, protected in-app settings navigation, searchable quick navigation, player-local shortcuts, bounded 15/30-second clip selection, advanced/recovery disclosures, export filters and responsive dark/light layouts. The native production core, dependencies, contracts and permissions are unchanged. Tests distinguish renderer-only fixtures from the newly packaged Windows application's real commands. The exact source, results, screenshots and installer provenance belong to [PR #3 and its checks](https://github.com/Alex-Unnippillil/PLAYZ.obs/pull/3); implementation alone does not establish passing execution. Every relevant final-commit gate must pass before merge.

## Historical baseline evidence

| Check | Exact source / Actions run | Result and scope |
|---|---|---|
| Native host and protocol | `ee134a144ff348467a05efccaa7745931a4d695a` / `35911118637` | Original C++ adapter compiled against pinned OBS; 1,784 verified C exports; CTest passed. |
| Frontend and dependency audit | `09f528e540f5b86df9db204517b86aa64be23529` / `35912714444` | Frozen install, strict TypeScript, 30 tests in four files, production Vite build and audit passed. Historical baseline, not evidence for the changed UI. |
| Hardened core | `e5a95359195058e05e6dff88cb43f45c52a0c1ac` / `35915948438` | Windows and Ubuntu passed rustfmt, 23 unit/property tests, two export-safety tests, DTO drift and export-parser checks. |
| Actual FFmpeg media | `553672a973f7d39131707045f75db4fcecaeb608` / `35914868736` | Real fixture remux/accurate trim, decoded frame bounds, generated audio signal, cancellation and unchanged original hash passed. |
| Actual selected-window capture | `f4f42448f2e597f4a8c45178337d38cb1e2222b6` / `35914615521` | Rust/libobs capture, finalize, MP4 asset, accurate export and reopened catalog/bookmark passed. 7,733 ms, x264, 720p30, Hyper-V Video. Audio disabled. |
| Bundled SQLite runtime | Same selected-window run | Actual runtime **3.53.2**, queried rather than inferred from wrapper version. |
| Full NSIS installer | Build source `553672a973f7d39131707045f75db4fcecaeb608` | Built successfully; installer SHA-256 `0246b96abc885d6478c43ddb6d7fe2c439270866aed5a20e9f35eea0cf7418c9`. Initial UI driver failed; the exact artifact subsequently passed the independent test below. |
| Actual installed Tauri workflow | Test driver `a4ed28c2b49694207904cd0ab82691bd4ada306e` / `35917885507` | Passed native import picker, WebView2 playhead advancement, real export completion, second-launch single instance, safe idle quit and persisted library after restart. No mock backend. |

Hosted environment is Windows Server 2022, not a clean Windows 11 consumer machine. These checks do not establish game hooking, recorded audio, hardware encoders, all codecs/editions, network-isolated installation or two-hour stability. See `docs/VERIFICATION_LOG.md`, the historical handoff and each increment's PR for provenance.

## Requirements-to-implementation matrix

| Requirement | Location | Implementation / remaining acceptance |
|---|---|---|
| Local desktop shell | `apps/desktop/src`, `src-tauri/src/main.rs` | Library, Review, Exports, Settings and Diagnostics with real local commands. Simplified workflows and renderer reflow/axe tests are described in `docs/UI_EXPERIENCE.md`; full Windows scaling/assistive-technology matrix remains open. |
| Capture setup and draft safety | `features/Settings.tsx`, `App.tsx` | Explicit source/encoder/audio choices; presets change quality only; advanced fields and validation; Save/Discard; in-app navigation/quit draft guard. Drafts are not crash/reload/OS-quit durable. |
| Capture backend | `native/recorder`, native bootstrap | Original libobs host; real selected-window capture proven. Specific game mode and GPU families require real-game/hardware tests. No Ascent proprietary wrapper or monitor fallback. |
| Audio and explicit scope | Native discovery/start, Settings/core | Microphone off until selected; unavailable saved device IDs stay visible. System output may include other apps; one mixed track. Captured audio/device-loss acceptance remains open. |
| Supervision and IPC | `recorder.rs`, `core.rs`, `process.rs` | Serialized/idempotent decisions, bounded private inherited handles, owned processes. Renderer-independent capture. Controller failure can interrupt MKV; fault matrix remains open. |
| Durable library | `library.rs`, migrations | Single bounded writer, foreign keys, parameterized SQL, WAL/FULL, runtime version check and consistent backup API. Restart passed; full restore/upgrade/downgrade acceptance open. |
| Manifests/recovery | `core.rs`, `library.rs`, `paths.rs` | Versioned manifests and known interrupted-entry reconciliation. Broader external-move/reparse-race/watch tests remain open. |
| Playback | `media.rs`, scoped asset command, Review | Compatible MKV→MP4 remux; seek/speed/volume/fullscreen/resume plus player-local shortcuts. Multi-gigabyte and edition/codec matrix open; no frame-accurate browser stepping claim. |
| Export | `media.rs`, Review and Export Queue | Accurate default; fast mode is keyframe-aligned, not exact. Quick selection stays within coverage. Persistent queue/cancel/retry and view filters; heavy work pauses/restarts during capture. |
| Output ownership/recovery | `media.rs`, `media_receipt.rs`, safety/media tests | Receipt-backed SHA-256 reconciliation of published or verified temporary clips. Unknown/changed output fails closed; cancellation/pause checks during hashing. See `docs/EXPORT_RECOVERY.md` and PR #1 evidence. |
| Editing/bookmarks | Library commands and UI | Titles, tags, notes, favorites, resume and bookmark CRUD/import. Live bookmark survived catalog reopen in capture test. |
| Relink/removal | `paths::registered_relink`, core, Recording tools | Relink requires complete original UUID folder and matching manifest. Unrelated videos use Import. Removal hides entry while preserving media/exports; Library > Removed can restore it after restart. |
| Shortcuts/tray/quit/instance | Tauri host; quick navigation/player UI | Native global shortcuts remain authoritative; UI-local shortcuts avoid typing/repeat conflicts. Installed single-instance/idle-quit/restart passed in earlier increments; active-capture hotkey/tray/fault scenarios still require acceptance. |
| Native/installed fixtures | `tools/capture-fixture`, `scripts/test-installed*`, integration tests | Real application/core/media paths. Distinct renderer fixtures and native/installed-package evidence; no shipped mock recording backend. |
| League and synchronization | `league.rs` | Preparatory pure mapping/candidate tests only. No live client, TLS trust bundle, automation or durable backfill. Manual live timing uses encoded frame count, not calibrated exact PTS. |
| Offline packaging | Tauri config, build/package scripts | Full per-user NSIS with WebView2 offline installer mode. Clean offline Windows 11 acceptance remains separate. Superseded PR builds are cancelled; current-head gates remain mandatory. |
| Signing/SBOM/source compliance | `third_party`, release checklist | Native hashes/notices recorded. Signing identity absent; complete Rust/npm/native SBOM, corresponding-source and license review remain open. |

## First-build boundaries

SDR H.264/AAC at 720p/1080p, 30/60 fps. No HDR, separate microphone tracks, per-game audio isolation, live meters, automatic encoder fallback or autostart. No cloud/account/telemetry, automatic deletion, updater, publishing or enabled League automation.

A detected encoder is not hardware-qualified. CPU/RAM/GPU impact, A/V drift, two-hour stability and NVIDIA/AMD/Intel coverage are unmeasured. Preserve originals and verify a short recording and export before important sessions. `RELEASE_CHECKLIST.md` remains authoritative for production gates.
