# Release checklist

**Current classification: unsigned local engineering preview, not production.** Passing tests below are scoped to their actual source, binary and environment. The tested installer and evidence are in `docs/LOCAL_PREVIEW_HANDOFF.md`; a newer build is never presumed equivalent merely from its filename/version.

## Completed local-build milestones

- [x] Original PLAYZ interface and thin C++ host around appropriately identified upstream libobs; no proprietary Ascent application code.
- [x] Pinned direct dependencies, Rust/Node/pnpm tools, Cargo/pnpm locks and native archive hashes.
- [x] Windows native host compile and CTest protocol verification; matching OBS headers/runtime.
- [x] Frontend strict TypeScript, 30 tests, production static build and dependency audit (`09f528e`, run `35912714444`; UI source unchanged afterward).
- [x] Hardened core formatting, 23 unit/property tests, two safety tests, contract drift and export-parser checks on Windows and Ubuntu (`e5a9535`, run `35915948438`).
- [x] Real FFmpeg fixture through remux/accurate export, decoded frame bounds, generated audio signal, cancellation and original hash preservation.
- [x] Actual selected-window libobs capture, finalize, catalog reopen, persisted bookmark and accurate export (`f4f4244`, run `35914615521`; audio disabled, software x264).
- [x] Full unsigned NSIS installer built from `553672a`; exact installer hash recorded in handoff.
- [x] Exact installed binary subsequently passed real native-picker import, WebView2 playback, export, single instance and quit/restart (`a4ed28c` test driver, run `35917885507`).

## Still-required Phase 1 acceptance

- [ ] Re-run applicable checks for any changed production code and bind evidence to each exact newly built installer; do not transfer old binary evidence without provenance.
- [ ] Clean Windows 11 x64 standard-user **offline installation**, with no preinstalled OBS, FFmpeg, development tools or assumed WebView2 runtime.
- [ ] Record a real game with expected system/microphone audio, stop, restart/reboot, rediscover, play/seek and export with application WAN access denied.
- [ ] Capture-scope failure never widens to desktop; microphone is not silently substituted; audio disconnect/sample-rate changes handled visibly.
- [ ] Active recording: tray close, explicit quit/cancel, renderer reload/crash, global shortcut conflicts/repeats and focus behavior.
- [ ] Independent controller/recorder/export crash, disk exhaustion/removal, permission failure and interrupted finalization; recoverable originals and no orphaned workers.
- [ ] Consistent backup **restoration**, schema upgrade/refused downgrade, externally moved/missing media, relink and dependent-clip removal scenarios.
- [ ] Export restart/cancel/collision matrix; broader fast-mode keyframe-boundary tests. Existing outputs must not be falsely adopted.
- [ ] Large-file ranged seeking and the supported Windows edition/codec matrix in packaged WebView2.
- [ ] 100%, 150% and 200% display scaling, monitor changes, complete accessibility/keyboard/reduced-motion checks.
- [ ] Two-hour capture and repeated start/stop cycles, checking decoded media and A/V drift.
- [ ] Actual NVIDIA/AMD/Intel GPU/driver/encoder qualification for each advertised supported hardware family.
- [ ] Measured CPU/RAM/GPU/disk and game frame-time impact on named hardware, including visible/tray/playback states.

## Public distribution gates

- [ ] Complete native/Rust/npm SPDX/CycloneDX SBOM and dependency/license review, including exact FFmpeg build flags and corresponding-source materials.
- [ ] Pinned cargo-deny, package auditing and Gitleaks on the final source; resolve findings, not silent exclusions.
- [ ] Verify WebView2 offline redistributable provenance, permitted CRT/native dependencies, notices and capture helpers.
- [ ] Verify no test server, fixture override, mock backend or development runtime ships in the installer.
- [ ] Authorized Authenticode signing/timestamping and final signature/hash checks. No signing identity has been provided.
- [ ] Clean install, upgrade, uninstall and reinstall with preserved videos/library by default; safely defer upgrades during capture.
- [ ] Final release report with source commit, installer hash, exact OS/GPU matrix, evidence and measured limitations. Do not publish a production release with required gates open.

## Phase 2 — not enabled

- [ ] Reviewed local League API trust and policy, fixed loopback destination, redirects/proxies disabled, no global TLS bypass.
- [ ] Opt-in game readiness/lifecycle detection with manual-stop suppression and metadata-outage independence.
- [ ] Durable idempotent observed events, identity/provenance, backfill and explicitly incomplete metadata.
- [ ] Calibrated game/media/monotonic clock anchors, discontinuities, gaps and measured synchronization error.
- [ ] Rules-based candidates preserve edits/rejections and do not fabricate footage or unsupported events.
- [ ] A real full League session becomes an indexed playable review without manual file management.
- [ ] Current Riot registration/disclosure/policy review before public distribution. No approval is claimed.
