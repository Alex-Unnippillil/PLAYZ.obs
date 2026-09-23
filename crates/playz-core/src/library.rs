// SPDX-License-Identifier: GPL-2.0-or-later
use crate::{
    contracts::*,
    error::{Error, Result},
};
use rusqlite::{Connection, OptionalExtension, params};
use rusqlite_migration::{M, Migrations};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::sync::{mpsc, oneshot};

const SCHEMA: &str = include_str!("../migrations/001_initial.sql");
type Work = Box<dyn FnOnce(&mut Connection) + Send>;
#[derive(Clone)]
pub struct Library {
    sender: mpsc::Sender<Work>,
    pub path: PathBuf,
}
#[derive(Debug, Clone)]
pub struct StoredRecording {
    pub view: Recording,
    pub master: PathBuf,
    pub playback: Option<PathBuf>,
}
#[derive(Debug, Clone)]
pub struct StoredJob {
    pub view: ExportJob,
    pub output: PathBuf,
    pub temporary: PathBuf,
}

fn initialize(path: &Path) -> Result<Connection> {
    if rusqlite::version_number() < 3_051_003 {
        return Err("Bundled SQLite must contain the 3.51.3 WAL-reset corruption fix".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let existed = path.exists();
    let mut c = Connection::open(path)?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.pragma_update(None, "foreign_keys", "ON")?;
    c.pragma_update(None, "journal_mode", "WAL")?;
    c.pragma_update(None, "synchronous", "FULL")?;
    c.pragma_update(None, "wal_autocheckpoint", 1000)?;
    let version: u32 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        return Err(
            "This library was created by a newer PLAYZ version. Unsafe downgrade refused.".into(),
        );
    }
    if existed && version < 1 {
        backup_connection(
            &c,
            &path.with_extension(format!("pre-migration-{}.sqlite3", uuid::Uuid::new_v4())),
        )?;
    }
    Migrations::new(vec![M::up(SCHEMA)])
        .to_latest(&mut c)
        .map_err(|e| {
            Error::Message(format!("Migration failed; existing library preserved: {e}"))
        })?;
    Ok(c)
}
fn backup_connection(c: &Connection, destination: &Path) -> Result<()> {
    if destination.exists() {
        return Err("Backup destination already exists".into());
    }
    c.backup("main", destination, None)?;
    Ok(())
}
fn phase(text: String) -> rusqlite::Result<Phase> {
    serde_json::from_value(serde_json::Value::String(text)).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(e))
    })
}
fn record_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<StoredRecording> {
    let playback: Option<String> = r.get(6)?;
    let tags: String = r.get(10)?;
    let view = Recording {
        id: r.get(0)?,
        title: r.get(1)?,
        created_at: r.get(2)?,
        phase: phase(r.get(3)?)?,
        duration_ms: r.get(7)?,
        bytes: r.get::<_, i64>(8)?.max(0).to_string(),
        favorite: r.get::<_, i32>(9)? != 0,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        notes: r.get(11)?,
        source_label: r.get(12)?,
        capture_kind: r.get(13)?,
        has_playback: playback.is_some(),
        resume_ms: r.get(14)?,
        error: r.get(15)?,
    };
    Ok(StoredRecording {
        view,
        master: PathBuf::from(r.get::<_, String>(5)?),
        playback: playback.map(PathBuf::from),
    })
}
const RECORD_COLUMNS: &str = "id,title,created_at,phase,session_id,master_path,playback_path,duration_ms,bytes,favorite,tags_json,notes,source_label,capture_kind,resume_ms,error";
fn job_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<StoredJob> {
    let mode: String = r.get(3)?;
    Ok(StoredJob {
        view: ExportJob {
            id: r.get(0)?,
            recording_id: r.get(1)?,
            state: r.get(2)?,
            mode: if mode == "accurate" {
                ExportMode::Accurate
            } else {
                ExportMode::Fast
            },
            start_ms: r.get(4)?,
            end_ms: r.get(5)?,
            name: r.get(6)?,
            progress: r.get(7)?,
            error: r.get(8)?,
        },
        output: PathBuf::from(r.get::<_, String>(9)?),
        temporary: PathBuf::from(r.get::<_, String>(10)?),
    })
}
const JOB_COLUMNS: &str =
    "id,recording_id,state,mode,start_ms,end_ms,name,progress,error,output_path,temporary_path";

