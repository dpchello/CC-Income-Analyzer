import { useState, useEffect } from 'react'
import { useAuth } from '../auth.jsx'

const inputStyle = {
  backgroundColor: 'var(--bg)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
}

export default function AddPosition({ onAdded, holdings, prefill, portfolioId }) {
  const { apiFetch } = useAuth()
  const [expiries, setExpiries] = useState([])
  const holdingTickers = [...new Set((holdings || []).map(h => h.ticker).filter(Boolean))]
  const [form, setForm] = useState({
    ticker: prefill?.ticker || holdingTickers[0] || '', type: 'short_call',
    strike: prefill?.strike || '', expiry: prefill?.expiry || '',
    contracts: prefill?.contracts || 6,
    sell_price: prefill?.sell_price || '', premium_collected: '',
  })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    apiFetch('/api/options/expiries').then(r => r.json()).then(data => {
      // If a prefill expiry exists and isn't in the API list, append it so the select works
      const list = prefill?.expiry && !data.includes(prefill.expiry) ? [...data, prefill.expiry] : data
      setExpiries(list)
      if (!prefill?.expiry && list.length > 0) setForm(f => ({ ...f, expiry: list[0] }))
    }).catch(() => {})
  }, [])

  async function fetchMarketPrice() {
    if (!form.expiry || !form.strike) return
    setFetching(true)
    try {
      const res = await apiFetch(`/api/options/price?expiry=${form.expiry}&strike=${form.strike}&type=call`)
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
        portfolio_id: portfolioId,
        strike: parseFloat(form.strike),
        contracts: parseInt(form.contracts),
        sell_price: parseFloat(form.sell_price),
        premium_collected: parseFloat(form.premium_collected) || parseFloat(form.sell_price) * parseInt(form.contracts) * 100,
      }
      const res = await apiFetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
      {prefill && (
        <div className="px-3 py-2 text-xs border" style={{ backgroundColor: 'rgba(74,158,255,0.08)', borderColor: 'var(--blue)', color: 'var(--blue)', borderRadius: 'var(--radius-sm)' }}>
          Pre-filled from roll scenario — review and confirm the new position details.
        </div>
      )}
      <div>
        <label className={label} style={{ color: 'var(--muted)' }}>Ticker</label>
        {holdingTickers.length > 0 ? (
          <select
            className={field} style={inputStyle}
            value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
            required
          >
            {holdingTickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <input
            type="text" className={field} style={inputStyle}
            value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
            placeholder="AAPL" required
          />
        )}
      </div>
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
