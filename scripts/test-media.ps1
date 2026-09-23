$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:PLAYZ_TEST_RUNTIME = (Resolve-Path apps/desktop/src-tauri/resources/runtime).Path
New-Item -ItemType Directory -Force artifacts/media-fixture | Out-Null
$env:PLAYZ_TEST_MEDIA = (Resolve-Path artifacts/media-fixture).Path
python tools/media-fixture/generate.py --runtime $env:PLAYZ_TEST_RUNTIME --output $env:PLAYZ_TEST_MEDIA
if ($LASTEXITCODE -ne 0) { throw 'Deterministic media fixture generation failed' }
cargo test -p playz-core --locked --test media_pipeline -- --ignored --nocapture
if ($LASTEXITCODE -ne 0) { throw 'Real FFmpeg media integration failed' }
