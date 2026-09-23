param([switch]$Media, [switch]$Native)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
function Check { if ($LASTEXITCODE -ne 0) { throw "Test command failed: $LASTEXITCODE" } }
cargo fmt --all --check; Check
cargo test -p playz-core --locked --all-targets; Check
cargo run -p playz-core --locked --bin generate-contracts -- --check; Check
pnpm typecheck; Check
pnpm test; Check
& "$PSScriptRoot/test-exports.ps1"
if ($Native) { ctest --test-dir build/native -C Release --output-on-failure; Check }
if ($Media) { & "$PSScriptRoot/test-media.ps1" }
