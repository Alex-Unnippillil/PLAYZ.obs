param([Parameter(Mandatory)][string]$Dll, [Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$exports = & dumpbin.exe /nologo /exports $Dll
if ($LASTEXITCODE -ne 0) { throw 'dumpbin failed' }
$names = @($exports | ForEach-Object { if ($_ -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+([A-Za-z_][A-Za-z_0-9]*)\s*$') { $Matches[1] } })
if ($names.Count -lt 100) { throw 'OBS export table could not be verified' }
$def = [IO.Path]::ChangeExtension($Output, '.def')
@('LIBRARY obs.dll', 'EXPORTS') + $names | Set-Content -Encoding ascii $def
& lib.exe /nologo /machine:x64 "/def:$def" "/out:$Output"
if ($LASTEXITCODE -ne 0) { throw 'lib.exe failed' }
