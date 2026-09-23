# Windows acceptance evidence

Record the exact commit, installer SHA-256, Windows build/edition, WebView2 version, GPU/driver, encoder and audio devices for every run. Empty checkboxes are **not tested**, not assumed passes. Hosted Windows Server compilation does not establish Windows 11, GPU or Vanguard compatibility.

## Clean offline local workflow

- [ ] Start with a clean supported Windows 11 x64 test machine without OBS, FFmpeg, Node, Rust or development tools.
- [ ] Disconnect application WAN access before installation. Install the full per-user NSIS package. Verify WebView2 and all native DLL/plugin/helper dependencies are available without runtime downloads.
- [ ] Launch as a standard user, choose a writable local folder and save a specific capture target. Confirm microphone is off until explicitly selected.
- [ ] Record the deterministic visible capture fixture and its audio; then separately record a real game. Verify the captured target, readable moving content and expected audio.
- [ ] Stop, allow finalization, quit, restart and locate the recording without moving files. Reboot and repeat.
- [ ] Play and seek the packaged MP4 asset offline, change speed and volume, save a bookmark and resume playback.
- [ ] Export a selected interval in accurate mode, decode first/last frames and verify audio. Test fast mode separately for keyframe behavior. Compare the original hash before/after.
- [ ] Verify no second recorder/database writer on a second application launch.

## Lifecycle and faults

- [ ] Close to tray during capture, reopen and stop. Explicit Quit must offer stop/finalize; cancellation keeps capture running.
- [ ] Reload/crash the renderer independently of Rust. Then independently terminate Rust and the recorder; verify interrupted status, preserved files and no orphaned encoders.
- [ ] Repeat start/stop/hotkey presses. Check shortcut conflicts, key-repeat suppression and no accidental focus stealing.
- [ ] Fill/remove the recording drive; revoke write permission; unplug audio devices; minimize/resize/Alt-Tab/fullscreen-transition the target; change monitors.
- [ ] Interrupt remux/export before and after file publication; restart/cancel/retry. Existing unrelated files must never be overwritten or falsely adopted.
- [ ] Test consistent backup/restore, missing/relinked assets, schema upgrade/refused downgrade and preserved data across uninstall/reinstall.
- [ ] Check 100%, 150% and 200% display scaling, keyboard navigation, high contrast and reduced motion.

## Sustained and hardware tests

- [ ] Complete a two-hour recording and repeated short sessions, checking A/V drift, decodability and file integrity.
- [ ] Test each advertised NVIDIA/AMD/Intel encoder family on actual hardware. Unsupported families remain explicitly unqualified.
- [ ] Measure CPU, RAM, GPU, write throughput, encoder lag and frame-time distributions against a named no-recorder baseline. Include visible, tray and playback states. Publish measured values only.

## Phase 2 — not enabled in 0.1

- [ ] Opt-in League detection starts only a ready real game target; manual stop suppresses auto-restart for that session.
- [ ] Use reviewed loopback TLS trust with redirects/proxies disabled; metadata certificate failures never stop recording.
- [ ] Persist idempotent observed events, verified identities, gaps and raw/mapped timestamps. Validate clock discontinuities, pauses and startup delay against labeled evidence.
- [ ] A real complete match becomes an indexed playable review without manual file management. API outages backfill only actually available events, and missing metadata remains labeled.

## Public release package

- [ ] Confirm all included binaries/notices/corresponding-source materials and produce a reviewed Rust/npm/native SPDX/CycloneDX SBOM.
- [ ] Run cargo-deny, dependency audits and Gitleaks against the exact source tree; resolve findings rather than silently excluding them.
- [ ] Sign and timestamp the final Windows artifacts using an authorized identity; verify signatures and final hashes.
- [ ] Confirm no test server, fixture override, mock backend or development runtime is shipped.
- [ ] Record install/upgrade/uninstall/reinstall results and preserved recordings/settings. Upgrades must not interrupt capture.

Use [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) and [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) to link evidence. Do not replace these tests with mocked renderer snapshots.
