import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('harvest-token'))
  const [ready, setReady] = useState(false)

  // Validate stored token on mount
  useEffect(() => {
    if (!token) { setReady(true); return }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser(data)
        else clearAuth()
      })
      .catch(() => clearAuth())
      .finally(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function clearAuth() {
    localStorage.removeItem('harvest-token')
    setToken(null)
    setUser(null)
  }

  function saveAuth(data) {
    localStorage.setItem('harvest-token', data.access_token)
    setToken(data.access_token)
    setUser({ user_id: data.user_id, email: data.email, tier: data.tier })
  }

  async function login(email, password) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Login failed')
    saveAuth(data)
  }

  async function signup(email, password) {
    const r = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.detail || 'Signup failed')
    saveAuth(data)
  }

  function logout() {
    clearAuth()
  }

  // apiFetch: drop-in fetch replacement that injects the Bearer token
  // and auto-logs out on 401
  const apiFetch = useCallback(async (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const r = await fetch(url, { ...opts, headers })
    if (r.status === 401) { clearAuth(); return r }
    return r
  }, [token])

  return (
    <AuthContext.Provider value={{ user, token, ready, login, signup, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
