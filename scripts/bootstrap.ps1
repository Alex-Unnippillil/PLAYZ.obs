param([switch]$Native, [switch]$UpdateLock)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root
function Checked { param([scriptblock]$Command) & $Command; if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
function Download-Verified([string]$Url, [string]$Sha, [string]$Destination) {
  if (!(Test-Path $Destination)) { Invoke-WebRequest -Uri $Url -OutFile $Destination -MaximumRetryCount 3 }
  if ((Get-FileHash -Algorithm SHA256 $Destination).Hash.ToLowerInvariant() -ne $Sha) { throw "Checksum mismatch: $([IO.Path]::GetFileName($Destination))" }
}
New-Item -ItemType Directory -Force .cache, artifacts | Out-Null
if (!$Native) {
  if (!(Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Install Rust using rustup, then retry. See docs/BUILD.md.' }
  if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Install pnpm 12.6.0 on the build machine, then retry.' }
  if ($UpdateLock) { Checked { pnpm install --no-frozen-lockfile }; Checked { cargo generate-lockfile } }
  else { Checked { pnpm install --frozen-lockfile }; Checked { cargo fetch --locked } }
  exit 0
}
if (!$IsWindows) { throw 'Native bootstrap requires PowerShell 7 on Windows x64' }
$manifest = Get-Content third_party/native-lock.json -Raw | ConvertFrom-Json
$Runtime = Join-Path $Root 'apps/desktop/src-tauri/resources/runtime'
$Obs = Join-Path $Runtime 'obs'
$Media = Join-Path $Runtime 'media'
New-Item -ItemType Directory -Force $Obs, $Media, '.cache/obs-source', '.cache/ffmpeg' | Out-Null
Download-Verified $manifest.obs.runtime_url $manifest.obs.runtime_sha256 '.cache/obs.zip'
Download-Verified $manifest.obs.source_url $manifest.obs.source_sha256 '.cache/obs-source.tar.gz'
Download-Verified $manifest.ffmpeg.url $manifest.ffmpeg.sha256 '.cache/ffmpeg.zip'
if (!(Test-Path "$Obs/bin/64bit/obs.dll")) { Checked { tar -xf .cache/obs.zip -C $Obs } }
if (!(Get-ChildItem .cache/obs-source -Directory)) { Checked { tar -xf .cache/obs-source.tar.gz -C .cache/obs-source } }
if (!(Get-ChildItem .cache/ffmpeg -Directory)) { Checked { tar -xf .cache/ffmpeg.zip -C .cache/ffmpeg } }
$source = Get-ChildItem .cache/obs-source -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'libobs/obs.h') } | Select-Object -First 1
if (!$source) { throw 'Unexpected OBS source archive layout' }
$ff = Get-ChildItem .cache/ffmpeg -Recurse -Filter ffmpeg.exe | Select-Object -First 1
if (!$ff) { throw 'Unexpected FFmpeg archive layout' }
Copy-Item $ff.FullName "$Media/ffmpeg.exe" -Force
Copy-Item (Join-Path $ff.DirectoryName ffprobe.exe) "$Media/ffprobe.exe" -Force
Copy-Item (Join-Path $ff.Directory.Parent.FullName '*') $Media -Recurse -Force -Exclude bin
if (!(Test-Path '.cache/json/.git')) {
  Checked { git init .cache/json }
  Checked { git -C .cache/json remote add origin $manifest.nlohmann_json.repository }
  Checked { git -C .cache/json fetch --depth 1 origin $manifest.nlohmann_json.commit }
  Checked { git -C .cache/json checkout --detach FETCH_HEAD }
}
$jsonCommit = (git -C .cache/json rev-parse HEAD).Trim()
if ($jsonCommit -ne $manifest.nlohmann_json.commit) { throw 'Unexpected nlohmann/json revision' }
$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual Studio C++ x64 build tools are required' }
$devcmd = Join-Path $vs 'Common7/Tools/VsDevCmd.bat'
cmd /c "call `"$devcmd`" -arch=x64 -host_arch=x64 >nul && set" | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
if (!(Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'Could not enter the MSVC build environment' }
$redist = Get-ChildItem (Join-Path $vs 'VC/Redist/MSVC') -Directory | Where-Object { $_.Name -match '^\d+\.' -and (Test-Path (Join-Path $_.FullName 'x64')) } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
$crt = Get-ChildItem (Join-Path $redist.FullName 'x64') -Directory | Where-Object Name -Match 'Microsoft.VC.*.CRT' | Select-Object -First 1
if (!$crt) { throw 'MSVC redistributable CRT not found' }
Copy-Item (Join-Path $crt.FullName '*.dll') "$Obs/bin/64bit/" -Force
Checked { cmake -S native/recorder -B build/native -G 'Visual Studio 17 2022' -A x64 "-DOBS_SOURCE_DIR=$($source.FullName)" "-DOBS_RUNTIME_DIR=$Obs" "-DJSON_INCLUDE_DIR=$Root/.cache/json/single_include" }
Checked { cmake --build build/native --config Release --parallel 2 }
Checked { ctest --test-dir build/native -C Release --output-on-failure }
New-Item -ItemType Directory -Force "$Runtime/notices" | Out-Null
Copy-Item third_party/native-lock.json "$Runtime/notices/native-lock.json" -Force
Copy-Item (Join-Path $source.FullName 'COPYING') "$Runtime/notices/OBS-COPYING.txt" -Force
Copy-Item '.cache/json/LICENSE.MIT' "$Runtime/notices/nlohmann-json-LICENSE.txt" -Force
& "$Media/ffmpeg.exe" -hide_banner -buildconf 2>&1 | Out-File "$Runtime/notices/ffmpeg-buildconf.txt"
& "$Media/ffmpeg.exe" -hide_banner -L 2>&1 | Out-File "$Runtime/notices/ffmpeg-license.txt"
$ffconfig = Get-Content "$Runtime/notices/ffmpeg-buildconf.txt" -Raw
if ($ffconfig -match '--enable-nonfree' -or $ffconfig -notmatch '--enable-libx264') { throw 'Unapproved FFmpeg configuration' }
$allowed = @('obs-ffmpeg','obs-x264','obs-outputs','win-capture','win-wasapi','obs-nvenc','obs-qsv11')
Get-ChildItem "$Obs/obs-plugins/64bit" -File | Where-Object { $_.BaseName -notin $allowed } | Remove-Item -Force
Get-ChildItem "$Obs/data/obs-plugins" -Directory | Where-Object { $_.Name -notin $allowed } | Remove-Item -Recurse -Force
Get-ChildItem "$Obs/bin/64bit" -Filter 'obs64.exe' | Remove-Item -Force
$inventory = Get-ChildItem $Runtime -File -Recurse | Where-Object { $_.FullName -ne (Join-Path $Runtime 'provenance.json') } | ForEach-Object {
  @{ path = [IO.Path]::GetRelativePath($Runtime, $_.FullName).Replace('\','/'); sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); size = $_.Length }
}
@{ schema_version = 1; components = $manifest; files = @($inventory) } | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 "$Runtime/provenance.json"
Write-Output "Verified native runtime: $Runtime"
