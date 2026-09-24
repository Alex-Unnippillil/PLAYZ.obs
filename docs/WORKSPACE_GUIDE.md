# Workspace guide: saved views and recording overview

This increment preserves the native recording, database schema and export pipeline. It adds renderer-side workflow tools. Product version remains 0.1.0 unsigned engineering preview; this guide is not hardware acceptance evidence.

## Save a useful collection

Search titles, tags and notes, choose Active or Removed, optionally turn on Favorites, then choose **Save view**. Give it a unique name of 1–40 characters. Up to eight views can be saved on this computer. Applying a view restores the exact search text, favorite filter and collection, returning pagination to the first page. It does not modify or duplicate recordings.

Search operates through the existing native library query, not just on currently visible rows. Results remain newest first. `%`, `_`, backslashes and other supported literal search characters retain the backend's existing escaped-search semantics. A saved view is not a new query language. Search matching and Unicode collation retain the current SQLite implementation's limits.

**Manage** removes individual shortcuts. **Reset view preferences** requires confirmation and resets all saved view shortcuts plus density. Neither operation changes capture profiles, catalog entries, bookmarks, video files or exports. Removing a saved view and removing a recording are deliberately different operations.

## Density and resume

**Comfortable** shows more recording metadata; **Compact** reduces row height and secondary information. Both keep the existing virtualized rows and database pagination. The preference persists separately from the catalog.

The resume hint reflects a saved playback position only when the entry is Ready, has a playback asset and its finite position lies strictly inside the recording duration. The small track is a visual position indicator, not a watched-completion score. Removed, interrupted, invalid or finished positions do not receive a hint. Clicking the recording still opens the existing review player; no frame-accurate resume claim is added.

Press **/** in the Library to focus search. It is ignored inside text inputs, editable fields, selects and dialogs, for key repeats/composition, and with Ctrl/Meta/Alt modifiers. **Ctrl+K** continues to open Quick actions outside text fields/dialogs. Dialogs retain focus trapping, Escape and restoration from the existing Radix primitive.

## Capture overview

The active Library shows the saved source/profile, audio selection and a planning estimate based on the last native disk reading. No discovery, microphone activation, source widening or encoder switch happens merely by opening the Library.

The overview says **not hardware-qualified** alongside a configured source. Selected devices are not proof of non-black video or non-silent sound. Use **Edit capture profile**, save deliberately, and verify a short recording before a longer session.

The storage estimate budgets a preserved master and its MP4 playback copy, adds 192 kbps audio even when disabled, and reserves the larger of configured GiB or two minutes of output. It uses BigInt byte arithmetic before converting the display duration. Exact formula and native reserve source: [captureOverview.ts](../apps/desktop/src/lib/captureOverview.ts), [paths.rs](../crates/playz-core/src/paths.rs).

Disk readings originate at app startup, recording start or the recording heartbeat. They may already be stale while idle. A failed state query or zero/unparseable reading shows unavailable. The estimate cannot account for other applications' writes, variable encoder output, existing/queued exports or every temporary-file requirement. It does not make a session-length or disk-exhaustion guarantee. Durations are rounded and capped at 48+ hours in the display.

## Privacy, storage and failure behavior

Only explicitly saved names/search terms/filter choices and density are written under `playz.library.preferences.v1` in the installed WebView's local storage. User-entered search terms may themselves contain sensitive text; they stay in that local preference store. No new network request, telemetry, account or permission is introduced. Library media, native paths and capture credentials are not copied into this store by the application.

The value is versioned and bounded to 16 KiB of text, eight entries, 40-character names and 200-character queries. Corrupt, duplicate or future-version content is not silently overwritten. The UI reports that it cannot read the value, uses in-memory defaults, and requires explicit reset before replacing the existing value. Write failures produce a visible warning rather than a false persisted-success message. Unsaved in-memory convenience changes can be lost when leaving/reloading the Library; recording data is unaffected.

SQLite catalog backups do **not** include these WebView preferences. Back up recording folders separately from the catalog. Deleting WebView profile data may remove saved view shortcuts; it does not constitute deletion of the video catalog or media.

## Verification and screenshot provenance

Unit/component tests cover parse bounds, duplicates, future versions, exact view criteria, persistence failures/reset, keyboard guards, valid resume positions, reserve math and unavailable readings. Browser tests exercise save/apply/remove across reloads, density, focus, narrow layouts and axe checks. These are renderer tests with explicitly injected data, not capture tests.

README images are captured from the built UI by the same Playwright suite. `scripts/prepare-gallery.py` collects a fixed allowlist of screenshots after the suite succeeds and records source commit, byte count and SHA-256. The checked-in images were imported from a passing owner-branch build after review. The final gallery retains its original source identity; normal CI is read-only and only uploads test artifacts. Release UI has no injected test state or screenshot upload code.

`python scripts/check-docs.py` checks the README/guide's local targets, stack pins and image hashes, plus the presence of fenced Mermaid chart blocks. It does not claim to execute GitHub's Mermaid renderer. Hosted installed-application verification, actual native capture and real FFmpeg tests remain separate layers. Review the exact completed run evidence in [PR #4](https://github.com/Alex-Unnippillil/PLAYZ.obs/pull/4); never count the existence of this guide as a passed test.
