# SPDX-License-Identifier: GPL-2.0-or-later
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'parse-exports.ps1')
$lines = @(
  ' ordinal hint RVA      name',
  '     1    0 00001100 obs_startup',
  '     2    A 00001200 obs_shutdown = obs_shutdown',
  '     3   1F 00001300 obs_output_start = obs_output_start (void)',
  '     4   2a 00001400 obs_output_stop',
  '     5   2B 00001500 obs_startup',
  '     6   2C 00001600 ?Decorated@@YAHXZ',
  ' 1000 .text',
  '     7   2D 00001700 bad;directive',
  '     8   2E 00001800 name extra-column'
)
$actual = @(Get-ObsExportNames -Lines $lines)
$expected = @('obs_output_start','obs_output_stop','obs_shutdown','obs_startup')
if (($actual -join '|') -ne ($expected -join '|')) { throw "Unexpected export names: $($actual -join ', ')" }
if (@(Get-ObsExportNames -Lines @('no export table')).Count -ne 0) { throw 'Malformed table accepted' }
Write-Output 'Export parser regression tests passed (plain, annotated, deduplicated, malformed)'
