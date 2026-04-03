import { useState } from 'react'
import AddPosition from './AddPosition.jsx'

const ALERT_DEFS = {
  TAKE_PROFIT: {
    icon: '💰',
    label: 'Take Profit',
    color: 'text-[#00ff88]',
    border: 'border-[#00ff88]/30',
    bg: 'bg-[#00ff88]/5',
    title: '50% Profit Target Reached',
    explain: "You've captured 50% or more of the maximum premium. Academic research shows closing here — rather than holding to expiration — improves annualized return because you free up capital for a new position sooner.",
    action: 'Buy back this call at market and open a new position at a later expiry.',
  },
  ROLL_WARNING: {
    icon: '⏰',
    label: 'Roll Soon',
    color: 'text-[#ffb020]',
    border: 'border-[#ffb020]/30',
    bg: 'bg-[#ffb020]/5',
    title: 'Approaching the 21-Day Danger Zone',
    explain: 'With ≤21 days to expiration, options enter the high-gamma zone. Small moves in SPY cause large, fast moves in your option\'s price. The risk/reward of holding degrades significantly.',
    action: 'Roll: buy this back and sell a new call at the same or higher strike, targeting 30–45 DTE.',
  },
  GAMMA_DANGER: {
    icon: '🔥',
    label: 'Gamma Danger',
    color: 'text-[#ff3d5a]',
    border: 'border-[#ff3d5a]/30',
    bg: 'bg-[#ff3d5a]/5',
    title: 'Expiring in 7 Days or Less',
    explain: 'You are in the highest-risk zone. Gamma is at peak — a 1% SPY move can cause an outsized swing in your option\'s value with little time to react.',
    action: 'Close or roll immediately. Do not hold through expiration unless deeply OTM.',
  },
  STRIKE_BREACH: {
    icon: '🚨',
    label: 'Breach Risk',
    color: 'text-[#ff3d5a]',
    border: 'border-[#ff3d5a]/30',
    bg: 'bg-[#ff3d5a]/5',
    title: 'SPY Within 1.5% of Your Strike',
    explain: "SPY is dangerously close to your strike. If SPY closes above it at expiration, your 600 shares get called away at the strike price and you miss further upside.",
    action: 'Consider rolling up and out — buy back this call and sell a new one at a higher strike with a later expiry.',
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

function AlertExpanded({ type }) {
  const [open, setOpen] = useState(false)
  const d = ALERT_DEFS[type]
  return (
    <div className={`border ${d.border} ${d.bg} text-xs mb-1 last:mb-0`}>
      <button onClick={() => setOpen(o => !o)} className={`w-full flex items-center gap-2 px-3 py-1.5 ${d.color} text-left`}>
        <span>{d.icon}</span>
        <span className="font-semibold">{d.label}</span>
        <span className="ml-auto opacity-50 text-[10px]">{open ? '▲ less' : '▼ why?'}</span>
      </button>
      {open && (
        <div className={`px-3 pb-3 border-t ${d.border} pt-2 space-y-1`}>
          <div className={`font-semibold text-xs ${d.color}`}>{d.title}</div>
          <p className="text-[#4a5568] leading-relaxed">{d.explain}</p>
          <p className={`${d.color} leading-relaxed`}>→ {d.action}</p>
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

  return (
    <div className="space-y-6">

      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Portfolios</h1>
          <p className="text-sm text-[#4a5568] mt-0.5">All open covered call positions against your SPY holdings</p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="px-4 py-2 text-sm font-medium border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors"
        >
          {showAdd ? '✕ Cancel' : '+ Add Position'}
        </button>
      </div>

      {/* ── Add Position Form ───────────────────────────────────── */}
      {showAdd && (
        <AddPosition onAdded={() => { setShowAdd(false); onRefresh() }} />
      )}

      {/* ── Summary Stats ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: open.length, sub: `${closed.length} closed` },
          { label: 'Total Premium', value: `$${totalPremium.toLocaleString()}`, sub: 'collected', green: true },
          { label: 'Unrealized P&L', value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, sub: 'if closed now', green: totalPnl >= 0, red: totalPnl < 0 },
          { label: 'Avg Profit Capture', value: `${avgCapture.toFixed(1)}%`, sub: '50% = take-profit rule', amber: true },
        ].map(s => (
          <div key={s.label} className="bg-[#0f1629] border border-[#1e2d4a] p-4">
            <div className="text-xs text-[#4a5568] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-xl font-semibold font-mono ${s.green ? 'text-[#00ff88]' : s.red ? 'text-[#ff3d5a]' : s.amber ? 'text-[#ffb020]' : 'text-white'}`}>
              {s.value}
            </div>
            {s.sub && <div className="text-xs text-[#4a5568] mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Open Positions ──────────────────────────────────────── */}
      <div className="bg-[#0f1629] border border-[#1e2d4a]">
        <div className="px-5 py-3 border-b border-[#1e2d4a]">
          <h2 className="text-sm font-semibold text-white">Open Positions</h2>
          <p className="text-xs text-[#4a5568] mt-0.5">
            As a call seller, you profit when the option loses value. Positive P&L means the option has declined since you sold it.
          </p>
        </div>

        {open.length === 0 ? (
          <div className="px-5 py-12 text-center text-[#4a5568] text-sm">No open positions</div>
        ) : (
          <div className="divide-y divide-[#1e2d4a]">
            {open.map(pos => {
              const alerts = alertTypes(pos)
              const pnlPos = (pos.pnl || 0) >= 0
              const isClosing = closing?.id === pos.id

              return (
                <div key={pos.id} className="px-5 py-4 hover:bg-white/[0.015]">
                  <div className="flex flex-wrap gap-4 items-start">

                    {/* Left: position identity */}
                    <div className="flex items-center gap-3 min-w-[160px]">
                      <div className="w-9 h-9 rounded-full bg-[#1e2d4a] flex items-center justify-center text-xs font-semibold text-[#4a9eff] shrink-0">
                        {pos.ticker}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">${pos.strike} Call</div>
                        <div className="text-xs text-[#4a5568]">Expires {pos.expiry}</div>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="flex flex-wrap gap-6 text-sm flex-1">
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">DTE</div>
                        <div className={`font-mono font-semibold ${pos.dte <= 7 ? 'text-[#ff3d5a]' : pos.dte <= 21 ? 'text-[#ffb020]' : 'text-[#c8d6e5]'}`}>
                          {pos.dte}d
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">Contracts</div>
                        <div className="font-mono text-[#c8d6e5]">{pos.contracts} × 100</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">Sold At</div>
                        <div className="font-mono text-[#c8d6e5]">${pos.sell_price?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">Current</div>
                        <div className="font-mono text-[#c8d6e5]">${pos.current_price?.toFixed(2) ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">P&amp;L</div>
                        <div className={`font-mono font-semibold ${pnlPos ? 'text-[#00ff88]' : 'text-[#ff3d5a]'}`}>
                          {pnlPos ? '+' : ''}${pos.pnl?.toFixed(0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">Captured</div>
                        <div className={`font-mono font-semibold ${pos.profit_capture_pct >= 50 ? 'text-[#00ff88]' : 'text-[#c8d6e5]'}`}>
                          {pos.profit_capture_pct?.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#4a5568] mb-0.5">Strike Distance</div>
                        <div className={`font-mono ${pos.distance_to_strike_pct <= 1.5 ? 'text-[#ff3d5a]' : 'text-[#c8d6e5]'}`}>
                          {pos.distance_to_strike_pct != null ? `${pos.distance_to_strike_pct.toFixed(2)}%` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {isClosing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="buy-back price"
                            value={closePrice}
                            onChange={e => setClosePrice(e.target.value)}
                            className="w-28 bg-[#0a0e1a] border border-[#1e2d4a] px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#4a9eff]"
                          />
                          <button onClick={() => handleClose(pos)} className="text-[#00ff88] text-sm hover:underline">✓</button>
                          <button onClick={() => setClosing(null)} className="text-[#4a5568] text-sm hover:text-white">✗</button>
                        </div>
                      ) : (
                        <div className="flex gap-3 items-center">
                          <button
                            onClick={() => { setClosing(pos); setClosePrice('') }}
                            className="text-xs text-[#ffb020] hover:underline"
                          >
                            Close position
                          </button>
                          <button onClick={() => handleDelete(pos.id)} className="text-xs text-[#4a5568] hover:text-[#ff3d5a]">Remove</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="mt-3 max-w-lg space-y-1">
                      {alerts.map(type => <AlertExpanded key={type} type={type} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Closed Positions ─────────────────────────────────────── */}
      {closed.length > 0 && (
        <div className="bg-[#0f1629] border border-[#1e2d4a]">
          <div className="px-5 py-3 border-b border-[#1e2d4a]">
            <h2 className="text-sm font-semibold text-white">Closed Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1e2d4a] text-[#4a5568]">
                  {['Strike', 'Expiry', 'Contracts', 'Sold At', 'Closed At', 'Final P&L', 'Date'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map(pos => (
                  <tr key={pos.id} className="border-b border-[#1e2d4a] opacity-50">
                    <td className="px-4 py-2">${pos.strike}</td>
                    <td className="px-4 py-2">{pos.expiry}</td>
                    <td className="px-4 py-2">{pos.contracts}</td>
                    <td className="px-4 py-2">${pos.sell_price?.toFixed(2)}</td>
                    <td className="px-4 py-2">${pos.close_price?.toFixed(2) ?? '—'}</td>
                    <td className={`px-4 py-2 font-semibold ${(pos.final_pnl || 0) >= 0 ? 'text-[#00ff88]' : 'text-[#ff3d5a]'}`}>
                      {(pos.final_pnl || 0) >= 0 ? '+' : ''}${pos.final_pnl?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-[#4a5568]">{pos.close_date ?? '—'}</td>
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
