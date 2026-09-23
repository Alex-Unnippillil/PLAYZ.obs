param([switch]$SkipNative)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
function Check { if ($LASTEXITCODE -ne 0) { throw "Build command failed: $LASTEXITCODE" } }
if (-not $IsWindows) { throw 'The desktop application targets Windows x64. Use cargo test -p playz-core for portable logic.' }
if ((node --version).Trim() -ne 'v22.23.2') { throw 'Use the pinned Node.js 22.23.2 toolchain' }
if ((pnpm --version).Trim() -ne '12.6.0') { throw 'Use pnpm 12.6.0' }
pnpm install --frozen-lockfile; Check
python scripts/generate-icons.py; Check
cargo run --locked -p playz-core --bin generate-contracts -- --check; Check
if (-not $SkipNative) { & "$PSScriptRoot/bootstrap.ps1" -Native }
if (-not (Test-Path apps/desktop/src-tauri/resources/runtime/obs/bin/64bit/playz-recorder.exe)) { throw 'The verified native runtime must be built before the desktop host' }
pnpm --dir apps/desktop exec tauri build --no-bundle; Check
Write-Output 'Desktop binary: target/release/PLAYZ.exe. Capture acceptance is a separate hardware test.'
