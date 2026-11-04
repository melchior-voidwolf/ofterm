import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Columns2, CornerDownLeft, Plus, Rows2, Search, Settings as SettingsIcon, Terminal, X } from 'lucide-react'
import { api } from './lib/api'
import { SettingsDialog } from './components/SettingsDialog'
import { TerminalView } from './components/TerminalView'
import { defaultSettings, type Settings } from './settings/types'
import {
  collectPanes,
  newPane,
  removePane,
  layoutPanes,
  setSplitRatio,
  splitPane,
  type PaneNode,
} from './session/panes'
import type { SessionClient, SessionStatus } from './session/SessionClient'
import { blendHex, themeColors } from './theme'

interface Me {
  authenticated: boolean
  gateway: boolean
  mode: string
  version: string
  uid?: string
  username?: string
  isAdmin?: boolean
}

interface Tab {
  id: string
  title: string
  root: PaneNode
  activePaneId: string
}

interface StatusEntry {
  status: SessionStatus
  detail?: string
  cols?: number
  rows?: number
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  ended: '已结束',
  error: '错误',
}

const HOTKEY_OPTIONS = { enableOnFormTags: ['INPUT', 'TEXTAREA'] } as const

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/v1/me'))
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  if (loadError) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>无法连接后端</h1>
          <p className="auth-note">{loadError}</p>
          <button className="primary-button" onClick={() => void loadMe()}>
            重试
          </button>
        </div>
      </div>
    )
  }
  if (!me) return <div className="splash">OFTerm</div>
  if (!me.authenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <Terminal size={22} />
            <span>OFTerm</span>
          </div>
          <h1>请从 fnOS 桌面打开</h1>
          <p className="auth-note">当前请求没有通过 fnOS 网关身份校验。</p>
          <button className="primary-button" onClick={() => void loadMe()}>
            重新检测
          </button>
        </div>
      </div>
    )
  }
  return <Workspace me={me} />
}

