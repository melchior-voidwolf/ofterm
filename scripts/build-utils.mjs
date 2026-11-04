import { execFileSync } from 'node:child_process'
import { mkdirSync, copyFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Cross-compile the Rust helper binary for every platform the utilities can
// run on. Linux targets are static musl builds (no glibc version issues on any
// NAS or SSH host); macOS targets are built only when the host is macOS.
//
// The installer picks the matching file and runs --selftest on it; anything
// unmatched (or that fails to execute) falls back to the shell scripts.

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const crate = join(root, 'utilities')
const outDir = join(root, 'build/utils')

const targets = [
  { rust: 'x86_64-unknown-linux-musl', name: 'linux-x86_64' },
  { rust: 'aarch64-unknown-linux-musl', name: 'linux-aarch64' },
  { rust: 'armv7-unknown-linux-musleabihf', name: 'linux-armv7' },
  { rust: 'x86_64-apple-darwin', name: 'darwin-x86_64', hostOnly: 'darwin' },
  { rust: 'aarch64-apple-darwin', name: 'darwin-arm64', hostOnly: 'darwin' },
]

const clang = process.env.CLANG || (process.platform === 'darwin' ? '/opt/homebrew/opt/llvm/bin/clang' : 'clang')

mkdirSync(outDir, { recursive: true })

for (const target of targets) {
  if (target.hostOnly && target.hostOnly !== process.platform) {
    console.log(`skip ${target.name} (needs a ${target.hostOnly} host to link)`)
    continue
  }
  const env = { ...process.env }
  if (target.rust.includes('linux')) {
    // Static musl linking works from either macOS or Linux via clang + lld.
    env[`CARGO_TARGET_${target.rust.toUpperCase().replaceAll('-', '_')}_LINKER`] = clang
    env.RUSTFLAGS = `-C link-arg=--target=${target.rust} -C link-arg=-fuse-ld=lld`
  }
  console.log(`cargo build --target ${target.rust}`)
  execFileSync('cargo', ['build', '--release', '--target', target.rust], {
    cwd: crate,
    stdio: 'inherit',
    env,
  })
  const built = join(crate, 'target', target.rust, 'release', 'ofterm-utils')
  const dest = join(outDir, `ofterm-utils-${target.name}`)
  copyFileSync(built, dest)
  console.log(`${dest} (${statSync(dest).size} bytes)`)
}
