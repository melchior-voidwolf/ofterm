import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { apiUrl, wsUrl } from '../lib/api'
import type { Settings } from '../settings/types'
import { xtermTheme } from '../theme'

export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'error'

export interface SessionCallbacks {
  onStatus?: (status: SessionStatus, detail?: string) => void
  onSize?: (cols: number, rows: number) => void
  onTitle?: (title: string) => void
}

const OP_DATA = 0x01
const OP_RESIZE = 0x02
const OP_EXIT = 0x03
const OP_ERROR = 0x04
const OP_PING = 0x05
const OP_PONG = 0x06
const OP_READY = 0x07
const OP_ACK = 0x08
const OP_CLOSE = 0x0a

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeResize(cols: number, rows: number): Uint8Array {
  const out: number[] = [OP_RESIZE]
  const put = (n: number) => {
    while (n >= 0x80) {
      out.push((n & 0x7f) | 0x80)
      n >>>= 7
    }
    out.push(n)
  }
  put(cols)
  put(rows)
  return new Uint8Array(out)
}

export class SessionClient {
  readonly terminal: Terminal
  readonly fit = new FitAddon()
  readonly search = new SearchAddon()

  private readonly image = new ImageAddon({
    iipSupport: true,
    sixelSupport: true,
    pixelLimit: 16_777_216,
    storageLimit: 64,
    showPlaceholder: true,
  })
  private readonly unicode = new Unicode11Addon()
  private ws?: WebSocket
  private sessionId = ''
  private resumeToken = ''
  private lastSeq = 0
  private intentional = false
  private disposed = false
  private status: SessionStatus = 'connecting'
  private reconnectTimer?: number
  private reconnectAttempt = 0
  private reconnectStarted = 0
  private heartbeatTimer?: number
  private lastPong = 0
  private resizeObserver?: ResizeObserver
  private settings: Settings
  private mode: 'light' | 'dark'
  private callbacks: SessionCallbacks
  private multipart: { params: string; data: string } | null = null
  private pendingOutput = new Uint8Array(0)