function Workspace({ me }: { me: Me }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState('')
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const [toast, setToast] = useState<{ message: string; kind?: string } | null>(null)

  const clients = useRef(new Map<string, SessionClient>())
  const saveTimer = useRef<number | undefined>(undefined)
  const booted = useRef(false)
  const searchInput = useRef<HTMLInputElement>(null)

  const mode: 'light' | 'dark' =
    settings.uiTheme === 'system' ? (systemDark ? 'dark' : 'light') : settings.uiTheme
  const colors = themeColors(settings.themeId, mode, settings.customThemes)
  const terminalBg = colors.background
  const terminalFg = colors.foreground
  const terminalDivider = blendHex(colors.foreground, colors.background, 0.16)

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  useEffect(() => {
    let timer: number | undefined
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind?: string }>).detail
      if (!detail?.message) return
      setToast(detail)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setToast(null), 3200)
    }
    window.addEventListener('ofterm:notify', onNotify)
    return () => {
      window.removeEventListener('ofterm:notify', onNotify)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    void api<Settings>('/api/v1/settings')
      .then((s) => setSettings({ ...defaultSettings, ...s }))
      .catch(() => undefined)
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void api('/api/v1/settings', { method: 'PUT', body: JSON.stringify(next) }).catch(() => undefined)
      }, 300)
      return next
    })
  }, [])

  const updateTab = useCallback((tabId: string, fn: (tab: Tab) => Tab) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? fn(tab) : tab)))
  }, [])

  const addTab = useCallback(() => {
    const pane = newPane()
    const tab: Tab = {
      id: crypto.randomUUID(),
      title: pane.title,
      root: { type: 'leaf', pane },
      activePaneId: pane.id,
    }
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
    setStatuses((prev) => ({ ...prev, [pane.id]: { status: 'connecting' } }))
  }, [])

  const disposeTab = useCallback((tab: Tab) => {
    for (const pane of collectPanes(tab.root)) {
      clients.current.get(pane.id)?.dispose()
      clients.current.delete(pane.id)
    }
  }, [])

  const removeStatuses = useCallback((ids: string[]) => {
    setStatuses((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id)
      if (!tab) return
      disposeTab(tab)
      removeStatuses(collectPanes(tab.root).map((p) => p.id))
      const idx = tabs.findIndex((t) => t.id === id)
      const next = tabs.filter((t) => t.id !== id)
      setActiveId((active) => (active !== id ? active : (next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? '')))
      setTabs(next)
    },
    [disposeTab, removeStatuses, tabs],
  )

  const activeTab = tabs.find((t) => t.id === activeId)
  const activePanes = activeTab ? collectPanes(activeTab.root) : []
  const activePane = activePanes.find((p) => p.id === activeTab?.activePaneId) ?? activePanes[0]
  const activePaneId = activePane?.id ?? ''
  const activeClient = activePaneId ? clients.current.get(activePaneId) : undefined
  const activeStatus = activePaneId ? statuses[activePaneId] : undefined

  const activatePane = useCallback(
    (tabId: string, paneId: string) => {
      setActiveId(tabId)
      updateTab(tabId, (tab) => ({ ...tab, activePaneId: paneId }))
    },
    [updateTab],
  )

  const splitPaneById = useCallback(
    (tabId: string, paneId: string, direction: 'row' | 'column') => {
      const pane = newPane()
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, root: splitPane(tab.root, paneId, pane, direction), activePaneId: pane.id }
            : tab,
        ),
      )
      setActiveId(tabId)
      setStatuses((prev) => ({ ...prev, [pane.id]: { status: 'connecting' } }))
    },
    [],
  )

  const closePaneById = useCallback(
    (tabId: string, paneId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return
      if (collectPanes(tab.root).length === 1) {
        closeTab(tabId)
        return
      }
      clients.current.get(paneId)?.dispose()
      clients.current.delete(paneId)
      removeStatuses([paneId])
      const root = removePane(tab.root, paneId)
      if (!root) {
        closeTab(tabId)
        return
      }
      const remaining = collectPanes(root)
      updateTab(tabId, (t) => ({
        ...t,
        root,
        activePaneId: t.activePaneId === paneId ? remaining[0].id : t.activePaneId,
      }))
    },
    [closeTab, removeStatuses, tabs, updateTab],
  )

  const splitActive = useCallback(
    (direction: 'row' | 'column') => {
      if (activeTab && activePane) splitPaneById(activeTab.id, activePane.id, direction)
    },
    [activePane, activeTab, splitPaneById],
  )

  const closeActivePane = useCallback(() => {
    if (activeTab && activePane) closePaneById(activeTab.id, activePane.id)
  }, [activePane, activeTab, closePaneById])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    addTab()
  }, [addTab])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (Object.values(statuses).some((s) => s.status === 'connected' || s.status === 'connecting' || s.status === 'reconnecting')) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [statuses])

  const onClient = useCallback((id: string, client: SessionClient | null) => {
    if (client) clients.current.set(id, client)
    else clients.current.delete(id)
  }, [])

  const onStatus = useCallback((id: string, status: SessionStatus, detail?: string) => {
    setStatuses((prev) => ({ ...prev, [id]: { ...prev[id], status, detail } }))
  }, [])

  const onSize = useCallback((id: string, cols: number, rows: number) => {
    setStatuses((prev) => ({ ...prev, [id]: { ...prev[id], cols, rows } }))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.repeat) return
      if (settingsOpen) return
      const target = event.target as HTMLElement | null
      const inTerminal = !!target?.closest('.xterm')
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !inTerminal
      if (inField) return

      // Browser-reserved shortcuts (Cmd/Ctrl+D/W/T/F) are intentionally not used.
      if (event.code === 'Backslash' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        splitActive(event.altKey ? 'column' : 'row')
      } else if (event.code === 'Enter' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        addTab()
      } else if (event.code === 'KeyX' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        closeActivePane()
      } else if (event.code === 'KeyF' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(true)
        requestAnimationFrame(() => searchInput.current?.focus())
      } else if (event.code === 'KeyK' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        activeClient?.clear()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeClient, addTab, closeActivePane, settingsOpen, splitActive])

  const closeSearch = () => {
    setSearchOpen(false)
    activeClient?.clearSearch()
    activeClient?.focus()
  }

  const search = (backwards = false) => {
    if (!activeClient || !searchTerm) return
    if (backwards) activeClient.findPrevious(searchTerm)
    else activeClient.findNext(searchTerm)
  }

  return (
    <div
      className={`app-shell tab-style-${settings.tabStyle}`}
      style={
        {
          '--terminal-bg': terminalBg,
          '--terminal-fg': terminalFg,
          '--terminal-divider': terminalDivider,
        } as CSSProperties
      }
    >
      <div className="tabbar">
        <div className="tabbar-tabs" role="tablist" aria-label="终端标签">
          {tabs.map((tab) => {
            const pane = collectPanes(tab.root).find((p) => p.id === tab.activePaneId)
            const status = statuses[pane?.id ?? '']?.status ?? 'connecting'
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeId}
                className={`tab${tab.id === activeId ? ' is-active' : ''}`}
                onClick={() => setActiveId(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) closeTab(tab.id)
                }}
              >
                <span className={`status-dot status-${status}`} />
                <span className="tab-title">{tab.title}</span>
                <button
                  className="tab-close"
                  aria-label="关闭标签"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          <button className="new-tab-button" title="新建标签 (⌘⇧Enter)" aria-label="新建标签" onClick={addTab}>
            <Plus size={15} />
          </button>
        </div>
        <div className="tabbar-actions">
          <button
            className="toolbar-button"
            title="搜索 (⌘⇧F)"
            aria-label="搜索"
            onClick={() => {
              setSearchOpen(true)
              requestAnimationFrame(() => searchInput.current?.focus())
            }}
          >
            <Search size={15} />
          </button>
          <button className="toolbar-button" title="Settings" aria-label="设置" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={15} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="search-bar">
          <Search size={14} />
          <input
            ref={searchInput}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              if (e.target.value) activeClient?.findNext(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch()
              else if (e.key === 'Enter') search(e.shiftKey)
            }}
            placeholder="搜索"
            spellCheck={false}
          />
          <button className="icon-button" title="上一个" onClick={() => search(true)}>
            <CornerDownLeft size={13} style={{ transform: 'scaleY(-1)' }} />
          </button>
          <button className="icon-button" title="关闭" onClick={closeSearch}>
            <X size={13} />
          </button>
        </div>
      ) : null}

      <main className="workspace">
        {tabs.length === 0 ? (
          <div className="empty-state">
            <Terminal size={28} />
            <h2>没有打开的标签</h2>
            <button className="primary-button" onClick={addTab}>
              <Plus size={14} /> 新建标签
            </button>
          </div>
        ) : null}
        {tabs.map((tab) => (
          <div key={tab.id} className={`tab-tree${tab.id === activeId ? ' is-active' : ''}`}>
            <TabPanes
              tab={tab}
              active={tab.id === activeId}
              settings={settings}
              mode={mode}
              onClient={onClient}
              onStatus={onStatus}
              onSize={onSize}
              onActivate={activatePane}
              onSplit={splitPaneById}
              onClosePane={closePaneById}
              onRatio={(tabId, splitId, ratio) => updateTab(tabId, (t) => ({ ...t, root: setSplitRatio(t.root, splitId, ratio) }))}
            />
          </div>
        ))}
      </main>

      {toast ? <div className={`toast toast-${toast.kind ?? 'info'}`}>{toast.message}</div> : null}

      <footer className="statusbar">
        <span className={`status-text status-${activeStatus?.status ?? 'connecting'}`}>
          {STATUS_LABEL[activeStatus?.status ?? 'connecting']}
        </span>
        {activeTab ? <span className="status-sep">{activeTab.title}</span> : null}
        {activeStatus?.cols ? (
          <span className="status-sep">
            {activeStatus.cols}×{activeStatus.rows}
          </span>
        ) : null}
        <span className="status-spacer" />
        <span className="status-muted">OFTerm {me.version}</span>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={updateSettings} />
    </div>
  )
}

