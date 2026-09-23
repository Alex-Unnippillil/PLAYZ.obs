param([switch]$SkipNative)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location (Split-Path -Parent $PSScriptRoot)
& "$PSScriptRoot/build.ps1" -SkipNative:$SkipNative
pnpm --dir apps/desktop exec tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'Offline NSIS packaging failed' }
$installers = @(Get-ChildItem target/release/bundle/nsis/*.exe)
if ($installers.Count -ne 1) { throw 'Expected exactly one installer; clean stale bundle output first' }
New-Item -ItemType Directory -Force artifacts | Out-Null
$installer = $installers[0]
$signature = Get-AuthenticodeSignature $installer.FullName
$manifest = [ordered]@{
  schema_version = 1
  commit = (git rev-parse HEAD).Trim()
  product = 'PLAYZ'
  version = '0.1.0'
  installer = $installer.Name
  size_bytes = $installer.Length
  sha256 = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  authenticode_status = "$($signature.Status)"
  classification = 'Unsigned local test build; not a production release'
  os = [Environment]::OSVersion.VersionString
  clean_windows_11_install_verified = $false
  real_game_capture_verified = $false
  sustained_two_hour_capture_verified = $false
}
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 artifacts/package-evidence.json
Copy-Item $installer.FullName artifacts/
Write-Output ($manifest | ConvertTo-Json)
