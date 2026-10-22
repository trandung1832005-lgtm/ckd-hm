const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const KEY = 'ckd_token'

// Token chỉ nằm trong sessionStorage (mất khi đóng tab) và hết hạn theo máy chủ.
export const tokenStore = {
  get: () => { try { return sessionStorage.getItem(KEY) } catch { return null } },
  set: (t: string) => { try { sessionStorage.setItem(KEY, t) } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } },
}

export class ApiError extends Error {
  status: number
  code: string
  details?: { field: string; message: string }[]
  constructor(status: number, code: string, message: string, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const t = tokenStore.get()
  if (t) headers.Authorization = `Bearer ${t}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && t && onUnauthorized) onUnauthorized()
    const d = data as { error?: string; message?: string; details?: ApiError['details'] } | null
    throw new ApiError(res.status, d?.error ?? 'error', d?.message ?? `Lỗi ${res.status}`, d?.details)
  }
  return data as T
}

export async function download(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` } })
  if (!res.ok) throw new ApiError(res.status, 'download', 'Không tải được tệp')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
