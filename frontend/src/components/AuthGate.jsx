import { useState } from 'react'
import { useAuth } from '../auth.jsx'

export default function AuthGate() {
  const { login, signup } = useAuth()
  const [mode, setMode]       = useState('login')   // 'login' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') await login(email, password)
      else await signup(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnStyle = {
    width: '100%',
    padding: '11px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--green)',
    color: '#000',
    fontWeight: 600,
    fontSize: '14px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    transition: 'opacity 0.15s',
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '36px 32px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="text-2xl mb-1">🌾</div>
          <h1 className="font-bold text-xl tracking-tight" style={{ color: 'var(--text)' }}>
            Harvest
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your free account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--muted)' }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--muted)' }}
            >
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <p
              className="text-xs px-3 py-2 rounded"
              style={{
                color: 'var(--red, #ef4444)',
                backgroundColor: 'rgba(239,68,68,0.08)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} style={btnStyle}>
            {loading
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--green)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              padding: 0,
            }}
          >
            {mode === 'login' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--muted)', opacity: 0.5 }}>
          Free tier: 3 positions · 1 screener/day
        </p>
      </div>
    </div>
  )
}