  constructor(settings: Settings, mode: 'light' | 'dark', callbacks: SessionCallbacks = {}) {
    this.settings = settings
    this.mode = mode
    this.callbacks = callbacks
    this.terminal = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      fontWeight: settings.fontWeight,
      fontWeightBold: settings.fontWeightBold,
      letterSpacing: settings.letterSpacing,
      lineHeight: settings.lineHeight,
      scrollback: settings.scrollback,
      macOptionIsMeta: false,
      rightClickSelectsWord: false,
      theme: xtermTheme(settings.themeId, mode, settings.customThemes) as ITheme,
    })
    this.terminal.onData((data) => this.sendData(data))
    this.terminal.onResize(({ cols, rows }) => {
      this.callbacks.onSize?.(cols, rows)
      this.send(encodeResize(cols, rows))
    })
    this.terminal.onTitleChange((title) => this.callbacks.onTitle?.(title))
  }

  mount(container: HTMLElement) {
    this.terminal.loadAddon(this.fit)
    this.terminal.loadAddon(this.image)
    this.registerOscHandlers()
    this.terminal.loadAddon(this.search)
    this.terminal.loadAddon(new WebLinksAddon())
    this.terminal.loadAddon(this.unicode)
    this.terminal.unicode.activeVersion = '11'
    this.terminal.open(container)
    if (!new URLSearchParams(window.location.search).has('nogl')) {
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        this.terminal.loadAddon(webgl)
      } catch {
        // DOM renderer remains active.
      }
    }
    this.resizeObserver = new ResizeObserver(() => this.fitTerminal())
    this.resizeObserver.observe(container)
    this.fitTerminal()
  }

  async openNew() {
    this.setStatus('connecting')
    try {
      const ticket = await fetch(apiUrl('/api/v1/tickets'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OFTerm' },
        body: JSON.stringify({
          cols: this.terminal.cols,
          rows: this.terminal.rows,
          graceSeconds: this.settings.graceSeconds,
        }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message ?? `ticket failed (${res.status})`)
        return body as { ticket: string }
      })
      this.connect(wsUrl('/ws/terminal'), ['ofterm', `ticket.${ticket.ticket}`])
    } catch (err) {
      this.showError(err instanceof Error ? err.message : String(err))
      this.setStatus('error')
    }
  }


  // writeOutput turns iTerm2 MultipartFile streams into a single legacy
  // File= OSC before the bytes reach xterm. Doing this in-stream (rather than
  // re-writing after FileEnd) preserves the cursor position relative to the
  // shell prompt that follows the image.
  private writeOutput(chunk: Uint8Array) {
    if (this.pendingOutput.length) {
      const merged = new Uint8Array(this.pendingOutput.length + chunk.length)
      merged.set(this.pendingOutput)
      merged.set(chunk, this.pendingOutput.length)
      chunk = merged
    }
    this.pendingOutput = new Uint8Array(0)

    const out: Uint8Array[] = []
    let start = 0
    let i = 0
    let pendingFrom = -1
    while (i < chunk.length) {
      if (chunk[i] !== 0x1b) {
        i++
        continue
      }
      if (i + 7 > chunk.length) {
        // Split ESC ]1337; prefix: emit bytes before it and keep the rest.
        out.push(chunk.subarray(start, i))
        pendingFrom = i
        break
      }
      const is1337 =
        chunk[i + 1] === 0x5d &&
        chunk[i + 2] === 0x31 && chunk[i + 3] === 0x33 &&
        chunk[i + 4] === 0x33 && chunk[i + 5] === 0x37 && chunk[i + 6] === 0x3b
      if (!is1337) {
        out.push(chunk.subarray(start, i + 1))
        start = i + 1
        i++
        continue
      }
      let end = -1
      let termLen = 1
      for (let j = i + 7; j < chunk.length; j++) {
        if (chunk[j] === 0x07) {
          end = j
          termLen = 1
          break
        }
        if (chunk[j] === 0x1b && chunk[j + 1] === 0x5c) {
          end = j
          termLen = 2
          break
        }
      }
      if (end < 0) {
        // Incomplete OSC: do not emit the partial sequence twice.
        out.push(chunk.subarray(start, i))
        pendingFrom = i
        break
      }
      const payload = decoder.decode(chunk.subarray(i + 7, end))
      const nextStart = end + termLen
      if (payload.startsWith('MultipartFile=')) {
        this.multipart = { params: payload.slice('MultipartFile='.length), data: '' }
      } else if (this.multipart && payload.startsWith('FilePart=')) {
        this.multipart.data += payload.slice('FilePart='.length)
      } else if (this.multipart && payload === 'FileEnd') {
        out.push(encoder.encode(`\x1b]1337;File=${this.multipart.params}:${this.multipart.data}\x07`))
        this.multipart = null
      } else {
        out.push(chunk.subarray(i, nextStart))
      }
      i = nextStart
      start = nextStart
    }
    if (pendingFrom >= 0) {
      this.pendingOutput = chunk.slice(pendingFrom)
    } else if (start < chunk.length) {
      out.push(chunk.subarray(start))
    }
    for (const part of out) this.terminal.write(part)
  }

  private registerOscHandlers() {
    // iTerm2 inline images: assemble MultipartFile streams into a single
    // legacy File= sequence, which @xterm/addon-image understands.
    this.terminal.parser.registerOscHandler(1337, (data) => {
      if (data.startsWith('File=')) {
        const body = data.slice('File='.length)
        const colon = body.indexOf(':')
        if (colon < 0) return false
        const params = body.slice(0, colon)
        const payload = body.slice(colon + 1)
        if (/(^|;)inline=0(;|$)/.test(params)) {
          this.download(params, payload)
          return true
        }
        return false // inline images are handled by @xterm/addon-image
      }
      return false
    })

    // OSC 52 clipboard write.
    this.terminal.parser.registerOscHandler(52, (data) => {
      const colon = data.indexOf(';')
      if (colon < 0) return true
      try {
        const bytes = Uint8Array.from(atob(data.slice(colon + 1)), (c) => c.charCodeAt(0))
        const text = decoder.decode(bytes)
        void navigator.clipboard?.writeText(text).catch(() => undefined)
        window.dispatchEvent(new CustomEvent('ofterm:notify', { detail: { message: '已复制到剪贴板', kind: 'success' } }))
      } catch {
        // ignore malformed clipboard payloads
      }
      return true
    })

    // OSC 9 desktop notification.
    this.terminal.parser.registerOscHandler(9, (data) => {
      window.dispatchEvent(new CustomEvent('ofterm:notify', { detail: { message: data, kind: 'info' } }))
      return true
    })
  }

  private download(params: string, payload: string) {
    let name = 'download.bin'
    for (const part of params.split(';')) {
      if (part.startsWith('name=')) {
        try {
          name = decoder.decode(Uint8Array.from(atob(part.slice(5)), (c) => c.charCodeAt(0)))
        } catch {
          // keep default name
        }
      }
    }
    try {
      const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes]))
      const a = document.createElement('a')
      a.href = url
      a.download = name || 'download.bin'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      // ignore malformed downloads
    }
  }

  private connect(url: string, protocols?: string[]) {
    this.terminal.options.disableStdin = false
    const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      this.reconnectStarted = 0
      this.lastPong = Date.now()
      this.startHeartbeat()
    }
    ws.onmessage = (event) => this.handleFrame(event.data)
    ws.onclose = () => this.handleClose()
    ws.onerror = () => {
      // onclose handles retry/error states
    }
  }

  private handleFrame(raw: unknown) {
    if (typeof raw === 'string') {
      this.terminal.write(raw)
      return
    }
    if (!(raw instanceof ArrayBuffer)) return
    const buf = new Uint8Array(raw)
    if (buf.length === 0) return
    switch (buf[0]) {
      case OP_DATA: {
        if (buf.length < 9) return
        const seq = Number(new DataView(raw).getBigUint64(1))
        if (seq <= this.lastSeq) return
        this.lastSeq = seq
        this.writeOutput(buf.subarray(9))
        break
      }
      case OP_READY: {
        try {
          const info = JSON.parse(decoder.decode(buf.subarray(1)))
          this.sessionId = info.sessionId ?? ''
          this.resumeToken = info.resumeToken ?? ''
          if (typeof info.startSeq === 'number') this.lastSeq = info.startSeq
          this.terminal.options.disableStdin = false
          this.setStatus('connected')
          this.sendResize()
          this.terminal.focus()
        } catch {
          this.showError('invalid READY frame')
        }
        break
      }
      case OP_EXIT: {
        let info: { code?: number; signal?: string; reason?: string } = {}
        try {
          info = JSON.parse(decoder.decode(buf.subarray(1)))
        } catch {
          // ignore
        }
        const reason = info.signal ? `signal ${info.signal}` : `exit ${info.code ?? 0}`
        this.terminal.writeln(`\r\n\x1b[90m[会话已结束：${reason}]\x1b[0m`)
        this.intentional = true
        this.setStatus('ended', reason)
        break
      }
      case OP_ERROR: {
        try {
          const info = JSON.parse(decoder.decode(buf.subarray(1)))
          this.showError(info.message ?? info.code ?? 'terminal error')
        } catch {
          this.showError(decoder.decode(buf.subarray(1)))
        }
        this.setStatus('error')
        break
      }
      case OP_PONG:
        this.lastPong = Date.now()
        break
      default:
        break
    }
  }

  private handleClose() {
    this.stopHeartbeat()
    if (this.intentional || this.disposed) {
      if (this.status !== 'ended') this.setStatus('ended')
      return
    }
    if (!this.sessionId || !this.resumeToken) {
      this.showError('连接已断开')
      this.setStatus('error')
      return
    }
    if (!this.reconnectStarted) this.reconnectStarted = Date.now()
    if (Date.now() - this.reconnectStarted > this.settings.graceSeconds * 1000) {
      this.showNotice('重连超时，会话已结束')
      this.setStatus('ended', 'reconnect timeout')
      return
    }
    this.setStatus('reconnecting')
    const delay = Math.min(500 * 2 ** this.reconnectAttempt++, 4000)
    this.reconnectTimer = window.setTimeout(() => {
      this.connect(wsUrl('/ws/terminal'), [
        'ofterm',
        `session.${this.sessionId}`,
        `resume.${this.resumeToken}`,
        `seq.${this.lastSeq}`,
      ])
    }, delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (Date.now() - this.lastPong > 60_000) {
        this.ws?.close(4000, 'heartbeat timeout')
        return
      }
      this.send(new Uint8Array([OP_PING]))
    }, 20_000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private send(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data as unknown as ArrayBufferView<ArrayBuffer>)
  }

  private sendData(data: string) {
    const bytes = encoder.encode(data)
    const maxChunk = 64 * 1024
    for (let offset = 0; offset < bytes.length; offset += maxChunk) {
      const part = bytes.subarray(offset, offset + maxChunk)
      const frame = new Uint8Array(part.length + 1)
      frame[0] = OP_DATA
      frame.set(part, 1)
      this.send(frame)
    }
  }

  private sendResize() {
    if (this.terminal.cols > 0 && this.terminal.rows > 0) {
      this.send(encodeResize(this.terminal.cols, this.terminal.rows))
    }
  }

  fitTerminal() {
    try {
      this.fit.fit()
    } catch {
      // hidden containers can fail; the next activation retries
    }
  }

  focus() {
    this.fitTerminal()
    this.terminal.focus()
  }

  updateSettings(settings: Settings) {
    this.settings = settings
    this.terminal.options.fontFamily = settings.fontFamily
    this.terminal.options.fontSize = settings.fontSize
    this.terminal.options.fontWeight = settings.fontWeight
    this.terminal.options.fontWeightBold = settings.fontWeightBold
    this.terminal.options.lineHeight = settings.lineHeight
    this.terminal.options.letterSpacing = settings.letterSpacing
    this.terminal.options.cursorStyle = settings.cursorStyle
    this.terminal.options.cursorBlink = settings.cursorBlink
    this.terminal.options.scrollback = settings.scrollback
    this.fitTerminal()
  }

  updateTheme(mode: 'light' | 'dark', themeId: string, customThemes = this.settings.customThemes) {
    this.mode = mode
    this.terminal.options.theme = xtermTheme(themeId, mode, customThemes) as ITheme
  }

  private searchOptions = {
    incremental: true,
    decorations: {
      matchBackground: '#ffd60a',
      matchBorder: '#ffb000',
      matchOverviewRuler: '#ffb000',
      activeMatchBackground: '#ff9f0a',
      activeMatchBorder: '#ff6b00',
      activeMatchColorOverviewRuler: '#ff6b00',
    },
  }

  findNext(term: string) {
    if (term) this.search.findNext(term, this.searchOptions)
  }

  findPrevious(term: string) {
    if (term) this.search.findPrevious(term, this.searchOptions)
  }

  clearSearch() {
    this.search.clearDecorations()
  }

  clear() {
    this.terminal.clear()
  }

  runCommand(command: string) {
    if (this.status !== 'connected' || this.ws?.readyState !== WebSocket.OPEN) {
      this.showError('终端尚未连接')
      return
    }
    this.sendData(command + '\r')
    this.focus()
  }

  private showError(message: string) {
    this.terminal.writeln(`\r\n\x1b[31m[错误] ${message}\x1b[0m`)
  }

  private showNotice(message: string) {
    this.terminal.writeln(`\r\n\x1b[90m[${message}]\x1b[0m`)
  }

  private setStatus(status: SessionStatus, detail?: string) {
    this.status = status
    this.callbacks.onStatus?.(status, detail)
  }

  getStatus() {
    return this.status
  }

  dispose() {
    this.disposed = true
    this.intentional = true
    this.stopHeartbeat()
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
    this.resizeObserver?.disconnect()
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(new Uint8Array([OP_CLOSE]))
        this.ws.close(1000, 'tab closed')
      } catch {
        // ignore
      }
    } else {
      this.ws?.close()
    }
    this.terminal.dispose()
  }
}
