# SPDX-License-Identifier: GPL-2.0-or-later
# DUMPBIN may annotate exports with '= internal_symbol' when PDBs are present.
# Parse the export column only; never emit annotations as DEF directives.
function Get-ObsExportNames {
  param([Parameter(Mandatory)][string[]]$Lines)
  @($Lines | ForEach-Object {
    if ($_ -match '^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]{8,16}\s+([A-Za-z_][A-Za-z_0-9]*)(?:\s+=\s+.*)?\s*$') {
      $Matches[1]
    }
  } | Sort-Object -Unique)
}
