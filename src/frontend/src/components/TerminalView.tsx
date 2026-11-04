import { useEffect, useRef } from 'react'
import { Columns2, Rows2, X } from 'lucide-react'
import { SessionClient, type SessionStatus } from '../session/SessionClient'
import type { Settings } from '../settings/types'

interface Props {
  paneId: string
  settings: Settings
  mode: 'light' | 'dark'
  visible: boolean
  focused: boolean
  onClient: (id: string, client: SessionClient | null) => void
  onStatus: (id: string, status: SessionStatus, detail?: string) => void
  onSize: (id: string, cols: number, rows: number) => void
  onActivate: () => void
  onSplit: (direction: 'row' | 'column') => void
  onClose: () => void
  canClose: boolean
}

export function TerminalView({
  paneId,
  settings,
  mode,
  visible,
  focused,
  onClient,
  onStatus,
  onSize,
  onActivate,
  onSplit,
  onClose,
  canClose,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<SessionClient | null>(null)
  const settingsRef = useRef(settings)
  const modeRef = useRef(mode)
  settingsRef.current = settings
  modeRef.current = mode

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const client = new SessionClient(settingsRef.current, modeRef.current, {
      onStatus: (status, detail) => onStatus(paneId, status, detail),
      onSize: (cols, rows) => onSize(paneId, cols, rows),
    })
    clientRef.current = client
    client.mount(host)
    onClient(paneId, client)
    if (new URLSearchParams(window.location.search).has('debug')) {
      ;(window as unknown as { __ofterm?: SessionClient }).__ofterm = client
    }
    void client.openNew()
    return () => {
      onClient(paneId, null)
      client.dispose()
      clientRef.current = null
    }
    // The session must only be created once per pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  useEffect(() => {
    clientRef.current?.updateSettings(settings)
  }, [settings])

  useEffect(() => {
    clientRef.current?.updateTheme(mode, settings.themeId, settings.customThemes)
  }, [mode, settings.themeId])

  useEffect(() => {
    if (visible && focused) {
      requestAnimationFrame(() => clientRef.current?.focus())
    }
  }, [visible, focused])

  return (
    <div
      className={`terminal-pane${visible ? ' is-visible' : ''}${focused ? ' is-focused' : ''}`}
      aria-hidden={!visible}
      onPointerDown={onActivate}
    >
      <div className="terminal-host" ref={hostRef} />
      <div className="split-control" role="group" aria-label="分屏">
        <button title="向右分屏 (⌘\\)" aria-label="向右分屏" onClick={(e) => { e.stopPropagation(); onSplit('row') }}>
          <Columns2 size={12} />
        </button>
        <button title="向下分屏 (⌘⌥\\)" aria-label="向下分屏" onClick={(e) => { e.stopPropagation(); onSplit('column') }}>
          <Rows2 size={12} />
        </button>
        {canClose ? (
          <button className="split-close" title="关闭 pane (⌘⇧X)" aria-label="关闭 pane" onClick={(e) => { e.stopPropagation(); onClose() }}>
            <X size={12} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
