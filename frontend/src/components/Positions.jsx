import { useState } from 'react'
import Tooltip from './Tooltip.jsx'

const ALERT_DEFS = {
  TAKE_PROFIT: {
    icon: '💰',
    label: 'Take Profit',
    color: 'terminal-green',
    title: '50% Profit Target Reached',
    explain: 'You\'ve captured 50% or more of the maximum premium you could ever collect on this position. Academic research shows that closing here — rather than holding to expiration — improves your annualized return. Why? Because you free up capital to sell a new contract sooner, and you eliminate the risk of a late-expiry reversal erasing your gains.',
    action: 'Consider buying back this call at market and opening a new position at a later expiry.',
  },
  ROLL_WARNING: {
    icon: '⏰',
    label: 'Roll Soon',
    color: 'terminal-amber',
    title: 'Approaching the 21-Day Danger Zone',
    explain: 'With 21 or fewer days to expiration, options enter the "high gamma" zone. Gamma measures how fast an option\'s delta changes — near expiry, small moves in SPY can cause large, fast moves in your option\'s price. The risk/reward of holding through expiration worsens significantly. The sweet spot for this strategy is 30–45 DTE.',
    action: 'Consider rolling this position: buy it back and sell a new call at the same or slightly higher strike with a later expiry (targeting 30–45 DTE).',
  },
  GAMMA_DANGER: {
    icon: '🔥',
    label: 'Gamma Danger',
    color: 'terminal-red',
    title: 'Expiring in 7 Days or Less — Act Now',
    explain: 'You are in the highest-risk zone for short options. With under 7 days to expiry, gamma is at its peak. A 1% move in SPY can now cause an outsized swing in your option\'s value. If SPY is anywhere near your strike, the position can move against you very quickly with little time to react.',
    action: 'Close or roll this position immediately. Do not hold through expiration unless the option is deeply OTM and you are comfortable with assignment risk.',
  },
  STRIKE_BREACH: {
    icon: '🚨',
    label: 'Breach Risk',
    color: 'terminal-red',
    title: 'SPY Within 1.5% of Your Strike',
    explain: 'SPY\'s current price is dangerously close to the strike price of your call. If SPY closes above your strike at expiration, your 600 shares will be "called away" — sold at the strike price — and you\'ll miss any further upside. The closer SPY gets, the higher the delta (probability of exercise).',
    action: 'Monitor closely. If SPY continues rising, consider rolling up and out — buying back this call and selling a new one at a higher strike with a later expiry to preserve your shares.',
  },
}

const COLUMN_TIPS = {
  'DTE': 'Days To Expiration — how many calendar days until this option expires. The strategy targets 30–45 DTE for new entries and recommends rolling at 21 DTE.',
  'Sold @': 'The per-share price you received when you sold this call. Multiplied by contracts × 100 = total premium collected.',
  'Current': 'The current market price of this option (mid of bid/ask). To close the position, you\'d need to buy it back at approximately this price.',
  'P&L $': 'Your unrealized profit or loss in dollars. Calculated as: (Sold Price − Current Price) × Contracts × 100. Positive means the option has lost value — which is what you want as a seller.',
  'Profit%': 'How much of your maximum possible profit you\'ve already captured. At 100%, the option is worthless and you\'ve kept the full premium. The strategy recommends taking profit at 50%.',
  'Distance': 'How far SPY\'s current price is from your strike, as a percentage. The larger this number, the safer your position. Below 1.5% triggers a Breach Risk alert.',
}

