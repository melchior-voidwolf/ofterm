import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, chmodSync, renameSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const args = process.argv.slice(2)
const version = process.env.VERSION || '0.1.0'
const fnpack = process.env.FNPACK || 'fnpack'
const selected = args.includes('--all') ? null : args.find((a) => !a.startsWith('--'))
const architectures = JSON.parse(readFileSync(join(root, 'build/architectures.json'), 'utf8'))
const targets = selected
  ? architectures.targets.filter((t) => t.goarch === selected || t.fnos === selected || t.fnpack_arch === selected)
  : architectures.targets

if (!targets.length) {
  console.error(`no target matched ${selected}`)
  process.exit(1)
}

const manifestValues = {
  VERSION: version,
  MAINTAINER: 'OFTerm Contributors',
  MAINTAINER_URL: 'https://github.com/melchior-voidwolf/ofterm',
  DISTRIBUTOR: 'OFTerm Contributors',
  DISTRIBUTOR_URL: 'https://github.com/melchior-voidwolf/ofterm',
  HELP_URL: 'https://github.com/melchior-voidwolf/ofterm',
  OS_MIN_VERSION: process.env.OS_MIN_VERSION || '1.2.0',
  CHANGELOG: process.env.CHANGELOG || '首个测试版本',
}

async function main() {
  const out = join(root, 'build/out')
  mkdirSync(out, { recursive: true })

  for (const target of targets) {
    const stage = join(root, 'build/staging', `ofterm-${target.fnos}`)
    rmSync(stage, { recursive: true, force: true })
    cpSync(join(root, 'packaging/ofterm'), stage, { recursive: true })

    let manifest = readFileSync(join(stage, 'manifest.in'), 'utf8')
    const values = { ...manifestValues, PLATFORM: target.fnos }
    for (const [k, v] of Object.entries(values)) manifest = manifest.replaceAll(`@${k}@`, v)
    if (manifest.includes('@')) throw new Error(`unresolved manifest placeholder in ${stage}`)
    rmSync(join(stage, 'manifest.in'))
    writeFileSync(join(stage, 'manifest'), manifest)

    const bin = join(stage, 'app/ofterm')
    mkdirSync(dirname(bin), { recursive: true })
    // Packages embed only the shell helpers; the install command downloads
    // the matching native binary from GitHub Releases on demand, so the fpk
    // stays small and nothing multi-MB is typed into the terminal.
    console.log('utilities bundle (shell scripts)')
    execFileSync('node', [join(root, 'scripts/build-utils-bundle.mjs')], { stdio: 'inherit' })
    execFileSync('npm', ['run', 'build'], { cwd: join(root, 'src/frontend'), stdio: 'inherit' })
    console.log(`build ${target.goarch} -> ${bin}`)
    execFileSync('go', ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${version}`, '-o', bin, './cmd/ofterm'], {
      cwd: join(root, 'src/backend'),
      stdio: 'inherit',
      env: { ...process.env, GOOS: 'linux', GOARCH: target.goarch, CGO_ENABLED: '0' },
    })
    chmodSync(bin, 0o755)
    for (const dir of ['cmd']) {
      for (const f of readdirSync(join(stage, dir))) chmodSync(join(stage, dir, f), 0o755)
    }

    console.log(`fnpack ${target.fnos}`)
    execFileSync(fnpack, ['build', '-d', '.'], { cwd: stage, stdio: 'inherit' })
    const produced = readdirSync(stage).find((f) => f.endsWith('.fpk'))
    if (!produced) throw new Error('fnpack did not produce an .fpk')
    const dest = join(out, `ofterm_${version.replace(/[^0-9A-Za-z._-]/g, '-')}_${target.fnos}.fpk`)
    renameSync(join(stage, produced), dest)
    console.log(`artifact ${dest} (${statSync(dest).size} bytes)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
