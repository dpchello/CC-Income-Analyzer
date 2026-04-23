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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 48 }}>
        <button onClick={() => setAnnual(false)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: !annual ? 'var(--fg)' : 'var(--fg-mute)', fontWeight: !annual ? 600 : 400,
        }}>Monthly</button>

        <button onClick={() => setAnnual(!annual)} style={{
          position: 'relative', width: 44, height: 24, borderRadius: 12,
          background: 'var(--acid)', border: 'none', cursor: 'pointer',
        }}>
          <span style={{
            position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10,
            background: '#faf8f3', transition: 'left 0.15s',
            left: annual ? 22 : 2,
          }} />
        </button>

        <button onClick={() => setAnnual(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: annual ? 'var(--fg)' : 'var(--fg-mute)', fontWeight: annual ? 600 : 400,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Annual
          <span className="chip chip-acid" style={{ height: 18, fontSize: 10 }}>Save $108</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', maxWidth: 880, margin: '0 auto' }}>
        {/* Free */}
        <div style={{ background: 'var(--bg)', padding: '40px 36px', display: 'flex', flexDirection: 'column' }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Free</div>
          <div className="num" style={{ fontSize: 48, color: 'var(--fg)', letterSpacing: '-0.03em', lineHeight: 1 }}>$0</div>
          <div style={{ color: 'var(--fg-mute)', fontSize: 12, marginTop: 6, fontFamily: 'var(--mono)' }}>forever</div>
          <a href={appUrl} className="btn" style={{ marginTop: 24, justifyContent: 'center' }}>
            Get started free
          </a>
          <ul style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10, padding: 0, listStyle: 'none' }}>
            {freeFeatures.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--fg-dim)' }}>
                <span style={{ color: 'var(--acid)', flexShrink: 0 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div style={{ background: 'var(--bg-elev)', padding: '40px 36px', display: 'flex', flexDirection: 'column', position: 'relative', borderLeft: '1px solid var(--acid-line)' }}>
          <div style={{
            position: 'absolute', top: -1, left: 36,
            background: 'var(--acid)', color: '#faf8f3',
            fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '3px 10px', borderRadius: '0 0 4px 4px',
          }}>Most popular</div>
          <div className="eyebrow" style={{ marginBottom: 16, color: 'var(--acid)' }}>Pro</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div className="num" style={{ fontSize: 48, color: 'var(--fg)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              ${annual ? '20' : '29'}
            </div>
            <div style={{ color: 'var(--fg-mute)', fontSize: 13, marginBottom: 6 }}>/month</div>
          </div>
          <div style={{ color: 'var(--fg-mute)', fontSize: 12, marginTop: 6, fontFamily: 'var(--mono)' }}>
            {annual ? 'Billed $240/year — save $108' : 'Billed monthly'}
          </div>
          <a href={`${appUrl}/upgrade`} className="btn btn-primary" style={{ marginTop: 24, justifyContent: 'center' }}>
            Start Pro
          </a>
          <ul style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10, padding: 0, listStyle: 'none' }}>
            {proFeatures.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--fg-dim)' }}>
                <span style={{ color: 'var(--acid)', flexShrink: 0 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--fg-faint)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        No credit card required for free tier · Cancel Pro anytime
      </p>
    </div>
  )
}
