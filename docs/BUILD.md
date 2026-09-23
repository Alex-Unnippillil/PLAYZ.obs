# Building PLAYZ 0.1 locally

Target: Windows 11 x64. CI compiles on hosted Windows Server 2022; that is not a Windows 11 capture-acceptance result. Builds are unsigned test builds until the release checklist is closed.

## Build machine prerequisites

Install Git, PowerShell 7, Visual Studio 2022 with Desktop development with C++ and the Windows SDK, CMake 3.28 or later, Python 3, rustup, Node.js **22.23.2** and pnpm **12.6.0**. `rust-toolchain.toml` selects Rust **1.98.1**. Pinning a dependency is not a substitute for monitoring upstream advisories.

The build machine needs internet for verified dependencies and the full WebView2 offline installer. The installed application must not download dependencies on first launch. No OBS, FFmpeg, Node or Rust installation is intended to be required on the end-user machine.

```powershell
# From the repository root, in PowerShell 7:
./scripts/bootstrap.ps1
./scripts/bootstrap.ps1 -Native
./scripts/test.ps1 -Native -Media
./scripts/package.ps1 -SkipNative
```

`bootstrap.ps1 -Native` verifies the SHA-256 pins in `third_party/native-lock.json`, extracts the matching OBS runtime and headers, builds our C++ adapter, runs its protocol self-test, copies media tools and runtime notices, and records native hashes. It does not compile the entire OBS project from source. Our adapter does not include Ascent's wrapper code.

`build.ps1` creates `target/release/PLAYZ.exe` without an installer. `package.ps1` also creates the per-user NSIS installer in `target/release/bundle/nsis/`, copies it to `artifacts/`, and records `artifacts/package-evidence.json`. Do not distribute the executable alone: it requires the complete runtime resource tree and WebView2.

`-SkipNative` is only for an already verified, complete runtime in `apps/desktop/src-tauri/resources/runtime/`. It never downloads dependencies inside the installed application. Native build downloads are checksum-verified. WebView2 offline-installer acquisition is managed by the pinned Tauri bundler; its release provenance is a separate remaining gate.

## Developer interface

```powershell
python scripts/generate-icons.py
pnpm --dir apps/desktop exec tauri dev
```

Run a Tauri window, not an ordinary browser, to use recording and library commands. Browser-only previews deliberately display an error instead of simulating successful recording. Production has no mock capture backend or Node server.

## Reproducible checks

```powershell
cargo fmt --all --check
cargo test -p playz-core --locked --all-targets
cargo run -p playz-core --locked --bin generate-contracts -- --check
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
./scripts/test-exports.ps1
./scripts/test-media.ps1
```

The media integration test is ignored in ordinary `cargo test` because it requires the verified Windows FFmpeg runtime. `test-media.ps1` explicitly invokes it. It generates labeled video/audio rather than downloading footage. This proves tested media-processing behavior, not GPU capture.

After dependency changes, deliberately resolve and review lockfile changes; normal build/verification jobs must not regenerate locks or rewrite sources. `frontend-lock.yml` only proposes a lock artifact for review and has no write permission.

## Installed build inspection

```powershell
./scripts/verify-install.ps1 -InstallDirectory "$env:LOCALAPPDATA/PLAYZ"
```

Use the actual installation folder selected by the installer. This checks component presence and native startup only. Complete [ACCEPTANCE.md](ACCEPTANCE.md) for offline install, capture, playback and export. A passing compile, browser test or protocol test does not close those gates.

## Signing

No Authenticode identity has been provided. Do not represent the NSIS artifact as signed, trusted by SmartScreen or production-ready. Future signing must use a protected signing service/secret and be verified against the exact artifact. No network-dependent updater is included.
