param([Parameter(Mandatory)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path $InstallDirectory).Path
$required = @('PLAYZ.exe','runtime/obs/bin/64bit/playz-recorder.exe','runtime/obs/bin/64bit/obs.dll','runtime/media/ffmpeg.exe','runtime/media/ffprobe.exe','runtime/provenance.json')
foreach ($file in $required) { if (-not (Test-Path (Join-Path $root $file) -PathType Leaf)) { throw "Installed component missing: $file" } }
$provenance = Get-Content (Join-Path $root 'runtime/provenance.json') -Raw | ConvertFrom-Json
Write-Output 'Required installed components are present. This is a presence check, not capture or offline-install acceptance.'
& (Join-Path $root 'runtime/obs/bin/64bit/playz-recorder.exe') --self-test
if ($LASTEXITCODE -ne 0) { throw 'Installed native recorder protocol self-test failed' }
& (Join-Path $root 'runtime/media/ffprobe.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'Installed ffprobe failed' }
Write-Output 'Complete docs/ACCEPTANCE.md on a clean Windows 11 machine with application WAN access denied.'
