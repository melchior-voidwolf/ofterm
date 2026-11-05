import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import { X } from 'lucide-react'
import { DEFAULT_FONT_FAMILY, type Settings } from '../settings/types'
import { allThemes } from '../theme'
import { downloadITermColors, parseITermColors, themeColorsForExport } from '../theme/itermcolors'
import { getLocale, t } from '../i18n'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onInstallUtilities: () => void
}

export function SettingsDialog({ open, onOpenChange, settings, onChange, onInstallUtilities }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [themeError, setThemeError] = useState('')
  // Edits apply to a local draft; nothing persists until 保存.
  const [draft, setDraft] = useState<Settings>(settings)
  useEffect(() => {
    if (open) {
      setDraft(settings)
      setThemeError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }))
  const save = () => {
    onChange(draft)
    onOpenChange(false)
  }
  const intValue = (raw: string, fallback: number) => {
    if (raw.trim() === '') return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? Math.round(n) : fallback
  }

  const importTheme = async (file: File | undefined) => {
    if (!file) return
    setThemeError('')
    try {
      const theme = parseITermColors(await file.text(), file.name)
      patch({ customThemes: [...draft.customThemes, theme], themeId: theme.id })
    } catch (err) {
      setThemeError(err instanceof Error ? err.message : String(err))
    }
  }

  const exportCurrent = () => {
    const theme = allThemes(draft.customThemes).find((t) => t.id === draft.themeId)
    if (theme && themeColorsForExport(theme)) downloadITermColors(theme)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="settings-dialog" aria-describedby={undefined}>
          <header className="settings-header">
            <Dialog.Title className="settings-title">{t('设置')}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label={t('关闭')}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </header>
          <Tabs.Root defaultValue="appearance" orientation="vertical" className="settings-tabs">
            <Tabs.List className="settings-sidebar">
              <Tabs.Trigger value="appearance">{t('外观')}</Tabs.Trigger>
              <Tabs.Trigger value="text">{t('文本')}</Tabs.Trigger>
              <Tabs.Trigger value="colors">{t('配色')}</Tabs.Trigger>
              <Tabs.Trigger value="help">{t('帮助')}</Tabs.Trigger>
              <Tabs.Trigger value="about">{t('关于')}</Tabs.Trigger>
            </Tabs.List>
            <div className="settings-content">
              <Tabs.Content value="appearance">
                <h3>{t('外观')}</h3>
                <Row label={t('界面主题')}>
                  <select value={draft.uiTheme} onChange={(e) => patch({ uiTheme: e.target.value as Settings['uiTheme'] })}>
                    <option value="system">{t('跟随系统')}</option>
                    <option value="light">{t('亮色')}</option>
                    <option value="dark">{t('暗色')}</option>
                  </select>
                </Row>
                <Row label={t('语言')}>
                  <select value={draft.language} onChange={(e) => patch({ language: e.target.value as Settings['language'] })}>
                    <option value="auto">{t('跟随浏览器')}</option>
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                  </select>
                </Row>
                <Row label={t('标签栏')}>
                  <select value={draft.tabStyle} onChange={(e) => patch({ tabStyle: e.target.value })}>
                    <option value="iterm2">{t('紧凑')}</option>
                    <option value="fnos">{t('宽松')}</option>
                  </select>
                </Row>
              </Tabs.Content>

              <Tabs.Content value="text">
                <h3>{t('文本')}</h3>
                <Row label={t('字体')}>
                  <input
                    className="text-input wide"
                    value={draft.fontFamily}
                    onChange={(e) => patch({ fontFamily: e.target.value })}
                    spellCheck={false}
                  />
                </Row>
                <Row label={t('字号')}>
                  <input type="number" min={8} max={48} value={draft.fontSize} onChange={(e) => patch({ fontSize: intValue(e.target.value, draft.fontSize) })} />
                </Row>
                <Row label={t('字重')}>
                  <select value={draft.fontWeight} onChange={(e) => patch({ fontWeight: Number(e.target.value) })}>
                    {[300, 400, 500, 600, 700].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label={t('行高')}>
                  <input type="number" min={0.8} max={3} step={0.1} value={draft.lineHeight} onChange={(e) => patch({ lineHeight: Number(e.target.value) || draft.lineHeight })} />
                </Row>
                <Row label={t('字距')}>
                  <input type="number" min={-5} max={10} value={draft.letterSpacing} onChange={(e) => patch({ letterSpacing: intValue(e.target.value, draft.letterSpacing) })} />
                </Row>
                <Row label={t('光标')}>
                  <select value={draft.cursorStyle} onChange={(e) => patch({ cursorStyle: e.target.value as Settings['cursorStyle'] })}>
                    <option value="block">{t('方块')}</option>
                    <option value="bar">{t('竖线')}</option>
                    <option value="underline">{t('下划线')}</option>
                  </select>
                </Row>
                <Row label={t('光标闪烁')}>
                  <Switch.Root className="switch" checked={draft.cursorBlink} onCheckedChange={(v) => patch({ cursorBlink: v })}>
                    <Switch.Thumb className="switch-thumb" />
                  </Switch.Root>
                </Row>
                <Row label={t('回滚行数')}>
                  <input type="number" min={100} max={1000000} step={1000} value={draft.scrollback} onChange={(e) => patch({ scrollback: intValue(e.target.value, draft.scrollback) })} />
                </Row>
                <Row label={t('重连窗口')}>
                  <input type="number" min={0} max={3600} value={draft.graceSeconds} onChange={(e) => patch({ graceSeconds: intValue(e.target.value, draft.graceSeconds) })} />
                </Row>
                <div className="settings-actions">
                  <button className="secondary-button" onClick={() => patch({ fontFamily: DEFAULT_FONT_FAMILY })}>
                    {t('恢复默认字体栈')}
                  </button>
                </div>
              </Tabs.Content>

              <Tabs.Content value="colors">
                <h3>{t('配色')}</h3>
                <div className="theme-grid">
                  {allThemes(draft.customThemes).map((theme) => {
                    const c = theme.colors ?? theme.variants?.dark ?? theme.variants?.light
                    return (
                      <button
                        key={theme.id}
                        className={`theme-card${draft.themeId === theme.id ? ' is-active' : ''}`}
                        onClick={() => patch({ themeId: theme.id })}
                      >
                        <span className="theme-swatch" style={{ background: c?.background }}>
                          <span style={{ color: c?.foreground }}>Aa</span>
                        </span>
                        <span className="theme-card-name">{theme.name}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="settings-actions">
                  <button className="secondary-button" onClick={() => fileRef.current?.click()}>
                    {t('导入 .itermcolors')}
                  </button>
                  <button className="secondary-button" onClick={exportCurrent}>
                    {t('导出当前配色')}
                  </button>
                  <input
                    ref={fileRef}
                    className="file-input"
                    type="file"
                    accept=".itermcolors,application/xml,text/xml"
                    onChange={(e) => {
                      void importTheme(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
                {themeError ? <div className="form-error">{themeError}</div> : null}
              </Tabs.Content>

              <Tabs.Content value="help">
                <h3>{t('帮助')}</h3>
                {getLocale() === 'en-US' ? <HelpEn onInstallUtilities={onInstallUtilities} /> : <HelpZh onInstallUtilities={onInstallUtilities} />}
              </Tabs.Content>

              <Tabs.Content value="about">
                <h3>OFTerm</h3>
                <Row label="License">GPL-2.0</Row>
                <Row label="Terminal">xterm.js</Row>
                <Row label="Source">github.com/melchior-voidwolf/ofterm</Row>
              </Tabs.Content>
            </div>
          </Tabs.Root>
          <footer className="settings-footer">
            <Dialog.Close asChild>
              <button className="secondary-button">{t('取消')}</button>
            </Dialog.Close>
            <button className="secondary-button" onClick={() => onChange(draft)}>
              {t('应用')}
            </button>
            <button className="primary-button" onClick={save}>
              {t('保存')}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function HelpZh({ onInstallUtilities }: { onInstallUtilities: () => void }) {
  return (
    <>
      <section className="help-section">
        <h4>快速开始</h4>
        <p>OFTerm 是运行在飞牛 fnOS 上的开源终端。访问权限由 fnOS 网关与部署方式决定，应用本身不设置密码。</p>
        <ul>
          <li>在 fnOS 桌面双击图标，即可在系统窗口内打开。</li>
          <li>打开后自动创建一个本地 Shell 标签，Shell 以当前 fnOS 登录用户身份运行。</li>
          <li>需要管理员权限时，在 Shell 内直接使用 <code>sudo</code>；应用不介入 sudo 或密码输入。</li>
        </ul>
      </section>

      <section className="help-section">
        <h4>标签与分屏</h4>
        <p>顶部标签栏对应独立终端会话，标签标题跟随当前运行的程序。每个 pane 右上角提供分屏与关闭按钮；拖动 pane 之间的分隔线可调整尺寸。</p>
        <table className="help-table">
          <thead><tr><th>操作</th><th>macOS</th><th>Windows / Linux</th></tr></thead>
          <tbody>
            <tr><td>新建标签</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Enter</kbd></td></tr>
            <tr><td>向右分屏</td><td><kbd>⌘</kbd><kbd>\</kbd></td><td><kbd>Ctrl</kbd><kbd>\</kbd></td></tr>
            <tr><td>向下分屏</td><td><kbd>⌘</kbd><kbd>⌥</kbd><kbd>\</kbd></td><td><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>\</kbd></td></tr>
            <tr><td>关闭当前 pane</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>X</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>X</kbd></td></tr>
            <tr><td>搜索</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>F</kbd></td></tr>
            <tr><td>清屏</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>K</kbd></td></tr>
          </tbody>
        </table>
        <p>浏览器保留的 <code>Cmd/Ctrl+D</code>、<code>Cmd/Ctrl+W</code>、<code>Cmd/Ctrl+T</code>、<code>Cmd/Ctrl+F</code> 不会绑定到应用，避免与书签、关闭标签、新建浏览器标签和页内查找冲突。</p>
      </section>

      <section className="help-section">
        <h4>图片与实用工具</h4>
        <p>支持 iTerm2 的 OSC 1337 内联图片协议、Sixel，以及 OSC 52 剪贴板、OSC 9 通知和文件下载。命令会在当前终端中可见地执行：先安装内置的 shell 脚本，再按当前机器的架构从 GitHub Releases 下载原生二进制（无法访问时自动回退 shell 版）。</p>
        <div className="help-actions">
          <button className="primary-button" onClick={onInstallUtilities}>
            在当前终端安装辅助工具
          </button>
        </div>
        <pre className="help-code"># 手动安装（可选，需能访问 GitHub）
curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | FORCE=1 bash</pre>
        <ul>
          <li><code>imgcat</code>：在终端内显示图片，默认按窗口尺寸缩图（<code>--no-shrink</code> 发送原图）。</li>
          <li><code>imgls</code>：自适应多列缩略图网格，文件名与像素尺寸显示在图片下方。</li>
          <li><code>ofn-copy</code>、<code>ofn-notify</code>、<code>ofn-dl</code>、<code>ofn-title</code>：剪贴板、通知、下载与标题。</li>
        </ul>
      </section>

      <section className="help-section">
        <h4>字体与配色</h4>
        <p>默认字体与 iTerm2 一致：Monaco 12、字重 400、行高 1.0、关闭连字。macOS 直接使用系统 Monaco；其他系统依次回退 Menlo、SF Mono、DejaVu Sans Mono、JetBrains Mono。</p>
        <p>内置 iTerm2 兼容预设与 Material Design Colors。可在配色页导入或导出 <code>.itermcolors</code> 文件；导入的配色保存在应用设置中。</p>
      </section>

      <section className="help-section">
        <h4>会话与数据</h4>
        <p>会话不做持久化。WebSocket 异常断开后保留 15 秒重连窗口，超时或主动关闭立即结束；刷新或关闭页面会结束会话。需要长期运行的进程，可在 Shell 内自行使用 <code>tmux</code> 或 <code>screen</code>。</p>
        <p>应用配置与命令片段保存在应用私有数据目录。应用不保存 SSH 主机或凭据；需要连接其他主机时，直接使用系统 <code>ssh</code> 客户端。</p>
      </section>

      <section className="help-section">
        <h4>故障排查</h4>
        <ul>
          <li>页面无法打开：确认从 fnOS 桌面入口进入，或检查网关 Socket 与反向代理配置。</li>
          <li>终端黑屏或渲染异常：尝试在 URL 后加 <code>?nogl=1</code>，使用 DOM renderer。</li>
          <li>图片不显示：确认使用的是支持 OSC 1337 的终端，并更新到最新版本。</li>
          <li>会话意外结束：检查网络是否超过 15 秒重连窗口；可在文本设置中调整重连窗口。</li>
        </ul>
      </section>
    </>
  )
}

function HelpEn({ onInstallUtilities }: { onInstallUtilities: () => void }) {
  return (
    <>
      <section className="help-section">
        <h4>Quick Start</h4>
        <p>OFTerm is an open-source terminal for fnOS. Access is governed by the fnOS gateway and your deployment; the app itself has no password.</p>
        <ul>
          <li>Double-click the icon on the fnOS desktop to open it in a system window.</li>
          <li>A local shell tab is created automatically on launch, running as the signed-in fnOS user.</li>
          <li>Use <code>sudo</code> inside the shell when you need elevated privileges; the app stays out of sudo and password entry.</li>
        </ul>
      </section>

      <section className="help-section">
        <h4>Tabs &amp; Splits</h4>
        <p>Each tab is an independent terminal session, and the tab title follows the program currently running. Split and close controls sit in the upper-right corner of every pane; drag the divider between panes to resize.</p>
        <table className="help-table">
          <thead><tr><th>Action</th><th>macOS</th><th>Windows / Linux</th></tr></thead>
          <tbody>
            <tr><td>New tab</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Enter</kbd></td></tr>
            <tr><td>Split right</td><td><kbd>⌘</kbd><kbd>\</kbd></td><td><kbd>Ctrl</kbd><kbd>\</kbd></td></tr>
            <tr><td>Split down</td><td><kbd>⌘</kbd><kbd>⌥</kbd><kbd>\</kbd></td><td><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>\</kbd></td></tr>
            <tr><td>Close pane</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>X</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>X</kbd></td></tr>
            <tr><td>Search</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>F</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>F</kbd></td></tr>
            <tr><td>Clear screen</td><td><kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd></td><td><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>K</kbd></td></tr>
          </tbody>
        </table>
        <p>Browser-reserved <code>Cmd/Ctrl+D</code>, <code>Cmd/Ctrl+W</code>, <code>Cmd/Ctrl+T</code>, and <code>Cmd/Ctrl+F</code> are intentionally unbound to avoid conflicts with bookmarks, tab close, new browser tab, and in-page find.</p>
      </section>

      <section className="help-section">
        <h4>Images &amp; Utilities</h4>
        <p>Supports the iTerm2 OSC 1337 inline-image protocol, Sixel, OSC 52 clipboard, OSC 9 notifications, and file download. The commands run visibly in the current terminal: the embedded shell helpers install first, then the native binary for this machine's architecture is downloaded from GitHub Releases (falling back to the shell version when GitHub is unreachable).</p>
        <div className="help-actions">
          <button className="primary-button" onClick={onInstallUtilities}>
            Install utilities in current terminal
          </button>
        </div>
        <pre className="help-code"># Manual install (optional, requires GitHub access)
curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | FORCE=1 bash</pre>
        <ul>
          <li><code>imgcat</code>: display images in the terminal; downscales to fit the window by default (<code>--no-shrink</code> sends the original).</li>
          <li><code>imgls</code>: adaptive multi-column thumbnail grid with filenames and pixel dimensions under each image.</li>
          <li><code>ofn-copy</code>, <code>ofn-notify</code>, <code>ofn-dl</code>, <code>ofn-title</code>: clipboard, notification, download, and title.</li>
        </ul>
      </section>

      <section className="help-section">
        <h4>Font &amp; Colors</h4>
        <p>The default font matches iTerm2: Monaco 12, weight 400, line height 1.0, ligatures off. macOS uses the system Monaco; other systems fall back through Menlo, SF Mono, DejaVu Sans Mono, then JetBrains Mono.</p>
        <p>Built-in iTerm2-compatible presets plus Material Design Colors. Import or export <code>.itermcolors</code> files under Colors; imported palettes are stored in the app draft.</p>
      </section>

      <section className="help-section">
        <h4>Sessions &amp; Data</h4>
        <p>Sessions are not persisted. A dropped WebSocket keeps a 15-second reconnect window; expiry or an intentional close ends the session, as does refreshing or closing the page. Run <code>tmux</code> or <code>screen</code> inside the shell for long-lived processes.</p>
        <p>Settings and command snippets are stored in the app’s private data directory. No SSH hosts or credentials are saved; use the system <code>ssh</code> client inside the shell to reach other hosts.</p>
      </section>

      <section className="help-section">
        <h4>Troubleshooting</h4>
        <ul>
          <li>Page won’t open: enter from the fnOS desktop, or check the gateway socket and reverse-proxy configuration.</li>
          <li>Black screen or rendering glitches: append <code>?nogl=1</code> to the URL to use the DOM renderer.</li>
          <li>Images not showing: make sure the terminal supports OSC 1337 and update to the latest version.</li>
          <li>Session ended unexpectedly: the network drop may have exceeded the 15-second reconnect window; adjust it under Text draft.</li>
        </ul>
      </section>
    </>
  )
}
