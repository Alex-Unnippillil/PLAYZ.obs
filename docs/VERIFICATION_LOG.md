# Engineering verification log

These results are tied to their exact commits. They are not a certification of a different binary, a clean Windows 11 installation, or a real game.

## First complete unsigned installer

Source `09f528e540f5b86df9db204517b86aa64be23529`, Actions run **35912714444**: frontend and Windows jobs both succeeded. The Windows job built the original libobs host, passed core/contracts tests, ran the real FFmpeg media fixture and produced the full NSIS installer.

Artifact **10774352034**: `windows-test-build-09f528e540f5b86df9db204517b86aa64be23529`, ZIP size 320,829,479 bytes, SHA-256 `2f4f444f38ab8c9b9af3b2e30547951b73ee775aa3a495bd35bd04cd8bf0b669`. The artifact ZIP hash is **not** the embedded installer's hash; use `package-evidence.json` for that. This artifact predates subsequent recovery hardening and is retained as engineering evidence, not the recommended latest installer.

Frontend: 30 Vitest tests in four files, strict TypeScript, production Vite build and dependency audit passed. Media processing: compatible MKV probing/remux; accurate trim checked by decoding frame IDs, output duration and non-silent PCM; cancellation and original SHA-256 preservation. These tests do not establish captured system audio or packaged browser playback.

## First real selected-window roundtrip

Source `f4f42448f2e597f4a8c45178337d38cb1e2222b6`, Actions run **35914615521**, job **107362826992**: passed. The test selected the explicitly titled WinForms fixture, recorded through the actual Rust controller and original libobs host, stopped/finalized, exported through the real queue, reopened the catalog and found the Ready recording and saved bookmark.

Recorded duration: **7,733 ms**; software encoder **obs_x264**; 1280 × 720 at 30 fps. Decoded captured frame was inspected and showed the fixture heading, elapsed counter, two colored panels and moving-marker area rather than a blank image. Actual bundled SQLite runtime: **3.53.2**.

Environment: Microsoft Windows Server 2022 hosted runner, Microsoft Hyper-V Video, driver **10.0.20348.1**, desktop 1024 × 768. This qualifies neither NVIDIA/AMD/Intel hardware encoders nor real-game/Vanguard compatibility.

Artifact **10775340122**, ZIP SHA-256 `fef684641ad82f8ab030ec40ce604882931b64515d281fac99fe555ca213dee8`, contains the MKV master, MP4 playback asset, exported clip, SQLite catalog, manifest, decoded PNG and evidence JSON. Audio was explicitly **disabled**; captured-audio signal remains unverified. The successful test predates the final hardening commit, so relevant checks must be rerun on final source.

## Remaining gates

Installed Tauri/WebView2 interaction, clean Windows 11 offline install, captured system/microphone audio, true game capture, hardware encoders, sustained sessions, fault matrix, final supply-chain/source materials and signing remain separately tracked in `RELEASE_CHECKLIST.md`. No production release or League automation is claimed.
