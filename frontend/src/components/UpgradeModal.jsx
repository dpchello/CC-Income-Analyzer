import { useState } from 'react'

const FREE_FEATURES = [
  '3 positions tracked',
  '1 screener run per day',
  '7-day history',
  'Covered call calculator',
]

const PRO_FEATURES = [
  'Unlimited positions',
  'Unlimited screener runs',
  '12-month history + CSV export',
  'Roll targets & early exercise signals',
  'Execution scorecard',
  'OI chain access',
  'Tax context & P&L summary',
  'Email & push alerts',
]

export default function UpgradeModal({ onClose, triggerReason }) {
  const [billing, setBilling] = useState('annual')

  const price = billing === 'annual' ? '$20/mo' : '$29/mo'
  const subtext = billing === 'annual' ? 'billed $240/year' : 'billed monthly'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-bold text-xl" style={{ color: 'var(--text)' }}>
              Upgrade to Pro
            </h2>
            {triggerReason && (
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {triggerReason}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Billing toggle */}
        <div
          className="flex gap-1 p-1 mb-6"
          style={{
            backgroundColor: 'var(--bg)',
            borderRadius: 'var(--radius-sm)',
            width: 'fit-content',
          }}
        >
          {['annual', 'monthly'].map(b => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className="text-xs px-3 py-1.5 font-medium capitalize"
              style={{
                background: billing === b ? 'var(--surface)' : 'transparent',
                color: billing === b ? 'var(--text)' : 'var(--muted)',
                border: billing === b ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              {b}{b === 'annual' && (
                <span
                  className="ml-1.5 text-xs px-1 py-0.5 font-semibold"
                  style={{
                    background: 'rgba(255,176,32,0.15)',
                    color: 'var(--amber, #ffb020)',
                    borderRadius: 3,
                  }}
                >
                  Save 31%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Pricing */}
        <div className="mb-6">
          <span className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{price}</span>
          <span className="text-sm ml-2" style={{ color: 'var(--muted)' }}>{subtext}</span>
        </div>

        {/* Feature comparison */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>FREE</p>
            {FREE_FEATURES.map(f => (
              <div key={f} className="flex items-start gap-2 mb-1.5">
                <span className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>–</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{f}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--green)' }}>PRO</p>
            {PRO_FEATURES.map(f => (
              <div key={f} className="flex items-start gap-2 mb-1.5">
                <span className="text-xs mt-0.5" style={{ color: 'var(--green)' }}>✓</span>
                <span className="text-xs" style={{ color: 'var(--text)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--green)',
            color: '#000',
            fontWeight: 700,
            fontSize: 14,
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >
          Start Pro — {price}
        </button>

        <p className="text-center text-xs mt-3" style={{ color: 'var(--muted)' }}>
          Cancel anytime. No tricks, no lock-in.
        </p>
      </div>
    </div>
  )
}
