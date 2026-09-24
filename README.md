# PLAYZ

**A local-first Windows game recorder and review workspace.** Original interface, Rust application core, and an original thin C++ host around upstream OBS/libobs. No account, cloud service, telemetry or automatic publishing.

> **0.1 engineering preview, not a production release.** The source implements a real native recording path, not simulated recording buttons. Windows/GPU capture, a clean offline installation and sustained-session acceptance must be verified on the exact packaged build before recommending it for important recordings. See [implementation status](IMPLEMENTATION_STATUS.md) and [release checklist](RELEASE_CHECKLIST.md).

## First local workflow

Open the installed PLAYZ application. In **Capture settings**, refresh devices, explicitly select your game or window, select an encoder, and save the profile. System-output capture includes audio from other applications on that device. The microphone defaults to off.

Press **Record**, then **Stop recording**. The native host records an MKV master; Rust probes the result and creates a compatible MP4 playback copy without replacing the master. Open it in **Library**, verify video and sound, add bookmarks, set trim-in/out, and queue an export. Restart PLAYZ and confirm the recording is still listed.

A short test recording and export are essential before a longer session. **Device discovery is not hardware validation.** Failed game/window capture never silently widens to desktop capture. The software encoder uses CPU resources; no performance-impact claims are made.

## Implemented source workflows

- Explicit window/game capture through libobs, H.264/AAC SDR profiles, optional microphone, serialized native supervision and disk-reserve checks.
- Searchable local SQLite library, title/tags/notes/favorites, resume position, bookmarks, import, recovery, relink and reversible entry removal. Removing an entry does not delete media. **Library > Removed** provides searchable, persistent restoration after a restart.
- Offline MP4 playback, trim preview, accurate re-encoding and explicitly keyframe-aligned fast export, persistent job queue, cancellation, and pause/restart of heavy export work during recording.
- Dark/light/system interface, keyboard focus, global recording/bookmark shortcuts, single-instance behavior, tray close and safe explicit quit.
- Pinned source/dependency manifests, generated Rust/TypeScript contracts, C++/Rust/frontend/media tests and an unsigned per-user NSIS build pipeline with full offline WebView2 installation mode.

Implementation is not equivalent to acceptance. In particular, **League detection/automatic recording/event synchronization is not enabled in 0.1**. The isolated clock/highlight rules code is preparatory, not a working League integration. No cloud, YouTube, Discord, LLM or subscription scope is included.

## Build from source

Target Windows 11 x64. Build prerequisites and exact commands are in [docs/BUILD.md](docs/BUILD.md).

```powershell
# PowerShell 7 on the Windows build machine
./scripts/bootstrap.ps1
./scripts/bootstrap.ps1 -Native
./scripts/test.ps1 -Native -Media
./scripts/package.ps1 -SkipNative
```

The installer is produced at `target/release/bundle/nsis/`; `artifacts/package-evidence.json` records its commit, hash, size and signature status. Do not distribute `PLAYZ.exe` without its native resource tree. The ordinary browser preview deliberately cannot record or access the local library.

## Architecture

```text
React + TypeScript / Vite / Tailwind / Radix
    │ narrow local Tauri commands; generated contracts
Tauri 2 + Rust
    ├─ bounded single-writer SQLite service
    ├─ serialized recording lifecycle and recovery manifests
    ├─ inherited private pipes → original C++ libobs host
    ├─ supervised FFmpeg / ffprobe media jobs
    └─ scoped local assets → packaged WebView2 playback
```

TanStack queries run in `networkMode: always`; network loss must not suspend local database operations. Recording commands are not automatically retried. Native capture is independent of renderer reload; a controller crash may interrupt the current file and requires recovery—it is not uninterrupted recording.

## Documentation

[Build](docs/BUILD.md) · [Architecture](docs/ARCHITECTURE.md) · [Recovery and privacy](docs/RECOVERY_PRIVACY.md) · [Acceptance procedure](docs/ACCEPTANCE.md) · [Dependency register](third_party/DEPENDENCIES.md) · [Status](IMPLEMENTATION_STATUS.md) · [Release gates](RELEASE_CHECKLIST.md)

## Licensing and distribution

Original PLAYZ source files are offered under **GPL-2.0-or-later** where indicated by their SPDX headers. Third-party components retain their own licenses. OBS/libobs and FFmpeg obligations are not removed by process separation. The exact FFmpeg build configuration and third-party notices are collected with the native runtime. Complete corresponding-source and SBOM review is a public-distribution gate.

Windows, WebView2 and GPU drivers are proprietary platform dependencies; this is not an entirely open-source runtime. No Ascent branding or proprietary application code is incorporated. See [the recorder decision](docs/adr/0001-recorder-backend.md).
