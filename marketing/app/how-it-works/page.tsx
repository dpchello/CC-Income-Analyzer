import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How It Works — Harvest',
  description: 'Learn how Harvest turns your existing stocks into monthly income through covered calls. Three simple steps, no options experience needed.',
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

const steps = [
  {
    n: '01',
    t: 'Add your stocks',
    body: [
      'Enter any stock you own with 100 or more shares — AAPL, SPY, MSFT, QQQ, anything with an active options market. Harvest doesn\'t need your brokerage login. Just the ticker and share count.',
      'Once entered, Harvest shows you the income potential for each holding: the estimated monthly premium, current market conditions, and whether now is a good time to sell.',
    ],
  },
  {
    n: '02',
    t: 'See your income estimate',
    body: [
      'Harvest pulls live options market data and calculates what your specific holdings could earn this month. It finds the 0.20–0.25 delta call — the strike income-focused traders use — and shows you the premium in plain dollar terms.',
      'You\'ll see your total portfolio income estimate, broken down by position, plus a market conditions gauge that tells you whether conditions favor selling premium right now.',
    ],
  },
  {
    n: '03',
    t: 'Follow the recommendation',
    body: [
      'Harvest generates one plain-English recommendation per open position: "Sell the AAPL $195 call expiring May 16 — collect $312."',
      'No Greeks. No jargon. Just the trade. Execute it in your brokerage in about 60 seconds. Pro users also get roll recommendations when a position needs attention, early exercise warnings before ex-dividend dates, and tax context for each trade.',
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div style={{ padding: '96px 36px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>How it works</div>
        <h1 className="display" style={{ fontSize: 52, letterSpacing: '-0.035em', fontWeight: 500, color: 'var(--fg)', margin: '0 0 16px' }}>
          Three steps.<br />No experience required.
        </h1>
        <p style={{ color: 'var(--fg-dim)', fontSize: 15, margin: '0 0 80px', lineHeight: 1.6 }}>
          Start collecting income from your existing stocks this month.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {steps.map(({ n, t, body }, i) => (
            <div key={n} style={{
              display: 'grid', gridTemplateColumns: '64px 1fr', gap: 32,
              paddingBottom: 64, borderBottom: i < steps.length - 1 ? '1px solid var(--line)' : 'none',
              marginBottom: i < steps.length - 1 ? 64 : 0,
            }}>
              <div className="num" style={{ fontSize: 40, fontWeight: 500, color: 'var(--acid)', opacity: 0.3, lineHeight: 1 }}>{n}</div>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 500, color: 'var(--fg)', margin: '0 0 20px', letterSpacing: '-0.02em' }}>{t}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {body.map((p, j) => (
                    <p key={j} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--fg-dim)', margin: 0 }}>{p}</p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 80, background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 4, padding: '40px 36px', textAlign: 'center' }}>
          <h3 className="display" style={{ fontSize: 28, letterSpacing: '-0.025em', fontWeight: 500, color: 'var(--fg)', margin: '0 0 10px' }}>
            Ready to start?
          </h3>
          <p style={{ fontSize: 14, color: 'var(--fg-dim)', margin: '0 0 28px' }}>
            Free to start. No credit card. See your first income estimate in 2 minutes.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={appUrl} className="btn btn-primary btn-lg">Get Harvest free →</a>
            <Link href="/calculator" className="btn btn-lg">Try the calculator first</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
