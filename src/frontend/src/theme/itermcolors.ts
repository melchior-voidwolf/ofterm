import * as plist from 'plist'
import type { CustomTheme, Theme, ThemeColors } from './index'

type PlistDict = Record<string, unknown>

function numberValue(dict: PlistDict, key: string, fallback = 0): number {
  const v = dict[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function colorFromDict(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const d = value as PlistDict
  if (!('Red Component' in d) && !('Green Component' in d) && !('Blue Component' in d)) return null
  const r = Math.round(Math.min(1, Math.max(0, numberValue(d, 'Red Component'))) * 255)
  const g = Math.round(Math.min(1, Math.max(0, numberValue(d, 'Green Component'))) * 255)
  const b = Math.round(Math.min(1, Math.max(0, numberValue(d, 'Blue Component'))) * 255)
  const a = Math.min(1, Math.max(0, numberValue(d, 'Alpha Component', 1)))
  return a >= 0.999 ? `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}` : `rgba(${r}, ${g}, ${b}, ${a})`
}

function requiredColor(root: PlistDict, key: string): string {
  const c = colorFromDict(root[key])
  if (!c) throw new Error(`缺少 ${key}`)
  return c
}

export function parseITermColors(text: string, fileName: string): CustomTheme {
  const parsed = plist.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('不是有效的 .itermcolors 文件')
  }
  const root = parsed as PlistDict
  const ansi: string[] = []
  for (let i = 0; i < 16; i++) ansi.push(requiredColor(root, `Ansi ${i} Color`))
  const colors: ThemeColors = {
    background: requiredColor(root, 'Background Color'),
    foreground: requiredColor(root, 'Foreground Color'),
    cursor: colorFromDict(root['Cursor Color']) ?? requiredColor(root, 'Foreground Color'),
    cursorAccent: colorFromDict(root['Cursor Text Color']) ?? requiredColor(root, 'Background Color'),
    selectionBackground: colorFromDict(root['Selection Color']) ?? '#264f78',
    selectionForeground: colorFromDict(root['Selected Text Color']) ?? requiredColor(root, 'Foreground Color'),
    bold: colorFromDict(root['Bold Color']) ?? requiredColor(root, 'Foreground Color'),
    ansi: ansi as ThemeColors['ansi'],
  }
  const link = colorFromDict(root['Link Color'])
  if (link) colors.link = link
  const name = fileName.replace(/\.itermcolors$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported Colors'
  return {
    id: `custom-${crypto.randomUUID()}`,
    name,
    colors,
  }
}

function parseCSSColor(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color.trim())
  if (hex) {
    const n = parseInt(hex[1], 16)
    const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
  }
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim())
  if (short) {
    const n = parseInt(short[1].split('').map((c) => c + c).join(''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgba) {
    const p = rgba[1].split(',').map((s) => Number(s.trim()))
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] ?? 1]
  }
  return [0, 0, 0, 1]
}

function colorDict(color: string): PlistDict {
  const [r, g, b, a] = parseCSSColor(color)
  return {
    'Red Component': r / 255,
    'Green Component': g / 255,
    'Blue Component': b / 255,
    'Alpha Component': a,
  }
}

export function buildITermColors(colors: ThemeColors): string {
  const root: PlistDict = {}
  colors.ansi.forEach((color, i) => {
    root[`Ansi ${i} Color`] = colorDict(color)
  })
  root['Background Color'] = colorDict(colors.background)
  root['Foreground Color'] = colorDict(colors.foreground)
  root['Cursor Color'] = colorDict(colors.cursor)
  root['Cursor Text Color'] = colorDict(colors.cursorAccent)
  root['Selection Color'] = colorDict(colors.selectionBackground)
  root['Selected Text Color'] = colorDict(colors.selectionForeground)
  root['Bold Color'] = colorDict(colors.bold)
  if (colors.link) root['Link Color'] = colorDict(colors.link)
  return plist.build(root as never)
}

export function themeColorsForExport(theme: Theme): ThemeColors | null {
  return theme.colors ?? theme.variants?.dark ?? theme.variants?.light ?? null
}

export function downloadITermColors(theme: Theme) {
  const colors = themeColorsForExport(theme)
  if (!colors) return
  const xml = buildITermColors(colors)
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${theme.name.replace(/[^a-z0-9._-]+/gi, '-')}.itermcolors`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
