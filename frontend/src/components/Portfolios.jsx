import { useState } from 'react'
import AddPosition from './AddPosition.jsx'

const ALERT_DEFS = {
  TAKE_PROFIT: {
    icon: '💰', label: 'Take Profit', color: 'var(--green)',
    title: '50% Profit Target Reached',
    explain: "You've captured 50%+ of the maximum premium. Closing here improves annualized return — you free up capital for a new position sooner and eliminate late-expiry gamma risk.",
    action: 'Buy back this call at market and open a new position at a later expiry.',
  },
  ROLL_WARNING: {
    icon: '⏰', label: 'Roll Soon', color: 'var(--amber)',
    title: 'Approaching the 21-Day Danger Zone',
    explain: 'With ≤21 days to expiration, options enter the high-gamma zone. Small SPY moves cause large, fast option price moves. Risk/reward of holding degrades significantly past this point.',
    action: 'Roll: buy this back and sell a new call at the same or higher strike, targeting 30–45 DTE.',
  },
  GAMMA_DANGER: {
    icon: '🔥', label: 'Gamma Danger', color: 'var(--red)',
    title: 'Expiring in 7 Days or Less',
    explain: 'Highest-risk zone. Gamma is at peak — a 1% SPY move causes an outsized option swing with little time to react.',
    action: 'Close or roll immediately. Do not hold through expiration unless deeply OTM.',
  },
  STRIKE_BREACH: {
    icon: '🚨', label: 'Breach Risk', color: 'var(--red)',
    title: 'SPY Within 1.5% of Your Strike',
    explain: "SPY is close to your strike. If it closes above at expiration, your 600 shares get called away and you miss further upside.",
    action: 'Consider rolling up and out — buy back this call, sell a new one at a higher strike with a later expiry.',
  },
}

function alertTypes(pos) {
  const types = []
  if (pos.profit_capture_pct >= 50) types.push('TAKE_PROFIT')
  if (pos.dte <= 7) types.push('GAMMA_DANGER')
  else if (pos.dte <= 21) types.push('ROLL_WARNING')
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5 && pos.distance_to_strike_pct > 0) types.push('STRIKE_BREACH')
  return types
}

