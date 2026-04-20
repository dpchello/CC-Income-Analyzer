import { useState, useEffect } from 'react'
import { useAuth } from '../auth.jsx'
import { Bar } from '@visx/shape'
import { scaleLinear, scaleBand } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { Group } from '@visx/group'
import { useTooltip, TooltipWithBounds, defaultStyles as tooltipDefaultStyles } from '@visx/tooltip'
import { ParentSize } from '@visx/responsive'
import { Term } from './Tooltip.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const FACTOR_DEFS = {
  iv_rank:        { name: 'Option Price Level',      question: 'Are options priced well enough to sell today?',   explain: "Option Price Level (IV Rank) measures where today's option premiums sit relative to the past year. 0 = premiums are historically cheap, 100 = historically expensive. Above 50 means you have a statistical edge as a seller — you're collecting more than average. Below 15 means premiums are too thin to be worth the risk.", calc: "IV Rank = (today's IV − 52-week low IV) ÷ (52-week high IV − 52-week low IV) × 100. Above 70 → +3 pts · 50–70 → +2 · 30–49 → +1 · 15–29 → −1 · below 15 → −3. Data via yfinance intraday implied volatility." },
  vix_level:      { name: 'Volatility Level',        question: 'Is market volatility in a healthy range?',        explain: "Volatility (VIX) measures how much the market expects stocks to move. VIX 20–28 is the sweet spot: option premiums are generous but the market isn't in panic mode. Above 35 brings serial down-days that can overwhelm short call positions.", calc: 'VIX is the CBOE Volatility Index, fetched via yfinance ticker ^VIX. Scoring: 20–28 → +2 pts · 15–19 → +1 · 28–35 → 0 · above 35 → −2. The absolute level is scored independently of IV Rank — they measure different things.' },
  vvix:           { name: 'Volatility Stability',    question: 'Is volatility itself stable right now?',           explain: 'Volatility Stability (VVIX) measures how unpredictable the volatility level is. Above 100 signals the market is panicking about volatility itself — it could spike suddenly, which is dangerous when you have sold options.', calc: 'VVIX is the CBOE VIX of VIX index, fetched via yfinance ticker ^VVIX. Scoring: below 90 → +1 pt · 90–100 → 0 · above 100 → −2. A high VVIX reading means volatility itself is volatile — hard to predict, dangerous for options sellers.' },
  spy_trend:      { name: 'Market Trend',            question: 'Is the market trending too strongly to sell calls?', explain: 'Selling calls works best when the market is flat or rising slowly. A steep uptrend means your calls may get breached (stock blows past your strike) and you miss out on the rally. A flat or gently rising trend is ideal.', calc: "SPY's 20-day moving average and slope (% per month) are computed from daily close prices via yfinance. Scoring: above MA + slope < 0.5%/mo → +2 · above MA + slope 0.5–1.5% → +1 · below MA → 0 · slope > 1.5%/mo → −2." },
  rates:          { name: 'Interest Rates (10yr)',   question: 'Are interest rates helping or hurting stocks?',   explain: 'When 10-year bond yields fall, stocks tend to rise — a tailwind. Rising rates can be a headwind for stocks, increasing the chance your short calls get breached.', calc: 'The 10-year Treasury yield (^TNX) and TLT (20+ year bond ETF) are fetched via yfinance. Direction is measured over the past 5 trading days. Scoring: yield falling + bonds rising → +1 · yield rising sharply + bonds falling → −1 · otherwise → 0.' },
  curve:          { name: 'Economic Stress Signal',  question: 'Is the economy showing signs of stress?',         explain: 'The yield curve compares short-term and long-term interest rates. A normal curve (short rates lower) signals a healthy economy. An inverted curve (short rates higher) has historically preceded recessions and raises the overall risk level.', calc: 'Compares the 5-year Treasury yield (^FVX) to the 10-year Treasury yield (^TNX), both via yfinance. Scoring: 5yr < 10yr (normal curve) → +1 · 5yr > 10yr (inverted) → −1. This is a tie-breaker with limited weight.' },
  recovery_phase: { name: 'Market Recovery Mode',   question: 'Is the market bouncing back from a dip?',         explain: "When the market has just sold off sharply and is now recovering strongly, your short calls become a problem — they cap how much you benefit from the rebound. If volatility has dropped 25%+ from a recent spike and stocks have bounced 4%+ off their lows, this factor scores negative to flag the risk. This is the period where the strategy historically underperforms the most.", calc: 'Triggered when both: (1) VIX has dropped ≥25% from its recent 10-day high (fear subsiding), and (2) SPY has bounced ≥4% from its recent 10-day low (stocks recovering). Both must be true simultaneously. Score: −2 when triggered, 0 otherwise.' },
}

const REGIME_EXPLAIN = {
  'SELL PREMIUM': 'Good Time to Open — most factors are aligned. Option premiums are elevated, the market trend is not too steep, and volatility is stable. This is when the strategy has its best historical edge.',
  'HOLD':         'Hold — Pause New Positions. Signals are mixed. Keep existing positions running but wait for a clearer picture before opening new ones.',
  'CAUTION':      'Be Careful. Multiple warning signs are present — either premiums are too thin, volatility is unstable, or the trend is too strong. Avoid adding new risk.',
  'AVOID':        'Not a Good Time. Conditions are unfavorable. The edge that options sellers usually have is absent or risk is too high. Stay put with existing positions.',
}

