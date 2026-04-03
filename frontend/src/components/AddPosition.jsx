import { useState, useEffect } from 'react'

export default function AddPosition({ onAdded }) {
  const [expiries, setExpiries] = useState([])
  const [form, setForm] = useState({
    ticker: 'SPY',
    type: 'short_call',
    strike: '',
    expiry: '',
    contracts: 6,
    sell_price: '',
    premium_collected: '',
  })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    fetch('/api/options/expiries')
      .then(r => r.json())
      .then(data => {
        setExpiries(data)
        if (data.length > 0) setForm(f => ({ ...f, expiry: data[0] }))
      })
      .catch(() => {})
  }, [])

  async function fetchMarketPrice() {
    if (!form.expiry || !form.strike) return
    setFetching(true)
    try {
      const res = await fetch(`/api/options/price?expiry=${form.expiry}&strike=${form.strike}&type=call`)
      const data = await res.json()
      if (data.price) {
        setForm(f => ({ ...f, sell_price: data.price.toFixed(2) }))
      }
    } catch (e) {}
    setFetching(false)
  }

  function computePremium(sell_price, contracts) {
    const sp = parseFloat(sell_price)
    const c = parseInt(contracts)
    if (!isNaN(sp) && !isNaN(c)) {
      setForm(f => ({ ...f, premium_collected: (sp * c * 100).toFixed(2) }))
    }
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
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setMsg({ type: 'success', text: 'Position added successfully.' })
        setTimeout(onAdded, 800)
      } else {
        setMsg({ type: 'error', text: 'Failed to add position.' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: String(err) })
    }
    setLoading(false)
  }

  const fieldClass = "bg-terminal-bg border border-terminal-border px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-terminal-blue w-full"
  const labelClass = "block text-xs font-mono text-terminal-muted mb-1 uppercase tracking-wider"

  return (
    <div className="max-w-lg">
      <div className="panel p-6">
        <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-5">Add New Position</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Expiry</label>
              <select
                className={fieldClass}
                value={form.expiry}
                onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))}
                required
              >
                {expiries.map(exp => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
                {expiries.length === 0 && <option value="">Loading...</option>}
              </select>
            </div>
            <div>
              <label className={labelClass}>Strike Price ($)</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="5"
                  className={fieldClass}
                  value={form.strike}
                  onChange={e => setForm(f => ({ ...f, strike: e.target.value }))}
                  placeholder="685"
                  required
                />
                <button
                  type="button"
                  onClick={fetchMarketPrice}
                  disabled={fetching || !form.strike || !form.expiry}
                  className="px-2 border border-terminal-border text-xs font-mono text-terminal-muted hover:text-terminal-blue disabled:opacity-40 whitespace-nowrap"
                >
                  {fetching ? '...' : 'MKT'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Contracts</label>
              <input
                type="number"
                min="1"
                className={fieldClass}
                value={form.contracts}
                onChange={e => {
                  setForm(f => ({ ...f, contracts: e.target.value }))
                  computePremium(form.sell_price, e.target.value)
                }}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Sell Price (per share)</label>
              <input
                type="number"
                step="0.01"
                className={fieldClass}
                value={form.sell_price}
                onChange={e => {
                  setForm(f => ({ ...f, sell_price: e.target.value }))
                  computePremium(e.target.value, form.contracts)
                }}
                placeholder="1.75"
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Premium Collected (auto-computed)</label>
            <input
              type="number"
              step="0.01"
              className={fieldClass + ' opacity-70'}
              value={form.premium_collected}
              onChange={e => setForm(f => ({ ...f, premium_collected: e.target.value }))}
              placeholder="1050.00"
            />
            <div className="text-xs font-mono text-terminal-muted mt-1">= sell_price × contracts × 100</div>
          </div>

          {msg && (
            <div className={`text-xs font-mono px-3 py-2 ${msg.type === 'success' ? 'text-terminal-green bg-terminal-green/10' : 'text-terminal-red bg-terminal-red/10'}`}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 font-mono text-sm font-semibold border border-terminal-green text-terminal-green bg-terminal-green/10 hover:bg-terminal-green/20 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Adding...' : '+ Add Position'}
          </button>
        </form>
      </div>
    </div>
  )
}
