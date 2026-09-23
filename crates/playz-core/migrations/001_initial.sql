CREATE TABLE sessions (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL,
 state TEXT NOT NULL, external_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE recordings (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 request_id TEXT UNIQUE NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL,
 phase TEXT NOT NULL, master_path TEXT NOT NULL UNIQUE, playback_path TEXT,
 duration_ms REAL NOT NULL DEFAULT 0 CHECK(duration_ms >= 0), bytes INTEGER NOT NULL DEFAULT 0,
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)), tags_json TEXT NOT NULL DEFAULT '[]',
 notes TEXT NOT NULL DEFAULT '', source_label TEXT NOT NULL, capture_kind TEXT NOT NULL,
 resume_ms REAL NOT NULL DEFAULT 0, error TEXT, removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX recordings_created ON recordings(removed, created_at DESC);
CREATE TABLE recording_segments (
 id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id),
 path TEXT NOT NULL UNIQUE, phase TEXT NOT NULL, start_ms REAL NOT NULL DEFAULT 0,
 duration_ms REAL, error TEXT
);
CREATE TABLE media_assets (
 id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id),
 kind TEXT NOT NULL, path TEXT NOT NULL UNIQUE, duration_ms REAL, sha256 TEXT
);
CREATE TABLE bookmarks (
 id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id),
 position_ms REAL NOT NULL CHECK(position_ms >= 0), label TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX bookmarks_recording ON bookmarks(recording_id, position_ms);
CREATE TABLE events (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 source_id TEXT, fingerprint TEXT NOT NULL, kind TEXT NOT NULL, game_seconds REAL,
 media_ms REAL, uncertainty_ms REAL, provenance TEXT NOT NULL, raw_json TEXT NOT NULL,
 UNIQUE(session_id, fingerprint)
);
CREATE TABLE clock_anchors (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), segment_id TEXT NOT NULL REFERENCES recording_segments(id),
 game_seconds REAL NOT NULL, media_ms REAL NOT NULL, uncertainty_ms REAL NOT NULL, mapping_version INTEGER NOT NULL
);
CREATE TABLE clip_candidates (
 id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id),
 rule_version INTEGER NOT NULL, reason TEXT NOT NULL, start_ms REAL NOT NULL, end_ms REAL NOT NULL,
 missing_context INTEGER NOT NULL, event_refs_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'suggested'
);
CREATE TABLE export_jobs (
 id TEXT PRIMARY KEY, recording_id TEXT NOT NULL REFERENCES recordings(id), created_at TEXT NOT NULL,
 state TEXT NOT NULL, mode TEXT NOT NULL, start_ms REAL NOT NULL, end_ms REAL NOT NULL,
 name TEXT NOT NULL, output_path TEXT NOT NULL UNIQUE, temporary_path TEXT NOT NULL UNIQUE,
 progress REAL NOT NULL DEFAULT 0, error TEXT
);
CREATE INDEX export_queue ON export_jobs(state, created_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE schema_history (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_history VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE VIRTUAL TABLE recording_search USING fts5(title, notes, tags, content='');
