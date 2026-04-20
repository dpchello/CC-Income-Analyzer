import { useState, useEffect } from 'react'

const inputStyle = {
  backgroundColor: 'var(--bg)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
}

export default function AddPosition({ onAdded }) {
  const [expiries, setExpiries] = useState([])
  const [form, setForm] = useState({
    ticker: 'SPY', type: 'short_call', strike: '', expiry: '',
    contracts: 6, sell_price: '', premium_collected: '',
  })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/options/expiries').then(r => r.json()).then(data => {
      setExpiries(data)
      if (data.length > 0) setForm(f => ({ ...f, expiry: data[0] }))
    }).catch(() => {})
  }, [])

  async function fetchMarketPrice() {
    if (!form.expiry || !form.strike) return
    setFetching(true)
    try {
      const res = await fetch(`/api/options/price?expiry=${form.expiry}&strike=${form.strike}&type=call`)
      const data = await res.json()
      if (data.price) setForm(f => ({ ...f, sell_price: data.price.toFixed(2) }))
    } catch (_) {}
    setFetching(false)
  }

  function computePremium(sell_price, contracts) {
    const sp = parseFloat(sell_price), c = parseInt(contracts)
    if (!isNaN(sp) && !isNaN(c)) setForm(f => ({ ...f, premium_collected: (sp * c * 100).toFixed(2) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const body = {
        ...form,
        strike: parseFloat(form.strike),
        contracts: parseInt(form.contracts),
        sell_price: parseFloat(form.sell_price),
        premium_collected: parseFloat(form.premium_collected) || parseFloat(form.sell_price) * parseInt(form.contracts) * 100,
      }
      const res = await fetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { setMsg({ type: 'success', text: 'Position added.' }); setTimeout(onAdded, 600) }
      else setMsg({ type: 'error', text: 'Failed to add position.' })
    } catch (err) {
      setMsg({ type: 'error', text: String(err) })
    }
    setLoading(false)
  }

  const label = 'block text-xs uppercase tracking-wider mb-1 font-mono'
  const field = 'w-full px-3 py-2 text-sm font-mono border focus:outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Expiry</label>
          <select
            className={field}
            style={inputStyle}
            value={form.expiry}
            onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))}
            required
          >
            {expiries.map(exp => <option key={exp} value={exp}>{exp}</option>)}
            {expiries.length === 0 && <option value="">Loading…</option>}
          </select>
        </div>
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Strike ($)</label>
          <div className="flex gap-1">
            <input type="number" step="5" className={field} style={inputStyle}
              value={form.strike} onChange={e => setForm(f => ({ ...f, strike: e.target.value }))}
              placeholder="685" required />
            <button
              type="button" onClick={fetchMarketPrice}
              disabled={fetching || !form.strike || !form.expiry}
              className="px-2 border text-xs font-mono disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
            >
              {fetching ? '…' : 'MKT'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Contracts</label>
          <input type="number" min="1" className={field} style={inputStyle}
            value={form.contracts}
            onChange={e => { setForm(f => ({ ...f, contracts: e.target.value })); computePremium(form.sell_price, e.target.value) }}
            required />
        </div>
        <div>
          <label className={label} style={{ color: 'var(--muted)' }}>Sell Price / share</label>
          <input type="number" step="0.01" className={field} style={inputStyle}
            value={form.sell_price} placeholder="1.75"
            onChange={e => { setForm(f => ({ ...f, sell_price: e.target.value })); computePremium(e.target.value, form.contracts) }}
            required />
        </div>
      </div>

      <div>
        <label className={label} style={{ color: 'var(--muted)' }}>Premium Collected (auto)</label>
        <input type="number" step="0.01" className={`${field} opacity-70`} style={inputStyle}
          value={form.premium_collected} placeholder="1050.00"
          onChange={e => setForm(f => ({ ...f, premium_collected: e.target.value }))} />
        <div className="text-xs font-mono mt-1" style={{ color: 'var(--muted)' }}>= sell price × contracts × 100</div>
      </div>

      {msg && (
        <div className="text-xs font-mono px-3 py-2"
          style={{ color: msg.type === 'success' ? 'var(--green)' : 'var(--red)', backgroundColor: msg.type === 'success' ? 'rgba(62,207,142,0.10)' : 'rgba(248,113,113,0.10)' }}>
          {msg.text}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-2.5 text-sm font-semibold border disabled:opacity-50 transition-colors"
        style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}>
        {loading ? 'Adding…' : '+ Add Position'}
      </button>
    </form>
  )
}
