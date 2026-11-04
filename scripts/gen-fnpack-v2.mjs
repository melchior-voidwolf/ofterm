#!/usr/bin/env node
// Regenerate the FnDepot V2 source index (fnpack.json) from built fpk artifacts.
//
// Required env:
//   VERSION        e.g. 1.0.0 (no leading "v")
// Optional env:
//   CHANGELOG      release changelog text (defaults to the release-notes URL)
//   UPDATED_AT     ISO 8601 timestamp (defaults to now)
//   BUILD_OUT      artifact directory (default: build/out)
//   SHA_X86/SHA_ARM, SIZE_X86/SIZE_ARM
//                  override computed sha256/size, for indexing artifacts that
//                  were built elsewhere (e.g. published by CI)
//
// Architecture targets come from build/architectures.json (single source of
// truth). Releases already present in a V2 index are preserved.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const version = process.env.VERSION
if (!version) {
  console.error('error: VERSION env is required (e.g. VERSION=1.0.0)')
  process.exit(1)
}

const matrix = JSON.parse(readFileSync(path.join(root, 'build/architectures.json'), 'utf8'))
const targets = matrix.targets
if (!Array.isArray(targets) || targets.length === 0) {
  console.error('error: build/architectures.json has no targets')
  process.exit(1)
}
const outDir = process.env.BUILD_OUT || path.join(root, 'build/out')

function artifact(fnosArch) {
  const key = fnosArch.toUpperCase()
  const envSha = process.env[`SHA_${key}`]
  const envSize = process.env[`SIZE_${key}`]
  if (envSha && envSize) return { sha256: envSha, size: Number(envSize) }
  const file = path.join(outDir, `ofterm_${version}_${fnosArch}.fpk`)
  if (!existsSync(file)) {
    console.error(`error: missing ${file}; pass SHA_${key}/SIZE_${key} to index remote artifacts`)
    process.exit(1)
  }
  const buf = readFileSync(file)
  return { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length }
}

const repo = 'https://github.com/melchior-voidwolf/ofterm'
const raw = 'https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main'

const packages = {}
const platforms = []
for (const t of targets) {
  const meta = artifact(t.fnos)
  packages[t.fnos] = {
    download_url: `${repo}/releases/download/v${version}/ofterm_${version}_${t.fnos}.fpk`,
    sha256: meta.sha256,
    size: meta.size,
  }
  platforms.push(t.fnos)
}

// Preserve previously indexed versions when the existing index is already V2.
const indexPath = path.join(root, 'fnpack.json')
let releases = {}
if (existsSync(indexPath)) {
  try {
    const prev = JSON.parse(readFileSync(indexPath, 'utf8'))
    if (prev.schema_version === '2' && prev.apps?.ofterm?.releases) {
      releases = prev.apps.ofterm.releases
    }
  } catch {
    // Unreadable or legacy V1 index: start fresh.
  }
}

releases[version] = {
  changelog: process.env.CHANGELOG || `参见 Release notes:${repo}/releases/tag/v${version}`,
  updated_at: process.env.UPDATED_AT || new Date().toISOString(),
  os_min_version: '',
  os_max_version: '',
  packages,
}
// Newest version first.
releases = Object.fromEntries(
  Object.entries(releases).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
)

const index = {
  schema_version: '2',
  source_info: {
    name: 'OFTerm 应用源',
    author: 'OFTerm Contributors',
    homepage: repo,
    description: 'OFTerm 官方应用源:面向飞牛 fnOS 的开源 iTerm2 风格终端。',
  },
  apps: {
    ofterm: {
      display_name: 'OFTerm 终端',
      desc: '面向飞牛 fnOS 的开源终端应用,iTerm2 风格界面与设置,提供本地 Shell。',
      platform: platforms,
      categories: ['系统工具', '编程开发'],
      icon_url: `${raw}/ofterm/ICON_256.PNG`,
      preview_urls: [1, 2, 3, 4].map((n) => `${raw}/ofterm/Preview/${n}.png`),
      readme_url: `${raw}/ofterm/README.md`,
      bug_report_url: `${repo}/issues`,
      maintainer: 'OFTerm Contributors',
      maintainer_url: repo,
      distributor: 'OFTerm Contributors',
      distributor_url: repo,
      run_as: 'root',
      install_type: 'root',
      is_docker: false,
      service_port: '',
      releases,
    },
  },
}

writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
console.log(`fnpack.json: indexed v${version} (${platforms.join(', ')})`)
