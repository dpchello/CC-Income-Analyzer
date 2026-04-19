'use client'
import { useState } from 'react'

const freeFeatures = [
  'Track up to 3 positions',
  'Income estimates on all your holdings',
  '1 screener result per day',
  '7-day income history',
  'Plain-English recommendations',
]

const proFeatures = [
  'Unlimited positions',
  'Full screener — all daily results',
  '12-month income history + CSV export',
  'Roll recommendations (defensive, balanced, income)',
  'Early exercise risk signals',
  'Ex-dividend date alerts',
  'Tax context (short vs long-term impact)',
  'Email + push alerts',
  'Position scorecard',
]

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

export default function PricingTable() {
  const [annual, setAnnual] = useState(true)

  return (
    <div>
      {/* Billing toggle */}
      <div className="mb-10 flex items-center justify-center gap-4">
        <button
          onClick={() => setAnnual(false)}
          className={`text-sm font-medium transition-colors ${!annual ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(!annual)}
          className="relative h-6 w-11 rounded-full bg-[var(--amber)] transition-all"
          aria-label="Toggle billing period"
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all ${annual ? 'left-5' : 'left-0.5'}`}
          />
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={`text-sm font-medium transition-colors ${annual ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}
        >
          Annual
          <span className="ml-2 rounded-full bg-[var(--green)]/20 px-2 py-0.5 text-xs text-[var(--green)]">
            Save $108
          </span>
        </button>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 px-6 md:grid-cols-2">
        {/* Free */}
        <div className="panel flex flex-col p-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">Free</p>
          <p className="mt-3 text-4xl font-bold text-[var(--text)]">$0</p>
          <p className="mt-1 text-sm text-[var(--muted)]">forever</p>
          <a
            href={appUrl}
            className="mt-6 block w-full rounded-md border border-[var(--border)] py-3 text-center text-sm font-semibold text-[var(--text)] hover:border-[var(--amber)] hover:text-[var(--amber)] transition-colors"
          >
            Get started free
          </a>
          <ul className="mt-8 flex flex-col gap-3">
            {freeFeatures.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[var(--muted)]">
                <span className="mt-0.5 text-[var(--green)]">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="panel relative flex flex-col border-[var(--amber)] p-8" style={{ borderColor: 'var(--amber)' }}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--amber)] px-4 py-1 text-xs font-bold text-black">
            MOST POPULAR
          </div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--amber)]">Pro</p>
          <div className="mt-3 flex items-end gap-2">
            <p className="text-4xl font-bold text-[var(--text)]">
              ${annual ? '20' : '29'}
            </p>
            <p className="mb-1 text-sm text-[var(--muted)]">/month</p>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {annual ? 'Billed $240/year — save $108' : 'Billed monthly'}
          </p>
          <a
            href={`${appUrl}/upgrade`}
            className="mt-6 block w-full rounded-md bg-[var(--amber)] py-3 text-center text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            Start Pro
          </a>
          <ul className="mt-8 flex flex-col gap-3">
            {proFeatures.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-[var(--muted)]">
                <span className="mt-0.5 text-[var(--amber)]">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-10 text-center text-sm text-[var(--muted)]">
        No credit card required for free tier. Cancel Pro anytime.
      </p>
    </div>
  )
}
