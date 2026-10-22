import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api'
import type { User } from '../lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!tokenStore.get())
  const [sessionExpired, setExpired] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear()
      setUser(null)
      setExpired(true)
    })
    if (tokenStore.get()) {
      api<User>('/api/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false))
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>('/api/auth/login', { method: 'POST', body: { email, password } })
    tokenStore.set(r.access_token)
    setExpired(false)
    setUser(r.user)
    return r.user
  }, [])

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* token có thể đã hết hạn */ }
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, sessionExpired, login, logout }), [user, loading, sessionExpired, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth ngoài AuthProvider')
  return c
}
