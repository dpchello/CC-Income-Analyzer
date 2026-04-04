import { useState, useEffect } from 'react'
import AddPosition from './AddPosition.jsx'
import AddHolding from './AddHolding.jsx'

// ── Alert definitions ─────────────────────────────────────────────────────────

const ALERT_DEFS = {
  TAKE_PROFIT:  { icon: '💰', label: 'Take Profit',   color: 'var(--green)', title: '50% Profit Target Reached',       explain: "You've captured 50%+ of the maximum premium. Closing here improves annualized return — you free up capital sooner and avoid late-expiry gamma risk.", action: 'Buy back this call at market and open a new position at a later expiry.' },
  ROLL_WARNING: { icon: '⏰', label: 'Roll Soon',      color: 'var(--amber)', title: 'Approaching 21-Day Danger Zone',  explain: 'With ≤21 days to expiry, options enter high-gamma zone. Small SPY moves cause large, fast option price swings.', action: 'Roll: buy back this call and sell a new one at the same or higher strike, targeting 30–45 DTE.' },
  GAMMA_DANGER: { icon: '🔥', label: 'Gamma Danger',  color: 'var(--red)',   title: 'Expiring in 7 Days or Less',       explain: 'Highest-risk zone. Gamma is at peak — a 1% SPY move causes an outsized swing with little time to react.', action: 'Close or roll immediately.' },
  STRIKE_BREACH:{ icon: '🚨', label: 'Breach Risk',   color: 'var(--red)',   title: 'SPY Within 1.5% of Your Strike',  explain: "SPY is close to your strike. If it closes above at expiry your shares get called away.", action: 'Consider rolling up and out to a higher strike with a later expiry.' },
}

function alertTypes(pos) {
  const t = []
  if ((pos.profit_capture_pct || 0) >= 50) t.push('TAKE_PROFIT')
  if (pos.dte <= 7) t.push('GAMMA_DANGER')
  else if (pos.dte <= 21) t.push('ROLL_WARNING')
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5 && pos.distance_to_strike_pct > 0) t.push('STRIKE_BREACH')
  return t
}

