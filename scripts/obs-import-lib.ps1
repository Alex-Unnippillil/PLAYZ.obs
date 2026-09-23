param([Parameter(Mandatory)][string]$Dll, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'parse-exports.ps1')
$exports = @(& dumpbin.exe /nologo /exports $Dll)
if ($LASTEXITCODE -ne 0) { throw 'dumpbin failed' }
$names = @(Get-ObsExportNames -Lines $exports)
$required = @('obs_startup','obs_shutdown','obs_output_start','obs_output_stop','obs_source_create')
$missing = @($required | Where-Object { $_ -notin $names })
if ($names.Count -lt 100 -or $missing.Count -gt 0) {
  $exports | Select-Object -First 50 | Write-Output
  throw "OBS export table verification failed: $($names.Count) C exports; missing $($missing -join ', ')"
}
$def = [IO.Path]::ChangeExtension($Output, '.def')
@('LIBRARY obs.dll', 'EXPORTS') + $names | Set-Content -Encoding ascii $def
& lib.exe /nologo /machine:x64 "/def:$def" "/out:$Output"
if ($LASTEXITCODE -ne 0) { throw 'lib.exe failed' }
Write-Output "Verified $($names.Count) C exports from the pinned obs.dll"
