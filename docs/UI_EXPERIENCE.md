# Simplified local UI increment

The interface keeps everyday actions visible and puts occasional controls behind named disclosures. Native recording, receipt recovery, SQLite, Active/Removed collections, permissions, dependency pins and the 0.1.0 preview version are unchanged.

## Everyday workflow

1. **Capture settings:** choose a specific source and discovered encoder. Compact (720p30 / 6 Mb/s), Balanced (1080p30 / 10 Mb/s), and Smooth (1080p60 / 16 Mb/s) fill quality fields only. They never enable a microphone, widen capture scope, select another encoder, or save automatically. These are presets, not hardware recommendations.
2. **Save profile:** only saved settings are used by Record and global shortcuts. Unsaved settings prompt before navigating to another workspace or using the in-app Quit safely action. Stay preserves the draft; Discard is explicit. This guard is renderer-local: it is not a guarantee across a crash, renderer reload, or an OS/tray-level quit.
3. **Library:** open a recording; existing search, favorites, paging, removal and restoration remain available. Match review navigation appears after choosing a recording.
4. **Review:** select up to 15/30 seconds around the playhead, use ordinary numeric trim controls, preview, then queue a clip. The selection stays inside recorded coverage. Accurate export remains the default. Fast export is in Export options and retains a visible boundary warning even when collapsed.
5. **Export queue:** All, In progress, Completed and Needs attention filter existing jobs, not copies of them. Completed clips stay accessible; failed/cancelled jobs retain Retry. Progress is actual backend progress, not a decorative animation.

## Advanced controls

Advanced settings contains custom resolution/FPS/bitrate, free-space reserve, global hotkeys and hide-to-tray behavior. Errors reveal the advanced fields and focus an error summary. Saved unavailable audio device IDs remain visible; refreshing devices does not silently select another microphone or output.

Recording tools contains relinking, recovery and removal. The removal confirmation still explains that media and dependent clips remain on disk and restoration is available in Library → Removed. Diagnostics and catalog backup remain one click away in the sidebar.

Quick actions opens from the sidebar or Ctrl/Cmd+K outside editable fields. It searches navigation destinations and shows configured native shortcuts; it cannot execute a recording command. Escape restores focus to the opening control. Player-local J/L seek five seconds, K toggles playback, I/O set trim, and B creates a bookmark. They ignore modifiers, repetition and text entry. No frame-accuracy claim is made.

## Visual system and accessibility

Graphite/neutral surfaces, restrained mint accents, quieter navigation, consistent spacing, explicit focus indicators, and dark/light/system preference using the existing native setting. At narrow widths the sidebar becomes wrapped top navigation, review stacks, and settings use one column. Disclosures have real buttons, stable names, aria-expanded/controls, and hidden content is removed from navigation. Reduced motion and Windows forced-colors receive explicit treatment.

Design references: WAI disclosure pattern (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), Radix Dialog keyboard/focus model (https://www.radix-ui.com/primitives/docs/components/dialog), React state identity (https://react.dev/learn/preserving-and-resetting-state). Existing dependencies are reused without upgrades.

## Verification

- Existing and new Vitest tests: `pnpm typecheck`; `pnpm test`; `pnpm build`.
- Renderer suite: build, install the pinned Playwright Chromium runtime, generate the four-second `dist/fixture.mp4` as in `.github/workflows/ui.yml`, then `pnpm --dir apps/desktop exec playwright test --config playwright.ui.config.ts`.
- Browser tests inject explicit test fixtures into built assets. The production graph does not import fixture data or a mock backend. Screenshots from this suite are **UI fixtures, not game capture**. Tests include 390/680/960/1440 CSS-pixel widths, dark/light themes, axe, focus, draft navigation, filters, review controls and absence of a production browser recorder.
- `scripts/test-installed.ps1` still installs the full newly built NSIS package and drives real Tauri commands. The workflow now also exercises presets, advanced settings, the unsaved guard, native profile save, quick selection, export options, Completed filtering and the existing import/play/export/restart/remove/restore flow.
- Existing native capture, real FFmpeg pipelines and Windows/Linux Rust checks remain merge gates.

Execution results must be attached to the exact PR source and package. Test code alone is not passing evidence. CSS-pixel reflow and axe checks do not establish every assistive technology or physical Windows DPI/monitor case.

## Release boundary

This remains an unsigned local engineering preview. No cloud, telemetry, updater, new renderer filesystem capability, live League integration, separate audio tracks, live audio meters, HDR, or hardware qualification is added. Clean offline Windows 11, actual game/system/microphone capture, hardware encoders, sustained sessions, complete fault/upgrade/restore and supply-chain/signing gates remain open. Historical installers do not contain this UI increment.
