# PLAYZ 0.1 local preview handoff

## What this milestone establishes

The application has a real local recording path and a usable installed review/export workflow. It is an **unsigned engineering preview**, not a production release or completed Windows 11/hardware acceptance. League automation is not enabled.

A real selected-window fixture was captured through the original C++ libobs host and Rust controller, finalized to MKV/MP4, accurately exported, and rediscovered with its bookmark after reopening the catalog. Separately, the actual NSIS-installed Tauri application imported local media through the native picker, played its MP4 in WebView2, completed an export, enforced single-instance behavior, quit and found the recording after restart. Neither test uses a mock recording backend.

## Tested installer

- Filename: `PLAYZ_0.1.0_x64-setup.exe`
- Size: **320,670,968 bytes** (about 306 MiB).
- Installer SHA-256: `0246b96abc885d6478c43ddb6d7fe2c439270866aed5a20e9f35eea0cf7418c9`.
- Build source: `553672a973f7d39131707045f75db4fcecaeb608`.
- Authenticode: **NotSigned**.
- Build artifact: `10775382652`, Actions build run `35914868736`.
- Artifact ZIP SHA-256: `1093ffdaaaf785d18808372c4ab4c866afed49ab522f52d622502334dae5e140`.

The build run's initial installed-UI test failed on a test-driver focus assumption; compilation and NSIS packaging succeeded. The exact installer was later independently verified by the passing installed-workflow run below. Do not confuse an artifact ZIP hash with the embedded EXE hash, or relabel this installer with another build commit.

The repository comparison from this build source through `a4ed28c2b49694207904cd0ab82691bd4ada306e` showed only test scripts, CI workflows and evidence documentation changes. Application frontend, Rust production modules, C++ host, native pins and lockfiles were unchanged. This handoff adds documentation/CI changes only. Fresh build artifacts still receive their own exact commit and hash in `package-evidence.json`.

## Installed workflow evidence

Test-driver source: `a4ed28c2b49694207904cd0ab82691bd4ada306e`. Actions run **35917885507**, job **107374042581**, **passed** against the exact installer above. Evidence artifact **10775782452**, ZIP SHA-256 `a2d17f7e627b9f18c9e760c9df8b74ad8336bbebab1ccfe05b3fa50bed678275`.

Passed assertions: required packaged native components; installed recorder protocol self-test; installed FFmpeg fixture generation; real native file-picker import; HTML video playhead advancement from zero; native export queue completion; a single application instance after a second launch; safe idle quit; library persistence after reopening. Screenshots and `installed-smoke.json` accompany the evidence.

The developer-only test uses UI Automation for the actual WebView2 interface and bounded, process-scoped Win32 messages for the standard file picker. It does not install a production automation server, inject fake app data, bypass Rust import validation, or ship a test override.

Test environment: hosted **Windows Server 2022, build 20348**. This does **not** establish a clean offline Windows 11 install, unsupported Windows editions, real-game hooking, captured system/microphone audio, GPU encoder qualification, a two-hour recording or performance budgets.

## First use

Install the full NSIS package, not the executable copied out of its runtime directory. Open **Capture settings**, launch the intended game/window, refresh devices, explicitly select the target and encoder, choose a local recording folder, then save. Microphone capture is off until selected. System-output audio may include other applications on that output device.

Make a short recording. Stop and allow finalization. Open it in **Library**, check the expected image and sound, make a small accurate export, then restart and confirm the entry remains. Do this before an important session. A discovered hardware encoder is not automatically qualified; x264 uses CPU resources. Do not disable security software or anti-cheat to work around failures.

Masters are preserved. **Remove entry** hides a catalog entry without deleting videos. **Relink** requires the complete original UUID recording directory and matching manifest. Use **Import** for unrelated videos. Existing ambiguous export destinations fail closed rather than being overwritten or falsely adopted.

## Build and test entry points

See `BUILD.md` for pinned prerequisites. On a Windows build machine with PowerShell 7:

```powershell
./scripts/bootstrap.ps1
./scripts/bootstrap.ps1 -Native
./scripts/test.ps1 -Native -Media
./scripts/package.ps1 -SkipNative
./scripts/test-capture.ps1
# On a disposable test account: installs and drives the real application.
./scripts/test-installed.ps1
```

For an already built repository artifact, manually run `package-smoke.yml` with its artifact ID, ZIP SHA-256 and source commit. The normal desktop workflow always tests its newly built installer. Historical artifact IDs are not silently reused for future builds.

## Next release gates

Complete `ACCEPTANCE.md` and `../RELEASE_CHECKLIST.md`: clean Windows 11 offline installation; real game/audio and hardware matrix; long sessions/A-V drift; active-capture lifecycle and fault injection; backup restoration/migration/large-file seeking/scaling; complete native/Rust/npm SBOM and corresponding-source/license review; authorized signing. Only after the local workflow is qualified should live League detection, TLS trust, durable event ingestion and calibrated PTS synchronization be enabled.