interface TabPanesProps {
  tab: Tab
  active: boolean
  settings: Settings
  mode: 'light' | 'dark'
  onClient: (id: string, client: SessionClient | null) => void
  onStatus: (id: string, status: SessionStatus, detail?: string) => void
  onSize: (id: string, cols: number, rows: number) => void
  onActivate: (tabId: string, paneId: string) => void
  onSplit: (tabId: string, paneId: string, direction: 'row' | 'column') => void
  onClosePane: (tabId: string, paneId: string) => void
  onRatio: (tabId: string, splitId: string, ratio: number) => void
}

function TabPanes({ tab, active, settings, mode, onClient, onStatus, onSize, onActivate, onSplit, onClosePane, onRatio }: TabPanesProps) {
  const { panes, dividers } = layoutPanes(tab.root)
  return (
    <div className="pane-layer">
      {panes.map(({ pane, rect }) => (
        <div
          key={pane.id}
          className="pane-slot"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
          }}
        >
          <TerminalView
            paneId={pane.id}
            settings={settings}
            mode={mode}
            visible={active}
            focused={tab.activePaneId === pane.id}
            onClient={onClient}
            onStatus={onStatus}
            onSize={onSize}
            onActivate={() => onActivate(tab.id, pane.id)}
            onSplit={(direction) => onSplit(tab.id, pane.id, direction)}
            onClose={() => onClosePane(tab.id, pane.id)}
            canClose={panes.length > 1}
          />
        </div>
      ))}
      {dividers.map((divider) => (
        <Splitter
          key={divider.splitId}
          direction={divider.direction}
          rect={divider.rect}
          ratio={divider.ratio}
          onRatio={(ratio) => onRatio(tab.id, divider.splitId, ratio)}
        />
      ))}
    </div>
  )
}

function Splitter({
  direction,
  rect,
  ratio,
  onRatio,
}: {
  direction: 'row' | 'column'
  rect: { x: number; y: number; w: number; h: number }
  ratio: number
  onRatio: (ratio: number) => void
}) {
  const style =
    direction === 'row'
      ? { left: `calc(${rect.x * 100}% - 2px)`, top: `${rect.y * 100}%`, width: 4, height: `${rect.h * 100}%` }
      : { left: `${rect.x * 100}%`, top: `calc(${rect.y * 100}% - 2px)`, width: `${rect.w * 100}%`, height: 4 }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const parent = event.currentTarget.parentElement
    if (!parent) return
    const box = parent.getBoundingClientRect()
    const total = direction === 'row' ? box.width : box.height
    const start = direction === 'row' ? event.clientX : event.clientY
    const move = (ev: PointerEvent) => {
      const delta = (direction === 'row' ? ev.clientX : ev.clientY) - start
      onRatio(Math.min(0.85, Math.max(0.15, ratio + delta / total)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return <div className={`pane-divider ${direction}`} role="separator" style={style} onPointerDown={onPointerDown} />
}