const REGIME_SHORT_LABEL = {
  'SELL PREMIUM': 'Good Time to Open',
  'HOLD':         'Hold — Pause New Positions',
  'CAUTION':      'Be Careful',
  'AVOID':        'Not a Good Time',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Sub-components ────────────────────────────────────────────────────────────

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

// Raw value formatters per factor key
const FACTOR_RAW_VALUE = {
  iv_rank:        m => m?.iv_rank      != null ? `IV Rank = ${m.iv_rank.toFixed(0)}` : null,
  vix_level:      m => m?.vix          != null ? `VIX = ${m.vix.toFixed(2)}` : null,
  vvix:           m => m?.vvix         != null ? `VVIX = ${m.vvix.toFixed(0)}` : null,
  spy_trend:      m => m?.spy_slope_pct != null ? `20d slope = ${m.spy_slope_pct > 0 ? '+' : ''}${m.spy_slope_pct.toFixed(2)}%/mo` : null,
  rates:          m => m?.tnx          != null ? `TNX = ${m.tnx.toFixed(2)}%` : null,
  curve:          m => (m?.tnx != null && m?.fvx != null) ? `TNX ${m.tnx.toFixed(2)}% · FVX ${m.fvx.toFixed(2)}%` : null,
  recovery_phase: m => m?.vix          != null ? `VIX = ${m.vix.toFixed(2)}` : null,
}

function FactorCard({ fkey, data, marketInputs, asOf }) {
  const def = FACTOR_DEFS[fkey] || { name: fkey, question: '', explain: '' }
  const score = data.score
  const scoreColor = score > 0 ? 'var(--green)' : score < 0 ? 'var(--red)' : 'var(--muted)'
  const borderColor = score > 0 ? 'rgba(62,207,142,0.25)' : score < 0 ? 'rgba(248,113,113,0.25)' : 'var(--border)'
  const rawValue = FACTOR_RAW_VALUE[fkey]?.(marketInputs)
  const asOfStr = asOf ? new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  const [calcOpen, setCalcOpen] = useState(false)

  return (
    <div className="p-4 space-y-3 border" style={{ backgroundColor: 'var(--surface)', borderColor, borderRadius: 'var(--radius-md)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {fkey === 'iv_rank'  ? <Term id="IVRank">{def.name}</Term>
             : fkey === 'vvix'   ? <Term id="VVIX">{def.name}</Term>
             : fkey === 'vix_level' ? <Term id="VVIX">{def.name}</Term>
             : def.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{def.question}</div>
          {rawValue && (
            <div className="text-xs font-mono mt-1.5" style={{ color: 'var(--text)' }}>
              {rawValue}
              {asOfStr && <span className="ml-1.5" style={{ color: 'var(--muted)' }}>as of {asOfStr}</span>}
            </div>
          )}
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
      {def.calc && (
        <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
          <button
            className="text-xs flex items-center gap-1 transition-colors"
            style={{ color: 'var(--muted)', backgroundColor: 'transparent' }}
            onClick={() => setCalcOpen(o => !o)}
          >
            <span style={{ color: 'var(--green)', fontSize: 9 }}>{calcOpen ? '▼' : '▶'}</span>
            How is this calculated?
          </button>
          {calcOpen && (
            <p className="text-xs mt-2 leading-relaxed px-2 py-2 border-l-2" style={{ color: 'var(--muted)', borderColor: 'var(--border)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
              {def.calc}
            </p>
          )}
        </div>
      )}
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
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
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
              RSI above 70 = overbought. Below 30 = oversold. High RSI can mean a pullback is due — good for OTM calls.
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
    </div>
  )
}

// ── Screener ──────────────────────────────────────────────────────────────────

export function ScreenerPanel({ portfolios, holdings, positions, onRefresh, regime, userTier, onUpgrade }) {
  const { apiFetch } = useAuth()
  const activePortfolios = (portfolios || []).filter(p => !p.archived)
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    () => activePortfolios[0]?.id || 'default'
  )
  // DTE range presets: label, min_dte, max_dte
  const DTE_RANGES = [
    { id: '0-15',  label: '0 – 15d',  minDte: 0,  maxDte: 15  },
    { id: '16-30', label: '16 – 30d', minDte: 16, maxDte: 30  },
    { id: '31-45', label: '31 – 45d', minDte: 31, maxDte: 45  },
    { id: '46-60', label: '46 – 60d', minDte: 46, maxDte: 60  },
    { id: '61+',   label: '61d +',    minDte: 61, maxDte: 120 },
    { id: 'all',   label: 'All',      minDte: 0,  maxDte: 120 },
  ]
  const SHOW_COUNTS = [5, 10, 20, 50]

  const [minDelta,  setMinDelta]    = useState('0.05')
  const [maxDelta,  setMaxDelta]    = useState('0.30')
  const [dteRange,  setDteRange]    = useState('31-45')
  const [showCount, setShowCount]   = useState(20)
  const [recFilter, setRecFilter]   = useState('all')
  const [results, setResults] = useState(null)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(null)
  const [added, setAdded] = useState({})
  const [sortCol, setSortCol] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const [colExp, setColExp]   = useState({ price: false, greeks: false, volume: false, score: false, value: false })

  useEffect(() => { runScreener() }, [selectedPortfolioId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function runScreener() {
    const dte  = DTE_RANGES.find(d => d.id === dteRange) || DTE_RANGES[5]
    const minD = Math.max(0.01, Math.min(0.49, parseFloat(minDelta) || 0.05))
    const maxD = Math.max(minD + 0.01, Math.min(0.50, parseFloat(maxDelta) || 0.30))
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const params = new URLSearchParams({
        portfolio_id: selectedPortfolioId,
        min_delta: minD,
        max_delta: maxD,
        min_dte: dte.minDte,
        max_dte: dte.maxDte,
        limit: showCount,
      })
      const res = await apiFetch(`/api/screener?${params}`)
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        const code = body?.detail?.code || body?.code
        if (code === 'DAILY_LIMIT_REACHED') {
          setError('DAILY_LIMIT_REACHED')
        } else if (code === 'UPGRADE_REQUIRED') {
          setError('UPGRADE_REQUIRED')
        } else {
          setError(`Server error ${res.status}`)
        }
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setResults(data.candidates || [])
      setMeta(data.meta || {})
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  async function addPosition(c) {
    const key = `${c.strike}-${c.expiry}`
    setAdding(key)
    try {
      const body = {
        ticker: 'SPY', type: 'short_call',
        strike: c.strike, expiry: c.expiry,
        contracts: c.contracts_suggested, sell_price: c.mid,
        premium_collected: c.premium_total, portfolio_id: selectedPortfolioId,
      }
      const res = await fetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { setAdded(prev => ({ ...prev, [key]: true })); onRefresh() }
      else { const err = await res.json(); setError(err.detail || 'Failed to add') }
    } catch (e) { setError(String(e)) }
    setAdding(null)
  }

  const inputStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }
  const hdr = 'px-3 py-2.5 text-xs uppercase tracking-wider font-medium text-left whitespace-nowrap'
  const cell = 'px-3 py-2 text-xs font-mono whitespace-nowrap'

  function scoreColor(s) { return s >= 75 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : 'var(--muted)' }
  function deltaColor(d) { return d > 0.25 ? 'var(--red)' : d > 0.20 ? 'var(--amber)' : 'var(--text)' }
  function taxColor(r)   { return r > 1.0 ? 'var(--amber)' : 'var(--muted)' }
  function ivColor(iv)   { return iv > 0.40 ? 'var(--amber)' : 'var(--text)' }

  // Unified recommendation for every row — open positions take priority
  function rec(c) {
    const d = c.delta
    const ivPct = c.iv != null ? c.iv * 100 : null
    const dStr = d != null ? d.toFixed(2) : '?'
    const ivStr = ivPct != null ? ivPct.toFixed(0) : '?'

    if (c.has_position) {
      const pnlPct = c.position_sell_price > 0
        ? ((c.position_sell_price - c.mid) / c.position_sell_price) * 100
        : null
      if (d != null && d > 0.35)
        return { text: 'CLOSE', color: 'var(--red)',
          tip: `You hold ${c.position_contracts} contract(s) here. Delta ${dStr} is elevated — this call is moving toward the money. Close now to avoid assignment risk.` }
      if (d != null && d < 0.10)
        return { text: 'CLOSE EARLY', color: 'var(--green)',
          tip: `You hold ${c.position_contracts} contract(s) here. Delta ${dStr} is very low — ~${pnlPct != null ? pnlPct.toFixed(0) + '% profit captured' : 'most premium decayed'}. Close early, lock in the gain, and free up capacity.` }
      return { text: 'HOLD', color: 'var(--amber)',
        tip: `You hold ${c.position_contracts} contract(s) here. Delta ${dStr} is in a safe range — let theta decay. Monitor if delta approaches 0.35.` }
    }

    if (d == null || ivPct == null)
      return { text: 'NO DATA', color: 'var(--muted)', tip: 'Greeks unavailable for this strike.' }
    if (ivPct < 15)
      return { text: 'SKIP', color: 'var(--muted)',
        tip: `IV ${ivStr}% is too low — premium is too thin relative to the risk of tying up shares.` }
    if (regime === 'AVOID')
      return { text: 'SKIP', color: 'var(--muted)',
        tip: `Market regime is AVOID. Conditions are unfavorable for selling premium regardless of strike quality.` }
    if (c.composite_score >= 75 && regime === 'SELL PREMIUM')
      return { text: 'OPEN NOW', color: 'var(--green)',
        tip: `Score ${c.composite_score}/100. Delta ${dStr}, IV ${ivStr}%, regime SELL PREMIUM — all factors aligned. High-conviction entry.` }
    if (c.composite_score >= 60)
      return { text: 'OPEN', color: 'var(--green)',
        tip: `Score ${c.composite_score}/100. Delta ${dStr}, IV ${ivStr}% — solid candidate.` }
    if (c.composite_score >= 45)
      return { text: 'CONSIDER', color: 'var(--amber)',
        tip: `Score ${c.composite_score}/100. Delta ${dStr}, IV ${ivStr}% — acceptable but not ideal. Check if a different expiry scores better.` }
    return { text: 'SKIP', color: 'var(--muted)',
      tip: `Score ${c.composite_score}/100. Delta ${dStr}, IV ${ivStr}% — not worth the premium at this time.` }
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function toggleCol(key) { setColExp(e => ({ ...e, [key]: !e[key] })) }

  // Clickable group header — expands the group
  function GroupTh({ groupKey, label }) {
    return (
      <th className={hdr + ' cursor-pointer select-none'} style={{ color: 'var(--muted)' }} onClick={() => toggleCol(groupKey)}>
        {label}<span style={{ color: 'var(--green)', fontSize: '9px', marginLeft: '4px' }}>▸</span>
      </th>
    )
  }
  // First sub-header when expanded — collapses the group
  function CollapseTh({ groupKey, children }) {
    return (
      <th className={hdr + ' cursor-pointer select-none'} style={{ color: 'var(--muted)' }} onClick={() => toggleCol(groupKey)}>
        {children}<span style={{ color: 'var(--green)', fontSize: '9px', marginLeft: '4px' }}>▾</span>
      </th>
    )
  }

  function sortedResults() {
    if (!results) return []
    const pinned  = results.filter(c => c.has_position)
    const rest    = results.filter(c => !c.has_position)
    const key     = sortCol
    const sign    = sortDir === 'asc' ? 1 : -1
    const sorted  = [...rest].sort((a, b) => {
      const av = a[key] ?? -Infinity
      const bv = b[key] ?? -Infinity
      return typeof av === 'string' ? av.localeCompare(bv) * sign : (av - bv) * sign
    })
    return [...pinned, ...sorted]
  }

  function Th({ col, children, style }) {
    const active = sortCol === col
    const arrow  = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    return (
      <th
        className={hdr + ' cursor-pointer select-none hover:text-[var(--text)] transition-colors'}
        style={{ color: active ? 'var(--text)' : 'var(--muted)', ...style }}
        onClick={() => toggleSort(col)}
      >
        {children}{arrow && <span style={{ color: 'var(--green)' }}>{arrow}</span>}
      </th>
    )
  }

  const [scoreGuideOpen, setScoreGuideOpen] = useState(false)

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      {/* Header */}
      <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Options Screener</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Live SPY options chain · ranked by composite score (signal + raw yield + delta safety + DTE quality)
            </p>
          </div>
          <button
            className="text-xs flex items-center gap-1 shrink-0 transition-colors"
            style={{ color: 'var(--muted)', backgroundColor: 'transparent' }}
            onClick={() => setScoreGuideOpen(o => !o)}
          >
            <span style={{ color: 'var(--green)', fontSize: 9 }}>{scoreGuideOpen ? '▼' : '▶'}</span>
            How scoring works
          </button>
        </div>

        {/* Inline score component guide */}
        {scoreGuideOpen && (
          <div className="mt-3 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-2" style={{ borderColor: 'var(--border)' }}>
            {[
              { label: 'A · Market Signal', pts: 'up to 25 pts', color: 'var(--green)', why: 'A great option in bad market conditions is still a bad trade. This component ensures the macro environment is right before anything else matters. If conditions are unfavorable, the max achievable score drops — protecting you from acting on good-looking numbers at the wrong time.' },
              { label: 'B · Income Potential', pts: 'up to 30 pts', color: 'var(--green)', why: 'The primary reason to sell a covered call is income. This component scores how much you\'d collect relative to SPY\'s price. It gets the highest weight because it directly determines whether the trade is financially worth doing.' },
              { label: 'C · Assignment Risk', pts: 'up to 20 pts', color: 'var(--amber)', why: 'Assignment means your shares get sold. Lower assignment risk (lower delta) means more buffer between SPY\'s current price and your strike. High-risk options score lower here even if they pay more — the extra income rarely compensates for the loss of upside.' },
              { label: 'D · Timing Sweet Spot', pts: 'up to 25 pts', color: 'var(--amber)', why: 'Options decay fastest in the 21–45 day window before expiry — that\'s where you collect the most income per day of risk. Too short and last-minute moves can blow past your strike. Too long and your capital is tied up for too little return.' },
            ].map(s => (
              <div key={s.label} className="p-3 border text-xs" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-semibold" style={{ color: s.color }}>{s.label}</span>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>{s.pts}</span>
                </div>
                <p className="leading-relaxed" style={{ color: 'var(--muted)' }}>{s.why}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-4 border-b" style={{ borderColor: 'var(--border)' }}>

        {/* Row 1: Portfolio + Run button + meta */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wider mb-1 font-mono" style={{ color: 'var(--muted)' }}>Portfolio</label>
            <select
              className="px-3 py-2 text-sm font-mono border focus:outline-none"
              style={inputStyle}
              value={selectedPortfolioId}
              onChange={e => { setSelectedPortfolioId(e.target.value); setResults(null) }}
            >
              {activePortfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button
            onClick={runScreener} disabled={loading}
            className="px-5 py-2 text-sm font-medium border disabled:opacity-50"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}
          >
            {loading ? 'Scanning…' : 'Run Screener'}
          </button>
          {meta && (
            <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {meta.total_contracts} contracts · {meta.total_shares} shares · avg cost ${meta.avg_cost?.toFixed(2)} · signal {meta.signal_score}/12
            </div>
          )}
        </div>

        {/* Row 2: Delta range inputs */}
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-xs uppercase tracking-wider font-mono w-20 shrink-0" style={{ color: 'var(--muted)' }}>Delta</span>
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Min Δ</label>
            <input
              type="number" min="0.01" max="0.49" step="0.01"
              value={minDelta}
              onChange={e => setMinDelta(e.target.value)}
              className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Max Δ</label>
            <input
              type="number" min="0.02" max="0.50" step="0.01"
              value={maxDelta}
              onChange={e => setMaxDelta(e.target.value)}
              className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none"
              style={inputStyle}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
            Δ {parseFloat(minDelta).toFixed(2)} – {parseFloat(maxDelta).toFixed(2)}
          </span>
        </div>

        {/* Row 3: DTE range chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wider font-mono w-20 shrink-0" style={{ color: 'var(--muted)' }}>Expiry</span>
          {DTE_RANGES.map(d => {
            const active = dteRange === d.id
            return (
              <button
                key={d.id}
                onClick={() => setDteRange(d.id)}
                className="px-3 py-1 text-xs font-mono border transition-colors"
                style={{
                  borderColor: active ? 'var(--text)' : 'var(--border)',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  backgroundColor: active ? 'rgba(128,128,128,0.1)' : 'transparent',
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>

        {/* Row 4: Show count chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wider font-mono w-20 shrink-0" style={{ color: 'var(--muted)' }}>Show</span>
          {SHOW_COUNTS.map(n => {
            const active = showCount === n
            return (
              <button
                key={n}
                onClick={() => setShowCount(n)}
                className="px-3 py-1 text-xs font-mono border transition-colors"
                style={{
                  borderColor: active ? 'var(--text)' : 'var(--border)',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  backgroundColor: active ? 'rgba(128,128,128,0.1)' : 'transparent',
                }}
              >
                {n}
              </button>
            )
          })}
          <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>results</span>
        </div>

        {/* Row 5: Rec filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wider font-mono w-20 shrink-0" style={{ color: 'var(--muted)' }}>Rec</span>
          {[
            { id: 'all',        label: 'All',                    color: 'var(--muted)' },
            { id: 'OPEN NOW',   label: 'Open Now — Best',        color: 'var(--green)' },
            { id: 'OPEN',       label: 'Open — Good',            color: 'var(--green)' },
            { id: 'CONSIDER',   label: 'Consider',               color: 'var(--amber)' },
            { id: 'HOLD',       label: 'Hold Position',          color: 'var(--amber)' },
            { id: 'CLOSE EARLY',label: 'Lock In Profits',        color: 'var(--green)' },
            { id: 'CLOSE',      label: 'Close — High Risk',      color: 'var(--red)'   },
            { id: 'SKIP',       label: 'Skip',                   color: 'var(--muted)' },
          ].map(rf => {
            const active = recFilter === rf.id
            return (
              <button
                key={rf.id}
                onClick={() => setRecFilter(rf.id)}
                className="px-3 py-1 text-xs font-mono border transition-colors"
                style={{
                  borderColor: active ? rf.color : 'var(--border)',
                  color: active ? rf.color : 'var(--muted)',
                  backgroundColor: active ? `${rf.color}18` : 'transparent',
                }}
              >
                {rf.label}
              </button>
            )
          })}
        </div>

      </div>

      {error === 'DAILY_LIMIT_REACHED' && (
        <div className="px-5 py-8 text-center space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Daily screener limit reached</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Free accounts get 1 screener run per day. Upgrade to Pro for unlimited runs.
          </p>
          {onUpgrade && (
            <button
              onClick={() => onUpgrade('You\'ve used your 1 free screener run for today.')}
              className="text-xs px-3 py-1.5 font-semibold"
              style={{ background: 'var(--gold)', color: '#1a1208', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              Upgrade to Pro →
            </button>
          )}
        </div>
      )}
      {error && error !== 'DAILY_LIMIT_REACHED' && error !== 'UPGRADE_REQUIRED' && (
        <div className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--red)', backgroundColor: 'rgba(248,113,113,0.08)' }}>{error}</div>
      )}

      {!loading && results === null && !error && (
        <div className="px-5 py-10 text-center space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No strong candidates right now.</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No SPY holdings found for this portfolio — add your shares in the My Positions tab to calculate contract sizing and after-tax estimates.
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Check back after the next market session.</p>
        </div>
      )}

      {results !== null && results.length === 0 && (
        <div className="px-5 py-10 text-center space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No strong candidates right now.</p>
          {regime === 'AVOID' ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              The market signal is <span style={{ color: 'var(--red)' }}>Not a Good Time</span> — conditions aren't ideal for new positions. No candidates are shown when the signal is in AVOID mode.
            </p>
          ) : regime === 'CAUTION' ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              The market signal is <span style={{ color: 'var(--orange)' }}>Be Careful</span> — multiple warning signs are present. Try widening your delta range or switching DTE window.
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No candidates match your current filters. Try a different DTE range, widen the delta filter, or add SPY holdings to unlock sizing.
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Check back after the next market session.</p>
        </div>
      )}

      {results !== null && results.length > 0 && (
        <>
          {/* Column hint */}
          <div className="px-5 py-2 border-b text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
            Click <span style={{ color: 'var(--green)' }}>▸</span> group headers to expand · Δ = assignment risk · θ = daily income decay · Γ = gamma · OI = open interest · Yield% = income ÷ stock price · Value = intrinsic (in-the-money portion) + time value (pure premium)
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
                  {/* 1 Strike */}
                  <Th col="strike"><Term id="Strike">Strike</Term></Th>
                  {/* 2 Expiry / DTE */}
                  <Th col="expiry"><Term id="Expiry">Expiry</Term> / <Term id="DTE">Days Left</Term></Th>
                  {/* 3 Rec */}
                  <th className={hdr} style={{ color: 'var(--muted)' }}>Action</th>
                  {/* 4 Price group */}
                  {!colExp.price ? (
                    <GroupTh groupKey="price" label="Price" />
                  ) : (
                    <>
                      <CollapseTh groupKey="price">Bid</CollapseTh>
                      <Th col="ask">Ask</Th>
                      <Th col="mid"><Term id="Premium">Mid</Term></Th>
                    </>
                  )}
                  {/* 4b Value group */}
                  {!colExp.value ? (
                    <GroupTh groupKey="value" label="Value" />
                  ) : (
                    <>
                      <CollapseTh groupKey="value">Intrinsic</CollapseTh>
                      <Th col="time_premium">Time Value</Th>
                      <Th col="ex_div">Ex-Div</Th>
                    </>
                  )}
                  {/* 5 Greeks group */}
                  {!colExp.greeks ? (
                    <GroupTh groupKey="greeks" label="Greeks" />
                  ) : (
                    <>
                      <CollapseTh groupKey="greeks"><Term id="Delta">Δ Assign. Risk</Term></CollapseTh>
                      <Th col="gamma"><Term id="Gamma">Γ Gamma</Term></Th>
                      <Th col="theta"><Term id="Theta">θ / day</Term></Th>
                      <Th col="vega">Vega</Th>
                    </>
                  )}
                  {/* 6 IV% */}
                  <Th col="iv"><Term id="IVRank">IV%</Term></Th>
                  {/* 7 Volume group */}
                  {!colExp.volume ? (
                    <GroupTh groupKey="volume" label="Volume" />
                  ) : (
                    <>
                      <CollapseTh groupKey="volume"><Term id="OpenInterest">OI</Term></CollapseTh>
                      <Th col="volume">Volume</Th>
                    </>
                  )}
                  {/* 8 Score group */}
                  {!colExp.score ? (
                    <GroupTh groupKey="score" label="Score" />
                  ) : (
                    <>
                      <CollapseTh groupKey="score"><Term id="CompositeScore">Total</Term></CollapseTh>
                      <th className={hdr} style={{ color: 'var(--muted)' }}>
                        <div><Term id="SignalScore">Signal</Term></div>
                        <div className="text-[9px] font-normal normal-case tracking-normal mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>market conditions</div>
                      </th>
                      <th className={hdr} style={{ color: 'var(--muted)' }}>
                        <div>Yield</div>
                        <div className="text-[9px] font-normal normal-case tracking-normal mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>income potential</div>
                      </th>
                      <th className={hdr} style={{ color: 'var(--muted)' }}>
                        <div>Risk</div>
                        <div className="text-[9px] font-normal normal-case tracking-normal mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>assignment safety</div>
                      </th>
                      <th className={hdr} style={{ color: 'var(--muted)' }}>
                        <div>Days</div>
                        <div className="text-[9px] font-normal normal-case tracking-normal mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>timing sweet spot</div>
                      </th>
                    </>
                  )}
                  {/* Yield% standalone */}
                  <Th col="raw_yield_pct">Yield%</Th>
                  {/* Action */}
                  <th className={hdr}></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults().filter(c => recFilter === 'all' || rec(c).text === recFilter).map((c, i) => {
                  const key = `${c.strike}-${c.expiry}`
                  const isAdded = added[key]
                  const isAdding = adding === key
                  const r = rec(c)
                  const rowBg = c.has_position ? 'rgba(255,176,32,0.04)' : undefined
                  const sb = c.score_breakdown || {}

                  return (
                    <tr key={i} className="border-b hover:bg-white/5 transition-colors" style={{ borderColor: 'var(--border)', backgroundColor: rowBg }}>
                      {/* Strike */}
                      <td className={cell} style={{ color: 'var(--text)', fontWeight: 700 }}>${c.strike}C</td>
                      {/* Expiry / DTE */}
                      <td className={cell}>
                        <div style={{ color: 'var(--text)' }}>
                          {new Date(c.expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px]" style={{ color: c.dte <= 14 ? 'var(--amber)' : 'var(--muted)' }}>{c.dte}d</div>
                      </td>
                      {/* Rec */}
                      <td className={cell}>
                        <div className="flex flex-col gap-0.5">
                          <span
                            title={r.tip}
                            className="px-2 py-0.5 text-[11px] font-semibold font-mono cursor-help inline-block"
                            style={{ color: r.color, backgroundColor: `${r.color}18`, border: `1px solid ${r.color}40`, borderRadius: 'var(--radius-sm)' }}
                          >
                            {r.text}
                          </span>
                          {c.has_position && (
                            <span className="px-2 py-0.5 text-[10px] font-mono inline-block" style={{ color: 'var(--amber)', backgroundColor: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.2)', borderRadius: 'var(--radius-sm)' }}>
                              {c.position_contracts} ct{c.position_contracts !== 1 ? 's' : ''} @ ${c.position_sell_price?.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Price group */}
                      {!colExp.price ? (
                        <td className={cell} style={{ color: 'var(--text)', fontWeight: 600 }}>${c.mid.toFixed(2)}</td>
                      ) : (
                        <>
                          <td className={cell} style={{ color: 'var(--muted)' }}>${c.bid.toFixed(2)}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>${c.ask.toFixed(2)}</td>
                          <td className={cell} style={{ color: 'var(--text)', fontWeight: 600 }}>${c.mid.toFixed(2)}</td>
                        </>
                      )}
                      {/* Value group */}
                      {!colExp.value ? (
                        <td className={cell}>
                          <div style={{ color: 'var(--text)', fontWeight: 600 }}>${(c.time_premium ?? c.mid ?? 0).toFixed(2)}</div>
                          <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>time val</div>
                          {c.expiry_after_ex_div && c.upcoming_dividend > 0 && (
                            <div className="text-[10px] font-mono px-1 mt-0.5 inline-block"
                                 style={{ color: 'var(--amber)', backgroundColor: 'rgba(255,176,32,0.12)', border: '1px solid rgba(255,176,32,0.3)', borderRadius: 'var(--radius-sm)' }}>
                              ex-div risk
                            </div>
                          )}
                        </td>
                      ) : (
                        <>
                          <td className={cell} style={{ color: (c.intrinsic_value ?? 0) > 0 ? 'var(--red)' : 'var(--muted)' }}>
                            ${(c.intrinsic_value ?? 0).toFixed(2)}
                          </td>
                          <td className={cell}>
                            <div style={{ color: 'var(--green)', fontWeight: 600 }}>${(c.time_premium ?? 0).toFixed(2)}</div>
                            {c.expiry_after_ex_div && c.upcoming_dividend > 0 && (c.time_premium ?? 0) < c.upcoming_dividend && (
                              <div className="text-[10px] font-mono" style={{ color: 'var(--amber)' }}>div trap</div>
                            )}
                          </td>
                          <td className={cell}>
                            {c.next_ex_div_date ? (
                              <>
                                <div style={{ color: c.expiry_after_ex_div ? 'var(--amber)' : 'var(--muted)' }}>
                                  {c.next_ex_div_date}
                                </div>
                                {c.days_until_ex_div != null && (
                                  <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{c.days_until_ex_div}d away</div>
                                )}
                                {c.expiry_after_ex_div && (
                                  <div className="text-[10px] font-semibold" style={{ color: 'var(--amber)' }}>straddles</div>
                                )}
                              </>
                            ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                          </td>
                        </>
                      )}
                      {/* Greeks group */}
                      {!colExp.greeks ? (
                        <td className={cell} style={{ color: deltaColor(c.delta) }}>{c.delta != null ? c.delta.toFixed(3) : '—'}</td>
                      ) : (
                        <>
                          <td className={cell} style={{ color: deltaColor(c.delta) }}>{c.delta != null ? c.delta.toFixed(3) : '—'}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{c.gamma != null ? c.gamma.toFixed(4) : '—'}</td>
                          <td className={cell} style={{ color: 'var(--green)' }}>${Math.abs(c.theta ?? 0).toFixed(3)}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{c.vega != null ? c.vega.toFixed(3) : '—'}</td>
                        </>
                      )}
                      {/* IV% */}
                      <td className={cell} style={{ color: ivColor(c.iv) }}>
                        {c.iv != null ? `${(c.iv * 100).toFixed(1)}%` : '—'}
                      </td>
                      {/* Volume group */}
                      {!colExp.volume ? (
                        <td className={cell}>
                          <span style={{ color: 'var(--muted)' }}>
                            {c.open_interest > 0 ? c.open_interest.toLocaleString() : '—'}
                          </span>
                          {c.oi_change_1d_pct != null && (() => {
                            const pct = c.oi_change_1d_pct
                            const color = pct <= -35 ? 'var(--red)'
                              : pct <= -20 ? 'var(--amber)'
                              : pct >= 25  ? 'var(--blue)'
                              : 'var(--muted)'
                            return (
                              <span className="ml-1 text-[10px] font-mono px-1"
                                    style={{ backgroundColor: color + '20', color }}>
                                {pct > 0 ? '+' : ''}{pct}%
                              </span>
                            )
                          })()}
                        </td>
                      ) : (
                        <>
                          <td className={cell}>
                            <span style={{ color: 'var(--muted)' }}>
                              {c.open_interest > 0 ? c.open_interest.toLocaleString() : '—'}
                            </span>
                            {c.oi_change_1d_pct != null && (() => {
                              const pct = c.oi_change_1d_pct
                              const color = pct <= -35 ? 'var(--red)'
                                : pct <= -20 ? 'var(--amber)'
                                : pct >= 25  ? 'var(--blue)'
                                : 'var(--muted)'
                              return (
                                <span className="ml-1 text-[10px] font-mono px-1"
                                      style={{ backgroundColor: color + '20', color }}>
                                  {pct > 0 ? '+' : ''}{pct}%
                                </span>
                              )
                            })()}
                          </td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>
                            {c.volume > 0 ? c.volume.toLocaleString() : '—'}
                          </td>
                        </>
                      )}
                      {/* Score / Confidence group */}
                      {!colExp.score ? (
                        <td className={cell}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: scoreColor(c.composite_score), fontWeight: 700 }}>{c.composite_score}</span>
                            <div className="w-10 h-1" style={{ backgroundColor: 'var(--border)' }}>
                              <div className="h-full" style={{ width: `${c.composite_score}%`, backgroundColor: scoreColor(c.composite_score) }} />
                            </div>
                          </div>
                          <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                            {c.composite_score >= 80 ? 'High confidence' : c.composite_score >= 60 ? 'Moderate' : 'Low confidence'}
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className={cell}>
                            <div className="flex items-center gap-1.5">
                              <span style={{ color: scoreColor(c.composite_score), fontWeight: 700 }}>{c.composite_score}</span>
                              <div className="w-8 h-1" style={{ backgroundColor: 'var(--border)' }}>
                                <div className="h-full" style={{ width: `${c.composite_score}%`, backgroundColor: scoreColor(c.composite_score) }} />
                              </div>
                            </div>
                            <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                              {c.composite_score >= 80 ? 'High confidence' : c.composite_score >= 60 ? 'Moderate' : 'Low confidence'}
                            </div>
                          </td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{sb.signal ?? '—'}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{sb.raw_yield ?? '—'}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{sb.delta ?? '—'}</td>
                          <td className={cell} style={{ color: 'var(--muted)' }}>{sb.dte_quality ?? '—'}</td>
                        </>
                      )}
                      {/* Yield% */}
                      <td className={cell} style={{ color: 'var(--green)' }}>{(c.raw_yield_pct ?? 0).toFixed(2)}%</td>
                      {/* Add */}
                      <td className={cell}>
                        {isAdded ? (
                          <span style={{ color: 'var(--green)' }}>Added ✓</span>
                        ) : (
                          <div className="flex flex-col gap-0.5 items-start">
                            <button
                              onClick={() => addPosition(c)}
                              disabled={isAdding || c.at_strike_limit || c.at_expiry_limit || c.contracts_suggested === 0}
                              className="px-3 py-1 text-xs border disabled:opacity-40"
                              style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}
                            >
                              {isAdding ? '…' : '+ Add'}
                            </button>
                            {!c.has_position && c.contracts_suggested > 0 && !c.at_strike_limit && !c.at_expiry_limit && (
                              <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                                {c.contracts_suggested} ct{c.contracts_suggested !== 1 ? 's' : ''}
                              </span>
                            )}
                            {(c.at_strike_limit || c.at_expiry_limit) && (
                              <span className="text-[10px] font-mono" style={{ color: 'var(--amber)' }}>at limit</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer legend */}
          <div className="px-5 py-3 border-t text-[11px] space-y-1.5" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span style={{ color: 'var(--green)' }}>OPEN NOW — score ≥75, signal aligned · High confidence</span>
              <span style={{ color: 'var(--green)' }}>OPEN — score ≥60 · Moderate confidence</span>
              <span style={{ color: 'var(--amber)' }}>CONSIDER — score ≥45 · Low confidence</span>
              <span style={{ color: 'var(--amber)' }}>HOLD — open position, safe range</span>
              <span style={{ color: 'var(--red)' }}>CLOSE — open position, assignment risk high</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span><strong style={{ color: 'var(--text)' }}>Score breakdown</strong> (expand ▸ Score to see):</span>
              <span><strong style={{ color: 'var(--text)' }}>Signal</strong> — are market conditions right? (up to 25 pts)</span>
              <span><strong style={{ color: 'var(--text)' }}>Yield</strong> — how much income? (up to 30 pts)</span>
              <span><strong style={{ color: 'var(--text)' }}>Risk</strong> — how safe from assignment? (up to 20 pts)</span>
              <span><strong style={{ color: 'var(--text)' }}>Days</strong> — is timing in the sweet spot? (up to 25 pts)</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── OI Chart inner (Visx) ─────────────────────────────────────────────────────

function OIChartInner({ data, width, height, spyPrice }) {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } = useTooltip()
  const MARGIN = { top: 8, right: 16, left: 44, bottom: 22 }
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)
  const BAR_MAX = 14

  const strikes = data.map(d => String(d.strike))
  const xScale = scaleBand({ domain: strikes, range: [0, innerW], padding: 0.15 })
  const maxOI = Math.max(...data.flatMap(d => [d.call_oi, d.put_oi]), 1)
  const yScale = scaleLinear({ domain: [0, maxOI * 1.1], range: [innerH, 0] })
  const barW = Math.min(xScale.bandwidth() / 2, BAR_MAX)

  const handleMouseMove = (d, e) => {
    const rect = e.currentTarget.closest('svg').getBoundingClientRect()
    const x = e.clientX - rect.left
    showTooltip({ tooltipData: d, tooltipLeft: x, tooltipTop: yScale(Math.max(d.call_oi, d.put_oi)) + MARGIN.top - 8 })
  }

  // Find the nearest strike index for SPY price reference line
  const spyLineX = spyPrice > 0
    ? (() => {
        const sorted = [...data].sort((a, b) => Math.abs(a.strike - spyPrice) - Math.abs(b.strike - spyPrice))
        const nearest = sorted[0]
        return nearest ? (xScale(String(nearest.strike)) ?? 0) + xScale.bandwidth() / 2 : null
      })()
    : null

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows scale={yScale} width={innerW} stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.5} />
          {data.map(d => {
            const x = xScale(String(d.strike)) ?? 0
            const putH = innerH - yScale(d.put_oi)
            const callH = innerH - yScale(d.call_oi)
            return (
              <Group key={d.strike}>
                <Bar x={x} y={yScale(d.put_oi)} width={barW} height={putH}
                  fill="var(--green)" opacity={0.7}
                  onMouseMove={e => handleMouseMove(d, e)} onMouseLeave={hideTooltip}
                />
                <Bar x={x + barW} y={yScale(d.call_oi)} width={barW} height={callH}
                  fill="var(--red)" opacity={0.7}
                  onMouseMove={e => handleMouseMove(d, e)} onMouseLeave={hideTooltip}
                />
              </Group>
            )
          })}
          {spyLineX !== null && (
            <line
              x1={spyLineX} x2={spyLineX} y1={0} y2={innerH}
              stroke="var(--amber)" strokeWidth={1.5} strokeDasharray="4 3"
            />
          )}
          {spyLineX !== null && (
            <text x={spyLineX + 3} y={10} fontSize={9} fill="var(--amber)">
              SPY ${spyPrice}
            </text>
          )}
          <AxisBottom
            scale={xScale}
            top={innerH}
            stroke="var(--border)"
            tickStroke="transparent"
            tickLabelProps={() => ({ fill: 'var(--muted)', fontSize: 10, textAnchor: 'middle' })}
            tickFormat={v => `$${v}`}
          />
          <AxisLeft
            scale={yScale}
            stroke="transparent"
            tickStroke="transparent"
            tickLabelProps={() => ({ fill: 'var(--muted)', fontSize: 10, textAnchor: 'end', dx: -4 })}
            tickFormat={v => v === 0 ? '0' : `${(Math.abs(Number(v)) / 1000).toFixed(0)}k`}
            numTicks={4}
            width={42}
          />
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop} left={tooltipLeft}
          style={{
            ...tooltipDefaultStyles,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--text)',
          }}
        >
          <div style={{ color: 'var(--muted)', marginBottom: 2 }}>${tooltipData.strike} Strike</div>
          <div style={{ color: 'var(--green)' }}>Put OI: {tooltipData.put_oi.toLocaleString()}</div>
          <div style={{ color: 'var(--red)' }}>Call OI: {tooltipData.call_oi.toLocaleString()}</div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

// ── OI Chart ──────────────────────────────────────────────────────────────────

export function OIChart() {
  const [expiries, setExpiries] = useState([])
  const [selectedExpiry, setSelectedExpiry] = useState(null)
  const [oiData, setOiData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/options/expiries')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setExpiries(list)
        if (list.length > 0) setSelectedExpiry(list[0])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedExpiry) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/oi/chain?expiry=${selectedExpiry}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setOiData(data) })
      .catch(() => { if (!cancelled) setError('Could not load OI data.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedExpiry])

  const spyPrice = oiData?.spy_price || 0

  // Filter to ±15% around spot, transform for chart (puts above zero, calls below)
  const chartData = (oiData?.strikes || [])
    .filter(r => spyPrice === 0 || (r.strike >= spyPrice * 0.85 && r.strike <= spyPrice * 1.15))
    .map(r => ({
      strike: r.strike,
      put_oi:   r.put_oi  != null ? r.put_oi  : 0,
      call_oi:  r.call_oi != null ? -r.call_oi : 0,  // negative so it goes below axis
      put_change:  r.put_change_1d,
      call_change: r.call_change_1d,
    }))

  const totalCallOI = (oiData?.strikes || []).reduce((s, r) => s + (r.call_oi || 0), 0)
  const totalPutOI  = (oiData?.strikes || []).reduce((s, r) => s + (r.put_oi  || 0), 0)

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Open Interest by Strike</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Green bars above = Put OI · Red bars below = Call OI · Dashed line = SPY price · ±15% around spot
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {expiries.map(exp => (
            <button
              key={exp}
              onClick={() => setSelectedExpiry(exp)}
              className="text-xs px-2.5 py-1 border transition-colors"
              style={{
                borderColor: selectedExpiry === exp ? 'var(--blue)' : 'var(--border)',
                color: selectedExpiry === exp ? 'var(--blue)' : 'var(--muted)',
                backgroundColor: selectedExpiry === exp ? 'rgba(74,158,255,0.08)' : 'transparent',
              }}
            >
              {exp}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--muted)' }}>Loading OI data…</div>
      )}
      {error && (
        <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--red)' }}>{error}</div>
      )}
      {!loading && !error && chartData.length === 0 && (
        <div className="px-5 py-8 text-center text-xs" style={{ color: 'var(--muted)' }}>
          No OI data yet for this expiry. Run a screener scan or capture a snapshot to seed history.
        </div>
      )}
      {!loading && !error && chartData.length > 0 && (
        <>
          <div className="px-2 py-4" style={{ height: 280 }}>
            <ParentSize>
              {({ width, height }) => (
                <OIChartInner
                  data={chartData}
                  width={width}
                  height={height}
                  spyPrice={spyPrice}
                />
              )}
            </ParentSize>
          </div>
          <div className="px-5 py-2 border-t flex gap-6 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            <span><Term id="OpenInterest">Total Call OI</Term>: <span style={{ color: 'var(--red)' }}>{totalCallOI.toLocaleString()}</span></span>
            <span><Term id="OpenInterest">Total Put OI</Term>: <span style={{ color: 'var(--green)' }}>{totalPutOI.toLocaleString()}</span></span>
            {totalCallOI > 0 && <span><Term id="PutCallRatio">Put/Call ratio</Term>: <span style={{ color: 'var(--text)' }}>{(totalPutOI / totalCallOI).toFixed(2)}</span></span>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SignalTracker({ signalData, alphaData }) {
  if (!signalData) return <div className="text-sm" style={{ color: 'var(--muted)' }}>Loading signal data…</div>

  const { regime, confidence, total_score, max_score, factor_scores, recommended_strikes, warnings, market_inputs, last_updated } = signalData
  const regimeColor = regime === 'SELL PREMIUM' ? 'var(--green)'
    : regime === 'HOLD' ? 'var(--amber)'
    : regime === 'CAUTION' ? 'var(--orange)'
    : 'var(--red)'
  const pct = Math.max(0, total_score) / max_score * 100

  return (
    <div className="space-y-6">

      {/* Regime card */}
      <div className="p-6 space-y-4 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Current Signal</div>
            <div className="text-3xl font-bold" style={{ color: regimeColor }}>{REGIME_SHORT_LABEL[regime] || regime}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{confidence} confidence</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
              <Term id="SignalScore">Score</Term>
            </div>
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
              <div key={i} className="text-xs" style={{ color: 'var(--amber)' }}>⚠ {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Technical indicators */}
      <TechnicalsPanel technicals={alphaData?.technicals} />

      {/* Factor grid */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Factor Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {factor_scores && Object.entries(factor_scores).map(([key, data]) => (
            <FactorCard key={key} fkey={key} data={data} marketInputs={market_inputs} asOf={last_updated} />
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
              <div key={i} className="p-4 space-y-2 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs px-2 py-0.5 font-medium"
                    style={{
                      backgroundColor: rec.leg === 'near-term' ? 'rgba(74,158,255,0.1)' : 'rgba(255,176,32,0.1)',
                      color: rec.leg === 'near-term' ? 'var(--blue)' : 'var(--amber)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {rec.leg.toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{rec.dte} <Term id="DTE">days to expiry</Term></span>
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
    </div>
  )
}
