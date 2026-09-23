# SPDX-License-Identifier: GPL-2.0-or-later
param([switch]$Audio)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not $IsWindows) { throw 'Capture verification requires an interactive Windows session' }
$env:PLAYZ_TEST_RUNTIME = (Resolve-Path apps/desktop/src-tauri/resources/runtime).Path
New-Item -ItemType Directory -Force artifacts/capture-fixture | Out-Null
$env:PLAYZ_CAPTURE_ROOT = (Resolve-Path artifacts/capture-fixture).Path
$env:PLAYZ_CAPTURE_TITLE = 'PLAYZ fixture ' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$env:PLAYZ_CAPTURE_AUDIO = if ($Audio) { '1' } else { '0' }
$info = [Diagnostics.ProcessStartInfo]::new((Get-Command pwsh).Source)
$info.UseShellExecute = $false
$info.RedirectStandardOutput = $true
foreach ($arg in @('-NoLogo','-NoProfile','-STA','-File',(Join-Path (Get-Location) 'tools/capture-fixture/window.ps1'),'-Title',$env:PLAYZ_CAPTURE_TITLE)) { $info.ArgumentList.Add($arg) }
if ($Audio) {
  $wave = (Resolve-Path artifacts/media-fixture/audio.wav).Path
  $info.ArgumentList.Add('-AudioFile')
  $info.ArgumentList.Add($wave)
}
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
$started = $false
try {
  $started = $process.Start()
  if (-not $started) { throw 'Could not launch the deterministic capture window' }
  $ready = $process.StandardOutput.ReadLineAsync()
  if (-not $ready.Wait(20000) -or $ready.Result -ne 'PLAYZ_FIXTURE_READY') { throw 'The fixture window did not become ready; check the interactive desktop and .NET Windows Forms availability' }
  cargo test -p playz-core --locked --test capture_pipeline -- --ignored --nocapture
  if ($LASTEXITCODE -ne 0) { throw 'Real capture acceptance failed; do not mark this environment supported' }
} finally {
  if ($started -and -not $process.HasExited) { $process.Kill($true); $process.WaitForExit(5000) | Out-Null }
  $process.Dispose()
}