function AlertCard({ type }) {
  const [open, setOpen] = useState(false)
  const d = ALERT_DEFS[type]
  return (
    <div className="border text-xs mb-1 last:mb-0" style={{ borderColor: d.color + '40', backgroundColor: d.color + '0d' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left" style={{ color: d.color }}>
        <span>{d.icon}</span><span className="font-semibold">{d.label}</span>
        <span className="ml-auto opacity-50 text-[10px]">{open ? '▲ less' : '▼ why?'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1 border-t" style={{ borderColor: d.color + '30' }}>
          <p className="font-semibold" style={{ color: d.color }}>{d.title}</p>
          <p style={{ color: 'var(--muted)' }} className="leading-relaxed">{d.explain}</p>
          <p style={{ color: d.color }}>→ {d.action}</p>
        </div>
      )}
    </div>
  )
}

// ── Portfolio sidebar item ────────────────────────────────────────────────────

function PortfolioTab({ portfolio, active, onClick }) {
  const stats = portfolio.stats || {}
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-l-2 transition-colors"
      style={{
        borderColor: active ? 'var(--green)' : 'transparent',
        backgroundColor: active ? 'var(--green)08' : 'transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: active ? 'var(--text)' : 'var(--muted)' }}>
          {portfolio.name}
        </span>
        {stats.open_count > 0 && (
          <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
            {stats.open_count}
          </span>
        )}
      </div>
      {stats.total_premium_collected > 0 && (
        <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--green)' }}>
          ${stats.total_premium_collected.toLocaleString()} premium
        </div>
      )}
    </button>
  )
}

// ── Holdings row ──────────────────────────────────────────────────────────────

function HoldingRow({ holding, coveredShares, onDelete, onEdit }) {
  const pnlPos = (holding.unrealized_pnl || 0) >= 0
  const totalShares = holding.shares
  const covered = Math.min(coveredShares, totalShares)
  const coveragePct = totalShares > 0 ? Math.round(covered / totalShares * 100) : 0

  return (
    <div className="flex flex-wrap items-center gap-4 py-3 border-b text-sm" style={{ borderColor: 'var(--border)' }}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}
      >
        {holding.ticker}
      </div>

      <div className="flex flex-wrap gap-5 flex-1 text-sm">
        {[
          { label: 'Shares', value: holding.shares.toLocaleString(), color: 'var(--text)' },
          { label: 'Avg Cost', value: `$${holding.avg_cost.toFixed(2)}`, color: 'var(--text)' },
          { label: 'Current', value: `$${holding.current_price?.toFixed(2) ?? '—'}`, color: 'var(--text)' },
          { label: 'Market Value', value: `$${(holding.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'var(--text)' },
          { label: 'Unrealized P&L', value: `${pnlPos ? '+' : ''}$${(holding.unrealized_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} (${holding.unrealized_pnl_pct?.toFixed(1)}%)`, color: pnlPos ? 'var(--green)' : 'var(--red)' },
        ].map(f => (
          <div key={f.label}>
            <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
            <div className="font-mono font-semibold" style={{ color: f.color }}>{f.value}</div>
          </div>
        ))}

        {/* Coverage bar */}
        <div className="min-w-[120px]">
          <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Call Coverage</div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5" style={{ backgroundColor: 'var(--border)' }}>
              <div className="h-full" style={{ width: `${coveragePct}%`, backgroundColor: 'var(--green)' }} />
            </div>
            <span className="text-xs font-mono" style={{ color: coveragePct === 100 ? 'var(--green)' : 'var(--amber)' }}>
              {covered}/{totalShares} ({coveragePct}%)
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 shrink-0 text-xs">
        <button onClick={onEdit} style={{ color: 'var(--amber)' }} className="hover:underline">Edit</button>
        <button onClick={onDelete} style={{ color: 'var(--muted)' }} className="hover:underline">Remove</button>
      </div>
    </div>
  )
}

// ── Edit holding modal ────────────────────────────────────────────────────────

function EditHoldingModal({ holding, onSave, onClose }) {
  const [shares, setShares] = useState(String(holding.shares))
  const [avgCost, setAvgCost] = useState(String(holding.avg_cost))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/holdings/${holding.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares: parseInt(shares), avg_cost: parseFloat(avgCost) }),
    })
    setSaving(false)
    onSave()
  }

  const field = 'px-3 py-2 text-sm font-mono border w-full focus:outline-none'
  const fStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="p-6 space-y-4 w-80" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Edit {holding.ticker} Holding</div>
        <div>
          <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Shares</label>
          <input type="number" className={field} style={fStyle} value={shares} onChange={e => setShares(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Avg Cost / Share</label>
          <input type="number" step="0.01" className={field} style={fStyle} value={avgCost} onChange={e => setAvgCost(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Position card ─────────────────────────────────────────────────────────────

function PositionCard({ pos, portfolios, currentPortfolioId, onClose, onDelete, onMove }) {
  const [isClosing, setIsClosing] = useState(false)
  const [closePrice, setClosePrice] = useState('')
  const [moving, setMoving] = useState(false)
  const alerts = alertTypes(pos)
  const pnlPos = (pos.pnl || 0) >= 0
  const otherPortfolios = portfolios.filter(p => p.id !== currentPortfolioId && !p.archived)

  async function doClose() {
    const price = parseFloat(closePrice)
    if (isNaN(price)) return
    await fetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed', close_price: price }),
    })
    setIsClosing(false)
    onClose()
  }

  async function doMove(portfolioId) {
    await fetch(`/api/positions/${pos.id}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolioId }),
    })
    setMoving(false)
    onMove()
  }

  return (
    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap gap-4 items-start">
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-[160px]">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
               style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}>
            {pos.ticker}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>${pos.strike} Call</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Expires {pos.expiry}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 flex-1">
          {[
            { label: 'DTE',       value: `${pos.dte}d`,                                    color: pos.dte <= 7 ? 'var(--red)' : pos.dte <= 21 ? 'var(--amber)' : 'var(--text)' },
            { label: 'Contracts', value: `${pos.contracts} × 100`,                          color: 'var(--text)' },
            { label: 'Sold At',   value: `$${pos.sell_price?.toFixed(2)}`,                  color: 'var(--text)' },
            { label: 'Current',   value: `$${pos.current_price?.toFixed(2) ?? '—'}`,        color: 'var(--text)' },
            { label: 'P&L',       value: `${pnlPos?'+':''}$${pos.pnl?.toFixed(0)}`,         color: pnlPos ? 'var(--green)' : 'var(--red)' },
            { label: 'Captured',  value: `${pos.profit_capture_pct?.toFixed(1)}%`,           color: pos.profit_capture_pct >= 50 ? 'var(--green)' : 'var(--text)' },
            { label: 'Distance',  value: pos.distance_to_strike_pct != null ? `${pos.distance_to_strike_pct.toFixed(2)}%` : '—', color: (pos.distance_to_strike_pct || 99) <= 1.5 ? 'var(--red)' : 'var(--text)' },
          ].map(f => (
            <div key={f.label}>
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
              <div className="text-sm font-mono font-semibold" style={{ color: f.color }}>{f.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col gap-2 items-end">
          {isClosing ? (
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.01" placeholder="buy-back price" value={closePrice}
                onChange={e => setClosePrice(e.target.value)}
                className="w-28 px-2 py-1 text-xs font-mono border focus:outline-none"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button onClick={doClose} className="text-sm" style={{ color: 'var(--green)' }}>✓</button>
              <button onClick={() => setIsClosing(false)} className="text-sm" style={{ color: 'var(--muted)' }}>✗</button>
            </div>
          ) : (
            <button onClick={() => setIsClosing(true)} className="text-xs hover:underline" style={{ color: 'var(--amber)' }}>
              Close position
            </button>
          )}

          {/* Move to */}
          {otherPortfolios.length > 0 && (
            moving ? (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Move to:</span>
                {otherPortfolios.map(p => (
                  <button key={p.id} onClick={() => doMove(p.id)}
                    className="text-xs px-2 py-0.5 border" style={{ borderColor: 'var(--border)', color: 'var(--blue)' }}>
                    {p.name}
                  </button>
                ))}
                <button onClick={() => setMoving(false)} className="text-xs" style={{ color: 'var(--muted)' }}>✗</button>
              </div>
            ) : (
              <button onClick={() => setMoving(true)} className="text-xs hover:underline" style={{ color: 'var(--blue)' }}>
                Move to…
              </button>
            )
          )}

          <button onClick={() => { if (confirm('Remove this position?')) onDelete(pos.id) }}
            className="text-xs" style={{ color: 'var(--muted)' }}>
            Remove
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mt-3 max-w-lg space-y-1">
          {alerts.map(type => <AlertCard key={type} type={type} />)}
        </div>
      )}
    </div>
  )
}

// ── Main Portfolios component ─────────────────────────────────────────────────

export default function Portfolios({ positions, portfolios, holdings, dashData, signalData, onRefresh }) {
  const active = portfolios.filter(p => !p.archived)
  const archived = portfolios.filter(p => p.archived)

  const [selectedId, setSelectedId] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [creating, setCreating] = useState(false)

  // Auto-select first portfolio on load
  useEffect(() => {
    if (!selectedId && active.length > 0) {
      setSelectedId(active[0].id)
    }
  }, [portfolios])

  const selected = portfolios.find(p => p.id === selectedId)
  const myPositions = positions.filter(p => p.portfolio_id === selectedId)
  const myHoldings  = holdings.filter(h => h.portfolio_id === selectedId)
  const openPos  = myPositions.filter(p => p.status === 'open')
  const closedPos = myPositions.filter(p => p.status === 'closed')

  // Covered shares per ticker
  const coveredByTicker = {}
  for (const p of openPos) {
    coveredByTicker[p.ticker] = (coveredByTicker[p.ticker] || 0) + p.contracts * 100
  }

  const totalPremium = openPos.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl     = openPos.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture   = openPos.length ? openPos.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / openPos.length : 0

  async function createPortfolio() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const res = await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json()
      setNewName('')
      setShowNewForm(false)
      await onRefresh()
      setSelectedId(created.id)
    }
    setCreating(false)
  }

  async function deletePortfolio(id) {
    if (!confirm('Delete this portfolio? Closed positions will move to Default.')) return
    const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.detail)
      return
    }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function archivePortfolio(id) {
    const res = await fetch(`/api/portfolios/${id}/archive`, { method: 'PUT' })
    if (!res.ok) { const err = await res.json(); alert(err.detail); return }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function unarchivePortfolio(id) {
    await fetch(`/api/portfolios/${id}/unarchive`, { method: 'PUT' })
    onRefresh()
  }

  async function deletePosition(id) {
    await fetch(`/api/positions/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  async function deleteHolding(id) {
    if (!confirm('Remove this holding?')) return
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div className="flex gap-6 min-h-[70vh]">

      {/* ── Left sidebar: portfolio list ─────────────────────── */}
      <div className="w-56 shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>Portfolios</span>
          <button onClick={() => setShowNewForm(s => !s)}
            className="text-xs px-2 py-1 border" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
            + New
          </button>
        </div>

        {/* New portfolio input */}
        {showNewForm && (
          <div className="flex gap-1 mb-2">
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPortfolio()}
              placeholder="Portfolio name"
              className="flex-1 px-2 py-1 text-xs border focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <button onClick={createPortfolio} disabled={creating}
              className="text-xs px-2" style={{ color: 'var(--green)' }}>
              {creating ? '…' : '✓'}
            </button>
            <button onClick={() => { setShowNewForm(false); setNewName('') }}
              className="text-xs px-2" style={{ color: 'var(--muted)' }}>✗</button>
          </div>
        )}

        {/* Active portfolios */}
        {active.map(p => (
          <div key={p.id} className="group relative">
            <PortfolioTab portfolio={p} active={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
            {p.id !== 'default' && (
              <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                <button onClick={() => archivePortfolio(p.id)} title="Archive"
                  className="text-xs px-1" style={{ color: 'var(--muted)' }}>▾</button>
                <button onClick={() => deletePortfolio(p.id)} title="Delete"
                  className="text-xs px-1" style={{ color: 'var(--muted)' }}>✕</button>
              </div>
            )}
          </div>
        ))}

        {/* Archived toggle */}
        {archived.length > 0 && (
          <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setShowArchived(s => !s)}
              className="text-xs w-full text-left px-4 py-1" style={{ color: 'var(--muted)' }}>
              {showArchived ? '▲' : '▶'} Archived ({archived.length})
            </button>
            {showArchived && archived.map(p => (
              <div key={p.id} className="group relative opacity-50 hover:opacity-80">
                <PortfolioTab portfolio={p} active={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                <div className="absolute right-2 top-2 hidden group-hover:flex">
                  <button onClick={() => unarchivePortfolio(p.id)} title="Restore" className="text-xs px-1" style={{ color: 'var(--muted)' }}>↑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: selected portfolio detail ────────────── */}
      <div className="flex-1 space-y-6 min-w-0">
        {!selected ? (
          <div className="flex items-center justify-center h-48" style={{ color: 'var(--muted)' }}>
            <p className="text-sm">Select or create a portfolio</p>
          </div>
        ) : (
          <>
            {/* Portfolio header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{selected.name}</h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Created {selected.created_date}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddHolding(s => !s)}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--blue)', color: 'var(--blue)', backgroundColor: showAddHolding ? 'rgba(74,158,255,0.1)' : 'transparent' }}>
                  {showAddHolding ? '✕ Cancel' : '+ Add Holding'}
                </button>
                <button onClick={() => setShowAddPosition(s => !s)}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: showAddPosition ? 'rgba(0,255,136,0.1)' : 'transparent' }}>
                  {showAddPosition ? '✕ Cancel' : '+ Add Position'}
                </button>
              </div>
            </div>

            {/* Inline forms */}
            {showAddHolding && (
              <div className="p-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="text-xs uppercase tracking-wider mb-3 font-mono" style={{ color: 'var(--muted)' }}>Add Stock Holding</div>
                <AddHolding portfolioId={selectedId} onAdded={() => { setShowAddHolding(false); onRefresh() }} />
              </div>
            )}
            {showAddPosition && (
              <div className="p-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="text-xs uppercase tracking-wider mb-3 font-mono" style={{ color: 'var(--muted)' }}>Add Covered Call Position</div>
                <AddPosition portfolioId={selectedId} onAdded={() => { setShowAddPosition(false); onRefresh() }} />
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Open Positions',      value: String(openPos.length),                                       color: 'var(--text)' },
                { label: 'Total Premium',        value: `$${totalPremium.toLocaleString()}`,                          color: 'var(--green)' },
                { label: 'Unrealized P&L',       value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Avg Profit Capture',   value: `${avgCapture.toFixed(1)}%`,                                  color: 'var(--amber)' },
              ].map(s => (
                <div key={s.label} className="p-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
                  <div className="text-xl font-semibold font-mono" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── Holdings ─────────────────────────────────────── */}
            <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Stock Holdings</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Shares owned that are covered by your calls</p>
                </div>
              </div>
              {myHoldings.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  No holdings recorded. Click "+ Add Holding" to track your SPY shares.
                </div>
              ) : (
                <div className="px-5">
                  {myHoldings.map(h => (
                    <HoldingRow
                      key={h.id}
                      holding={h}
                      coveredShares={coveredByTicker[h.ticker] || 0}
                      onDelete={() => deleteHolding(h.id)}
                      onEdit={() => setEditingHolding(h)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Open Positions ────────────────────────────────── */}
            <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Open Covered Calls</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  You profit when the option loses value. Positive P&L means the call has declined since you sold it.
                </p>
              </div>
              {openPos.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>No open positions in this portfolio</div>
              ) : (
                openPos.map(pos => (
                  <PositionCard
                    key={pos.id} pos={pos}
                    portfolios={portfolios}
                    currentPortfolioId={selectedId}
                    onClose={onRefresh}
                    onDelete={deletePosition}
                    onMove={onRefresh}
                  />
                ))
              )}
            </div>

            {/* ── Closed Positions ──────────────────────────────── */}
            {closedPos.length > 0 && (
              <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Closed Positions</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                        {['Strike','Expiry','Contracts','Sold At','Closed At','Final P&L','Date'].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closedPos.map(pos => (
                        <tr key={pos.id} className="border-b opacity-50" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.strike}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.expiry}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.contracts}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.sell_price?.toFixed(2)}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.close_price?.toFixed(2) ?? '—'}</td>
                          <td className="px-4 py-2 font-semibold" style={{ color: (pos.final_pnl||0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {(pos.final_pnl||0) >= 0 ? '+' : ''}${pos.final_pnl?.toFixed(2) ?? '—'}
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{pos.close_date ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit holding modal */}
      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          onSave={() => { setEditingHolding(null); onRefresh() }}
          onClose={() => setEditingHolding(null)}
        />
      )}
    </div>
  )
}
