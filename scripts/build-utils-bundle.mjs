import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build the utilities archive that the app installs into the user's shell.
//
// Contents: the shell helpers plus the native binary for the architecture
// being packaged. The installer picks the matching binary, runs `--selftest`,
// and falls back to the shell scripts when it cannot execute (other OS, exotic
// CPU, a remote SSH host, ...).
//
// Usage: node scripts/build-utils-bundle.mjs [arch ...]
//   arch ∈ x86, arm (fnOS names), or the full binary suffix such as
//   linux-x86_64 / linux-aarch64 / linux-armv7. Default: all Linux arches.
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

const requested = process.argv.slice(2)
const wanted = requested.flatMap((arg) => {
  if (arg === 'all') return ['linux-x86_64', 'linux-aarch64', 'linux-armv7']
  const resolved = aliases[arg] ?? (arg.startsWith('linux-') || arg.startsWith('darwin-') ? arg : null)
  if (!resolved) {
    console.error(`unknown architecture: ${arg}`)
    process.exit(1)
  }
  return [resolved]
})
const binaries = wanted.length
  ? [...new Set(wanted)].map((name) => `ofterm-utils-${name}`)
  : ['ofterm-utils-linux-x86_64', 'ofterm-utils-linux-aarch64', 'ofterm-utils-linux-armv7']

const binDir = join(root, 'build/utils')
const staging = mkdtempSync(join(root, 'build/utils-bundle-'))
const scratch = mkdtempSync(join(root, 'build/utils-archive-'))
const tgz = join(scratch, 'utilities.tgz')
try {
  for (const name of binaries) {
    const path = join(binDir, name)
    if (!existsSync(path)) {
      console.error(`missing ${path}; run: node scripts/build-utils.mjs`)
      process.exit(1)
    }
  }
  for (const name of scripts) copyFileSync(join(root, 'contrib', name), join(staging, name))
  for (const name of binaries) copyFileSync(join(binDir, name), join(staging, name))
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