function AlertCard({ type, pos }) {
  const [open, setOpen] = useState(false)
  const def = ALERT_DEFS[type]
  if (!def) return null

  const colorMap = {
    'terminal-green': { border: 'border-terminal-green', text: 'text-terminal-green', bg: 'bg-terminal-green/10' },
    'terminal-amber': { border: 'border-terminal-amber', text: 'text-terminal-amber', bg: 'bg-terminal-amber/10' },
    'terminal-red': { border: 'border-terminal-red', text: 'text-terminal-red', bg: 'bg-terminal-red/10' },
  }
  const c = colorMap[def.color]

  return (
    <div className={`border ${c.border} ${c.bg} text-xs font-mono mb-1`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-1.5 px-2 py-1 ${c.text} text-left`}
      >
        <span>{def.icon}</span>
        <span className="font-semibold">{def.label}</span>
        <span className="ml-auto opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1 border-t border-white/10 pt-2">
          <div className={`font-semibold ${c.text}`}>{def.title}</div>
          <p className="text-terminal-muted font-sans leading-relaxed">{def.explain}</p>
          <p className={`font-sans ${c.text} leading-relaxed`}>→ {def.action}</p>
        </div>
      )}
    </div>
  )
}

function PositionAlerts({ pos }) {
  const alerts = []
  if (pos.profit_capture_pct >= 50) alerts.push('TAKE_PROFIT')
  if (pos.dte !== null && pos.dte <= 7) alerts.push('GAMMA_DANGER')
  else if (pos.dte !== null && pos.dte <= 21) alerts.push('ROLL_WARNING')
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5 && pos.distance_to_strike_pct > 0) alerts.push('STRIKE_BREACH')

  if (alerts.length === 0) return <span className="text-terminal-muted text-xs">—</span>
  return (
    <div className="min-w-[180px]">
      {alerts.map(type => <AlertCard key={type} type={type} pos={pos} />)}
    </div>
  )
}

function ColHeader({ label }) {
  const tip = COLUMN_TIPS[label]
  if (!tip) return <th className="px-3 py-2 text-left whitespace-nowrap">{label}</th>
  return (
    <th className="px-3 py-2 text-left whitespace-nowrap">
      <Tooltip text={tip}><span>{label}</span></Tooltip>
    </th>
  )
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

      {/* How to read this table */}
      <div className="panel p-4 border-l-2 border-terminal-blue/40">
        <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-1">How to Read This Table</div>
        <p className="text-xs text-terminal-muted font-sans leading-relaxed">
          You sold call options against your SPY shares. As the seller, you <em className="text-terminal-text">profit when the option loses value</em> —
          so a falling Current price and a positive P&L are good. The goal is to capture 50–100% of premium before expiration.
          Hover the <span className="text-terminal-text">ⓘ</span> icons on column headers for definitions. Click any alert badge to see why it fired and what to do.
        </p>
      </div>

      {/* Open Positions */}
      <div className="panel">
        <div className="px-4 py-2 border-b border-terminal-border text-xs font-mono text-terminal-muted uppercase tracking-wider">
          Open Positions ({open.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-terminal-border text-terminal-muted">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Strike</th>
                <th className="px-3 py-2 text-left">Expiry</th>
                <ColHeader label="DTE" />
                <th className="px-3 py-2 text-left">Contracts</th>
                <ColHeader label="Sold @" />
                <ColHeader label="Current" />
                <ColHeader label="P&L $" />
                <th className="px-3 py-2 text-left">P&L %</th>
                <ColHeader label="Profit%" />
                <ColHeader label="Distance" />
                <th className="px-3 py-2 text-left">Alerts</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {open.map(pos => {
                const pnlPositive = (pos.pnl || 0) >= 0
                const isClosing = closing?.id === pos.id
                return (
                  <tr key={pos.id} className="border-b border-terminal-border hover:bg-white/5 align-top">
                    <td className="px-3 py-3 text-terminal-blue">{pos.ticker}</td>
                    <td className="px-3 py-3 text-white font-semibold">${pos.strike}</td>
                    <td className="px-3 py-3">{pos.expiry}</td>
                    <td className={`px-3 py-3 font-semibold ${pos.dte <= 7 ? 'text-terminal-red' : pos.dte <= 21 ? 'text-terminal-amber' : 'text-terminal-text'}`}>
                      {pos.dte}d
                    </td>
                    <td className="px-3 py-3">{pos.contracts}</td>
                    <td className="px-3 py-3">${pos.sell_price?.toFixed(2)}</td>
                    <td className="px-3 py-3">${pos.current_price?.toFixed(2) ?? '—'}</td>
                    <td className={`px-3 py-3 font-semibold ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pnlPositive ? '+' : ''}${pos.pnl?.toFixed(2)}
                    </td>
                    <td className={`px-3 py-3 ${pnlPositive ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {pnlPositive ? '+' : ''}{pos.pnl_pct?.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-3 font-semibold ${(pos.profit_capture_pct || 0) >= 50 ? 'text-terminal-green' : 'text-terminal-text'}`}>
                      {pos.profit_capture_pct?.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3">
                      {pos.distance_to_strike_pct != null
                        ? <span className={pos.distance_to_strike_pct <= 1.5 ? 'text-terminal-red' : 'text-terminal-muted'}>
                            {pos.distance_to_strike_pct?.toFixed(2)}%
                          </span>
                        : '—'}
                    </td>
                    <td className="px-3 py-3"><PositionAlerts pos={pos} /></td>
                    <td className="px-3 py-3">
                      {isClosing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="buy-back price"
                            value={closePrice}
                            onChange={e => setClosePrice(e.target.value)}
                            className="w-24 bg-terminal-bg border border-terminal-border px-1 py-0.5 text-xs font-mono text-white"
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
                          <button onClick={() => handleDelete(pos.id)} className="text-terminal-muted hover:text-terminal-red">✕</button>
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

        {/* Summary */}
        <div className="px-4 py-3 border-t border-terminal-border space-y-2">
          <div className="flex flex-wrap gap-6 text-xs font-mono">
            <span>
              <Tooltip text="Total premium received across all open positions. This is your maximum possible profit if all options expire worthless.">
                <span className="text-terminal-muted">Total Premium Collected</span>
              </Tooltip>
              {': '}
              <span className="text-terminal-green font-semibold">${totalPremium.toFixed(2)}</span>
            </span>
            <span>
              <Tooltip text="Your current unrealized gain. This is what you'd lock in if you bought back all open contracts right now.">
                <span className="text-terminal-muted">Unrealized P&L</span>
              </Tooltip>
              {': '}
              <span className={`font-semibold ${totalPnl >= 0 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </span>
            </span>
            <span>
              <Tooltip text="Average percentage of maximum premium captured across open positions. The 50% rule says to close when this reaches 50% — you've captured half the max with less time risk.">
                <span className="text-terminal-muted">Avg Profit Capture</span>
              </Tooltip>
              {': '}
              <span className="text-terminal-amber font-semibold">{avgCapture.toFixed(1)}%</span>
            </span>
            <span className="text-terminal-muted">
              Win Rate: <span className="text-terminal-text">{closed.filter(p => (p.final_pnl || 0) > 0).length}/{closed.length} closed</span>
            </span>
          </div>
        </div>
      </div>

      {/* Alert Legend */}
      <div className="panel p-4">
        <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-3">Alert Reference</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(ALERT_DEFS).map(([type, def]) => {
            const c = {
              'terminal-green': 'text-terminal-green border-terminal-green',
              'terminal-amber': 'text-terminal-amber border-terminal-amber',
              'terminal-red': 'text-terminal-red border-terminal-red',
            }[def.color]
            return (
              <div key={type} className={`border-l-2 pl-3 ${c}`}>
                <div className="text-xs font-mono font-semibold mb-0.5">{def.icon} {def.label} — {def.title}</div>
                <p className="text-xs text-terminal-muted font-sans leading-relaxed">{def.explain}</p>
              </div>
            )
          })}
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
