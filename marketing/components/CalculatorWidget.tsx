'use client'
import { useState, useEffect } from 'react'
import { fetchIncomeEstimate, type CalculatorResult } from '@/lib/calculator'

const FREE_USES = 3
const STORAGE_KEY = 'harvest_calc_uses'

function getUses(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const { count, date } = JSON.parse(raw)
    if (date !== new Date().toISOString().slice(0, 10)) return 0
    return count
  } catch {
    return 0
  }
}

function incrementUses() {
  if (typeof window === 'undefined') return
  const today = new Date().toISOString().slice(0, 10)
  const count = getUses() + 1
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, date: today }))
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

export default function CalculatorWidget() {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [result, setResult] = useState<CalculatorResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [email, setEmail] = useState('')
  const [waitlistDone, setWaitlistDone] = useState(false)

  const [remaining, setRemaining] = useState(FREE_USES)
  useEffect(() => { setRemaining(Math.max(0, FREE_USES - getUses())) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!ticker || !shares) return
    setLoading(true)
    setError('')
    setResult(null)

    const { result: res, error: err, status } = await fetchIncomeEstimate(ticker, Number(shares))

    if (status === 429) {
      setLimitReached(true)
    } else if (status === 400) {
      setError(
        typeof err === 'object' && err !== null
          ? (err as { detail?: string }).detail || 'Invalid input'
          : 'Invalid input'
      )
    } else if (err || !res) {
      setError('Could not fetch market data. Try again in a moment.')
    } else {
      incrementUses()
      setResult(res)
    }
    setLoading(false)
  }

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setWaitlistDone(true)
  }

  if (limitReached) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--line-strong)', borderRadius: 4,
        padding: '40px 36px', textAlign: 'center', maxWidth: 520, margin: '0 auto',
      }}>
        <div className="display" style={{ fontSize: 22, color: 'var(--fg)', marginBottom: 8 }}>
          You&apos;ve used your free lookups
        </div>
        <p style={{ color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1.6 }}>
          Sign up free to get unlimited calculator access plus full portfolio tracking.
        </p>
        {waitlistDone ? (
          <p style={{ marginTop: 24, fontWeight: 600, color: 'var(--acid)', fontSize: 14 }}>
            You&apos;re on the list — check your inbox!
          </p>
        ) : (
          <form onSubmit={handleWaitlist} style={{ display: 'flex', gap: 8, marginTop: 24 }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={inputStyle} />
            <button type="submit" className="btn btn-primary">Notify me</button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--line-strong)', borderRadius: 4, padding: '32px 36px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div className="display" style={{ fontSize: 18, color: 'var(--fg)', marginBottom: 4 }}>
          What could your portfolio earn?
        </div>
        <p style={{ color: 'var(--fg-mute)', fontSize: 13, margin: 0 }}>
          Enter any stock you own to see your monthly income estimate.
          {remaining < FREE_USES && (
            <span style={{ color: 'var(--acid)', marginLeft: 4 }}>
              {remaining} free {remaining === 1 ? 'lookup' : 'lookups'} remaining today.
            </span>
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)" maxLength={6} required
          style={{ ...inputStyle, width: 140, fontFamily: 'var(--mono)', textTransform: 'uppercase' }} />
        <input type="number" value={shares} onChange={(e) => setShares(e.target.value)}
          placeholder="Shares owned" min={1} required
          style={{ ...inputStyle, flex: 1 }} />
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
          {loading ? '…' : 'Calculate'}
        </button>
      </form>

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--down)' }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="eyebrow">Estimated monthly income · {result.ticker}</div>
            {result.price != null && (
              <span className="eyebrow" style={{ fontSize: 10 }}>
                ${result.price.toLocaleString()} / share
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div className="num" style={{ fontSize: 48, color: 'var(--acid)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              ${result.monthly_estimate.toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: 16, paddingBottom: 4 }}>
              <div style={{ textAlign: 'center', paddingLeft: 10 }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>Monthly yield</div>
                <div className="num" style={{ fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
                  {(result.annualized_yield_pct / 12).toFixed(2)}%
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 16, textAlign: 'center' }}>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>Annualized</div>
                <div className="num" style={{ fontSize: 18, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
                  {result.annualized_yield_pct}%
                </div>
              </div>
            </div>
          </div>
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 14 }}>
            Sell the ${result.strike} call, collect ${result.mid?.toFixed(2)}/share · {result.contracts} contract{result.contracts !== 1 ? 's' : ''} · {result.expiry} expiry
          </div>
          <a href={appUrl} className="btn btn-primary" style={{ display: 'flex', justifyContent: 'center', marginTop: 20, height: 40 }}>
            Track your full portfolio free →
          </a>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  border: '1px solid var(--line-strong)',
  borderRadius: 4,
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontSize: 13,
  outline: 'none',
}
