# Architecture and boundaries

## Ownership

`apps/desktop/src` displays local snapshots and sends intentions. `apps/desktop/src-tauri` exposes individually declared commands and owns tray, single-instance, native pickers, hotkeys and scoped media access. It does not grant the renderer an unrestricted filesystem or shell.

`crates/playz-core` owns recording decisions, SQLite, paths, supervision, reconciliation and media jobs. These closely related services are modules in one crate for the initial local build; they are not split into speculative microservices. Rust commands validate persisted settings and user inputs. DTO declarations come from `ts-rs` and are checked for drift.

`native/recorder` is original C++ code using the pinned upstream libobs public API. The build uses matching source headers and the official runtime DLL. Its import library is generated from that exact DLL and checks mandatory exports. No undocumented Ascent CLI or OBS WebSocket service is assumed.

## Recording lifecycle

A bounded serialized controller prevents duplicate simultaneous capture. Each start carries a local UUID request ID; the database retains it. The engine must acknowledge capture and show actual encoded frames/output bytes before the controller presents Recording. This does not prove that the content is non-black or that audio is non-silent.

The native protocol is versioned JSON over inherited parent/child handles, not a public localhost port or broadly accessible named pipe. Frames and operations have size/deadline bounds. Windows job ownership supplies last-resort child cleanup. Normal Quit calls stop/finalize first. A controller crash can kill the recorder and interrupt the current MKV; the recovery path never promises uninterrupted capture or preservation of every final frame.

Selected game/window scope is validated again at start. Full-monitor fallback is absent. Microphone activation is explicit. SDR H.264/AAC is the only supported compatibility profile in this first implementation.

## Persistence and media

The SQLite service has one bounded writer thread, parameterized SQL, foreign keys, WAL and FULL synchronization for durable lifecycle/user edits. The bundled SQLite runtime is checked for the required minimum patched version. Backups use SQLite's backup API rather than copying only the live database file.

Video lives outside SQLite. UUID recording directories contain original media and versioned manifests. Atomic same-volume publication never replaces an existing final video. Manifests and database transactions are not one atomic transaction; startup reconciliation handles known interrupted records and recognizable unindexed manifests conservatively.

FFmpeg/ffprobe run outside the renderer, using argument arrays, registered local paths, a file/pipe protocol allowlist, timeouts, bounded progress and process ownership. The source master is never trimmed in place. MP4 playback copies are lossless remuxes for compatible streams. Accurate export re-encodes; fast export may include a preceding keyframe and is not frame-exact.

Heavy export work is paused during capture. Pausing terminates the current encoding attempt; retry starts the trim again, not at a byte offset. Disk use includes masters, playback copies and temporary exports. No automatic deletion policy is implemented.

## Deliberate limitations

There is no production League polling or automation in 0.1. `league.rs` provides isolated mapping/rules tests only. Actual output PTS calibration, metadata backfill, per-session deduplication, a TLS fixture server and real-match evidence remain future work.

Live manual bookmarks currently use encoded-frame-count time from the recorder. They are not claimed to be precisely calibrated media PTS, nor is browser seeking advertised as exact frame stepping.

Audio is one mixed playback track. Audio meters, per-game isolation, separate microphone tracks, HDR, automatic encoder fallback, hardware qualification, GPU performance budgets and autostart are not implemented/accepted. Persistent redacted diagnostic log bundles and comprehensive filesystem watcher/reparse-race hardening remain release work.
