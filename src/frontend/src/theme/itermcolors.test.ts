import { describe, expect, it } from 'vitest'
import { buildITermColors, parseITermColors } from './itermcolors'

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
${Array.from({ length: 16 }, (_, i) => `<key>Ansi ${i} Color</key><dict><key>Red Component</key><real>0.1</real><key>Green Component</key><real>0.2</real><key>Blue Component</key><real>0.3</real><key>Alpha Component</key><real>1</real></dict>`).join('')}
<key>Background Color</key><dict><key>Red Component</key><real>0</real><key>Green Component</key><real>0</real><key>Blue Component</key><real>0</real></dict>
<key>Foreground Color</key><dict><key>Red Component</key><real>1</real><key>Green Component</key><real>1</real><key>Blue Component</key><real>1</real></dict>
<key>Cursor Color</key><dict><key>Red Component</key><real>1</real><key>Green Component</key><real>1</real><key>Blue Component</key><real>1</real></dict>
<key>Selection Color</key><dict><key>Red Component</key><real>0.2</real><key>Green Component</key><real>0.3</real><key>Blue Component</key><real>0.4</real></dict>
</dict></plist>`

describe('itermcolors', () => {
  it('parses a valid file', () => {
    const theme = parseITermColors(sample, 'My Theme.itermcolors')
    expect(theme.name).toBe('My Theme')
    expect(theme.colors.ansi).toHaveLength(16)
    expect(theme.colors.background).toBe('#000000')
    expect(theme.colors.foreground).toBe('#ffffff')
  })

  it('rejects a file without ANSI colors', () => {
    expect(() => parseITermColors('<plist><dict></dict></plist>', 'bad.itermcolors')).toThrow()
  })

  it('round-trips into valid plist XML', () => {
    const theme = parseITermColors(sample, 'My Theme.itermcolors')
    const xml = buildITermColors(theme.colors)
    expect(xml).toContain('<key>Ansi 0 Color</key>')
    expect(xml).toContain('<key>Background Color</key>')
    const reparsed = parseITermColors(xml, 'roundtrip.itermcolors')
    expect(reparsed.colors.foreground).toBe('#ffffff')
  })
})
