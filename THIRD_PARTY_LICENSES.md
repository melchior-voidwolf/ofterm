# Third-Party Licenses

OFTerm is licensed under the GNU General Public License v2.0 (see `LICENSE`).

This file must be regenerated from the Go module graph, the npm lockfile, and
the bundled theme/font assets before each release. The authoritative full
license texts live in `licenses/`; the CI license gate is not implemented yet.

## Runtime dependencies (initial list)

| Component | Version | License | Use |
|---|---|---|---|
| Go standard library | toolchain | BSD-3-Clause | HTTP, TLS, crypto, process control |
| github.com/coder/websocket | pinned in go.mod | ISC | WebSocket transport |
| github.com/creack/pty | pinned in go.mod | MIT | Local PTY |
| go.etcd.io/bbolt | pinned in go.mod | MIT | Embedded key/value store |
| React | pinned in package-lock.json | MIT | UI |
| React DOM | pinned in package-lock.json | MIT | UI |
| Zustand | pinned in package-lock.json | MIT | UI state |
| Vite | pinned in package-lock.json | MIT | Build tooling (not shipped) |
| @xterm/xterm and addons | pinned in package-lock.json | MIT | Terminal emulator |
| JetBrains Mono | @fontsource/jetbrains-mono | OFL-1.1 | Bundled monospace fallback |
| iTerm2 imgcat | derived | GPL-2.0 | Inline image helper (contrib/imgcat), modified to downscale before transfer |
| image (Rust) | pinned in utilities/Cargo.lock | MIT OR Apache-2.0 | Decoding and downscaling in the native utilities binary |
| avif-decode (Rust) | pinned in utilities/Cargo.lock | BSD-3-Clause | AVIF decoding in the native utilities binary (x86_64/aarch64) |
| avif-parse (Rust) | pinned in utilities/Cargo.lock | MPL-2.0 | AVIF container parsing for dimensions |
| rav1d (Rust) | pinned in utilities/Cargo.lock | BSD-2-Clause | Pure-Rust AV1 decoder used by avif-decode (transitive) |
| kamadak-exif (Rust) | pinned in utilities/Cargo.lock | BSD-2-Clause | EXIF orientation for phone photos |
| libc (Rust) | pinned in utilities/Cargo.lock | MIT OR Apache-2.0 | Terminal window-size ioctl |

## Theme and color data

| Asset | License | Notes |
|---|---|---|
| Material Design Colors | MIT | `MartinSeeler/iterm2-material-design` |
| iTerm2 built-in preset color values | Data transcription | Numeric values only; no iTerm2 source files are shipped |
| iTerm2-Color-Schemes | MIT | Optional additional schemes, if adopted |

## Policy

- The project itself is GPL-2.0-only; third-party runtime dependencies must be GPLv2-compatible (MIT/BSD/ISC/OFL).
- `contrib/imgcat` is derived from iTerm2's imgcat (GPLv2), modified to downscale before transfer; `contrib/imgls` is an independent OFTerm implementation with an iTerm2-compatible command line.
- The native `ofterm-utils` binary (Rust) is part of OFTerm and is licensed GPL-2.0-only like the rest of the project. Its dependencies are MIT/BSD-2-Clause/Apache-2.0 dual-licensed and therefore GPLv2-compatible.
- No FntermX code, binaries, icons, screenshots, or other assets are reused.
- Dependency licenses are restricted to the allowlist: GPL-2.0-only, MIT,
  BSD-2-Clause, BSD-3-Clause, ISC, OFL-1.1. The automated CI license gate is
  planned but not implemented yet; until then, additions are reviewed manually.
- Apache-2.0 runtime dependencies are not GPLv2-compatible and must not be added.
