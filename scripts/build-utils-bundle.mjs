import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build the utilities archive that the app installs into the user's shell.
//
// Contents: the shell helpers plus the native binary for every supported
// platform. The installer picks the matching binary, runs `--selftest`, and
// falls back to the shell scripts when it cannot execute. Everything ships in
// every package because the install runs in whatever shell the user has open —
// often an SSH session on a different machine (Raspberry Pi, x86 server, Mac).
//
// Usage: node scripts/build-utils-bundle.mjs [arch ...]
//   arch ∈ x86, arm (fnOS names), or a full suffix such as linux-x86_64,
//   linux-aarch64, linux-armv7, linux-armv6, darwin-x86_64, darwin-arm64.
//   Default: everything available under build/utils.
//
// Binaries are produced by scripts/build-utils.mjs; run that first.

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const scripts = ['imgcat', 'imgls', 'ofn-copy', 'ofn-notify', 'ofn-dl', 'ofn-title', 'ofn-check']

const aliases = {
  x86: 'linux-x86_64',
  amd64: 'linux-x86_64',
  x86_64: 'linux-x86_64',
  arm: 'linux-aarch64',
  arm64: 'linux-aarch64',
  aarch64: 'linux-aarch64',
  armv7: 'linux-armv7',
  all: null,
}

const defaults = ['linux-x86_64', 'linux-aarch64', 'linux-armv7', 'darwin-x86_64', 'darwin-arm64']

const requested = process.argv.slice(2)
const wanted = requested.flatMap((arg) => {
  if (arg === 'all') return defaults
  const resolved = aliases[arg] ?? (arg.startsWith('linux-') || arg.startsWith('darwin-') ? arg : null)
  if (!resolved) {
    console.error(`unknown architecture: ${arg}`)
    process.exit(1)
  }
  return [resolved]
})
const binaries = (wanted.length ? [...new Set(wanted)] : defaults).map((name) => `ofterm-utils-${name}`)

const binDir = join(root, 'build/utils')
const staging = mkdtempSync(join(root, 'build/utils-bundle-'))
const scratch = mkdtempSync(join(root, 'build/utils-archive-'))
const tgz = join(scratch, 'utilities.tgz')
try {
  const missing = binaries.filter((name) => !existsSync(join(binDir, name)))
  if (missing.length && process.env.UTILS_ALLOW_MISSING !== '1') {
    for (const name of missing) console.error(`missing ${join(binDir, name)}; run: node scripts/build-utils.mjs`)
    process.exit(1)
  }
  const present = binaries.filter((name) => !missing.includes(name))
  for (const name of missing) {
    console.warn(`warning: ${name} unavailable, package will fall back to shell scripts for that platform`)
  }
  for (const name of scripts) copyFileSync(join(root, 'contrib', name), join(staging, name))
  for (const name of present) copyFileSync(join(binDir, name), join(staging, name))
  execFileSync(
    'tar',
    [...(process.platform === 'darwin' ? ['--no-xattrs'] : []), '--format=ustar', '-czf', tgz, '-C', staging, '.'],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } },
  )
  const archive = readFileSync(tgz)
  const base64 = archive.toString('base64')
  // Served as a static asset (public/ is copied into the web root by Vite), so
  // the main JavaScript bundle stays small and the archive is fetched only
  // when the user installs the utilities.
  const out = join(root, 'src/frontend/public/utilities.b64')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, base64)
  console.log(
    `bundle [${binaries.join(', ')}]: ${archive.length} bytes gz, ${base64.length} base64 chars -> ${out}`,
  )
} finally {
  rmSync(staging, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
}
