# Removed recordings: reversible local library organization

This is an unsigned local engineering-preview increment. It does not enable League automation, permanent media deletion, cloud services, or database replacement.

## User workflow

In Match review, choose **Remove entry**, read the confirmation, then choose **Remove entry only**. PLAYZ hides the catalog entry from Active recordings. It does not delete the master, playback asset, bookmarks or exports. Queued exports are not cancelled. The existing immediate **Undo removal** still works.

To restore an entry later, including after quitting and restarting PLAYZ, open **Library > Removed**, search by title/tags/notes or use Favorites, and choose **Restore**. The entry reappears under **Active**. Its title, tags, favorite state, notes, bookmark IDs/notes, playback position, media paths and export jobs are retained. Restoration does not start capture, launch an encoder, rewrite media, or reset a failed/interrupted recording to Ready.

This collection is not the Windows Recycle Bin. It cannot recover a file deleted outside PLAYZ or replace a missing media drive. Restore the entry, reconnect the drive, and use the existing Relink/Recover actions where applicable. Catalog backups and separate media-folder backups are still necessary. Full database restoration, drive-loss recovery and the broader release fault matrix remain separate acceptance gates.

## Implementation

- `Library::list` continues to return only active entries. New `Library::list_removed` shares a bounded, parameterized query with the active collection. Count and page are read within one SQLite transaction. Both collections use creation time and UUID as a deterministic order.
- Search treats `%`, `_` and backslash literally instead of exposing SQL LIKE wildcard syntax. Existing SQLite case behavior is retained; no new Unicode case-folding claim is made.
- `list_removed_recordings` is an explicitly allowlisted Tauri command returning the existing `LibraryPage` DTO. No raw paths or SQL are accepted, and no new general filesystem or shell capability is granted.
- Remove/restore commands validate UUIDs. A conditional SQL update rejects removal while preparing/recording/finalizing. A missing entry now reports an error rather than claiming success. Repeated removal/restoration of a known safe entry remains idempotent.
- The frontend includes collection and filter/page values in query keys. It uses the existing offline-capable TanStack client. Restoring is not optimistic: only a successful native result triggers a success notice/refetch. Failure leaves the row visible; in-flight restore clicks are deduplicated.
- Pagination resets when filters/collection change, and moves to the preceding page when restoring the last result on a later page. Virtual row keys use recording UUIDs. Keyboard focus returns to a stable collection control after a successful restoration.

SQLite update/transaction semantics and TanStack query-key guidance were rechecked during implementation: https://sqlite.org/lang_update.html ; https://www.sqlite.org/lang_transaction.html ; https://tanstack.com/query/latest/docs/framework/react/guides/query-keys . No dependency or lockfile upgrade was needed.

## Verification

Tests are added at three levels. Their presence is not a passing result; the associated PR records exact-commit execution results and fresh package provenance.

| Suite | Coverage |
|---|---|
| `tests/library_visibility.rs` | Separate active/removed collections; idempotence; missing/active-entry rejection; literal Unicode/punctuation searches; deterministic pagination; bounded queries; title/tags/notes/favorites/resume/bookmark/export preservation through catalog reopening and the existing backup API. |
| `features/Library.test.tsx` | Active/Removed switching; search/favorites/clear; explicit native API calls; offline actions; pending-click deduplication; failures; pagination reset/last-row restoration; text escaping; focus recovery. jsdom mocks geometry/API only; it is not native acceptance. |
| `tests/media_pipeline.rs` | Import real generated H.264/AAC media, bookmark and export, remove, close/reopen the actual Core, restore, probe playback, and compare master/playback/export SHA-256 values. |
| `scripts/test-installed-ui.ps1` | Install the newly built application; use the real UI to remove an imported recording, quit/restart, restore from Removed, and verify the recording and dependent export are accessible. No injected catalog or mock backend. |

Commands on the Windows build machine:

```powershell
pnpm typecheck
pnpm test
pnpm build
cargo fmt --all --check
cargo test -p playz-core --locked --all-targets
cargo run -p playz-core --locked --bin generate-contracts -- --check
./scripts/test-media.ps1
./scripts/package.ps1 -SkipNative
./scripts/test-installed.ps1
```

The existing desktop and capture workflows remain merge gates. Native/media tests require the pinned runtime from `./scripts/bootstrap.ps1 -Native`. Installed tests run on a disposable account. Hosted Windows Server 2022 success is not clean offline Windows 11, real-game/audio/GPU, two-hour recording, full accessibility/scaling, supply-chain or signing acceptance. See `RELEASE_CHECKLIST.md`.

## Installed-driver compatibility

The first installed test of this increment completed import/play/export and entry removal, then failed when its driver assumed the Removed collection button supported `InvokePattern`. The failure screenshot shows the correctly emptied Active collection. WAI-ARIA `aria-pressed` buttons map to UI Automation's `TogglePattern`. The developer-only driver now selects actual Button controls and uses the supported Invoke or Toggle action; it logs each action and collects supported patterns on failure. No application semantics or assertions were removed. A rerun must prove the full remove/restart/restore path before merge; the earlier failed run is not passing evidence.

References: https://www.w3.org/TR/core-aam-1.2/#role-map-button-pressed ; https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.automationelement.trygetcurrentpattern .
