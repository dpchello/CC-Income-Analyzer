'use client'
import { useState } from 'react'
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

export default function CalculatorWidget() {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [result, setResult] = useState<CalculatorResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const [email, setEmail] = useState('')
  const [waitlistDone, setWaitlistDone] = useState(false)

  const uses = getUses()
  const remaining = Math.max(0, FREE_USES - uses)

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
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <p className="text-2xl font-bold text-[var(--text)]">You&apos;ve used your free lookups</p>
        <p className="mt-2 text-[var(--muted)]">
          Sign up free to get unlimited calculator access plus full portfolio tracking.
        </p>
        {waitlistDone ? (
          <p className="mt-6 font-semibold text-[var(--green)]">
            You&apos;re on the list — check your inbox!
          </p>
        ) : (
          <form onSubmit={handleWaitlist} className="mt-6 flex gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--amber)] px-5 py-3 text-sm font-semibold text-black hover:opacity-90"
            >
              Notify me
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="panel mx-auto max-w-lg p-8">
      <h3 className="text-lg font-bold text-[var(--text)]">
        What could your portfolio earn?
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Enter any stock you own to see your monthly income estimate.
        {remaining < FREE_USES && (
          <span className="ml-1 text-[var(--amber)]">
            {remaining} free {remaining === 1 ? 'lookup' : 'lookups'} remaining today.
          </span>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)"
          maxLength={6}
          required
          className="w-36 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-mono text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
        />
        <input
          type="number"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="Shares owned"
          min={1}
          required
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--amber)] px-5 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '…' : 'Calculate'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-[var(--red)]">{error}</p>
      )}

      {result && (
        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5">
          <p className="text-sm text-[var(--muted)]">
            Estimated monthly income from {result.ticker}
          </p>
          <p className="mt-1 text-4xl font-bold text-[var(--green)]">
            ${result.monthly_estimate.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {result.annualized_yield_pct}% annualized · {result.contracts} contracts ·{' '}
            {result.expiry} expiry
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Sell the ${result.strike} call, collect ${result.mid?.toFixed(2)}/share
          </p>
          <a
            href={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'}
            className="mt-5 block w-full rounded-md bg-[var(--amber)] py-3 text-center text-sm font-semibold text-black hover:opacity-90"
          >
            Track your full portfolio free →
          </a>
        </div>
      )}
    </div>
  )
}
