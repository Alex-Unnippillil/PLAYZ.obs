# Next-version increment: export recovery and stop-failure cleanup

This change is an engineering-preview increment, not a production release. The historical 0.1 installer in `LOCAL_PREVIEW_HANDOFF.md` does not contain this code. Only a fresh package built from the new source can be used to test these changes.

## Behaviour

Every newly completed export retains a small, versioned `.receipt.json` sidecar next to its private temporary filename. Before publishing the MP4, PLAYZ hashes the complete encoded clip with SHA-256, flushes it, and atomically persists the receipt. The receipt binds the recording ID, exact trim interval, export mode, master/output paths, and the job-specific temporary path. It stores only digests and byte count, not raw paths, titles, or player information.

After a restart, the existing SQLite queue reconciliation returns interrupted running jobs to queued. The media worker now handles both publication boundaries:

| Files found | Behaviour |
|---|---|
| Final MP4 and a matching receipt | Verify every output byte, probe actual media, validate codec/duration, then complete the job without re-encoding. |
| Verified temporary MP4 and receipt; no final output | Revalidate and publish without re-encoding, using the existing no-overwrite operation. |
| Receipt but no remaining clip | Restart encoding from trim-in; refresh only a valid receipt for the same job. |
| Existing output without a receipt | Preserve it and fail closed. Legacy clips are never adopted based only on duration or codec. |
| Changed bytes, foreign intent, malformed/oversized/unsupported receipt | Preserve existing files; report failure rather than overwrite or falsely complete. |

Hashing streams in 256 KiB chunks and checks cancellation/recording-pause between reads. A cancelled or paused encode restarts from trim-in when retried; it does not resume encoded bytes. Originals are never rewritten. Receipt sidecars should be retained with the recording's exports folder. A receipt is a local crash-consistency record, not a signature or a defence against a malicious process with the same user's write access.

When stopping a recording, failure to persist the `finalizing` lifecycle transition now takes the same failure-cleanup path as a recorder/media error. It attempts normal recorder shutdown, clears the busy flag, and marks the session interrupted instead of leaving the controller permanently busy. Database failure can still prevent persistence; original media and the recovery warning remain the fallback.

## Verification entry points

- `cargo fmt --all --check`
- `cargo test -p playz-core --locked --all-targets`
- `cargo run -p playz-core --locked --bin generate-contracts -- --check`
- Windows with the pinned runtime: `./scripts/test-media.ps1`
- Native selected-window check: `./scripts/test-capture.ps1`
- Fresh package: `./scripts/package.ps1 -SkipNative`, then `./scripts/test-installed.ps1`

Unit/integration fixtures cover full-byte identity, same-length tampering, changed trim/mode/recording/job/path, oversized and corrupt receipts, pre-cancellation/pre-pause, output collision preservation, and an injected real SQLite lifecycle failure. Real-media tests recover both publication boundaries with the encoder executable deliberately unavailable, retain a real ffprobe check, and reopen the actual SQLite catalog to reconcile a published job. The existing decoded-frame/audio/master-hash tests remain in the same media suite.

The initial code commit introduces these tests; passing execution must be established by its linked Actions checks. Test names or test source alone do not constitute passing evidence.

## Remaining boundaries

No new dependency, migration, renderer permission, network client, or enabled League integration is introduced. This does not establish full power-loss durability, hostile same-user filesystem-race resistance, clean Windows 11 offline installation, real-game/audio/GPU qualification, two-hour stability, or signing. The historical handoff and `RELEASE_CHECKLIST.md` continue to apply. Do not relabel an old installer as containing this increment.

Publication continues to use the existing same-folder hard-link/no-overwrite path. Cleanup failure after publication can leave the temporary hard link; recovery verifies the final output and does not delete potentially ambiguous extra files. Filesystems without the required hard-link semantics fail rather than silently switching to overwrite.
