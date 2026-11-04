// Minimal gettext-style i18n. Keys are the Chinese source strings, so the
// zh-CN UI needs no dictionary; en-US falls back to the key when a
// translation is missing. Long-form content (the Help page) branches on
// locale in the component instead. The locale is module-level: Workspace
// sets it during render, and every component re-renders on settings change.

export type Locale = 'zh-CN' | 'en-US'

let current: Locale = 'zh-CN'

export function setLocale(locale: Locale) {
  current = locale
}

export function getLocale(): Locale {
  return current
}

export function resolveLocale(setting: string): Locale {
  if (setting === 'zh-CN' || setting === 'en-US') return setting
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function t(zh: string): string {
  if (current === 'zh-CN') return zh
  return enUS[zh] ?? zh
}

const enUS: Record<string, string> = {
  // App shell
  终端标签: 'Terminal tabs',
  新建标签: 'New Tab',
  '新建标签 (⌘⇧Enter)': 'New Tab (⌘⇧Enter)',
  关闭标签: 'Close Tab',
  搜索: 'Search',
  '搜索 (⌘⇧F)': 'Search (⌘⇧F)',
  设置: 'Settings',
  切换语言: 'Switch language',
  上一个: 'Previous',
  关闭: 'Close',
  保存: 'Save',
  取消: 'Cancel',
  应用: 'Apply',
  没有打开的标签: 'No open tabs',
  请先打开一个终端: 'Open a terminal first',
  辅助工具安装已启动: 'Utility installation started',
  // Session status
  连接中: 'Connecting',
  已连接: 'Connected',
  重连中: 'Reconnecting',
  已结束: 'Ended',
  错误: 'Error',
  // Split controls
  分屏: 'Split pane',
  '向右分屏 (⌘\\)': 'Split Right (⌘\\)',
  '向下分屏 (⌘⌥\\)': 'Split Down (⌘⌥\\)',
  '关闭 pane (⌘⇧X)': 'Close Pane (⌘⇧X)',
  // Settings
  外观: 'Appearance',
  文本: 'Text',
  配色: 'Colors',
  帮助: 'Help',
  关于: 'About',
  界面主题: 'Interface theme',
  跟随系统: 'System',
  亮色: 'Light',
  暗色: 'Dark',
  语言: 'Language',
  跟随浏览器: 'Browser',
  标签栏: 'Tab bar',
  紧凑: 'Compact',
  宽松: 'Relaxed',
  字体: 'Font',
  字号: 'Font size',
  字重: 'Font weight',
  行高: 'Line height',
  字距: 'Letter spacing',
  光标: 'Cursor',
  方块: 'Block',
  竖线: 'Bar',
  下划线: 'Underline',
  光标闪烁: 'Cursor blink',
  回滚行数: 'Scrollback lines',
  重连窗口: 'Reconnect window (s)',
  恢复默认字体栈: 'Restore default font stack',
  '导入 .itermcolors': 'Import .itermcolors',
  导出当前配色: 'Export current colors',
  // In-terminal messages
  '会话已结束：': 'Session ended: ',
  '重连超时，会话已结束': 'Reconnect timed out; session ended',
  连接已断开: 'Connection lost',
  终端尚未连接: 'Terminal is not connected',
  已复制到剪贴板: 'Copied to clipboard',
}
