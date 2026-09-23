# PLAYZ implementation status — 0.1 local engineering preview

This is a source/build status, not a production or hardware certification. Phase 1 acceptance is **open** until a clean supported Windows 11 installation completes record → restart → find → play → export with the application's WAN access denied. Phase 2 League automation is **not implemented or enabled**.

## Verified evidence to date

| Evidence | Exact revision / run | Result and limits |
|---|---|---|
| Native C++ host + protocol CTest | `ee134a144ff348467a05efccaa7745931a4d695a`, Actions `35911118637` | Passed on hosted Windows Server 2022. Verified 1,784 C exports from pinned OBS DLL. Does not prove capture/hardware. |
| Frozen frontend dependency installation, strict TypeScript, unit tests, production build, dependency audit | `09f528e540f5b86df9db204517b86aa64be23529`, Actions `35912714444`, job `107356328242` | Passed: 30 tests / 4 files. Audit exit zero. Renderer unit tests are not native desktop tests. |
| Rust/core contracts and real FFmpeg media pipeline | Same revision/run, Windows job `107356327994` | Those steps passed. The media test decodes labeled output frames, checks duration/non-silent PCM, cancellation and preservation of the original hash. |
| Core formatting at that revision | `35912714365` | Failed only on formatting of newly added media test; corrected in subsequent source. Re-run on final commit is required. |
| Full desktop/NSIS package | `35912714444` | Still being verified when this status was written. A package is not claimed until its artifact and final hash exist. |

Every later fix invalidates affected earlier acceptance evidence. Final package evidence is stored in the CI artifact `package-evidence.json`, keyed to its exact source commit. Do not substitute a build of a different commit.

## Requirements-to-implementation matrix

| Requirement | Implementation | Status / test / unresolved acceptance |
|---|---|---|
| Original local desktop shell | `apps/desktop/src`, `src-tauri` | Implemented; frontend tests/build pass. Packaged WebView2 interaction and scaling acceptance open. |
| Real capture adapter | `native/recorder`, `scripts/bootstrap.ps1` | Compiles against pinned upstream OBS 32.2.2 headers/runtime; original host, not Ascent proprietary wrapper. Real selected-window/game hardware proof open. |
| Explicit capture scope and microphone opt-in | Native discovery/start validation; Settings form/core validation | Implemented. No whole-desktop fallback. Microphone off by default. Audio device loss and real-game cases require hardware testing. |
| Supervision / idempotency / bounded IPC | `engine.rs`, `core.rs`, `state.rs`, `process.rs` | Unit-tested boundaries; process ownership/inherited private pipes. No promise of uninterrupted recording after controller failure. Full fault-injection matrix open. |
| Patched SQLite and durable library | `library.rs`, migrations, `paths.rs` | Bounded single-writer service, WAL/FULL, runtime version check, consistent backup. Portable tests; actual runtime version must accompany final evidence. |
| Lifecycle manifests / startup recovery | `core.rs`, `library.rs`, `paths.rs` | Implemented for known interrupted entries/manifests. Comprehensive external move/watch/reparse-race tests open. |
| Playback | `media.rs`, Tauri scoped asset command, Review view | Compatible MKV → MP4 remux tested with real FFmpeg. Packaged large-file ranged seeking/WebView2 and Windows N codec matrix open. |
| Accurate and fast export | `media.rs`, Export Queue / Review | Accurate media fixture test passes at cited revision. Fast mode is explicitly keyframe-aligned, not frame-exact. Broader fast-mode boundary tests open. |
| Export safety | `export_safety.rs`, native request/path validation | Reject pre-cancelled jobs and existing ambiguous outputs before spawning. No silent overwrite/adoption. Receipt-backed automatic final-output recovery is not implemented. |
| Library editing / bookmarks | Native commands, SQLite, Library / Review views | Implemented title/tags/notes/favorite/resume/bookmark editing. Local/UI tests; end-to-end desktop evidence open. |
| Relink / removal | `paths::registered_relink`, core commands | Relink requires complete original UUID directory and matching manifest. Import unrelated media. Removal hides catalog entry; no destructive media deletion. |
| Global shortcuts / tray / single instance / quit | `src-tauri/src/lib.rs` | Implemented through maintained Tauri integrations. Interactive lifecycle/conflict tests open. |
| Native capture integration fixture | `tools/capture-fixture`, `scripts/test-capture.ps1`, `tests/capture_pipeline.rs` | Real Rust → libobs → media → restart/export harness; developer-only. Ignored in ordinary cargo tests; explicitly run on interactive Windows. Not a real-game or GPU-family qualification. |
| League integration / event ingestion | `league.rs` pure preparatory logic | Clock/candidate unit fixtures only. No live client, certificate trust bundle, automatic recording, deduplication/backfill or full session workflow. Disabled in UI. |
| Media PTS synchronization | Preparatory pure mapping functions | Not calibrated against actual recorder PTS. Live manual bookmarks currently use encoded-frame-count timing, not a claimed 500-ms precision guarantee. |
| Offline installer | `tauri.conf.json`, `scripts/package.ps1` | Per-user NSIS with full WebView2 offline installer mode. Build/artifact/clean-install verification are separate gates. |
| Signing / complete SBOM / corresponding source | `third_party`, release checklist | Signing identity absent. Runtime hashes/notices collected, but full native/Rust/npm SBOM and corresponding-source audit remain open. No public release. |

## Intentional first-build limits

SDR H.264/AAC only; 1080p/720p at 30/60 fps. System-output audio may include unrelated applications. One mixed audio track; no live meters, per-game isolation, independent microphone tracks, HDR, automatically chosen encoder fallback or claimed hardware validation. No automatic deletion, cloud, account, telemetry, updater, YouTube/Discord publishing or LLM features.

A detected encoder is not a tested encoder. CPU/GPU/RAM impact, two-hour recording stability, A/V drift and the NVIDIA/AMD/Intel matrix have not been measured. Preserve originals and make a short test recording before any important session.

## Next acceptance work

Run the final installer and the real capture fixture on an interactive supported Windows 11 system, then test a real game and the complete offline/restart/export flow. Complete fault injection and long-session/hardware measurements. Only after the local workflow is accepted should League automation be connected to real local endpoints and synchronized output PTS. See `docs/ACCEPTANCE.md` for the detailed evidence checklist.
