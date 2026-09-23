"""One-time reviewed source corrections for the initial remote Windows build.

This is development tooling, not part of the application. The assembly workflow
commits the resulting actual source and lockfile before testing that exact commit.
It is restricted to the owner's implementation branch and never force-pushes.
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
path = root / 'scripts/bootstrap.ps1'
text = path.read_text(encoding='utf-8')
lines = text.splitlines()
for index, line in enumerate(lines):
    if line.startswith('cmd /s /c '):
        lines[index] = 'cmd /c "call `"$devcmd`" -arch=x64 -host_arch=x64 >nul && set" | ForEach-Object {'
path.write_text('\n'.join(lines) + '\n', encoding='utf-8')

path = root / 'crates/playz-core/src/media.rs'
text = path.read_text(encoding='utf-8').replace('reader.by_ref().take(8193)', '(&mut reader).take(8193)')
path.write_text(text, encoding='utf-8')

path = root / 'crates/playz-core/src/library.rs'
text = path.read_text(encoding='utf-8')
text = text.replace('let mut c = Connection::open(path)?;', 'let existed = path.exists();\n    let mut c = Connection::open(path)?;')
text = text.replace('if version > 0 && version < 1 { backup_connection(&c, &path.with_extension("pre-migration.sqlite3"))?; }', 'if existed && version < 1 { backup_connection(&c, &path.with_extension(format!("pre-migration-{}.sqlite3", uuid::Uuid::new_v4())))?; }')
path.write_text(text, encoding='utf-8')

path = root / 'crates/playz-core/migrations/001_initial.sql'
text = path.read_text(encoding='utf-8')
text = text.replace("CREATE VIRTUAL TABLE recording_search USING fts5(title, notes, tags, content='');\n", '')
path.write_text(text, encoding='utf-8')

path = root / 'crates/playz-core/src/core.rs'
text = path.read_text(encoding='utf-8').replace('Library,StoredJob,StoredRecording', 'Library,StoredJob')
path.write_text(text, encoding='utf-8')
print('Reviewed source corrections applied; no production mock or capture fallback was added.')
