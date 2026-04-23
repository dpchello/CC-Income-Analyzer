import type { Metadata } from 'next'
import Link from 'next/link'
import FaqAccordion from '@/components/FaqAccordion'
import CalculatorWidget from '@/components/CalculatorWidget'

export const metadata: Metadata = {
  title: 'Harvest — Income from the shares you already own',
  description:
    'Harvest scans your portfolio, models risk, and recommends covered calls sized to your positions. Ranked by expected yield, delta and event risk — never by commission.',
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

// Deterministic seeded path generator (matches handoff)
function genPath(n: number, start: number, vol: number, trend: number, seed: number): number[] {
  let s = seed
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  const out = [start]
  for (let i = 1; i < n; i++) {
    const step = (rand() - 0.5) * 2 * vol + trend
    out.push(Math.max(0.1, out[i - 1] * (1 + step)))
  }
  return out
}

function pointsToSVGD(points: number[], w: number, h: number, pad: number): string {
  const min = Math.min(...points) * 0.985
  const max = Math.max(...points) * 1.015
  const range = max - min || 1
  const plotW = w - pad * 2
  const plotH = h - pad * 2
  const step = plotW / (points.length - 1)
  return points.map((p, i) => {
    const x = (pad + i * step).toFixed(1)
    const y = (pad + plotH - ((p - min) / range) * plotH).toFixed(1)
    return (i === 0 ? 'M' : 'L') + x + ' ' + y
  }).join(' ')
}

function strikeY(strike: number, points: number[], h: number, pad: number): number {
  const min = Math.min(...points) * 0.985
  const max = Math.max(...points) * 1.015
  const range = max - min || 1
  const plotH = h - pad * 2
  return pad + plotH - ((strike - min) / range) * plotH
}

function areaD(points: number[], w: number, h: number, pad: number): string {
  const d = pointsToSVGD(points, w, h, pad)
  const plotW = w - pad * 2
  const plotH = h - pad * 2
  const lastX = (pad + plotW).toFixed(1)
  const baseY = (pad + plotH).toFixed(1)
  return `${d} L${lastX} ${baseY} L${pad} ${baseY} Z`
}

function MockTerminal() {
  const path = genPath(120, 182, 0.008, 0.0012, 14)
  const W = 340, H = 160, PAD = 18
  const strike = 200
  const sy = strikeY(strike, path, H, PAD)
  const d = pointsToSVGD(path, W, H, PAD)
  const ad = areaD(path, W, H, PAD)

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--line-strong)',
      borderRadius: 4,
      padding: 20,
      fontFamily: 'var(--mono)',
      fontSize: 11,
      color: 'var(--fg-dim)',
      boxShadow: '0 30px 80px rgba(24,28,20,0.12), 0 0 0 1px var(--acid-faint)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ color: 'var(--fg)', fontSize: 12, fontWeight: 500 }}>AAPL · 400 sh</div>
        <div className="chip chip-acid" style={{ height: 20 }}>Recommendation · High</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div>
          <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
            {/* grid lines */}
            {[0.25, 0.5, 0.75, 1].map((t, i) => (
              <line key={i} x1={PAD} x2={W - PAD} y1={PAD + (H - PAD * 2) * (1 - t)} y2={PAD + (H - PAD * 2) * (1 - t)}
                stroke="var(--line-soft)" strokeWidth="1" />
            ))}
            {/* strike line */}
            {sy > PAD && sy < H - PAD && (
              <g>
                <line x1={PAD} x2={W - PAD} y1={sy} y2={sy} stroke="var(--acid)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                <text x={PAD + 4} y={sy - 3} fontSize="9" fill="var(--acid)" fontFamily="var(--mono)">STRIKE $200</text>
              </g>
            )}
            {/* area fill */}
            <path d={ad} fill="var(--acid)" opacity="0.06" />
            {/* line */}
            <path d={d} fill="none" stroke="var(--acid)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            {/* x labels */}
            {['Jan', 'Feb', 'Mar', 'Apr'].map((l, i, a) => (
              <text key={l} x={PAD + (i * (W - PAD * 2)) / (a.length - 1)} y={H - 4}
                fontSize="9" fill="var(--fg-faint)" fontFamily="var(--mono)"
                textAnchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}>{l}</text>
            ))}
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { k: 'Action', v: 'Sell 4× call', acid: false },
            { k: 'Strike', v: '$200', acid: false },
            { k: 'Expiry', v: 'May 16', acid: false },
            { k: 'Premium', v: '$980', acid: true },
            { k: 'Ann. yield', v: '18.4%', acid: false },
            { k: 'PoP', v: '72%', acid: false },
          ].map(({ k, v, acid }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 9.5 }}>{k}</span>
              <span style={{ color: acid ? 'var(--acid)' : 'var(--fg)', fontSize: 11 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', color: 'var(--fg-mute)', lineHeight: 1.55, fontSize: 10.5 }}>
        IV rank 28 · $200 strike sits above 1σ range and prior rejection. No earnings pre-expiry.
      </div>
    </div>
  )
}

