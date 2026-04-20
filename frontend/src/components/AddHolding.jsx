import { useState } from 'react'

const inputStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }

export default function AddHolding({ portfolioId, onAdded }) {
  const [form, setForm] = useState({ ticker: 'SPY', shares: '', avg_cost: '', purchase_date: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const body = {
        portfolio_id: portfolioId,
        ticker: form.ticker,
        shares: parseInt(form.shares),
        avg_cost: parseFloat(form.avg_cost),
        purchase_date: form.purchase_date || new Date().toISOString().slice(0, 10),
      }
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setMsg({ type: 'success', text: 'Holding added.' })
        setForm({ ticker: 'SPY', shares: '', avg_cost: '', purchase_date: '' })
        setTimeout(onAdded, 500)
      } else {
        const err = await res.json()
        setMsg({ type: 'error', text: err.detail || 'Failed to add holding.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: String(err) })
    }
    setLoading(false)
  }

  const label = 'block text-xs uppercase tracking-wider mb-1 font-mono'
  const field = 'w-full px-3 py-2 text-sm font-mono border focus:outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Ticker</label>
          <input
            type="text" className={field} style={inputStyle}
            value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
            placeholder="SPY" required
          />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Shares</label>
          <input
            type="number" min="1" className={field} style={inputStyle}
            value={form.shares}
            onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
            placeholder="600" required
          />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Avg Cost / Share</label>
          <input
            type="number" step="0.01" className={field} style={inputStyle}
            value={form.avg_cost}
            onChange={e => setForm(f => ({ ...f, avg_cost: e.target.value }))}
            placeholder="540.25" required
          />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Purchase Date</label>
          <input
            type="date" className={field} style={inputStyle}
            value={form.purchase_date}
            onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
          />
        </div>
      </div>

      {msg && (
        <div className="text-xs font-mono px-3 py-2" style={{
          color: msg.type === 'success' ? 'var(--green)' : 'var(--red)',
          backgroundColor: msg.type === 'success' ? 'rgba(62,207,142,0.10)' : 'rgba(248,113,113,0.10)',
        }}>
          {msg.text}
        </div>
      )}

      <button
        type="submit" disabled={loading}
        className="px-4 py-2 text-sm font-medium border disabled:opacity-50 transition-colors"
        style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}
      >
        {loading ? 'Adding…' : '+ Add Holding'}
      </button>
    </form>
  )
}
