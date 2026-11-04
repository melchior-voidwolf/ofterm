import presets from './presets.json'

export type AnsiColors = [
  string, string, string, string,
  string, string, string, string,
  string, string, string, string,
  string, string, string, string,
]

export interface ThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
  bold: string
  link?: string
  ansi: AnsiColors
}

export interface Theme {
  id: string
  name: string
  source: string
  license: string
  colors?: ThemeColors
  variants?: { light?: ThemeColors; dark?: ThemeColors }
  defaultVariant?: 'light' | 'dark'
}

export interface CustomTheme {
  id: string
  name: string
  colors: ThemeColors
}

export interface PresetData {
  version: number
  defaultTheme: string
  menu: {
    radio: string[]
    separatorAfterRadio: boolean
    list: string[]
    custom: string[]
  }
  themes: Theme[]
}

export const presetData = presets as PresetData

export const themes = new Map(presetData.themes.map((t) => [t.id, t]))

export function findTheme(id: string, custom: CustomTheme[] = []): Theme | undefined {
  const builtin = themes.get(id)
  if (builtin) return builtin
  const imported = custom.find((t) => t.id === id)
  return imported ? { ...imported, source: 'Imported .itermcolors', license: 'User provided' } : undefined
}

export function allThemes(custom: CustomTheme[] = []): Theme[] {
  return [
    ...presetData.themes,
    ...custom.map((t) => ({ ...t, source: 'Imported .itermcolors', license: 'User provided' })),
  ]
}

export function themeColors(id: string, mode: 'light' | 'dark', custom: CustomTheme[] = []): ThemeColors {
  const theme = findTheme(id, custom) ?? themes.get(presetData.defaultTheme)!
  if (theme.colors) return theme.colors
  return theme.variants?.[mode] ?? theme.variants?.dark ?? theme.variants?.light ?? themes.get(presetData.defaultTheme)!.colors!
}

const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const

export function xtermTheme(id: string, mode: 'light' | 'dark', custom: CustomTheme[] = []) {
  const c = themeColors(id, mode, custom)
  const out: Record<string, string> = {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor,
    cursorAccent: c.cursorAccent,
    selectionBackground: c.selectionBackground,
    selectionForeground: c.selectionForeground,
    selectionInactiveBackground: c.selectionBackground,
  }
  ANSI_KEYS.forEach((key, i) => {
    out[key] = c.ansi[i]
  })
  return out
}


function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(color.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function blendHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return b
  const mix = (x: number, y: number) => Math.round(x * t + y * (1 - t))
  const r = mix(ca[0], cb[0])
  const g = mix(ca[1], cb[1])
  const bl = mix(ca[2], cb[2])
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}
