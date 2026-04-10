import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Term } from './Tooltip.jsx'

// ── Action urgency logic (mirrors Portfolios.jsx getAction, with rule softening) ─

function getAction(pos) {
  // Rule softening: if closing would give back > 40% of original premium, downgrade urgency
  const closeLossRatio = pos.loss_as_pct_of_premium != null ? pos.loss_as_pct_of_premium / 100 : 0
  const closingCostly  = closeLossRatio > 0.40

  if (pos.dte <= 7) {
    const urgency = closingCostly ? 'HIGH' : 'URGENT'
    const label   = closingCostly ? 'Watch Carefully — Closing Costs More Than Holding' : 'Expiring Soon — Act Now'
    return { key: 'GAMMA_DANGER', label, color: 'var(--red)', urgency,
      instruction: 'Expires in 7 days or fewer — close or renew immediately.', closingCostly }
  }
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct > 0 && pos.distance_to_strike_pct <= 1.5) {
    const urgency = closingCostly ? 'HIGH' : 'URGENT'
    const label   = closingCostly ? 'Watch Carefully — Strike Nearby, Closing Expensive' : 'Strike Price at Risk'
    return { key: 'BREACH_RISK', label, color: 'var(--red)', urgency,
      instruction: 'Stock is within 1.5% of your strike. Roll to a higher strike or close now.', closingCostly }
  }
  if (pos.delta != null && pos.delta > 0.35)
    return { key: 'CLOSE', label: 'High Assignment Risk — Close', color: 'var(--red)', urgency: 'HIGH',
      instruction: `Assignment risk (${pos.delta.toFixed(2)}) is too high — this call is moving toward the money. Close now.`, closingCostly }
  return null
}

const urgencyOrder = { URGENT: 0, HIGH: 1, RECOMMENDED: 2, WATCH: 3 }

// ── Greeting hero ─────────────────────────────────────────────────────────────

