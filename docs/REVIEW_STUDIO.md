# Review Studio and frontend stack decisions

## Selection workflow

Open a playable recording from Library. Drag the **Selection start/end** handles, focus either handle and use the arrow keys, or enter numeric trim timestamps. Minimum selection length is 250 ms. The thin playhead line reflects ordinary player time; the band is the selected interval, not an audio waveform or per-frame decoding result.

**Undo selection** and **Redo selection** retain up to 50 selection decisions while this review stays open. A pointer gesture contributes one step. Numeric input is not silently clamped: invalid/blank values disable the timeline and export until corrected, undone or reset with Full recording. Undo does not reverse bookmarks, exports or file operations. Leaving the review resets selection history; no original media is edited.

**Loop selection** is off initially. Enabling it does not play anything. Press **Preview interval** to start. At the interval boundary, loop mode seeks to trim-in; ordinary preview pauses instead. **Stop preview**, an explicit seek, or a new selection stops the active preview. Browser time events and seek behavior are not frame-exact, so very short loops can include timing overshoot. Accurate FFmpeg export remains a distinct, validated pipeline.

Find bookmarks by their label or note. Previous/next navigate the filtered list in timestamp order. A bookmark's clip button selects up to 15 seconds around it, clipped to available recorded coverage; it does not queue an export or create media. Existing edit/delete and numeric trim controls remain available. No League events or synthetic statistics are introduced.

## Stack update and architectural decisions

- **Radix Slider 1.4.7 (MIT)** extends the existing Radix primitive family for multi-thumb pointer/keyboard semantics instead of creating a second UI framework. The published package accepts React 19. Its exact version and transitive graph are committed in the frontend manifest and lockfile. Existing direct Rust/native/toolchain/frontend versions are retained, not blindly upgraded.
- **React.lazy/Suspense** defers Review, Settings and Operations modules. Library, capture controls, status polling and navigation remain in the initial shell. All chunks are built static installer assets; no CDN or runtime dependency download exists. Local TanStack queries keep their existing offline-capable network policy.
- **Page-scoped error containment** lives below the capture bar. A failed page can return to Library or explicitly reload the interface. Returning clears stale settings navigation guards and discards page-only edits; durable recordings remain in the native core. This does not promise uninterrupted native-controller crash recovery.
- **A bounded pure reducer** owns transient selection history; no extra global state store or database migration is needed. No cloud, AI service, telemetry, broad shell permission, native hook or automatic deletion is added.
- **Vite manifest size checks**, implemented using Node standard-library APIs, verify deferred module boundaries and raw/gzip bundle sizes. Limits are 480 KiB initial static closure, 450 KiB each JavaScript chunk, 800 KiB all JavaScript. A missing manifest/import/chunk or an accidentally eager secondary page fails the build. `artifacts/bundle-report.json` records measurements; no startup/FPS claim is inferred from bytes.

The short-lived branch-only lock writer is removed before the final PR tree. Regular verification workflows use read-only repository permissions and frozen dependency installation. The dependency register and README pins are verified with the documentation checker.

## Verification entry points

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
python scripts/check-docs.py --self-test
python scripts/check-docs.py
# Renderer interaction tests against built local assets and a test-only fixture:
pnpm --dir apps/desktop exec playwright test --config playwright.ui.config.ts
# Windows with the pinned native runtime; drives the actual installed package:
./scripts/test-installed.ps1
```

Frontend tests cover history bounds/branching/invalid input, slider keyboard changes, loop preview and failures, bookmark navigation, and page-error containment. Node tests exercise the bundle graph and size gate. Chromium tests cover real HTML video loops, pointer/keyboard editing, undo grouping, dark/light narrow layouts, automated accessibility, and a blocked deferred chunk. Browser fixtures do not prove native recording. The installed Windows workflow separately exercises real media, numeric selection edits, undo/redo, explicit looping and the unchanged import/export/restart workflow.

Test code is not passing evidence. Exact commit, source tree, completed runs and any failures are recorded in the pull request after execution. Historical README gallery images retain their original provenance and are not relabeled as this new screen.

## Unchanged release boundaries

This remains an unsigned 0.1 engineering preview. Full Windows 11 offline clean installation, real-game audio/GPU qualification, sustained sessions, fault/power-loss/upgrade/restore coverage, manual accessibility and hardware scaling, corresponding-source/SBOM review, and signing are still separate gates. No League automation is enabled. See [release checklist](../RELEASE_CHECKLIST.md), [implementation status](../IMPLEMENTATION_STATUS.md), [dependency register](../third_party/DEPENDENCIES.md) and [architecture overview](../README.md).
