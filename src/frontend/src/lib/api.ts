export type ApiError = { error: { code: string; message: string } }

export function apiUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).toString()
}

export function wsUrl(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(path.replace(/^\/+/, ''), document.baseURI)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  for (const [k, v] of Object.entries(params)) {
    if (v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  headers.set('X-Requested-With', 'OFTerm')
  const res = await fetch(apiUrl(path), {
    credentials: 'same-origin',
    ...init,
    headers,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const message =
      (data as ApiError)?.error?.message ||
      (typeof data === 'string' ? data : `request failed (${res.status})`)
    throw new Error(message)
  }
  return data as T
}
