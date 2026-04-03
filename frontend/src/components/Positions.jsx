import { useState } from 'react'

function AlertBadge({ pos }) {
  const badges = []

  if (pos.profit_capture_pct >= 50) {
    badges.push(
      <span key="tp" className="pulse-green text-xs font-mono px-1 py-0.5 border border-terminal-green text-terminal-green bg-terminal-green/10">
        💰 TAKE PROFIT
      </span>
    )
  }
  if (pos.dte !== null && pos.dte <= 7) {
    badges.push(
      <span key="gd" className="pulse-red text-xs font-mono px-1 py-0.5 border border-terminal-red text-terminal-red bg-terminal-red/10">
        🔥 GAMMA DANGER
      </span>
    )
  } else if (pos.dte !== null && pos.dte <= 21) {
    badges.push(
      <span key="rn" className="text-xs font-mono px-1 py-0.5 border border-terminal-amber text-terminal-amber bg-terminal-amber/10">
        ⏰ ROLL NOW
      </span>
    )
  }
  if (pos.distance_to_strike_pct !== null && pos.distance_to_strike_pct <= 1.5 && pos.distance_to_strike_pct > 0) {
    badges.push(
      <span key="br" className="pulse-red text-xs font-mono px-1 py-0.5 border border-terminal-red text-terminal-red bg-terminal-red/10">
        🚨 BREACH RISK
      </span>
    )
  }

  return badges.length > 0 ? <div className="flex flex-wrap gap-1">{badges}</div> : <span className="text-terminal-muted text-xs">—</span>
}

export default function Positions({ positions, onRefresh }) {
  const [closing, setClosing] = useState(null)
  const [closePrice, setClosePrice] = useState('')

  const open = positions.filter(p => p.status === 'open')
  const closed = positions.filter(p => p.status === 'closed')

  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture = open.length ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length : 0

  async function handleClose(pos) {
    const price = parseFloat(closePrice)
    if (isNaN(price)) return
    await fetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed', close_price: price, close_date: new Date().toISOString().slice(0, 10) }),
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
    <div className="space-y-4">
      {/* Open Positions */}
      <div className="panel">
        <div className="px-4 py-2 border-b border-terminal-border text-xs font-mono text-terminal-muted uppercase tracking-wider">
          Open Positions ({open.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-terminal-border text-terminal-muted">
                {['Symbol', 'Strike', 'Expiry', 'DTE', 'Contracts', 'Sold @', 'Current', 'P&L $', 'P&L %', 'Profit%', 'Distance', 'Alert', 'Action'].map(h => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.map(pos => {
                const pnlPositive = (pos.pnl || 0) >= 0
                const isClosing = closing?.id === pos.id
                return (
                  <tr key={pos.id} className="border-b border-terminal-border hover:bg-white/5">
                    <td className="px-3 py-2 text-terminal-blue">{pos.ticker}</td>
                    <td className="px-3 py-2 text-white font-semibold">${pos.strike}</td>
                    <td className="px-3 py-2">{pos.expiry}</td>
                    <td className={`px-3 py-2 font-semibold ${pos.dte <= 7 ? 'text-terminal-red' : pos.dte <= 21 ? 'text-terminal-amber' : 'text-terminal-text'}`}>
                      {pos.dte}d
                    </td>
                    <td className="px-3 py-2">{pos.contracts}</td>
                    <td className="px-3 py-2">${pos.sell_price?.toFixed(2)}</td>
                    <td className="px-3 py-2">${pos.current_price?.toFixed(2) ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pnlPositive ? '+' : ''}${pos.pnl?.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pnlPositive ? '+' : ''}{pos.pnl_pct?.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 font-semibold ${(pos.profit_capture_pct || 0) >= 50 ? 'text-terminal-green' : 'text-terminal-text'}`}>
                      {pos.profit_capture_pct?.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2">
                      {pos.distance_to_strike_pct != null
                        ? <span className={pos.distance_to_strike_pct <= 1.5 ? 'text-terminal-red' : 'text-terminal-muted'}>
                            {pos.distance_to_strike_pct?.toFixed(2)}%
                          </span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2"><AlertBadge pos={pos} /></td>
                    <td className="px-3 py-2">
                      {isClosing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="price"
                            value={closePrice}
                            onChange={e => setClosePrice(e.target.value)}
                            className="w-20 bg-terminal-bg border border-terminal-border px-1 py-0.5 text-xs font-mono text-white"
                          />
                          <button onClick={() => handleClose(pos)} className="text-terminal-green hover:underline">✓</button>
                          <button onClick={() => setClosing(null)} className="text-terminal-muted hover:underline">✗</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setClosing(pos); setClosePrice('') }}
                            className="text-terminal-amber hover:underline whitespace-nowrap"
                          >
                            Close
                          </button>
                          <button
                            onClick={() => handleDelete(pos.id)}
                            className="text-terminal-muted hover:text-terminal-red"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {open.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-terminal-muted">No open positions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Summary row */}
        <div className="px-4 py-3 border-t border-terminal-border flex flex-wrap gap-6 text-xs font-mono">
          <span>Total Premium: <span className="text-terminal-green font-semibold">${totalPremium.toFixed(2)}</span></span>
          <span>Unrealized P&L: <span className={`font-semibold ${totalPnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </span></span>
          <span>Avg Profit Capture: <span className="text-terminal-amber font-semibold">{avgCapture.toFixed(1)}%</span></span>
          <span>Win Rate: <span className="text-terminal-text">{closed.filter(p => (p.final_pnl || 0) > 0).length}/{closed.length}</span></span>
        </div>
      </div>

      {/* Closed Positions */}
      {closed.length > 0 && (
        <div className="panel">
          <div className="px-4 py-2 border-b border-terminal-border text-xs font-mono text-terminal-muted uppercase tracking-wider">
            Closed Positions ({closed.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-terminal-border text-terminal-muted">
                  {['Strike', 'Expiry', 'Contracts', 'Sold @', 'Closed @', 'Final P&L', 'Close Date'].map(h => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closed.map(pos => (
                  <tr key={pos.id} className="border-b border-terminal-border opacity-60">
                    <td className="px-3 py-2">${pos.strike}</td>
                    <td className="px-3 py-2">{pos.expiry}</td>
                    <td className="px-3 py-2">{pos.contracts}</td>
                    <td className="px-3 py-2">${pos.sell_price?.toFixed(2)}</td>
                    <td className="px-3 py-2">${pos.close_price?.toFixed(2) ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${(pos.final_pnl || 0) >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {(pos.final_pnl || 0) >= 0 ? '+' : ''}${pos.final_pnl?.toFixed(2) ?? '—'}
                    </td>
                    <td className="px-3 py-2">{pos.close_date ?? '—'}</td>
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