const TICKERS = [
  { s: 'AAPL', v: '+1.18%', up: true }, { s: 'MSFT', v: '-0.42%', up: false },
  { s: 'NVDA', v: '+2.81%', up: true }, { s: 'GOOG', v: '+0.61%', up: true },
  { s: 'AMD', v: '+0.94%', up: true }, { s: 'META', v: '+1.42%', up: true },
  { s: 'TSLA', v: '-1.80%', up: false }, { s: 'F', v: '-0.78%', up: false },
  { s: 'SOFI', v: '+2.12%', up: true }, { s: 'INTC', v: '+0.34%', up: true },
  { s: 'COIN', v: '+3.40%', up: true }, { s: 'KO', v: '+0.18%', up: true },
]

function TickerStrip() {
  const items = [...TICKERS, ...TICKERS]
  return (
    <div style={{
      borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
      padding: '12px 0', background: 'var(--bg-elev)', overflow: 'hidden',
    }}>
      <div className="ticker-track" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
        {items.map((t, i) => (
          <span key={i} style={{ marginRight: 36, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--fg)' }}>{t.s}</span>{' '}
            <span style={{ color: t.up ? 'var(--acid)' : 'var(--down)' }}>{t.v}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const FEATURES = [
  {
    n: '01', t: 'Your portfolio. Read-only.',
    c: 'Import from 12 brokers or upload a CSV. Harvest never places trades or sees your credentials — we read holdings via Plaid Investments and SnapTrade.',
    acc: 'Supported: Fidelity, Schwab, Robinhood, IBKR, E*TRADE, Vanguard, Public, Webull, tastytrade, M1, Merrill, and JP Morgan.',
  },
  {
    n: '02', t: 'Recommendations under each position.',
    c: 'Open any ticker to see a ranked list of covered-call candidates. Each idea shows premium, annualized yield, probability of profit, and a short thesis you can read in 15 seconds.',
    acc: 'Filtered for IV rank, delta band, DTE, earnings, ex-dividend, and assignment probability.',
  },
  {
    n: '03', t: 'The screener finds ideas you don\'t own.',
    c: 'Plot premium against yield, filter by delta, DTE, or sector. Add a ticker to your watchlist and Harvest will monitor its IV rank and alert when a defined setup triggers.',
    acc: 'Presets for wheel starters, high-IV income, and low-delta conservatives.',
  },
  {
    n: '04', t: 'A journal of every trade you\'ve made.',
    c: 'Every open, roll, close, and assignment is captured. See realized yield by ticker, expiry, and outcome. Export to CSV or Form 8949 at year-end.',
    acc: 'Outcome tags: expired, closed-early, rolled, assigned, called-away. Filter by any.',
  },
]

const METHODOLOGY = ['IV rank', 'Delta band', 'Days-to-expiry', 'Earnings distance', 'Ex-div distance', 'Historical assignment', 'Concentration cap']

export default function HomePage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="grain" style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ padding: '120px 36px 0', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div className="hidden md:grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 80, alignItems: 'center' }}>
            {/* Left */}
            <div>
              <div className="eyebrow" style={{ marginBottom: 24, display: 'flex', alignItems: 'center' }}>
                <span className="dot" />Covered-call platform · v2.4
              </div>
              <h1 className="display" style={{
                fontSize: 'clamp(48px, 5vw, 68px)', fontWeight: 500, lineHeight: 0.98,
                letterSpacing: '-0.035em', margin: 0, color: 'var(--fg)',
              }}>
                Income from the{' '}
                <span style={{ color: 'var(--acid)' }}>shares</span>
                <br />you already own.
              </h1>
              <p style={{ fontSize: 17, color: 'var(--fg-dim)', marginTop: 24, maxWidth: 480, lineHeight: 1.55 }}>
                Harvest scans your portfolio, models risk, and recommends covered calls sized to your
                positions. Ranked by expected yield, delta and event risk — never by commission.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
                <a href={appUrl} className="btn btn-primary btn-lg">Connect a portfolio</a>
                <Link href="/how-it-works" className="btn btn-lg">See the screener →</Link>
              </div>
              <div style={{
                display: 'flex', gap: 28, marginTop: 48, color: 'var(--fg-mute)',
                fontSize: 12, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
                flexWrap: 'wrap',
              }}>
                <span>✓ Read-only by default</span>
                <span>✓ No trade commissions</span>
                <span>✓ Imports from 12 brokers</span>
              </div>
            </div>
            {/* Right */}
            <div style={{ position: 'relative' }}>
              <MockTerminal />
            </div>
          </div>

          {/* Mobile hero */}
          <div className="md:hidden" style={{ textAlign: 'center' }}>
            <div className="eyebrow" style={{ marginBottom: 20, display: 'inline-flex', alignItems: 'center' }}>
              <span className="dot" />Covered-call platform
            </div>
            <h1 className="display" style={{ fontSize: 44, fontWeight: 500, lineHeight: 1.0, letterSpacing: '-0.035em', color: 'var(--fg)' }}>
              Income from the{' '}
              <span style={{ color: 'var(--acid)' }}>shares</span>{' '}
              you already own.
            </h1>
            <p style={{ fontSize: 16, color: 'var(--fg-dim)', marginTop: 20, lineHeight: 1.55 }}>
              Harvest recommends covered calls sized to your positions — ranked by yield, not commission.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28, alignItems: 'center' }}>
              <a href={appUrl} className="btn btn-primary btn-lg" style={{ width: '100%', maxWidth: 320, justifyContent: 'center' }}>Connect a portfolio</a>
              <Link href="/how-it-works" className="btn btn-lg" style={{ width: '100%', maxWidth: 320, justifyContent: 'center' }}>See the screener →</Link>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 96 }}>
          <TickerStrip />
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 1100, margin: '0 auto' }}>
          {[
            { v: '$12,840', l: 'yield captured', sub: 'past 90 days', acc: true },
            { v: '14.2%', l: 'avg. annualized', sub: 'per position' },
            { v: '6 of 48', l: 'assignments', sub: '12.5% rate' },
            { v: 'May 16', l: 'next expiry', sub: '4 contracts' },
          ].map(({ v, l, sub, acc }) => (
            <div key={l} style={{ padding: '32px 28px', borderRight: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{l}</div>
              <div className="num" style={{ fontSize: 32, fontWeight: 500, color: acc ? 'var(--acid)' : 'var(--fg)', letterSpacing: '-0.025em' }}>{v}</div>
              <div style={{ color: 'var(--fg-mute)', fontSize: 12, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features 2×2 ── */}
      <section style={{ padding: '120px 36px', borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>How Harvest works</div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 4vw, 52px)', margin: 0, letterSpacing: '-0.035em', fontWeight: 500, maxWidth: 800 }}>
            Four surfaces. Built for the long-term shareholder who wants the shares to keep working.
          </h2>
          <div style={{ marginTop: 72, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)' }}>
            {FEATURES.map((f) => (
              <div key={f.n} style={{ background: 'var(--bg)', padding: '44px 40px' }}>
                <div className="num" style={{ fontSize: 13, color: 'var(--acid)', marginBottom: 32 }}>{f.n}</div>
                <div style={{ fontSize: 24, color: 'var(--fg)', letterSpacing: '-0.02em', marginBottom: 14, fontWeight: 500 }}>{f.t}</div>
                <p style={{ color: 'var(--fg-dim)', fontSize: 14.5, lineHeight: 1.6, maxWidth: 480, margin: 0 }}>{f.c}</p>
                <p style={{ color: 'var(--fg-mute)', fontSize: 12, lineHeight: 1.5, marginTop: 16, fontFamily: 'var(--mono)', marginBottom: 0 }}>{f.acc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Methodology ── */}
      <section style={{ padding: '96px 36px', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 20 }}>Methodology</div>
              <h3 className="display" style={{ fontSize: 36, letterSpacing: '-0.025em', fontWeight: 500, margin: 0, lineHeight: 1.1 }}>
                Every recommendation carries a thesis, a risk score, and a clear exit plan.
              </h3>
              <p style={{ color: 'var(--fg-dim)', fontSize: 15, marginTop: 20, lineHeight: 1.6 }}>
                We score each candidate on seven axes: IV rank, delta band, days-to-expiration, earnings distance,
                ex-dividend distance, historical assignment rate, and portfolio concentration. The weights are public.
              </p>
              <a href={appUrl} style={{
                display: 'inline-block', marginTop: 24, color: 'var(--acid)', fontSize: 13,
                borderBottom: '1px solid var(--acid-line)', paddingBottom: 2,
              }}>Read the methodology →</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {METHODOLOGY.map((x) => (
                <div key={x} style={{ border: '1px solid var(--line)', padding: '14px 16px', fontSize: 13, color: 'var(--fg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 2 }}>
                  <span>{x}</span>
                  <span className="eyebrow">weight</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section style={{ padding: '96px 36px', borderTop: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="eyebrow" style={{ marginBottom: 16, textAlign: 'center' }}>Income calculator</div>
          <h2 className="display" style={{ fontSize: 40, letterSpacing: '-0.03em', fontWeight: 500, textAlign: 'center', margin: '0 0 12px' }}>
            See what your portfolio could earn
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--fg-dim)', marginBottom: 48, fontSize: 15 }}>
            Enter any stock you own. We&apos;ll show you the monthly income estimate — free.
          </p>
          <CalculatorWidget />
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '120px 36px', borderTop: '1px solid var(--line)', background: 'var(--bg-elev)', position: 'relative', overflow: 'hidden' }} className="grain">
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h3 className="display" style={{ fontSize: 'clamp(40px, 4.5vw, 60px)', letterSpacing: '-0.035em', fontWeight: 500, margin: 0, lineHeight: 1, color: 'var(--fg)' }}>
              Start with a<br />read-only portfolio.
            </h3>
            <p style={{ color: 'var(--fg-dim)', fontSize: 16, marginTop: 24, maxWidth: 480, lineHeight: 1.6 }}>
              Connect your broker in under a minute. Harvest will surface the first batch of
              recommendations as soon as the import finishes.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <a href={appUrl} className="btn btn-primary btn-lg">Connect a portfolio</a>
              <Link href="/how-it-works" className="btn btn-lg">Book a walkthrough</Link>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg-mute)', lineHeight: 2.0 }}>
            <div>→ 1. Link broker (read-only)</div>
            <div>→ 2. Harvest imports positions</div>
            <div>→ 3. See ranked ideas in 60s</div>
            <div>→ 4. Review the thesis per trade</div>
            <div>→ 5. Place orders in your broker</div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FaqAccordion />

      {/* ── Final CTA ── */}
      <section style={{ padding: '96px 36px', borderTop: '1px solid var(--line)', textAlign: 'center' }}>
        <h2 className="display" style={{ fontSize: 'clamp(32px, 3.5vw, 48px)', letterSpacing: '-0.03em', fontWeight: 500, color: 'var(--fg)' }}>
          Start collecting income<br />from your portfolio
        </h2>
        <p style={{ color: 'var(--fg-dim)', marginTop: 16, fontSize: 15 }}>
          Free to start. No credit card. No options experience needed.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={appUrl} className="btn btn-primary btn-lg">Connect a portfolio</a>
          <Link href="/calculator" className="btn btn-lg">Try the calculator →</Link>
        </div>
        <p style={{ marginTop: 20, color: 'var(--fg-faint)', fontSize: 12, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Read-only · No commissions · Cancel anytime
        </p>
      </section>
    </>
  )
}