function GreetingHero({ positions, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')
  const urgentActions = open
    .map(pos => ({ pos, action: getAction(pos) }))
    .filter(({ action }) => action !== null)
    .sort((a, b) => (urgencyOrder[a.action.urgency] ?? 4) - (urgencyOrder[b.action.urgency] ?? 4))

  const urgentCount  = urgentActions.filter(({ action }) => action.urgency === 'URGENT').length
  const highCount    = urgentActions.filter(({ action }) => action.urgency === 'HIGH').length
  const needsCount   = urgentCount + highCount

  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  let heroText, heroBg, heroColor
  if (needsCount === 0) {
    heroText  = 'Everything looks good.'
    heroBg    = 'rgba(16,185,129,0.08)'
    heroColor = 'var(--green)'
  } else if (urgentCount > 0) {
    heroText  = `${urgentCount} position${urgentCount !== 1 ? 's' : ''} need${urgentCount === 1 ? 's' : ''} your attention right now.`
    heroBg    = 'rgba(255,61,90,0.08)'
    heroColor = 'var(--red)'
  } else {
    heroText  = `${highCount} position${highCount !== 1 ? 's' : ''} worth reviewing today.`
    heroBg    = 'rgba(255,176,32,0.08)'
    heroColor = 'var(--amber)'
  }

  return (
    <div
      className="px-6 py-5 border"
      style={{ backgroundColor: heroBg, borderColor: heroColor + '40', borderRadius: 'var(--radius-md)' }}
    >
      <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--muted)' }}>{timeGreeting}.</div>
      <div className="text-2xl font-bold" style={{ color: heroColor }}>{heroText}</div>
      {open.length === 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            You don't have any open positions yet. Check the Market Conditions tab to see if now is a good time to start.
          </p>
          <button
            className="text-xs px-3 py-1.5 border transition-colors"
            style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)' }}
            onClick={() => onNavigate('SignalTracker')}
          >
            View Market Conditions →
          </button>
        </div>
      ) : needsCount === 0 ? (
        <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {open.length} open position{open.length !== 1 ? 's' : ''} · no action required.
          <button
            className="ml-3 text-xs hover:underline"
            style={{ color: 'var(--blue)' }}
            onClick={() => onNavigate('Portfolios')}
          >
            View all →
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ── Urgent action strip ───────────────────────────────────────────────────────

function UrgentActionStrip({ positions, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')
  const urgentActions = open
    .map(pos => ({ pos, action: getAction(pos) }))
    .filter(({ action }) => action !== null && (action.urgency === 'URGENT' || action.urgency === 'HIGH'))
    .sort((a, b) => (urgencyOrder[a.action.urgency] ?? 4) - (urgencyOrder[b.action.urgency] ?? 4))

  if (urgentActions.length === 0) return null

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>What to do right now</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>These positions need your attention today</p>
        </div>
        <button
          onClick={() => onNavigate('Portfolios')}
          className="text-xs hover:underline"
          style={{ color: 'var(--blue)' }}
        >
          Manage all →
        </button>
      </div>
      <div className="px-5 py-3 flex flex-wrap gap-3">
        {urgentActions.map(({ pos, action }) => {
          const closePnl    = pos.close_pnl_impact != null ? pos.close_pnl_impact : null
          const closePnlPos = closePnl != null && closePnl >= 0
          const breakEven   = pos.break_even_price != null ? pos.break_even_price : pos.strike
          const urgencyLabel = action.urgency === 'URGENT' ? 'Act Now' : 'Watch'
          return (
            <div
              key={pos.id}
              className="border text-xs min-w-[220px] max-w-[340px] flex-1"
              style={{ backgroundColor: action.color + '0d', borderColor: action.color + '40', borderRadius: 'var(--radius-md)' }}
            >
              {/* Header */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-semibold" style={{ color: action.color }}>{action.label}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 font-medium"
                    style={{ backgroundColor: action.color + '20', color: action.color, borderRadius: 'var(--radius-sm)' }}
                  >
                    {urgencyLabel}
                  </span>
                </div>
                <div className="font-mono font-semibold mb-1" style={{ color: 'var(--text)' }}>
                  ${pos.strike} Call · {pos.expiry} · {pos.dte}d left
                </div>
                <div className="leading-snug" style={{ color: 'var(--muted)' }}>{action.instruction}</div>
                {action.closingCostly && (
                  <div className="mt-1 leading-snug" style={{ color: 'var(--amber)' }}>
                    Closing now is expensive — consider rolling instead.
                  </div>
                )}
              </div>
              {/* P&L snapshot */}
              <div className="border-t px-4 py-2.5 space-y-1" style={{ borderColor: action.color + '20' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>P&L if you close:</span>
                  <span className="font-mono font-semibold"
                    style={{ color: closePnl == null ? 'var(--muted)' : closePnlPos ? 'var(--green)' : 'var(--red)' }}>
                    {closePnl == null ? '—' : `${closePnlPos ? '+' : ''}$${Math.abs(closePnl).toFixed(0)}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>SPY must stay below:</span>
                  <span className="font-mono">${breakEven?.toFixed(0)} for holding to win</span>
                </div>
              </div>
              <div className="px-4 py-2.5">
                <button
                  onClick={() => onNavigate('Portfolios')}
                  className="text-[11px] hover:underline"
                  style={{ color: action.color }}
                >
                  Go to position →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Market signal card ────────────────────────────────────────────────────────

function MarketSignalCard({ signalData }) {
  const regime = signalData?.regime
  const score  = signalData?.total_score ?? 0
  const max    = signalData?.max_score ?? 14

  const RC = {
    'SELL PREMIUM': { label: 'Good Time to Open',          color: 'var(--green)',  bg: 'rgba(16,185,129,0.08)', sentence: 'Market conditions support adding new positions.' },
    'HOLD':         { label: 'Hold — Pause New Positions', color: 'var(--amber)',  bg: 'rgba(255,176,32,0.06)', sentence: 'Hold existing positions and pause new entries until signals improve.' },
    'CAUTION':      { label: 'Be Careful',                 color: 'var(--orange)', bg: 'rgba(249,115,22,0.06)', sentence: 'Multiple warning signs — review positions carefully before adding.' },
    'AVOID':        { label: 'Not a Good Time',            color: 'var(--red)',    bg: 'rgba(255,61,90,0.06)',  sentence: 'Unfavorable conditions. Avoid new positions until conditions improve.' },
  }
  const rc = RC[regime] || { label: regime || '—', color: 'var(--muted)', bg: 'var(--surface)', sentence: 'Signal data is loading.' }

  return (
    <div
      className="px-5 py-4 border flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ backgroundColor: rc.bg, borderColor: rc.color + '40', borderRadius: 'var(--radius-md)' }}
    >
      <div className="flex-1">
        <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--muted)' }}>Market conditions</div>
        <div className="text-sm" style={{ color: 'var(--text)' }}>{rc.sentence}</div>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <span
          className="px-4 py-1.5 text-sm font-semibold"
          style={{ backgroundColor: rc.color + '20', color: rc.color, borderRadius: 'var(--radius-sm)' }}
        >
          {rc.label}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{score}/{max} signals</span>
      </div>
    </div>
  )
}

// ── Income summary row ────────────────────────────────────────────────────────

function IncomeSummaryRow({ positions, holdings, dashData }) {
  const open        = positions.filter(p => p.status === 'open')
  const spyPrice    = dashData?.spy?.price || 0
  const totalShares = (holdings || []).filter(h => h.ticker === 'SPY').reduce((s, h) => s + h.shares, 0)
  const underlyingValue = (totalShares || 600) * spyPrice

  // This month's income = premium from positions opened this calendar month
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonthIncome = positions
    .filter(p => (p.open_date || '').startsWith(monthKey))
    .reduce((s, p) => s + (p.premium_collected || 0), 0)

  // Daily rate
  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const avgDte = open.length
    ? open.reduce((s, p) => s + (p.dte || 30), 0) / open.length : 30
  const dailyIncome = avgDte > 0 ? Math.round(totalPremium / avgDte) : 0

  // Annualized %
  const annualizedPct = underlyingValue > 0
    ? ((totalPremium / underlyingValue) * 12 * 100).toFixed(1) : '—'

  // Days until next expiry
  const nextExpiry = open
    .filter(p => p.dte > 0)
    .sort((a, b) => (a.dte || 999) - (b.dte || 999))[0]
  const daysToNext = nextExpiry ? nextExpiry.dte : null

  const cells = [
    { label: 'This month\'s income', value: `$${thisMonthIncome.toLocaleString()}`, sub: 'premium opened this month' },
    { label: 'Daily rate', value: dailyIncome > 0 ? `$${dailyIncome}/day` : '—', sub: 'avg across open positions' },
    { label: 'Annualized return', value: annualizedPct !== '—' ? `${annualizedPct}%` : '—', sub: 'on underlying value' },
    { label: 'Next expiry', value: daysToNext != null ? `${daysToNext}d` : '—', sub: daysToNext != null ? nextExpiry.expiry : 'no open positions' },
  ]

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 border"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
    >
      {cells.map((c, i) => (
        <div
          key={c.label}
          className="px-5 py-4"
          style={{ borderRight: i < cells.length - 1 ? '1px solid var(--border)' : 'none' }}
        >
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{c.label}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: 'var(--green)' }}>{c.value}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Theta income projection chart ────────────────────────────────────────────

function ThetaIncomeChart({ positions }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const open = positions.filter(p =>
    p.status === 'open' && p.expiry && p.dte > 0 && p.current_price != null
  )
  if (open.length === 0) return null

  // Date range: today → last expiry + 7 days
  const lastExpiry = open.reduce((latest, p) => {
    const d = new Date(p.expiry + 'T00:00:00')
    return d > latest ? d : latest
  }, new Date(0))
  const endDate = new Date(lastExpiry)
  endDate.setDate(endDate.getDate() + 7)

  // Unique expiry dates for reference lines
  const expiryDates = [...new Set(open.map(p => p.expiry))].sort()

  // Daily income = sell_price / dte × contracts × 100, constant per position until expiry
  const posRates = open.map(p => ({
    expiryDate: new Date(p.expiry + 'T00:00:00'),
    dailyRate:  ((p.sell_price || 0) / p.dte) * (p.contracts || 1) * 100,
  }))

  const data = []
  const cursor = new Date(today)
  while (cursor <= endDate) {
    let total = 0
    for (const pr of posRates) {
      if (cursor < pr.expiryDate) total += pr.dailyRate
    }
    data.push({ date: cursor.toISOString().slice(0, 10), income: Math.max(0, Math.round(total)) })
    cursor.setDate(cursor.getDate() + 1)
  }

  const maxVal = Math.max(...data.map(d => d.income), 1)
  const tickDates = data.filter((_, i) => i === 0 || i % 7 === 0).map(d => d.date)

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Expected Daily Income</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Sold price ÷ DTE per position · steps down as positions expire · dashed lines = expiry dates
        </p>
      </div>
      <div className="px-2 py-4" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--green)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={tickDates}
              tickFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `$${v}`}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              width={52}
              domain={[0, Math.ceil(maxVal * 1.15)]}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}
              labelStyle={{ color: 'var(--muted)', marginBottom: 4 }}
              labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              formatter={v => [`$${v.toLocaleString()}`, 'Daily income']}
              cursor={{ stroke: 'var(--border)' }}
            />
            {expiryDates.map(ex => (
              <ReferenceLine key={ex} x={ex} stroke="var(--amber)" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: ex.slice(5), position: 'insideTopRight', fontSize: 9, fill: 'var(--amber)' }} />
            ))}
            <Area type="monotone" dataKey="income" stroke="var(--green)" strokeWidth={2}
              fill="url(#incomeGrad)" dot={false} activeDot={{ r: 3, fill: 'var(--green)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="p-5 space-y-1 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-3xl font-bold font-mono" style={{ color: valueColor || 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── Sentiment badge ───────────────────────────────────────────────────────────

function SentimentBadge({ score }) {
  if (score == null) return null
  const n = parseFloat(score)
  const label = n >= 0.35 ? 'Bullish' : n >= 0.15 ? 'Somewhat Bullish' : n <= -0.35 ? 'Bearish' : n <= -0.15 ? 'Somewhat Bearish' : 'Neutral'
  const color = n >= 0.15 ? 'var(--green)' : n <= -0.15 ? 'var(--red)' : 'var(--muted)'
  return <span className="text-xs font-medium" style={{ color }}>{label}</span>
}

// ── News feed ─────────────────────────────────────────────────────────────────

function NewsFeed({ news }) {
  // Don't show section header if there's no content — spec: "don't show the section header if content is empty"
  if (!news?.feed?.length) return null
  const articles = news.feed.slice(0, 4)
  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>SPY News &amp; Sentiment</h2>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>via AlphaVantage</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {articles.map((a, i) => {
          const tickerSent = a.ticker_sentiment?.find(t => t.ticker === 'SPY')
          const score = tickerSent?.ticker_sentiment_score ?? a.overall_sentiment_score
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

// ── P&L Summary card ──────────────────────────────────────────────────────────

function PnlSummary({ pnlData }) {
  if (!pnlData) return null
  const { total_realized, total_unrealized, estimated_tax_this_year, win_rate, closed_positions } = pnlData
  const winColor = win_rate >= 70 ? 'var(--green)' : win_rate >= 50 ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Banked Income &amp; Tax</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Based on {closed_positions} closed position{closed_positions !== 1 ? 's' : ''} · short-term capital gains rate</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: 'var(--border)' }}>
        {[
          { label: 'Realized P&L', value: `${total_realized >= 0 ? '+' : ''}$${Math.abs(total_realized).toLocaleString()}`, color: total_realized >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Unrealized P&L', value: `${total_unrealized >= 0 ? '+' : ''}$${Math.abs(total_unrealized).toLocaleString()}`, color: total_unrealized >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Est. Tax (this year)', value: `$${estimated_tax_this_year.toLocaleString()}`, color: 'var(--amber)' },
          { label: 'Win Rate', value: closed_positions > 0 ? `${win_rate}%` : '—', color: closed_positions > 0 ? winColor : 'var(--muted)' },
        ].map(f => (
          <div key={typeof f.label === 'string' ? f.label : 'item'} className="px-5 py-4">
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{f.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: f.color }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard (Overview) ─────────────────────────────────────────────────

export default function Dashboard({ dashData, signalData, positions, holdings, alphaData, pnlData, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')
  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture = open.length
    ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length : 0

  const regime = signalData?.regime
  const regimeLabel = regime === 'SELL PREMIUM' ? 'Good Time to Open'
    : regime === 'HOLD' ? 'Hold — Pause New Positions'
    : regime === 'CAUTION' ? 'Be Careful'
    : regime === 'AVOID' ? 'Not a Good Time'
    : (regime || '—')
  const regimeColor = regime === 'SELL PREMIUM' ? 'var(--green)'
    : regime === 'HOLD' ? 'var(--amber)'
    : regime === 'CAUTION' ? 'var(--orange)'
    : 'var(--red)'

  // Macro uncertainty: derived from any open position that carries the flag (PIPE-021)
  const macroUncertain = open.some(p => p.macro_uncertainty === true)

  return (
    <div className="space-y-6">

      {/* 1 — Greeting + status hero */}
      <GreetingHero positions={positions} onNavigate={onNavigate} />

      {/* 2 — Urgent action strip (only when there are URGENT or HIGH items) */}
      <UrgentActionStrip positions={positions} onNavigate={onNavigate} />

      {/* 3 — Market signal */}
      <MarketSignalCard signalData={signalData} />

      {/* Macro uncertainty banner (PIPE-021) — shown when >2 macro keyword flags in 48h news */}
      {macroUncertain && (
        <div
          className="px-5 py-3 border flex items-start gap-3 text-xs"
          style={{ backgroundColor: 'rgba(255,176,32,0.08)', borderColor: 'rgba(255,176,32,0.35)', borderRadius: 'var(--radius-md)' }}
        >
          <span style={{ color: 'var(--amber)', fontSize: '14px', lineHeight: 1 }}>⚠</span>
          <div style={{ color: 'var(--amber)' }}>
            <span className="font-semibold">Elevated macro uncertainty this week.</span>
            <span className="ml-1" style={{ color: 'var(--muted)' }}>
              Multiple macro news signals detected. Consider waiting before acting on roll or close recommendations.
            </span>
          </div>
        </div>
      )}

      {/* 4 — Income summary row */}
      <IncomeSummaryRow positions={positions} holdings={holdings} dashData={dashData} />

      {/* 5 — Theta income chart */}
      <ThetaIncomeChart positions={positions} />

      {/* 6 — Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={<Term id="PremiumCollected">Income Earned</Term>}
          value={`$${totalPremium.toLocaleString()}`}
          sub="total premium across open positions"
          valueColor="var(--green)"
        />
        <StatCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString()}`}
          sub="if closed right now"
          valueColor={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label={<Term id="ProfitCapturePct">% of Max Income Collected</Term>}
          value={`${avgCapture.toFixed(1)}%`}
          sub="50% = good time to close"
          valueColor={avgCapture >= 50 ? 'var(--green)' : 'var(--text)'}
        />
        <StatCard
          label={<Term id="SignalScore">Market Signal</Term>}
          value={regimeLabel}
          sub={`${signalData?.total_score ?? 0}/${signalData?.max_score ?? 12} factors favorable`}
          valueColor={regimeColor}
        />
      </div>

      {/* 7 — SPY price bar */}
      {dashData?.spy && (
        <div
          className="px-5 py-3 border flex flex-wrap items-center gap-6"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}
            >
              SPY
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>SPDR S&amp;P 500 ETF Trust</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold font-mono" style={{ color: 'var(--text)' }}>
                  ${dashData.spy.price.toFixed(2)}
                </span>
                <span className="text-sm font-mono" style={{ color: dashData.spy.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {dashData.spy.change >= 0 ? '+' : ''}{dashData.spy.change.toFixed(2)} ({dashData.spy.change_pct.toFixed(2)}%)
                </span>
                <span className="text-xs pulse-green" style={{ color: 'var(--muted)' }}>● Live</span>
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-xs" style={{ color: 'var(--muted)' }}>
            <span>Day High <span style={{ color: 'var(--text)' }}>${dashData.spy.day_high?.toFixed(2)}</span></span>
            <span>Day Low <span style={{ color: 'var(--text)' }}>${dashData.spy.day_low?.toFixed(2)}</span></span>
            {dashData.vix_history && (
              <span><Term id="VVIX">VIX</Term> <span style={{ color: 'var(--text)' }}>{dashData.vix_history.current?.toFixed(1)}</span></span>
            )}
            {dashData.spy_ma && (
              <span>20-Day MA <span style={{ color: 'var(--text)' }}>${dashData.spy_ma.ma_20?.toFixed(2)}</span></span>
            )}
          </div>
        </div>
      )}

      {/* P&L Summary */}
      <PnlSummary pnlData={pnlData} />

      {/* 8 — News feed (moved to bottom) */}
      <NewsFeed news={alphaData?.news} />

    </div>
  )
}
