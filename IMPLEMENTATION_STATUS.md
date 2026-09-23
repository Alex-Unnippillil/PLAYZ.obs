# PLAYZ 0.1 — local engineering preview

The manual local workflow is implemented. The first full unsigned NSIS installer built successfully. A real selected-window capture, finalize, catalog restart and accurate clip-export test has passed. **Production acceptance is not complete.** Clean Windows 11 offline installation, packaged playback, captured audio, real-game/GPU and sustained-session tests remain separate gates. League automation is not enabled.

## Recorded evidence

| Evidence | Exact source / Actions run | Result |
|---|---|---|
| Original C++ libobs host and protocol CTest | `ee134a144ff348467a05efccaa7745931a4d695a` / `35911118637` | Passed Windows build and protocol test; verified 1,784 C exports from pinned OBS DLL. |
| Frontend and audit | `09f528e540f5b86df9db204517b86aa64be23529` / `35912714444` | Frozen install, strict TypeScript, 30 tests in four files, Vite production build and audit passed. |
| Core/contracts and actual FFmpeg media | Same source/run | Passed labeled decoded-frame trim bounds, generated audio signal, duration, cancellation and original-hash preservation. |
| Full unsigned NSIS package | Same source/run, artifact `10774352034` | Successfully produced; ZIP size 320,829,479 bytes. ZIP hash differs from embedded installer hash. See its `package-evidence.json`. |
| Real selected-window workflow | `f4f42448f2e597f4a8c45178337d38cb1e2222b6` / `35914615521` | Actual Rust/libobs capture, stop, playback asset/export and reopened catalog/bookmark passed. 7,733 ms; software x264, 720p30, Hyper-V Video; audio disabled. |
| Actual SQLite runtime | Same selected-window run | **3.53.2**, queried from the bundled runtime. |
| Recovery hardening | `d826b33223bbf1d1c4c2a07baeed7b54c4d20af5` | Strict relink ownership, existing-output refusal, pre-cancel and Windows filename validation committed with tests. |

`docs/VERIFICATION_LOG.md` records artifact hashes and environment. Earlier evidence does not certify later changes; rerun affected gates on the exact final commit. `package-evidence.json` binds each installer to its source/hash/signature status. The original media-test formatting failure was corrected, not suppressed.

## Requirements-to-implementation matrix

| Requirement | Implementation | Status / remaining gate |
|---|---|---|
| Desktop shell and local data | `apps/desktop/src`, `src-tauri/src/main.rs` | Library, Review, Exports, Settings, Diagnostics; actual local commands, no mock capture. Frontend checks passed; installed UI/scaling acceptance separate. |
| Capture backend | `native/recorder`, `scripts/bootstrap.ps1` | Original host around pinned upstream OBS 32.2.2. Real window capture proven in hosted environment. Real games/GPU encoders unqualified. |
| Explicit scope / privacy | Native discovery/start; Settings/core validation | Specific window/game only, no monitor fallback; microphone off by default. Captured-audio/device-loss evidence open. |
| Supervision / IPC / idempotency | `recorder.rs`, `core.rs`, `process.rs` | Serialized decisions, bounded private inherited handles, child ownership. Renderer-independent capture. Controller crash can interrupt an MKV; complete fault matrix open. |
| Durable catalog | `library.rs`, migrations | Bounded writer, foreign keys, parameterized SQL, WAL/FULL, consistent backup, patched runtime check. Restart tested; full restore/upgrade cases open. |
| Manifests / reconciliation | `core.rs`, `library.rs`, `paths.rs` | Versioned manifests and interrupted-entry recovery. External move/watch/reparse-race matrix not complete. |
| Offline playback | `media.rs`, scoped native asset command, Review | Real compatible MKV→MP4 remux. HTML video seek/speed/volume/fullscreen/resume implemented. Packaged large-file/edition/codec matrix open. |
| Accurate / fast export | `media.rs`, Review/Export Queue | Accurate real-media test passed. Fast mode explicitly keyframe-aligned, not exact. Persistent queue/cancel/retry and pause/restart during capture implemented. |
| Export ownership safety | `media.rs`, `contracts.rs`, `tests/export_safety.rs` | Existing ambiguous destination fails closed without overwrite/adoption. Pre-cancel check before spawning. Receipt-backed automatic adoption not implemented. |
| Editing / bookmarks | Native library commands and views | Title/tags/notes/favorites/resume/bookmark CRUD/import. Capture test recovered saved bookmark after catalog reopen. |
| Relink / removal | `paths::registered_relink`, core commands | Complete original UUID folder + matching manifest required. Unrelated files use Import. Removal hides entry and preserves originals/exports. |
| Hotkeys / tray / single instance / quit | `src-tauri/src/main.rs` | Maintained Tauri integrations. Installed smoke harness added; active-recording lifecycle acceptance open. |
| Capture integration harness | `tools/capture-fixture`, `tests/capture_pipeline.rs` | Real Rust/libobs/media/catalog test, not shipped. First pass documented. Not game/audio/hardware-family certification. |
| League and media clock mapping | `league.rs` | Preparatory pure mapping/candidate tests only. No live integration, certificate bundle, auto-recording or backfill. Live bookmarks use frame-count timing, not calibrated exact PTS. |
| Offline installer | Tauri config; build/package scripts | Per-user NSIS with full WebView2 offline installer mode; first package build passed. Clean offline installation not yet accepted. |
| Signing / SBOM / source compliance | `third_party`, release checklist | Native hashes/notices gathered. Signing identity absent; full Rust/npm/native SBOM and corresponding-source audit still required. No public release. |

## First-build limits

SDR H.264/AAC, 1080p/720p at 30/60 fps. One mixed audio track; system output may include other applications. No live meters, per-game isolation, separate mic tracks, HDR, automatic encoder fallback, automatic deletion, cloud/account/telemetry/updater/publishing or League automation.

A detected encoder is not hardware-qualified. CPU/GPU/RAM impact, two-hour stability, A/V drift and NVIDIA/AMD/Intel coverage are unmeasured. Preserve originals and make a short test recording before an important session. Follow `docs/ACCEPTANCE.md`, `docs/RECOVERY_EDGE_CASES.md` and `RELEASE_CHECKLIST.md` before changing the release classification.
