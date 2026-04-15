import { useEffect, useRef } from 'react'
import { prepare, layout } from '@chenglou/pretext'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Term } from './Tooltip.jsx'

// ── Urgency logic ─────────────────────────────────────────────────────────────

function getAction(pos) {
  const closeLossRatio = pos.loss_as_pct_of_premium != null ? pos.loss_as_pct_of_premium / 100 : 0
  const closingCostly  = closeLossRatio > 0.40

  if (pos.early_exercise_risk === 'CRITICAL' || pos.early_exercise_risk === 'HIGH') {
    const urgency = pos.early_exercise_risk === 'CRITICAL' ? 'URGENT' : 'HIGH'
    return { key: 'EARLY_EXERCISE', label: 'Shares May Be Called Early', color: 'var(--red)', urgency,
      instruction: `Time value is $${(pos.time_premium ?? 0).toFixed(2)} — early assignment is likely.`, closingCostly }
  }
  if (pos.dte <= 7) {
    const urgency = closingCostly ? 'HIGH' : 'URGENT'
    const label   = closingCostly ? 'Watch — Closing Expensive' : 'Expiring Soon'
    return { key: 'GAMMA_DANGER', label, color: 'var(--red)', urgency,
      instruction: 'Expires in 7 days or fewer — close or renew immediately.', closingCostly }
  }
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct > 0 && pos.distance_to_strike_pct <= 1.5) {
    const urgency = closingCostly ? 'HIGH' : 'URGENT'
    const label   = closingCostly ? 'Watch — Strike Nearby' : 'Strike Price at Risk'
    return { key: 'BREACH_RISK', label, color: 'var(--red)', urgency,
      instruction: 'Stock is within 1.5% of your strike. Roll to a higher strike or close now.', closingCostly }
  }
  if (pos.delta != null && pos.delta > 0.35)
    return { key: 'CLOSE', label: 'High Assignment Risk', color: 'var(--red)', urgency: 'HIGH',
      instruction: `Delta (${pos.delta.toFixed(2)}) is too high — this call is moving toward the money. Close now.`, closingCostly }
  return null
}

const urgencyOrder = { URGENT: 0, HIGH: 1, RECOMMENDED: 2, WATCH: 3 }

// ── Monthly income trend (last 6 months from position open dates) ─────────────

function buildMonthlyTrend(positions) {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const income = positions
      .filter(p => (p.open_date || '').startsWith(key))
      .reduce((s, p) => s + (p.premium_collected || 0), 0)
    return { month: d.toLocaleString('en-US', { month: 'short' }), income }
  })
}

// ── Pretext hook: resize-aware height for a text element ─────────────────────

function usePretextHeight(text, lineHeightPx) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let ro
    document.fonts.ready.then(() => {
      if (!el) return
      const font = getComputedStyle(el).font
      const handle = prepare(text, font)
      const relayout = () => {
        if (!el) return
        const w = el.clientWidth || 240
        const { height } = layout(handle, w, lineHeightPx)
        el.style.height = `${Math.max(height, lineHeightPx)}px`
      }
      ro = new ResizeObserver(relayout)
      ro.observe(el)
      relayout()
    })
    return () => ro?.disconnect()
  }, [text, lineHeightPx])
  return ref
}

// ── Income Hero (left side of hero split) ─────────────────────────────────────

