# Release checklist

**Release classification: unsigned engineering preview. Public production release is blocked.** Checkmarks below must link exact commit/artifact evidence; code existence and mocked tests do not establish a Windows workflow.

## Source and build gates

- [x] Preserve PLAYZ identity and use an original interface/host instead of proprietary Ascent application code.
- [x] Pin direct dependencies, Rust/Node/pnpm tools, Cargo/pnpm locks, and native download hashes.
- [x] Build the original C++ adapter against matching OBS headers/runtime and pass protocol self-test (`ee134a1`, run `35911118637`).
- [x] Pass frontend strict TypeScript, 30 unit tests, production build and dependency audit (`09f528e`, run `35912714444`).
- [x] Run a real FFmpeg fixture through remux/accurate export with decoded frame bounds, audio signal, cancellation and unchanged master hash (same revision/run).
- [ ] Re-run formatting, all core/frontend/contracts/native/media checks on the exact final source commit after hardening.
- [ ] Produce the full NSIS artifact, exact SHA-256 and package manifest on that commit.
- [ ] Launch and exercise the actual packaged Tauri application; renderer-only tests are insufficient.
- [ ] Run the real capture fixture and actual game/window/audio tests separately.

## Local workflow acceptance

- [ ] Clean Windows 11 x64 standard-user offline installation with no preinstalled development tools, OBS or FFmpeg.
- [ ] Record, stop/finalize, quit, restart/reboot, rediscover, play/seek and export locally with WAN access denied.
- [ ] Capture-scope failure never widens to desktop; microphone remains opt-in and is not silently substituted.
- [ ] Tray close, explicit Quit/cancel, duplicate launch, hotkey conflicts/repeats and renderer crash tested.
- [ ] Controller/recorder/export crashes, disk exhaustion/removal and permission faults preserve recoverable originals without orphaned workers.
- [ ] Backup/restore, migration/refused downgrade, relink, missing media and removal with dependent clips tested.
- [ ] Export cancellation/restart and existing-output collisions preserve originals; fast mode meets its keyframe promise.
- [ ] Large media seeking and supported Windows edition/codec matrix tested in packaged WebView2.
- [ ] 100%, 150%, 200% display scaling and monitor changes verified with keyboard accessibility and reduced motion.
- [ ] Two-hour sustained capture and repeated start/stop cycles with measured A/V drift and decodability.
- [ ] Named NVIDIA/AMD/Intel GPU/driver/encoder qualification; untested families remain explicitly unqualified.
- [ ] CPU/RAM/GPU/disk and game frame-time impact measured on named hardware, including tray and playback states.

## Distribution gates

- [ ] Aggregate and audit all runtime notices and corresponding source, including FFmpeg build-dependent components and native capture helpers.
- [ ] Generate and review SPDX/CycloneDX SBOMs for Rust, npm and actual bundled native binaries.
- [ ] Run pinned cargo-deny, package vulnerability auditing and Gitleaks on final source. Do not suppress findings to obtain a green indicator.
- [ ] Verify full WebView2 offline redistributable provenance, native/CRT completeness, and absence of test servers/mock backends in the installer.
- [ ] Use an authorized Authenticode identity, timestamp signatures and verify the exact final binaries. No signing identity is currently configured.
- [ ] Test clean install, upgrade, uninstall and reinstall; preserve videos/library by default and safely defer upgrades during recording.
- [ ] Attach final commit, hashes, OS/GPU matrix, limitations and evidence to release report. Do not publish a production release while any required gate is open.

## Phase 2 gates — not enabled

- [ ] Reviewed local League API certificate trust and endpoint policy; no proxies/redirects/global TLS disable.
- [ ] Opt-in lifecycle detection with manual-stop suppression and metadata-outage independence.
- [ ] Durable, idempotent observed-event ingestion/backfill and explicitly incomplete metadata.
- [ ] Calibrated media/game/monotonic clock anchors, gaps and measured synchronization error.
- [ ] Rules-based candidates preserve edits/rejections and never fabricate missing footage/events.
- [ ] Full real League session becomes an indexed playable review with no manual file management.
- [ ] Current Riot policy/registration/disclosure review before public distribution; no approval is claimed.
