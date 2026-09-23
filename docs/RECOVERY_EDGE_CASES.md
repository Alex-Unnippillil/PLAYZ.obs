# Conservative recovery boundaries

Relink is deliberately stricter than Import. Move the **complete original UUID-named recording directory**, including its `manifest.json`. Select `master.mkv` or `master.mp4` inside it. PLAYZ checks that the directory name, manifest recording ID and master filename match the selected catalog entry. Unrelated media must use Import; it must not turn an arbitrary user folder into a managed recording directory.

If an export's final destination already exists after an interrupted job, PLAYZ preserves that file and fails closed rather than deciding it belongs to the job merely because its codecs and duration look compatible. Review the file in the managed exports directory, or queue a new uniquely named export. Receipt-backed automatic adoption of a completed output is not implemented. This is a conservative limitation, not a claim that all interrupted exports resume seamlessly.

A controller crash may leave an interrupted MKV. A successful recovery does not establish that every final buffered frame survived. Never remove the original during recovery. A malformed/missing manifest, renamed UUID directory, externally replaced output or reparse point can require manual investigation; do not force the application to overwrite a file to bypass the warning.

The real capture fixture is invoked with `./scripts/test-capture.ps1` after native bootstrap. `-Audio` additionally plays the deterministic WAV through the system output and enables system capture, but audio **signal verification remains a separate acceptance check**. The default fixture run does not enable audio. A passing hosted Windows fixture would not establish real-game hooking, Vanguard compatibility, a clean Windows 11 offline installation, or hardware-family qualification.