function AlertCard({ type }) {
  const [open, setOpen] = useState(false)
  const d = ALERT_DEFS[type]
  return (
    <div className="border text-xs mb-1 last:mb-0" style={{ borderColor: d.color + '40', backgroundColor: d.color + '0d' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
        style={{ color: d.color }}
      >
        <span>{d.icon}</span>
        <span className="font-semibold">{d.label}</span>
        <span className="ml-auto opacity-50 text-[10px]">{open ? '▲ less' : '▼ why?'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-1 border-t" style={{ borderColor: d.color + '30' }}>
          <div className="font-semibold" style={{ color: d.color }}>{d.title}</div>
          <p style={{ color: 'var(--muted)' }} className="leading-relaxed">{d.explain}</p>
          <p style={{ color: d.color }} className="leading-relaxed">→ {d.action}</p>
        </div>
      )}
    </div>
  )
}

export default function Portfolios({ positions, dashData, signalData, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [closing, setClosing] = useState(null)
  const [closePrice, setClosePrice] = useState('')

  const open = positions.filter(p => p.status === 'open')
  const closed = positions.filter(p => p.status === 'closed')
  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture = open.length
    ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length : 0

  async function handleClose(pos) {
    const price = parseFloat(closePrice)
    if (isNaN(price)) return
    await fetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed', close_price: price }),
    })
    setClosing(null)
    setClosePrice('')
    onRefresh()
  }

  async function handleDelete(id) {
    if (!confirm('Remove this position?')) return
    await fetch(`/api/positions/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const card = 'p-4 border'
  const cardStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Portfolios</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>All open covered call positions against your SPY holdings</p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-4 py-2 text-sm font-medium border transition-colors"
          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: showAdd ? 'var(--green)25' : 'transparent' }}
        >
          {showAdd ? '✕ Cancel' : '+ Add Position'}
        </button>
      </div>

      {showAdd && <AddPosition onAdded={() => { setShowAdd(false); onRefresh() }} />}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: String(open.length), sub: `${closed.length} closed`, color: 'var(--text)' },
          { label: 'Total Premium', value: `$${totalPremium.toLocaleString()}`, sub: 'collected', color: 'var(--green)' },
          { label: 'Unrealized P&L', value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, sub: 'if closed now', color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Avg Profit Capture', value: `${avgCapture.toFixed(1)}%`, sub: '50% = take-profit rule', color: 'var(--amber)' },
        ].map(s => (
          <div key={s.label} className={card} style={cardStyle}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="text-xl font-semibold font-mono" style={{ color: s.color }}>{s.value}</div>
            {s.sub && <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Open Positions */}
      <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Open Positions</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            As a call seller, you profit when the option loses value. Positive P&amp;L means the option has declined since you sold it.
          </p>
        </div>

        {open.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>No open positions</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {open.map(pos => {
              const alerts = alertTypes(pos)
              const pnlPos = (pos.pnl || 0) >= 0
              const isClosing = closing?.id === pos.id
              return (
                <div key={pos.id} className="px-5 py-4">
                  <div className="flex flex-wrap gap-4 items-start">
                    {/* Identity */}
                    <div className="flex items-center gap-3 min-w-[160px]">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                        style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}
                      >
                        {pos.ticker}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>${pos.strike} Call</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Expires {pos.expiry}</div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-6 text-sm flex-1">
                      {[
                        { label: 'DTE', value: `${pos.dte}d`, color: pos.dte <= 7 ? 'var(--red)' : pos.dte <= 21 ? 'var(--amber)' : 'var(--text)' },
                        { label: 'Contracts', value: `${pos.contracts} × 100`, color: 'var(--text)' },
                        { label: 'Sold At', value: `$${pos.sell_price?.toFixed(2)}`, color: 'var(--text)' },
                        { label: 'Current', value: `$${pos.current_price?.toFixed(2) ?? '—'}`, color: 'var(--text)' },
                        { label: 'P&L', value: `${pnlPos ? '+' : ''}$${pos.pnl?.toFixed(0)}`, color: pnlPos ? 'var(--green)' : 'var(--red)' },
                        { label: 'Captured', value: `${pos.profit_capture_pct?.toFixed(1)}%`, color: pos.profit_capture_pct >= 50 ? 'var(--green)' : 'var(--text)' },
                        { label: 'Distance', value: pos.distance_to_strike_pct != null ? `${pos.distance_to_strike_pct.toFixed(2)}%` : '—', color: pos.distance_to_strike_pct <= 1.5 ? 'var(--red)' : 'var(--text)' },
                      ].map(f => (
                        <div key={f.label}>
                          <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
                          <div className="font-mono font-semibold" style={{ color: f.color }}>{f.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {isClosing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number" step="0.01" placeholder="buy-back price"
                            value={closePrice} onChange={e => setClosePrice(e.target.value)}
                            className="w-28 px-2 py-1 text-xs font-mono border focus:outline-none"
                            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                          />
                          <button onClick={() => handleClose(pos)} className="text-sm" style={{ color: 'var(--green)' }}>✓</button>
                          <button onClick={() => setClosing(null)} className="text-sm" style={{ color: 'var(--muted)' }}>✗</button>
                        </div>
                      ) : (
                        <div className="flex gap-3 items-center">
                          <button onClick={() => { setClosing(pos); setClosePrice('') }} className="text-xs hover:underline" style={{ color: 'var(--amber)' }}>
                            Close position
                          </button>
                          <button onClick={() => handleDelete(pos.id)} className="text-xs" style={{ color: 'var(--muted)' }}>
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {alerts.length > 0 && (
                    <div className="mt-3 max-w-lg space-y-1">
                      {alerts.map(type => <AlertCard key={type} type={type} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Closed Positions */}
      {closed.length > 0 && (
        <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Closed Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  {['Strike', 'Expiry', 'Contracts', 'Sold At', 'Closed At', 'Final P&L', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map(pos => (
                  <tr key={pos.id} className="border-b opacity-50" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.strike}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.expiry}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.contracts}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.sell_price?.toFixed(2)}</td>
                    <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.close_price?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: (pos.final_pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {(pos.final_pnl || 0) >= 0 ? '+' : ''}${pos.final_pnl?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{pos.close_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