function IncomeHero({ positions }) {
  const now = new Date()
  const monthKey     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

  const thisMonthIncome = positions
    .filter(p => (p.open_date || '').startsWith(monthKey))
    .reduce((s, p) => s + (p.premium_collected || 0), 0)
  const lastMonthIncome = positions
    .filter(p => (p.open_date || '').startsWith(lastMonthKey))
    .reduce((s, p) => s + (p.premium_collected || 0), 0)
  const vsLastMonth = thisMonthIncome - lastMonthIncome

  // Premium capture: how much of open premiums are locked in
  const open = positions.filter(p => p.status === 'open')
  const avgCapture = open.length
    ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length
    : 0
  const capturePct = Math.max(0, Math.min(100, avgCapture))

  const incomeText = `$${thisMonthIncome.toLocaleString()}`
  const numberRef  = usePretextHeight(incomeText, 56)

  return (
    <div className="flex flex-col justify-between h-full gap-4">
      <div>
        <div
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: 'var(--muted)', letterSpacing: '0.1em' }}
        >
          <Term id="PremiumCollected">Income This Month</Term>
        </div>

        {/* Hero number — Pretext handles resize-aware height */}
        <div
          ref={numberRef}
          className="font-mono font-bold leading-none"
          style={{ color: 'var(--green)', fontSize: 'clamp(36px, 4vw, 52px)', lineHeight: 1.1 }}
        >
          {incomeText}
        </div>

        {lastMonthIncome > 0 && (
          <div className="text-sm mt-2" style={{ color: vsLastMonth >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {vsLastMonth >= 0 ? '▲' : '▼'} ${Math.abs(vsLastMonth).toLocaleString()} vs {lastMonthDate.toLocaleString('en-US', { month: 'long' })}
          </div>
        )}
      </div>

      {open.length > 0 && (
        <div>
          <div
            className="w-full overflow-hidden mb-1.5"
            style={{ height: 6, backgroundColor: 'var(--border)', borderRadius: 3 }}
          >
            <div
              style={{
                width: `${capturePct}%`,
                height: '100%',
                backgroundColor: 'var(--green)',
                borderRadius: 3,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            <Term id="ProfitCapturePct">{capturePct.toFixed(0)}% of open premiums captured</Term>
            {' · '}{open.length} position{open.length !== 1 ? 's' : ''} open
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact Income Trend chart (right side of hero split) ─────────────────────

function IncomeTrendChart({ positions }) {
  const data = buildMonthlyTrend(positions)
  const hasData = data.some(d => d.income > 0)

  if (!hasData) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: 'var(--muted)', letterSpacing: '0.1em' }}
        >
          Income Trend
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No income history yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: 'var(--muted)', letterSpacing: '0.1em' }}
      >
        Income Trend
      </div>
      <div style={{ flex: 1, minHeight: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--green)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
              formatter={v => [`$${v.toLocaleString()}`, 'Income']}
              cursor={{ stroke: 'var(--border)' }}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="var(--green)"
              strokeWidth={2}
              fill="url(#trendGrad)"
              dot={false}
              activeDot={{ r: 3, fill: 'var(--green)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Status Band ────────────────────────────────────────────────────────────────

function StatusBand({ positions, signalData }) {
  const open = positions.filter(p => p.status === 'open')
  const urgentActions = open
    .map(pos => ({ pos, action: getAction(pos) }))
    .filter(({ action }) => action !== null)
    .sort((a, b) => (urgencyOrder[a.action.urgency] ?? 4) - (urgencyOrder[b.action.urgency] ?? 4))

  const urgentCount = urgentActions.filter(({ action }) => action.urgency === 'URGENT').length
  const highCount   = urgentActions.filter(({ action }) => action.urgency === 'HIGH').length
  const needsCount  = urgentCount + highCount
  const isAllClear  = needsCount === 0

  const regime = signalData?.regime
  const marketLabel = {
    'SELL PREMIUM': 'Good time to open',
    'HOLD': 'Hold new positions',
    'CAUTION': 'Use caution',
    'AVOID': 'Avoid new positions',
  }[regime] ?? (regime ? regime : 'Loading…')
  const marketColor = regime === 'SELL PREMIUM' ? 'var(--green)'
    : regime === 'HOLD' ? 'var(--amber)'
    : regime === 'CAUTION' ? 'var(--orange)'
    : regime === 'AVOID' ? 'var(--red)'
    : 'var(--muted)'
  const score = signalData?.total_score ?? 0
  const max   = signalData?.max_score ?? 14

  const nextExp = open.filter(p => p.dte > 0).sort((a, b) => a.dte - b.dte)[0]

  const bandColor  = isAllClear ? 'var(--green)' : urgentCount > 0 ? 'var(--red)' : 'var(--amber)'
  const bandBg     = isAllClear ? 'rgba(16,185,129,0.08)' : urgentCount > 0 ? 'rgba(255,61,90,0.08)' : 'rgba(255,176,32,0.08)'
  const bandBorder = isAllClear ? 'rgba(16,185,129,0.2)'  : urgentCount > 0 ? 'rgba(255,61,90,0.2)'  : 'rgba(255,176,32,0.2)'

  const statusText = isAllClear
    ? '✓ All Clear'
    : urgentCount > 0
      ? `⚠ ${urgentCount} position${urgentCount > 1 ? 's' : ''} need attention now`
      : `◦ ${highCount} position${highCount > 1 ? 's' : ''} worth reviewing`

  return (
    <div
      className="px-4 py-2.5 border flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      style={{ backgroundColor: bandBg, borderColor: bandBorder, borderRadius: 'var(--radius-md)' }}
    >
      <span className="font-medium" style={{ color: bandColor }}>{statusText}</span>

      <span style={{ color: 'var(--border)' }}>·</span>

      <span style={{ color: 'var(--muted)' }}>
        Market:{' '}
        <span style={{ color: marketColor }}>{marketLabel}</span>
        {' '}
        <span style={{ color: 'var(--border)' }}>
          ({score}/{max} signals)
        </span>
      </span>

      {nextExp && (
        <>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ color: 'var(--muted)' }}>
            Next expiry:{' '}
            <span style={{ color: nextExp.dte <= 7 ? 'var(--red)' : nextExp.dte <= 14 ? 'var(--amber)' : 'var(--text)' }}>
              {nextExp.ticker || 'SPY'} ${nextExp.strike} in {nextExp.dte}d
            </span>
          </span>
        </>
      )}
    </div>
  )
}

// ── Open Positions Table ───────────────────────────────────────────────────────

function PositionsTable({ positions, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')

  if (open.length === 0) {
    return (
      <div
        className="px-5 py-8 border text-center"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>No open positions yet.</p>
        <button
          onClick={() => onNavigate('Screener')}
          className="text-xs px-3 py-1.5 border transition-colors"
          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)' }}
        >
          Find opportunities in the Screener →
        </button>
      </div>
    )
  }

  return (
    <div
      className="border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
    >
      {/* Section header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Open Positions</h2>
        <button
          onClick={() => onNavigate('Portfolios')}
          className="text-xs hover:underline"
          style={{ color: 'var(--blue)' }}
        >
          View all →
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Ticker', 'Strike', 'Expiry', 'DTE', 'Time Value', 'P&L', 'Status'].map(col => (
                <th
                  key={col}
                  className="px-5 py-2.5 text-left"
                  style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {open.map((pos, i) => {
              const action     = getAction(pos)
              const isUrgent   = action?.urgency === 'URGENT'
              const isHigh     = action?.urgency === 'HIGH'
              const pnl        = pos.pnl ?? 0
              const pnlColor   = pnl >= 0 ? 'var(--green)' : 'var(--red)'
              const statusLabel = action ? action.label : 'All Clear'
              const statusColor = action ? action.color : 'var(--green)'
              const dteColor    = pos.dte <= 7 ? 'var(--red)' : pos.dte <= 14 ? 'var(--amber)' : 'var(--muted)'

              return (
                <tr
                  key={pos.id}
                  style={{
                    borderBottom: i < open.length - 1 ? '1px solid var(--border)' : 'none',
                    backgroundColor: isUrgent
                      ? 'rgba(255,61,90,0.04)'
                      : isHigh ? 'rgba(255,176,32,0.03)' : 'transparent',
                  }}
                >
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>
                    {pos.ticker || 'SPY'}
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: 'var(--text)' }}>
                    ${pos.strike} Call
                  </td>
                  <td className="px-5 py-3" style={{ color: 'var(--muted)' }}>
                    {pos.expiry}
                  </td>
                  <td className="px-5 py-3 font-mono font-medium" style={{ color: dteColor }}>
                    {pos.dte}d
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: pos.intrinsic_value > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {pos.time_premium != null ? `$${pos.time_premium.toFixed(2)}` : '—'}
                    {pos.intrinsic_value > 0 && (
                      <span className="ml-1 text-[10px]" style={{ color: 'var(--red)' }}>+${pos.intrinsic_value.toFixed(2)} ITM</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono font-semibold" style={{ color: pnlColor }}>
                    {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="px-2.5 py-1 font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: statusColor + '1a',
                        color: statusColor,
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => onNavigate('Portfolios')}
          className="text-xs px-3 py-1.5 border transition-colors"
          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'transparent', borderRadius: 'var(--radius-sm)' }}
        >
          + Add Position
        </button>
      </div>
    </div>
  )
}

// ── Sentiment badge (for news feed) ───────────────────────────────────────────

function SentimentBadge({ score }) {
  if (score == null) return null
  const n     = parseFloat(score)
  const label = n >= 0.35 ? 'Bullish' : n >= 0.15 ? 'Somewhat Bullish' : n <= -0.35 ? 'Bearish' : n <= -0.15 ? 'Somewhat Bearish' : 'Neutral'
  const color = n >= 0.15 ? 'var(--green)' : n <= -0.15 ? 'var(--red)' : 'var(--muted)'
  return <span className="text-xs font-medium" style={{ color }}>{label}</span>
}

// ── News feed ─────────────────────────────────────────────────────────────────

function NewsFeed({ news }) {
  if (!news?.feed?.length) return null
  const articles = news.feed.slice(0, 4)
  return (
    <div
      className="border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
    >
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>SPY News &amp; Sentiment</h2>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>via AlphaVantage</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {articles.map((a, i) => {
          const tickerSent = a.ticker_sentiment?.find(t => t.ticker === 'SPY')
          const score      = tickerSent?.ticker_sentiment_score ?? a.overall_sentiment_score
          return (
            <div key={i} className="px-5 py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline line-clamp-2 leading-snug"
                  style={{ color: 'var(--text)' }}
                >
                  {a.title}
                </a>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{a.source}</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {a.time_published ? a.time_published.slice(0, 13).replace('T', ' ') : ''}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <SentimentBadge score={score} />
                {score != null && (
                  <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                    {parseFloat(score) >= 0 ? '+' : ''}{parseFloat(score).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── P&L Summary ───────────────────────────────────────────────────────────────

function PnlSummary({ pnlData }) {
  if (!pnlData) return null
  const { total_realized, total_unrealized, estimated_tax_this_year, win_rate, closed_positions } = pnlData
  const winColor = win_rate >= 70 ? 'var(--green)' : win_rate >= 50 ? 'var(--amber)' : 'var(--red)'

  return (
    <div
      className="border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
    >
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Banked Income &amp; Tax</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Based on {closed_positions} closed position{closed_positions !== 1 ? 's' : ''} · short-term capital gains rate
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
        {[
          { label: 'Realized P&L', value: `${total_realized >= 0 ? '+' : ''}$${Math.abs(total_realized).toLocaleString()}`, color: total_realized >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Unrealized P&L', value: `${total_unrealized >= 0 ? '+' : ''}$${Math.abs(total_unrealized).toLocaleString()}`, color: total_unrealized >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Est. Tax (this year)', value: `$${estimated_tax_this_year.toLocaleString()}`, color: 'var(--amber)' },
          { label: 'Win Rate', value: closed_positions > 0 ? `${win_rate}%` : '—', color: closed_positions > 0 ? winColor : 'var(--muted)' },
        ].map(f => (
          <div key={f.label} className="px-5 py-4">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{f.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: f.color }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({ dashData: _dashData, signalData, positions, holdings: _holdings, alphaData, pnlData, onNavigate }) {
  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.'
  const dateStr  = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const open         = positions.filter(p => p.status === 'open')
  const macroUncertain = open.some(p => p.macro_uncertainty === true)

  return (
    <div className="space-y-4">

      {/* Greeting row */}
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--muted)' }}>{greeting}</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{dateStr}</span>
      </div>

      {/* Hero: income number (left) + trend chart (right) */}
      <div
        className="grid md:grid-cols-2 border overflow-hidden"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
      >
        <div className="p-6 border-b md:border-b-0 md:border-r" style={{ borderColor: 'var(--border)', minHeight: 180 }}>
          <IncomeHero positions={positions} />
        </div>
        <div className="p-6" style={{ minHeight: 180 }}>
          <IncomeTrendChart positions={positions} />
        </div>
      </div>

      {/* Status band */}
      <StatusBand positions={positions} signalData={signalData} />

      {/* Macro uncertainty banner */}
      {macroUncertain && (
        <div
          className="px-5 py-3 border flex items-start gap-3 text-xs"
          style={{ backgroundColor: 'rgba(255,176,32,0.08)', borderColor: 'rgba(255,176,32,0.35)', borderRadius: 'var(--radius-md)' }}
        >
          <span style={{ color: 'var(--amber)', fontSize: 14, lineHeight: 1 }}>⚠</span>
          <div>
            <span className="font-semibold" style={{ color: 'var(--amber)' }}>Elevated macro uncertainty this week.</span>
            <span className="ml-1" style={{ color: 'var(--muted)' }}>
              Multiple macro news signals detected. Consider waiting before acting on roll or close recommendations.
            </span>
          </div>
        </div>
      )}

      {/* Open positions table */}
      <PositionsTable positions={positions} onNavigate={onNavigate} />

      {/* Banked income + tax */}
      <PnlSummary pnlData={pnlData} />

      {/* News feed */}
      <NewsFeed news={alphaData?.news} />

    </div>
  )
}
