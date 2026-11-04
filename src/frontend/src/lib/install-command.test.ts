import { describe, expect, it } from 'vitest'
import { batchScript, buildInstallLines, INSTALL_BATCH_LIMIT } from './install-command'

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

  it('maps every supported uname pair to a bundled binary', () => {
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
