"""Reviewed, idempotent corrections for the first Windows assembly.

The trusted implementation-branch workflow commits the actual corrected source
before testing that exact commit. This script is not shipped to end users.
"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
path = root / 'scripts/bootstrap.ps1'
text = path.read_text(encoding='utf-8')
text = text.replace("Get-ChildItem (Join-Path $vs 'VC/Redist/MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1", "Get-ChildItem (Join-Path $vs 'VC/Redist/MSVC') -Directory | Where-Object { $_.Name -match '^\\d+\\.' -and (Test-Path (Join-Path $_.FullName 'x64')) } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1")
path.write_text(text, encoding='utf-8')
path = root / 'crates/playz-core/src/library.rs'
text = path.read_text(encoding='utf-8').replace('rusqlite::DatabaseName::Main', '"main"')
path.write_text(text, encoding='utf-8')
print('Updated SQLite Name API and selected an actual versioned x64 MSVC redistributable directory.')
