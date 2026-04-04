import { useState } from 'react'

const FACTOR_DEFS = {
  iv_rank:   { name: 'IV Rank',       question: 'Are premiums worth selling today?',              explain: "IV Rank measures where today's VIX sits within its 52-week range. 0 = historically cheap options, 100 = historically expensive. Above 50 means you have a statistical edge as a seller. Below 15 means premiums are too thin." },
  vix_level: { name: 'VIX Level',     question: 'Is volatility in a safe range?',                explain: 'VIX 20–28 is the sweet spot: premiums are fat but the market isn\'t in panic mode. Above 35 brings serial down-days that can overwhelm short call positions.' },
  vvix:      { name: 'VVIX',          question: 'Is volatility itself stable?',                  explain: 'VVIX is the volatility of VIX. Above 100 signals the market is panicking about volatility itself — VIX could spike suddenly, dangerous for short options.' },
  spy_trend: { name: 'SPY Trend',     question: 'Is the market trending too fast to sell calls?', explain: 'Covered calls underperform in strong uptrends. A flat or mildly rising trend is ideal — you collect premium and the call drifts toward zero.' },
  rates:     { name: 'Rates (TNX)',   question: 'Are bonds a headwind or tailwind for SPY?',     explain: 'When the 10-year yield falls, equities tend to rally — a tailwind for SPY. Rising rates can be a headwind, increasing the risk your calls get breached.' },
  curve:     { name: 'Yield Curve',   question: 'Is the economy signaling stress?',               explain: 'Normal curve (5yr < 10yr) is healthy. Inverted curve (5yr > 10yr) has historically preceded recessions and adds a macro risk overlay.' },
}

const REGIME_EXPLAIN = {
  'SELL PREMIUM': 'All or most factors are aligned. Implied volatility is elevated, the trend is not too steep, and the vol regime is stable. This is when the academic edge exists.',
  'HOLD':         'Mixed signals. Maintain existing positions but pause new entries until the picture clarifies.',
  'CAUTION':      'Multiple warning flags. Either premiums are too cheap, volatility is unstable, or the trend is too strong. Avoid adding risk.',
  'AVOID':        'Conditions are unfavorable. The volatility risk premium is absent or risk is too elevated. Stand pat.',
}

function ScoreBar({ score, maxAbs = 3 }) {
  const pct = Math.abs(score) / maxAbs * 100
  const color = score > 0 ? 'var(--green)' : score < 0 ? 'var(--red)' : 'var(--border)'
  return (
    <div className="w-24 h-1.5 relative" style={{ backgroundColor: 'var(--border)' }}>
      {score !== 0 && (
        <div
          className="absolute top-0 h-full"
          style={{ width: `${pct}%`, backgroundColor: color, left: score > 0 ? 0 : 'auto', right: score < 0 ? 0 : 'auto' }}
        />
      )}
    </div>
  )
}

