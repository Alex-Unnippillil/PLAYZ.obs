# Dependency and provenance register

Version pins are the source of truth, not moving latest tags. Review security notices before release and after dependency changes. Never upgrade only one side of the OBS header/runtime pair. A dependency inventory is not a legal opinion or a complete corresponding-source audit.

| Component | Purpose / pin | Upstream / license family | Ships to users |
|---|---|---|---|
| OBS Studio/libobs | Capture, mixing, encoding and MKV output; **32.2.2**, exact runtime/source SHA-256 in `native-lock.json` | https://github.com/obsproject/obs-studio ; GPL-2.0-or-later, with dependent components retaining their notices | Selected runtime DLLs, plugins, helpers and data |
| nlohmann/json | C++ protocol parsing; **3.12.0**, commit `55f93686c01528224f448c19128836e7df245f72` | https://github.com/nlohmann/json ; MIT | Compiled into original recorder host |
| FFmpeg/ffprobe | Local probing, remux and export; **9.0.2** Gyan essential build, exact archive hash in native lock | https://github.com/GyanD/codexffmpeg ; build-dependent GPL obligations, actual `-L` and `-buildconf` collected | Both executables and supplied notices |
| Rust/Tauri | Native host; Rust **1.98.1**, Tauri **2.11.6**, CLI **2.11.5** | https://github.com/tauri-apps/tauri ; MIT/Apache-2.0 ecosystem, see exact crate metadata | Compiled host; CLI/toolchain build-only |
| rusqlite / migrations | Durable local catalog; **0.40.2** / **2.6.0** | https://github.com/rusqlite/rusqlite ; MIT; https://github.com/cljoly/rusqlite_migration ; Apache-2.0 | Compiled with bundled SQLite |
| SQLite | Actual runtime queried at startup, refused below **3.51.3** | https://sqlite.org ; public domain; exact bundled source is selected by `Cargo.lock` | Compiled native runtime |
| Tokio / serde / ts-rs | Async process supervision, serialization, generated DTOs; pins in `Cargo.toml`/`Cargo.lock` | https://github.com/tokio-rs/tokio ; https://github.com/serde-rs/serde ; https://github.com/Aleph-Alpha/ts-rs ; respective upstream notices apply | Compiled code; DTO generator build-only |
| React / React DOM | Interface; **19.3.0** | https://github.com/facebook/react ; MIT | Bundled static assets |
| Vite / TypeScript / pnpm | Build; **8.3.0** / **7.0.2** / **12.6.0** | https://github.com/vitejs/vite ; https://github.com/microsoft/TypeScript ; https://github.com/pnpm/pnpm ; MIT/Apache-2.0 as applicable | No end-user Node server/toolchain |
| TanStack Query / Virtual | Local queries and library virtualization; **5.103.2** / **3.14.13** | https://github.com/TanStack/query ; https://github.com/TanStack/virtual ; MIT | Bundled interface |
| Tailwind / Radix Dialog / Lucide | Styles, accessible dialog primitive, icons; **4.3.3** / **1.1.23** / **1.47.0** | https://github.com/tailwindlabs/tailwindcss ; https://github.com/radix-ui/primitives ; https://github.com/lucide-icons/lucide ; MIT / ISC-family icon notices | Bundled interface; CSS tooling build-only |
| RHF / Zod | Form/runtime validation; **7.88.0** / **4.6.5** | https://github.com/react-hook-form/react-hook-form ; https://github.com/colinhacks/zod ; MIT | Bundled interface |
| Windows / WebView2 / MSVC runtime / GPU drivers | Platform, browser playback and native binary prerequisites | Microsoft/vendor terms; **not open-source components** | Permitted runtime components; Windows/drivers supplied by the system |

`Cargo.lock` and `pnpm-lock.yaml` enumerate transitive versions. `runtime/provenance.json` records native file hashes and sizes. `runtime/notices` contains OBS and JSON license text and actual FFmpeg configuration/license output. Native plugins are explicitly allowlisted; browser/websocket/virtual-camera plugins are not enabled by this host.

## Update policy

Dependency upgrades are separate reviewed changes: inspect advisories, update exact pins and lockfiles deliberately, regenerate DTOs if necessary, rebuild the native runtime, and rerun media, desktop, offline-install and hardware checks relevant to the change. Hash/signature/source checks must be repeated after a final fix.

## Remaining distribution work

The register does not replace a machine-generated and reviewed SPDX/CycloneDX SBOM covering Rust, npm and native dependencies. The exact FFmpeg build's full corresponding-source dependency set, the WebView2 offline redistributable provenance, MSVC redistribution materials and complete notice aggregation require final review before public release. Do not infer license compliance from process separation, a scanner pass, or the existence of this table.
