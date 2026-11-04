import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import { X } from 'lucide-react'
import { DEFAULT_FONT_FAMILY, type Settings } from '../settings/types'
import { allThemes } from '../theme'
import { downloadITermColors, parseITermColors, themeColorsForExport } from '../theme/itermcolors'

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
      onChange({ customThemes: [...settings.customThemes, theme], themeId: theme.id })
    } catch (err) {
      setThemeError(err instanceof Error ? err.message : String(err))
    }
  }

  const exportCurrent = () => {
    const theme = allThemes(settings.customThemes).find((t) => t.id === settings.themeId)
    if (theme && themeColorsForExport(theme)) downloadITermColors(theme)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="settings-dialog" aria-describedby={undefined}>
          <header className="settings-header">
            <Dialog.Title className="settings-title">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭">
                <X size={16} />
              </button>
            </Dialog.Close>
          </header>
          <Tabs.Root defaultValue="appearance" orientation="vertical" className="settings-tabs">
            <Tabs.List className="settings-sidebar">
              <Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
              <Tabs.Trigger value="text">Text</Tabs.Trigger>
              <Tabs.Trigger value="colors">Colors</Tabs.Trigger>
              <Tabs.Trigger value="help">Help</Tabs.Trigger>
              <Tabs.Trigger value="about">About</Tabs.Trigger>
            </Tabs.List>
            <div className="settings-content">
              <Tabs.Content value="appearance">
                <h3>Appearance</h3>
                <Row label="界面主题">
                  <select value={settings.uiTheme} onChange={(e) => onChange({ uiTheme: e.target.value as Settings['uiTheme'] })}>
                    <option value="system">跟随系统</option>
                    <option value="light">亮色</option>
                    <option value="dark">暗色</option>
                  </select>
                </Row>
                <Row label="标签栏">
                  <select value={settings.tabStyle} onChange={(e) => onChange({ tabStyle: e.target.value })}>
                    <option value="iterm2">紧凑</option>
                    <option value="fnos">宽松</option>
                  </select>
                </Row>
              </Tabs.Content>

              <Tabs.Content value="text">
                <h3>Text</h3>
                <Row label="字体">
                  <input
                    className="text-input wide"
                    value={settings.fontFamily}
                    onChange={(e) => onChange({ fontFamily: e.target.value })}
                    spellCheck={false}
                  />
                </Row>
                <Row label="字号">
                  <input type="number" min={8} max={48} value={settings.fontSize} onChange={(e) => onChange({ fontSize: intValue(e.target.value, settings.fontSize) })} />
                </Row>
                <Row label="字重">
                  <select value={settings.fontWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}>
                    {[300, 400, 500, 600, 700].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="行高">
                  <input type="number" min={0.8} max={3} step={0.1} value={settings.lineHeight} onChange={(e) => onChange({ lineHeight: Number(e.target.value) || settings.lineHeight })} />
                </Row>
                <Row label="字距">
                  <input type="number" min={-5} max={10} value={settings.letterSpacing} onChange={(e) => onChange({ letterSpacing: intValue(e.target.value, settings.letterSpacing) })} />
                </Row>
                <Row label="光标">
                  <select value={settings.cursorStyle} onChange={(e) => onChange({ cursorStyle: e.target.value as Settings['cursorStyle'] })}>
                    <option value="block">方块</option>
                    <option value="bar">竖线</option>
                    <option value="underline">下划线</option>
                  </select>
                </Row>
                <Row label="光标闪烁">
                  <Switch.Root className="switch" checked={settings.cursorBlink} onCheckedChange={(v) => onChange({ cursorBlink: v })}>
                    <Switch.Thumb className="switch-thumb" />
                  </Switch.Root>
                </Row>
                <Row label="回滚行数">
                  <input type="number" min={100} max={1000000} step={1000} value={settings.scrollback} onChange={(e) => onChange({ scrollback: intValue(e.target.value, settings.scrollback) })} />
                </Row>
                <Row label="重连窗口">
                  <input type="number" min={0} max={3600} value={settings.graceSeconds} onChange={(e) => onChange({ graceSeconds: intValue(e.target.value, settings.graceSeconds) })} />
                </Row>
                <button className="secondary-button" onClick={() => onChange({ fontFamily: DEFAULT_FONT_FAMILY })}>
                  恢复默认字体栈
                </button>
              </Tabs.Content>

              <Tabs.Content value="colors">
                <h3>Color Presets</h3>
                <div className="theme-grid">
                  {allThemes(settings.customThemes).map((theme) => {
                    const c = theme.colors ?? theme.variants?.dark ?? theme.variants?.light
                    return (
                      <button
                        key={theme.id}
                        className={`theme-card${settings.themeId === theme.id ? ' is-active' : ''}`}
                        onClick={() => onChange({ themeId: theme.id })}
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
                    导入 .itermcolors
                  </button>
                  <button className="secondary-button" onClick={exportCurrent}>
                    导出当前配色
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
                <h3>帮助</h3>
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
                  <p>顶部标签栏对应独立终端会话。每个 pane 右上角提供分屏与关闭按钮；拖动 pane 之间的分隔线可调整尺寸。</p>
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
                  <p>支持 iTerm2 的 OSC 1337 内联图片协议、Sixel，以及 OSC 52 剪贴板、OSC 9 通知和文件下载。辅助脚本位于仓库 <code>contrib/</code>。</p>
                  <div className="help-actions">
                    <button className="primary-button" onClick={onInstallUtilities}>
                      在当前终端安装辅助工具
                    </button>
                  </div>
                  <pre className="help-code">curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | FORCE=1 bash</pre>
                  <ul>
                    <li><code>imgcat</code> / <code>ofn-imgcat</code>：在终端内显示图片；<code>ofn-imgcat</code> 会按窗口尺寸缩图。</li>
                    <li><code>ofn-imgls</code>：带缩略图的目录列表。</li>
                    <li><code>ofn-copy</code>、<code>ofn-notify</code>、<code>ofn-dl</code>、<code>ofn-title</code>：剪贴板、通知、下载与标题。</li>
                  </ul>
                </section>

                <section className="help-section">
                  <h4>字体与配色</h4>
                  <p>默认字体与 iTerm2 一致：Monaco 12、字重 400、行高 1.0、关闭连字。macOS 直接使用系统 Monaco；其他系统依次回退 Menlo、SF Mono、DejaVu Sans Mono、JetBrains Mono。</p>
                  <p>内置 iTerm2 兼容预设与 Material Design Colors。可在 Colors 中导入或导出 <code>.itermcolors</code> 文件；导入的配色保存在应用设置中。</p>
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
                    <li>会话意外结束：检查网络是否超过 15 秒重连窗口；可在 Text 设置中调整重连窗口。</li>
                  </ul>
                </section>
              </Tabs.Content>

              <Tabs.Content value="about">
                <h3>OFTerm</h3>
                <Row label="License">GPL-2.0</Row>
                <Row label="Terminal">xterm.js</Row>
                <Row label="Source">github.com/melchior-voidwolf/ofterm</Row>
              </Tabs.Content>
            </div>
          </Tabs.Root>
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
