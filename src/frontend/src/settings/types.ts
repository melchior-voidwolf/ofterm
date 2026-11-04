import type { CustomTheme } from '../theme'

export interface Settings {
  uiTheme: 'system' | 'light' | 'dark'
  language: 'auto' | 'zh-CN' | 'en-US'
  themeId: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontWeightBold: number
  lineHeight: number
  letterSpacing: number
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  graceSeconds: number
  tabStyle: string
  customThemes: CustomTheme[]
}

export const DEFAULT_FONT_FAMILY =
  'Monaco, Menlo, "SF Mono", "DejaVu Sans Mono", "JetBrains Mono", monospace'

export const defaultSettings: Settings = {
  uiTheme: 'system',
  language: 'auto',
  themeId: 'material-design-colors',
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 12,
  fontWeight: 400,
  fontWeightBold: 700,
  lineHeight: 1,
  letterSpacing: 0,
  cursorStyle: 'block',
  cursorBlink: false,
  scrollback: 1000,
  graceSeconds: 15,
  tabStyle: 'iterm2',
  customThemes: [],
}