function FactorCard({ fkey, data }) {
  const def = FACTOR_DEFS[fkey] || { name: fkey, question: '', explain: '' }
  const score = data.score
  const scoreColor = score > 0 ? 'var(--green)' : score < 0 ? 'var(--red)' : 'var(--muted)'
  const borderColor = score > 0 ? 'rgba(0,255,136,0.2)' : score < 0 ? 'rgba(255,61,90,0.2)' : 'var(--border)'
  return (
    <div className="p-4 space-y-3 border" style={{ backgroundColor: 'var(--surface)', borderColor }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{def.name}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{def.question}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold font-mono" style={{ color: scoreColor }}>
            {score > 0 ? `+${score}` : score}
          </div>
          <div className="text-xs font-mono" style={{ color: scoreColor }}>{data.label}</div>
        </div>
      </div>
      <ScoreBar score={score} />
      <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{def.explain}</p>
      <div className="text-xs pt-2 border-t" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
        {data.reasoning}
      </div>
    </div>
  )
}

function TechnicalsPanel({ technicals }) {
  if (!technicals) return null
  const { rsi, bbands } = technicals
  if (!rsi && !bbands) return null

  const rsiVal = rsi ? parseFloat(Object.values(rsi)[0]?.RSI) : null
  const rsiColor = rsiVal > 70 ? 'var(--red)' : rsiVal < 30 ? 'var(--green)' : 'var(--text)'
  const rsiLabel = rsiVal > 70 ? 'Overbought' : rsiVal < 30 ? 'Oversold' : 'Neutral'

  const latestBB = bbands ? Object.values(bbands)[0] : null
  const bbUpper = latestBB ? parseFloat(latestBB['Real Upper Band']) : null
  const bbLower = latestBB ? parseFloat(latestBB['Real Lower Band']) : null
  const bbMid   = latestBB ? parseFloat(latestBB['Real Middle Band']) : null

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Technical Indicators — SPY</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>via AlphaVantage · daily data</p>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-6">
        {rsiVal != null && (
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>RSI (14)</div>
            <div className="text-2xl font-bold font-mono" style={{ color: rsiColor }}>{rsiVal.toFixed(1)}</div>
            <div className="text-xs mt-0.5" style={{ color: rsiColor }}>{rsiLabel}</div>
            <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
              RSI above 70 = overbought (rally may be exhausted). Below 30 = oversold. For covered calls, high RSI can mean a pullback is due — good for OTM calls staying OTM.
            </div>
          </div>
        )}
        {bbUpper != null && (
          <>
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>BB Upper</div>
              <div className="text-2xl font-bold font-mono" style={{ color: 'var(--red)' }}>${bbUpper.toFixed(2)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>resistance zone</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>BB Middle (20MA)</div>
              <div className="text-2xl font-bold font-mono" style={{ color: 'var(--text)' }}>${bbMid?.toFixed(2)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>mean</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>BB Lower</div>
              <div className="text-2xl font-bold font-mono" style={{ color: 'var(--green)' }}>${bbLower.toFixed(2)}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>support zone</div>
            </div>
          </>
        )}
      </div>
      {bbUpper != null && (
        <div className="px-5 pb-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          Bollinger Bands show SPY's price range relative to recent volatility. When SPY is near the upper band, it may be stretched — OTM calls are less likely to be breached in a pullback. When SPY is near the lower band, a bounce is more likely — consider selling calls at a strike near the upper band.
        </div>
      )}
    </div>
  )
}

// ── Screener ──────────────────────────────────────────────────────────────────

function ScreenerPanel({ portfolios, holdings, positions, onRefresh }) {
  const activePortfolios = (portfolios || []).filter(p => !p.archived)
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    () => activePortfolios[0]?.id || 'default'
  )
  const [maxDelta, setMaxDelta] = useState('0.30')
  const [results, setResults] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(null)   // id of candidate being added
  const [added, setAdded] = useState({})        // set of added keys

  async function runScreener() {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const params = new URLSearchParams({
        portfolio_id: selectedPortfolioId,
        max_delta: maxDelta,
      })
      const res = await fetch(`/api/screener?${params}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setResults(data.candidates || [])
      setMeta(data.meta || {})
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  async function addPosition(candidate) {
    const key = `${candidate.strike}-${candidate.expiry}`
    setAdding(key)
    try {
      const body = {
        ticker: 'SPY',
        type: 'short_call',
        strike: candidate.strike,
        expiry: candidate.expiry,
        contracts: candidate.contracts_suggested,
        sell_price: candidate.mid,
        premium_collected: candidate.premium_total,
        portfolio_id: selectedPortfolioId,
      }
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setAdded(prev => ({ ...prev, [key]: true }))
        onRefresh()
      } else {
        const err = await res.json()
        setError(err.detail || 'Failed to add position')
      }
    } catch (e) {
      setError(String(e))
    }
    setAdding(null)
  }

  const cell = 'px-3 py-2 text-xs font-mono whitespace-nowrap'
  const hdr  = 'px-3 py-2 text-xs uppercase tracking-wider font-medium text-left'
  const inputStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }

  function scoreColor(s) {
    return s >= 75 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : 'var(--muted)'
  }
  function deltaColor(d) {
    return d > 0.25 ? 'var(--red)' : d > 0.20 ? 'var(--amber)' : 'var(--text)'
  }
  function taxColor(ratio) {
    return ratio > 1.0 ? 'var(--red)' : ratio > 0.5 ? 'var(--amber)' : 'var(--green)'
  }

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Covered Call Screener</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Ranks live options chains by composite score — signal strength, annualized yield, delta safety, and assignment tax risk.
        </p>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 flex flex-wrap gap-4 items-end border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <label className="block text-xs uppercase tracking-wider mb-1 font-mono" style={{ color: 'var(--muted)' }}>Portfolio</label>
          <select
            className="px-3 py-2 text-sm font-mono border focus:outline-none"
            style={inputStyle}
            value={selectedPortfolioId}
            onChange={e => { setSelectedPortfolioId(e.target.value); setResults(null) }}
          >
            {activePortfolios.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider mb-1 font-mono" style={{ color: 'var(--muted)' }}>Max Delta</label>
          <input
            type="number" step="0.01" min="0.05" max="0.50"
            className="w-24 px-3 py-2 text-sm font-mono border focus:outline-none"
            style={inputStyle}
            value={maxDelta}
            onChange={e => setMaxDelta(e.target.value)}
          />
        </div>
        <button
          onClick={runScreener}
          disabled={loading}
          className="px-5 py-2 text-sm font-medium border disabled:opacity-50 transition-colors"
          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(0,255,136,0.08)' }}
        >
          {loading ? 'Scanning…' : 'Run Screener'}
        </button>
        {meta && (
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {meta.total_contracts} contracts available from {meta.total_shares} shares ·
            avg cost ${meta.avg_cost?.toFixed(2)} ·
            signal {meta.total_score}/12 ({meta.regime})
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--red)', backgroundColor: 'rgba(255,61,90,0.06)' }}>
          {error}
        </div>
      )}

      {/* No holdings warning */}
      {!loading && results === null && !error && (
        <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Configure your portfolio and click Run Screener to see ranked candidates.
          <br />
          <span className="text-xs">Requires SPY holdings to be entered in the Portfolios tab.</span>
        </div>
      )}

      {/* Results table */}
      {results !== null && results.length === 0 && (
        <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No candidates found matching your criteria. Try increasing Max Delta or check that SPY holdings are entered.
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                <th className={hdr}>Score</th>
                <th className={hdr}>Expiry</th>
                <th className={hdr}>Strike</th>
                <th className={hdr}>DTE</th>
                <th className={hdr}>Δ Delta</th>
                <th className={hdr}>θ/day</th>
                <th className={hdr}>Mid</th>
                <th className={hdr}>Yield/yr</th>
                <th className={hdr}>Premium</th>
                <th className={hdr}>Tax Risk</th>
                <th className={hdr}>Contracts</th>
                <th className={hdr}></th>
              </tr>
            </thead>
            <tbody>
              {results.map((c, i) => {
                const key = `${c.strike}-${c.expiry}`
                const isAdded = added[key]
                const isAdding = adding === key
                const atLimit = c.at_strike_limit || c.at_expiry_limit
                return (
                  <tr
                    key={i}
                    className="border-b"
                    style={{ borderColor: 'var(--border)', opacity: atLimit ? 0.5 : 1 }}
                  >
                    {/* Score */}
                    <td className={cell}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm" style={{ color: scoreColor(c.composite_score) }}>
                          {c.composite_score}
                        </span>
                        <div className="w-16 h-1" style={{ backgroundColor: 'var(--border)' }}>
                          <div
                            className="h-full"
                            style={{ width: `${c.composite_score}%`, backgroundColor: scoreColor(c.composite_score) }}
                          />
                        </div>
                      </div>
                    </td>
                    {/* Expiry */}
                    <td className={cell} style={{ color: 'var(--text)' }}>
                      {new Date(c.expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    {/* Strike */}
                    <td className={cell} style={{ color: 'var(--text)', fontWeight: 600 }}>${c.strike}C</td>
                    {/* DTE */}
                    <td className={cell} style={{ color: c.dte <= 14 ? 'var(--amber)' : 'var(--muted)' }}>{c.dte}d</td>
                    {/* Delta */}
                    <td className={cell} style={{ color: deltaColor(c.delta) }}>{c.delta.toFixed(3)}</td>
                    {/* Theta */}
                    <td className={cell} style={{ color: 'var(--green)' }}>${Math.abs(c.theta).toFixed(3)}</td>
                    {/* Mid */}
                    <td className={cell} style={{ color: 'var(--text)' }}>${c.mid.toFixed(2)}</td>
                    {/* Yield */}
                    <td className={cell} style={{ color: 'var(--green)' }}>{c.annualized_yield_pct.toFixed(1)}%</td>
                    {/* Premium */}
                    <td className={cell} style={{ color: 'var(--green)' }}>
                      {c.contracts_suggested > 0 ? `$${c.premium_total.toLocaleString()}` : '—'}
                    </td>
                    {/* Tax Risk */}
                    <td className={cell}>
                      <span style={{ color: taxColor(c.tax_ratio) }}>
                        {c.tax_if_assigned > 0 ? `$${c.tax_if_assigned.toLocaleString()}` : '—'}
                      </span>
                      {c.tax_if_assigned > 0 && (
                        <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                          ({(c.tax_ratio * 100).toFixed(0)}% of prem)
                        </span>
                      )}
                    </td>
                    {/* Contracts */}
                    <td className={cell} style={{ color: 'var(--muted)' }}>
                      {atLimit ? (
                        <span style={{ color: 'var(--amber)' }}>At limit</span>
                      ) : (
                        `${c.contracts_suggested}`
                      )}
                    </td>
                    {/* Add button */}
                    <td className={cell}>
                      {isAdded ? (
                        <span className="text-xs" style={{ color: 'var(--green)' }}>Added ✓</span>
                      ) : (
                        <button
                          onClick={() => addPosition(c)}
                          disabled={isAdding || atLimit || c.contracts_suggested === 0}
                          className="px-3 py-1 text-xs border disabled:opacity-40"
                          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(0,255,136,0.08)' }}
                        >
                          {isAdding ? '…' : '+ Add'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Score legend */}
          <div className="px-5 py-3 flex flex-wrap gap-4 text-xs border-t" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            <span>Score = signal (35pt) + annualized yield (35pt) + delta safety (20pt) + tax efficiency (10pt)</span>
            <span>Tax Risk = estimated 20% cap gains tax if assigned ÷ premium collected</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SignalTracker({ signalData, dashData, alphaData, portfolios, holdings, positions, onRefresh }) {
  if (!signalData) return <div className="text-sm" style={{ color: 'var(--muted)' }}>Loading signal data…</div>

  const { regime, confidence, total_score, max_score, factor_scores, recommended_strikes, warnings } = signalData
  const regimeColor = regime === 'SELL PREMIUM' ? 'var(--green)'
    : regime === 'HOLD' ? 'var(--amber)'
    : regime === 'CAUTION' ? '#f97316'
    : 'var(--red)'
  const pct = Math.max(0, total_score) / max_score * 100

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Signal Tracker</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          A multi-factor model that tells you <em>when</em> to sell covered calls, grounded in academic options research.
        </p>
      </div>

      {/* Regime card */}
      <div className="p-6 space-y-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Current Signal</div>
            <div className="text-3xl font-bold" style={{ color: regimeColor }}>{regime}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{confidence} confidence</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Score</div>
            <div className="text-3xl font-bold font-mono" style={{ color: regimeColor }}>
              {total_score}<span className="text-lg" style={{ color: 'var(--muted)' }}>/{max_score}</span>
            </div>
            <div className="w-48 h-2 mt-2 ml-auto" style={{ backgroundColor: 'var(--border)' }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: regimeColor }} />
            </div>
          </div>
        </div>
        <p className="text-sm leading-relaxed border-t pt-4" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
          {REGIME_EXPLAIN[regime] || ''}
        </p>
        {warnings?.length > 0 && (
          <div className="space-y-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            {warnings.map((w, i) => (
              <div key={i} className="text-xs" style={{ color: 'var(--amber)' }}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Technical indicators from AlphaVantage */}
      <TechnicalsPanel technicals={alphaData?.technicals} />

      {/* Factor grid */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Factor Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {factor_scores && Object.entries(factor_scores).map(([key, data]) => (
            <FactorCard key={key} fkey={key} data={data} />
          ))}
        </div>
      </div>

      {/* Strike recommendations */}
      {recommended_strikes?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Recommended New Entries</h2>
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>Based on current VIX level and available expiries in the 30–45 DTE sweet spot.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommended_strikes.map((rec, i) => (
              <div key={i} className="p-4 space-y-2 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs px-2 py-0.5 font-medium"
                    style={{
                      backgroundColor: rec.leg === 'near-term' ? 'rgba(74,158,255,0.1)' : 'rgba(255,176,32,0.1)',
                      color: rec.leg === 'near-term' ? 'var(--blue)' : 'var(--amber)',
                    }}
                  >
                    {rec.leg.toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{rec.dte} days to expiry</span>
                </div>
                <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>${rec.strike} Call · {rec.expiry}</div>
                <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                  <span>{rec.distance_pct?.toFixed(1)}% out-of-the-money</span>
                  <span>Target delta ~{rec.delta_target}</span>
                  <span style={{ color: 'var(--green)' }}>~${rec.estimated_premium?.toFixed(2)} est. premium</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{rec.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Academic footnote */}
      <div className="border-l-2 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          <span className="font-medium" style={{ color: 'var(--text)' }}>Academic basis:</span>{' '}
          Israelov & Nielsen (AQR, FAJ 2015) · Ibbotson Associates BXM study (2004) · Whaley (2002).
          Core thesis: implied volatility historically exceeds realized volatility by ~3 points — the Volatility Risk Premium is the seller's edge.
          Optimal window: 30–45 DTE. Exit at 50% profit to maximize annualized return.
        </p>
      </div>

      {/* Screener */}
      <ScreenerPanel
        portfolios={portfolios}
        holdings={holdings}
        positions={positions}
        onRefresh={onRefresh}
      />
    </div>
  )
}