impl Library {
    pub async fn open(path: PathBuf) -> Result<Self> {
        let (sender, mut receiver) = mpsc::channel::<Work>(64);
        let (ready_tx, ready_rx) = oneshot::channel();
        let worker_path = path.clone();
        std::thread::Builder::new()
            .name("playz-sqlite".into())
            .spawn(move || {
                let mut connection = match initialize(&worker_path) {
                    Ok(c) => {
                        let _ = ready_tx.send(Ok(()));
                        c
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                while let Some(work) = receiver.blocking_recv() {
                    work(&mut connection);
                }
                let _ = connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            })?;
        ready_rx
            .await
            .map_err(|_| Error::Message("Database worker did not start".into()))??;
        Ok(Self { sender, path })
    }
    pub async fn call<T: Send + 'static>(
        &self,
        action: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Box::new(move |c| {
                let _ = tx.send(action(c));
            }))
            .await
            .map_err(|_| Error::Message("Database service has stopped".into()))?;
        rx.await
            .map_err(|_| Error::Message("Database response was lost".into()))?
    }
    pub async fn settings(&self, default: Settings) -> Result<Settings> {
        self.call(move |c| {
            let text: Option<String> = c
                .query_row(
                    "SELECT value_json FROM settings WHERE key='application'",
                    [],
                    |r| r.get(0),
                )
                .optional()?;
            match text {
                Some(t) => {
                    let s: Settings = serde_json::from_str(&t)?;
                    s.validate()?;
                    Ok(s)
                }
                None => Ok(default),
            }
        })
        .await
    }
    pub async fn save_settings(&self, value: Settings) -> Result<()> {
        value.validate()?;
        self.call(move |c| { c.execute("INSERT INTO settings(key,value_json) VALUES('application',?1) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", [serde_json::to_string(&value)?])?; Ok(()) }).await
    }
    pub async fn insert(
        &self,
        record: Recording,
        request_id: String,
        master: PathBuf,
    ) -> Result<()> {
        self.call(move |c| {
            let tx = c.transaction()?;
            tx.execute("INSERT INTO sessions(id,created_at,kind,state) VALUES(?1,?2,?3,?4)", params![record.id, record.created_at, record.capture_kind, record.phase.as_str()])?;
            tx.execute("INSERT INTO recordings(id,session_id,request_id,title,created_at,phase,master_path,source_label,capture_kind) VALUES(?1,?1,?2,?3,?4,?5,?6,?7,?8)", params![record.id,request_id,record.title,record.created_at,record.phase.as_str(),master.to_string_lossy(),record.source_label,record.capture_kind])?;
            tx.execute("INSERT INTO recording_segments(id,recording_id,path,phase) VALUES(?1,?1,?2,?3)", params![record.id,master.to_string_lossy(),record.phase.as_str()])?;
            tx.commit()?; Ok(())
        }).await
    }
    pub async fn by_request(&self, request: String) -> Result<Option<String>> {
        self.call(move |c| {
            Ok(c.query_row(
                "SELECT id FROM recordings WHERE request_id=?1",
                [request],
                |r| r.get(0),
            )
            .optional()?)
        })
        .await
    }
    pub async fn get(&self, id: String) -> Result<StoredRecording> {
        self.call(move |c| {
            Ok(c.query_row(
                &format!("SELECT {RECORD_COLUMNS} FROM recordings WHERE id=?1"),
                [id],
                record_row,
            )?)
        })
        .await
    }
    pub async fn list(
        &self,
        query: String,
        offset: u32,
        limit: u32,
        favorites: bool,
    ) -> Result<LibraryPage> {
        if query.len() > 200 || limit == 0 || limit > 200 {
            return Err("Library query exceeds its limits".into());
        }
        self.call(move |c| {
            let filter = "removed=0 AND (?1='' OR title LIKE '%'||?1||'%' OR notes LIKE '%'||?1||'%' OR tags_json LIKE '%'||?1||'%') AND (?2=0 OR favorite=1)";
            let total: u32 = c.query_row(&format!("SELECT count(*) FROM recordings WHERE {filter}"), params![query, favorites], |r| r.get(0))?;
            let mut q = c.prepare(&format!("SELECT {RECORD_COLUMNS} FROM recordings WHERE {filter} ORDER BY created_at DESC,id DESC LIMIT ?3 OFFSET ?4"))?;
            let rows = q.query_map(params![query, favorites, limit, offset], record_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(LibraryPage { items: rows.into_iter().map(|s| s.view).collect(), total })
        }).await
    }
    pub async fn lifecycle(
        &self,
        id: String,
        phase: Phase,
        error: Option<String>,
        duration: Option<f64>,
        bytes: Option<u64>,
        playback: Option<PathBuf>,
    ) -> Result<()> {
        self.call(move |c| {
            let tx = c.transaction()?;
            let changed = tx.execute("UPDATE recordings SET phase=?2,error=?3,duration_ms=COALESCE(?4,duration_ms),bytes=COALESCE(?5,bytes),playback_path=COALESCE(?6,playback_path) WHERE id=?1", params![id, phase.as_str(),error,duration,bytes.map(|v| v.min(i64::MAX as u64) as i64),playback.as_ref().map(|p| p.to_string_lossy().to_string())])?;
            if changed != 1 { return Err("Recording no longer exists".into()); }
            tx.execute("UPDATE sessions SET state=?2 WHERE id=?1", params![id,phase.as_str()])?;
            tx.execute("UPDATE recording_segments SET phase=?2,duration_ms=COALESCE(?3,duration_ms),error=?4 WHERE recording_id=?1", params![id,phase.as_str(),duration,error])?;
            if let Some(p) = playback { tx.execute("INSERT INTO media_assets(id,recording_id,kind,path,duration_ms) VALUES(?1,?2,'playback',?3,?4) ON CONFLICT(path) DO UPDATE SET duration_ms=excluded.duration_ms", params![uuid::Uuid::new_v4().to_string(),id,p.to_string_lossy(),duration])?; }
            tx.commit()?; Ok(())
        }).await
    }
    pub async fn details(&self, id: String, d: Details) -> Result<()> {
        d.validate()?;
        self.call(move |c| {
            if c.execute(
                "UPDATE recordings SET title=?2,favorite=?3,tags_json=?4,notes=?5 WHERE id=?1",
                params![
                    id,
                    d.title.trim(),
                    d.favorite,
                    serde_json::to_string(&d.tags)?,
                    d.notes
                ],
            )? != 1
            {
                return Err("Recording not found".into());
            }
            Ok(())
        })
        .await
    }
    pub async fn resume(&self, id: String, ms: f64) -> Result<()> {
        if !ms.is_finite() || ms < 0.0 {
            return Err("Invalid playback position".into());
        }
        self.call(move |c| {
            c.execute(
                "UPDATE recordings SET resume_ms=MIN(?2,duration_ms) WHERE id=?1",
                params![id, ms],
            )?;
            Ok(())
        })
        .await
    }
    pub async fn remove_entry(&self, id: String) -> Result<()> {
        self.call(move |c| { c.execute("UPDATE recordings SET removed=1 WHERE id=?1 AND phase NOT IN ('preparing','recording','finalizing')", [id])?; Ok(()) }).await
    }
    pub async fn restore_entry(&self, id: String) -> Result<()> {
        self.call(move |c| {
            c.execute("UPDATE recordings SET removed=0 WHERE id=?1", [id])?;
            Ok(())
        })
        .await
    }
    pub async fn bookmark(&self, b: Bookmark) -> Result<Bookmark> {
        if !b.position_ms.is_finite()
            || b.position_ms < 0.0
            || b.label.trim().is_empty()
            || b.label.len() > 160
            || b.note.len() > 5000
        {
            return Err("Invalid bookmark".into());
        }
        self.call(move |c| { c.execute("INSERT INTO bookmarks(id,recording_id,position_ms,label,note) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET position_ms=excluded.position_ms,label=excluded.label,note=excluded.note WHERE bookmarks.recording_id=excluded.recording_id", params![b.id,b.recording_id,b.position_ms,b.label,b.note])?; Ok(b) }).await
    }
    pub async fn bookmarks(&self, id: String) -> Result<Vec<Bookmark>> {
        self.call(move |c| { let mut q = c.prepare("SELECT id,recording_id,position_ms,label,note FROM bookmarks WHERE recording_id=?1 ORDER BY position_ms LIMIT 5000")?; Ok(q.query_map([id], |r| Ok(Bookmark { id:r.get(0)?, recording_id:r.get(1)?, position_ms:r.get(2)?, label:r.get(3)?, note:r.get(4)? }))?.collect::<rusqlite::Result<Vec<_>>>()?) }).await
    }
    pub async fn delete_bookmark(&self, id: String) -> Result<()> {
        self.call(move |c| {
            c.execute("DELETE FROM bookmarks WHERE id=?1", [id])?;
            Ok(())
        })
        .await
    }
    pub async fn enqueue(&self, job: StoredJob) -> Result<()> {
        self.call(move |c| { let j=job.view; c.execute("INSERT INTO export_jobs(id,recording_id,created_at,state,mode,start_ms,end_ms,name,output_path,temporary_path) VALUES(?1,?2,?3,'queued',?4,?5,?6,?7,?8,?9)", params![j.id,j.recording_id,chrono::Utc::now().to_rfc3339(), match j.mode {ExportMode::Accurate=>"accurate",ExportMode::Fast=>"fast"},j.start_ms,j.end_ms,j.name,job.output.to_string_lossy(),job.temporary.to_string_lossy()])?; Ok(()) }).await
    }
    pub async fn jobs(&self) -> Result<Vec<ExportJob>> {
        self.call(|c| {
            let mut q = c.prepare(&format!(
                "SELECT {JOB_COLUMNS} FROM export_jobs ORDER BY created_at DESC LIMIT 200"
            ))?;
            Ok(q.query_map([], job_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?
                .into_iter()
                .map(|j| j.view)
                .collect())
        })
        .await
    }
    pub async fn job(&self, id: String) -> Result<StoredJob> {
        self.call(move |c| {
            Ok(c.query_row(
                &format!("SELECT {JOB_COLUMNS} FROM export_jobs WHERE id=?1"),
                [id],
                job_row,
            )?)
        })
        .await
    }
    pub async fn claim_job(&self) -> Result<Option<StoredJob>> {
        self.call(|c| { let tx=c.transaction()?; let job=tx.query_row(&format!("SELECT {JOB_COLUMNS} FROM export_jobs WHERE state='queued' ORDER BY created_at LIMIT 1"),[],job_row).optional()?; if let Some(j)=&job { tx.execute("UPDATE export_jobs SET state='running',error=NULL WHERE id=?1",[&j.view.id])?; } tx.commit()?; Ok(job) }).await
    }
    pub async fn job_state(
        &self,
        id: String,
        state: &str,
        progress: f64,
        error: Option<String>,
    ) -> Result<()> {
        if !matches!(
            state,
            "queued" | "running" | "completed" | "failed" | "cancelled"
        ) || !progress.is_finite()
        {
            return Err("Invalid job state".into());
        }
        let state = state.to_owned();
        self.call(move |c| {
            c.execute(
                "UPDATE export_jobs SET state=?2,progress=?3,error=?4 WHERE id=?1",
                params![id, state, progress.clamp(0.0, 100.0), error],
            )?;
            Ok(())
        })
        .await
    }
    pub async fn reconcile_states(&self) -> Result<usize> {
        self.call(|c| { let tx=c.transaction()?; let n=tx.execute("UPDATE recordings SET phase='interrupted',error='Previous process ended before verified finalization. Original media was preserved; use Recover.' WHERE phase IN ('preparing','recording','finalizing')",[])?; tx.execute("UPDATE recording_segments SET phase='interrupted' WHERE phase IN ('preparing','recording','finalizing')",[])?; tx.execute("UPDATE sessions SET state='interrupted' WHERE state IN ('preparing','recording','finalizing')",[])?; tx.execute("UPDATE export_jobs SET state='queued',progress=0,error='Interrupted export will be reconciled before restart' WHERE state='running'",[])?; tx.commit()?; Ok(n) }).await
    }
    pub async fn backup(&self, destination: PathBuf) -> Result<PathBuf> {
        self.call(move |c| {
            backup_connection(c, &destination)?;
            Ok(destination)
        })
        .await
    }
    pub async fn relink(&self, id: String, master: PathBuf) -> Result<()> {
        self.call(move |c| { let tx=c.transaction()?; tx.execute("UPDATE recordings SET master_path=?2,playback_path=NULL,phase='interrupted',error='Relinked master; recover to rebuild playback' WHERE id=?1",params![id,master.to_string_lossy()])?; tx.execute("UPDATE recording_segments SET path=?2 WHERE recording_id=?1",params![id,master.to_string_lossy()])?; tx.commit()?; Ok(()) }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn record(id: &str) -> Recording {
        Recording {
            id: id.into(),
            title: "日本語 test".into(),
            created_at: "2026-09-23T00:00:00Z".into(),
            phase: Phase::Preparing,
            duration_ms: 0.0,
            bytes: "0".into(),
            favorite: false,
            tags: vec![],
            notes: String::new(),
            source_label: "fixture".into(),
            capture_kind: "window".into(),
            has_playback: false,
            resume_ms: 0.0,
            error: None,
        }
    }
    #[tokio::test]
    async fn persistence_recovery_backup() {
        let d = tempfile::tempdir().unwrap();
        let path = d.path().join("library.sqlite3");
        let l = Library::open(path.clone()).await.unwrap();
        l.insert(record("r"), "req".into(), d.path().join("master.mkv"))
            .await
            .unwrap();
        assert_eq!(l.by_request("req".into()).await.unwrap(), Some("r".into()));
        assert!(
            l.insert(record("r2"), "req".into(), d.path().join("other.mkv"))
                .await
                .is_err()
        );
        assert_eq!(l.reconcile_states().await.unwrap(), 1);
        l.details(
            "r".into(),
            Details {
                title: "O'Brien 🎮".into(),
                favorite: true,
                tags: vec!["ace".into()],
                notes: "notes".into(),
            },
        )
        .await
        .unwrap();
        let b = l.backup(d.path().join("backup.sqlite3")).await.unwrap();
        let restored = Library::open(b).await.unwrap();
        assert_eq!(
            restored.get("r".into()).await.unwrap().view.title,
            "O'Brien 🎮"
        );
        assert_eq!(
            restored
                .list("ace".into(), 0, 20, true)
                .await
                .unwrap()
                .total,
            1
        );
        l.remove_entry("r".into()).await.unwrap();
        assert_eq!(l.list("".into(), 0, 20, false).await.unwrap().total, 0);
        l.restore_entry("r".into()).await.unwrap();
        assert_eq!(l.list("".into(), 0, 20, false).await.unwrap().total, 1);
    }
    #[tokio::test]
    async fn future_schema_refused_without_erasure() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("future.sqlite3");
        {
            let c = Connection::open(&p).unwrap();
            c.pragma_update(None, "user_version", 99).unwrap();
        }
        assert!(Library::open(p.clone()).await.is_err());
        let c = Connection::open(p).unwrap();
        let n: u32 = c
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(n, 99);
    }
    #[test]
    fn migrations_validate() {
        assert!(Migrations::new(vec![M::up(SCHEMA)]).validate().is_ok());
        assert!(rusqlite::version_number() >= 3_051_003);
    }
}
