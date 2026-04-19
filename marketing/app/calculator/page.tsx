import type { Metadata } from 'next'
import CalculatorWidget from '@/components/CalculatorWidget'

export const metadata: Metadata = {
  title: 'Covered Call Income Calculator — Harvest',
  description:
    'Free covered call income calculator. Enter any stock ticker and number of shares to see your estimated monthly and annualized income from selling covered calls.',
  keywords: ['covered call calculator', 'covered call income calculator', 'options income calculator'],
}

export default function CalculatorPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-[var(--text)]">
          Covered Call Income Calculator
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
          Enter any stock you own to see your estimated monthly income from selling covered calls.
          No login required — just a ticker and your share count.
        </p>
      </div>

      <CalculatorWidget />

      <div className="mx-auto mt-16 max-w-2xl">
        <h2 className="mb-6 text-xl font-bold text-[var(--text)]">How the estimate works</h2>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-[var(--muted)]">
          <p>
            Harvest finds the nearest 20–40 day option expiry for your stock and identifies the
            0.20–0.25 delta call — the strike that income-focused traders typically use. This strike
            gives you a good balance between premium collected and the probability your shares won&apos;t
            be called away.
          </p>
          <p>
            The monthly estimate multiplies the option&apos;s current bid-ask midpoint by your number of
            contracts (1 contract = 100 shares). It uses live market data so the estimate reflects
            current implied volatility — higher volatility means higher premiums.
          </p>
          <p>
            This is an estimate, not a guarantee. Actual premiums change daily with market conditions.
            Harvest Pro tracks your real trades and shows you actual income collected over time.
          </p>
        </div>
      </div>
    </div>
  )
}
