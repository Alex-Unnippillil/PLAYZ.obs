# SPDX-License-Identifier: GPL-2.0-or-later
# Installs only into the disposable test user's normal per-user location.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
$installers = @(Get-ChildItem target/release/bundle/nsis/*.exe)
if ($installers.Count -ne 1) { throw 'Expected exactly one freshly built NSIS installer' }
if (Get-Process -Name PLAYZ -ErrorAction SilentlyContinue) { throw 'Close PLAYZ safely before running installation tests' }
$installer = Start-Process -FilePath $installers[0].FullName -ArgumentList '/S' -PassThru
try {
  if (-not $installer.WaitForExit(300000)) { throw 'Test installation timed out' }
  if ($installer.ExitCode -ne 0) { throw "Installer exited with $($installer.ExitCode)" }
} finally { $installer.Dispose() }
$directory = Join-Path $env:LOCALAPPDATA 'PLAYZ'
& "$PSScriptRoot/verify-install.ps1" -InstallDirectory $directory
$evidence = Join-Path (Get-Location) 'artifacts/installed-smoke'
$fixture = Join-Path (Get-Location) 'artifacts/installed-media-fixture'
python tools/media-fixture/generate.py --runtime (Join-Path $directory 'runtime') --output $fixture
if ($LASTEXITCODE -ne 0) { throw 'Installed FFmpeg fixture generation failed' }
& powershell.exe -NoLogo -NoProfile -STA -File "$PSScriptRoot/test-installed-ui.ps1" -Executable (Join-Path $directory 'PLAYZ.exe') -EvidenceDirectory $evidence -MediaFile (Join-Path $fixture 'fixture.mkv')
if ($LASTEXITCODE -ne 0) { throw 'Actual installed-application UI workflow test failed' }
Write-Output 'Hosted installed application import/play/export/restart workflow passed. Clean Windows 11 offline and real-game capture are separate gates.'
