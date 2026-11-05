import { describe, expect, it } from 'vitest'
import { batchScript, buildInstallLines, INSTALL_BATCH_LIMIT, UTILS_RELEASE_BASE } from './install-command'

const bundle = 'QUJD'.repeat(2500) // ~10 KB of fake base64

describe('install command', () => {
  it('writes the bundle in printf chunks and decodes it', () => {
    const script = buildInstallLines(bundle).join('\n')
    expect(script).toContain('mkdir -p "$d"')
    expect(script).toContain('base64 -d')
    expect(script).toContain('tar -xzf')
    // Every chunk of the bundle is present, in order.
    const printed = [...script.matchAll(/printf '%s' '([^']*)'/g)].map((m) => m[1])
    expect(printed.join('')).toBe(bundle)
  })

  it('maps every supported uname pair to a release binary', () => {
    const script = buildInstallLines(bundle).join('\n')
    for (const name of [
      'ofterm-utils-linux-x86_64',
      'ofterm-utils-linux-aarch64',
      'ofterm-utils-linux-armv7',
      'ofterm-utils-darwin-x86_64',
      'ofterm-utils-darwin-arm64',
    ]) {
      expect(script).toContain(name)
    }
    expect(script).toContain('--selftest')
    expect(script).toContain('shell scripts')
  })

  it('downloads the native binary from GitHub Releases with curl or wget', () => {
    const script = buildInstallLines(bundle).join('\n')
    expect(script).toContain(UTILS_RELEASE_BASE)
    expect(script).toContain('curl -fsSL')
    expect(script).toContain('wget -q')
    // Download artifacts must not be executed before passing the selftest.
    const download = script.indexOf('curl -fsSL')
    const selftest = script.indexOf('--selftest')
    const symlink = script.indexOf('ln -sf ofterm-utils')
    expect(download).toBeGreaterThan(-1)
    expect(selftest).toBeGreaterThan(download)
    expect(symlink).toBeGreaterThan(selftest)
    // Older bundle-based installs left per-arch binaries behind; clean them.
    expect(script).toContain('rm -f "$d"/ofterm-utils-linux-*')
  })

  it('keeps every batch under the frame limit and on line boundaries', () => {
    const bigBundle = 'QUJD'.repeat(25_000) // ~100 KB, forces several batches
    const lines = buildInstallLines(bigBundle)
    const batches = batchScript(lines, 50_000)
    expect(batches.length).toBeGreaterThan(1)
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(50_000)
      for (const line of batch.split('\n')) expect(lines).toContain(line)
    }
    expect(batches.join('\n')).toBe(lines.join('\n'))
  })

  it('uses a limit well below the 1 MiB inbound frame limit', () => {
    expect(INSTALL_BATCH_LIMIT).toBeLessThan(1024 * 1024)
  })
})
