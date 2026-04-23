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
    <div style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto 64px', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Income calculator</div>
        <h1 className="display" style={{ fontSize: 52, letterSpacing: '-0.035em', fontWeight: 500, color: 'var(--fg)', margin: '0 0 16px' }}>
          Covered call income calculator
        </h1>
        <p style={{ color: 'var(--fg-dim)', fontSize: 15, margin: 0 }}>
          Enter any stock you own to see your estimated monthly income from selling covered calls.
          No login required — just a ticker and your share count.
        </p>
      </div>

      <CalculatorWidget />

      <div style={{ maxWidth: 640, margin: '80px auto 0', borderTop: '1px solid var(--line)', paddingTop: 64 }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>How the estimate works</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            'Harvest finds the nearest 20–40 day option expiry for your stock and identifies the 0.20–0.25 delta call — the strike that income-focused traders typically use. This strike gives you a good balance between premium collected and the probability your shares won\'t be called away.',
            'The monthly estimate multiplies the option\'s current bid-ask midpoint by your number of contracts (1 contract = 100 shares). It uses live market data so the estimate reflects current implied volatility — higher volatility means higher premiums.',
            'This is an estimate, not a guarantee. Actual premiums change daily with market conditions. Harvest Pro tracks your real trades and shows you actual income collected over time.',
          ].map((p, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-dim)', margin: 0 }}>{p}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
