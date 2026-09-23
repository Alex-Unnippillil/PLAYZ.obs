# ADR 0001 — Original host over upstream libobs

Status: accepted for the first local build; hardware acceptance remains open.

Inspected Ascent recorder revision: `6a090bb48c517e99d50b89b2de0c62424bff092e`. Its README builds a vendored OBS tree with VS2022/CMake, with browser and websocket disabled, then an Ascent Visual Studio solution. `main.cpp` starts a custom `Server`; `server.cpp` accepts JSON with numeric command IDs over a communication channel or standard handles, and terminates on disconnect in non-debug builds. It is not an OBS WebSocket server and not the full Ascent application. The repository-level wrapper license was not established by this inspection. No wrapper, branding, custom protocol or source from that wrapper is redistributed here. The complete fork inventory and a reproduced fork Windows build were not completed, and are not claimed.

Decision: use the official OBS Studio 32.2.2 portable runtime, exact-version public headers and an original GPL-2.0-or-later C++ host. Generate its import library from the exported symbols of the very DLL that ships. Record source/runtime archive hashes. This does not claim we rebuilt upstream OBS from source; it avoids an ABI mismatch while minimizing the first local build's toolchain burden. Corresponding source and native dependency notices remain distribution obligations.

The host loads an explicit plugin allowlist and uses inherited anonymous stdin/stdout handles, bounded JSON frames, correlation IDs and version negotiation. There is no listener, public fixed pipe, websocket or renderer shell. The host waits for the OBS start signal, encoded frames, file activity and nonzero source width. This proves output activity, not the absence of black frames or audible content.

Only specifically selected window/game capture is implemented initially. No full-monitor fallback exists. Hardware encoders are discovered but are explicitly unvalidated until the user's test recording and the hardware matrix pass. Software H.264 is the initial compatibility choice, with an explicit CPU-cost warning.

Reference documentation: https://docs.obsproject.com/frontends ; https://github.com/obsproject/obs-studio/tree/32.2.2 ; https://github.com/cliffside-git/ascent-obs/tree/6a090bb48c517e99d50b89b2de0c62424bff092e
