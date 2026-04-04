// ── Helpers ──────────────────────────────────────────────────────────────────

function riskLevel(pos) {
  if (!pos || pos.status !== 'open') return null
  if (pos.dte <= 7) return 'critical'
  if (pos.profit_capture_pct >= 50) return 'take-profit'
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5) return 'breach'
  if (pos.dte <= 21) return 'roll'
  return 'ok'
}

const RISK_BADGE = {
  critical:      { label: 'Expiring',    bg: 'rgba(255,61,90,0.12)',  color: 'var(--red)' },
  'take-profit': { label: 'Take Profit', bg: 'rgba(0,255,136,0.10)',  color: 'var(--green)' },
  breach:        { label: 'Breach Risk', bg: 'rgba(255,61,90,0.12)',  color: 'var(--red)' },
  roll:          { label: 'Roll Soon',   bg: 'rgba(255,176,32,0.10)', color: 'var(--amber)' },
  ok:            { label: 'On Track',    bg: 'rgba(128,128,128,0.08)', color: 'var(--muted)' },
}

// ── Sentiment badge ───────────────────────────────────────────────────────────

function SentimentBadge({ score }) {
  if (score == null) return null
  const n = parseFloat(score)
  const label = n >= 0.35 ? 'Bullish' : n >= 0.15 ? 'Somewhat Bullish' : n <= -0.35 ? 'Bearish' : n <= -0.15 ? 'Somewhat Bearish' : 'Neutral'
  const color = n >= 0.15 ? 'var(--green)' : n <= -0.15 ? 'var(--red)' : 'var(--muted)'
  return <span className="text-xs font-medium" style={{ color }}>{label}</span>
}

// ── Headline ──────────────────────────────────────────────────────────────────

function Headline({ positions, holdings, dashData, signalData }) {
  const open = positions.filter(p => p.status === 'open')
  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const spyPrice = dashData?.spy?.price || 0
  const totalShares = (holdings || []).filter(h => h.ticker === 'SPY').reduce((s, h) => s + h.shares, 0)
  const underlyingValue = (totalShares || 600) * spyPrice
  const annualizedPct = underlyingValue > 0
    ? ((totalPremium / underlyingValue) * 12 * 100).toFixed(1) : '—'
  const avgDte = open.length ? open.reduce((s, p) => s + (p.dte || 30), 0) / open.length : 30
  const dailyIncome = avgDte > 0 ? (totalPremium / avgDte).toFixed(0) : '—'
  const atRisk = open.filter(p => { const r = riskLevel(p); return r === 'critical' || r === 'breach' }).length

  const regime = signalData?.regime
  const regimeText = regime === 'SELL PREMIUM' ? 'Market conditions favor selling new covered calls.'
    : regime === 'HOLD' ? 'Conditions are marginal — hold existing positions, pause new entries.'
    : regime === 'CAUTION' ? 'Elevated risk — review open positions carefully before adding.'
    : 'Unfavorable conditions — avoid new positions until signals improve.'

  return (
    <div className="p-5 space-y-1 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-base leading-relaxed" style={{ color: 'var(--text)' }}>
        Your <strong>{open.length} open covered call{open.length !== 1 ? 's' : ''}</strong> are generating an estimated{' '}
        <strong style={{ color: 'var(--green)' }}>${dailyIncome}/day</strong> in income with a projected annualized return of{' '}
        <strong style={{ color: 'var(--green)' }}>{annualizedPct}%</strong> on the underlying position.
        {atRisk > 0
          ? <> <strong style={{ color: 'var(--red)' }}>{atRisk} position{atRisk !== 1 ? 's' : ''} need{atRisk === 1 ? 's' : ''} immediate attention.</strong></>
          : <> All positions are on track.</>
        }
      </p>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{regimeText}</p>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="p-4 space-y-1 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-2xl font-semibold font-mono" style={{ color: valueColor || 'var(--text)' }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── News feed ─────────────────────────────────────────────────────────────────

function NewsFeed({ news }) {
  if (!news?.feed?.length) return null
  const articles = news.feed.slice(0, 4)
  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
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

// ── Position row ──────────────────────────────────────────────────────────────

function PositionRow({ pos, onNavigate }) {
  const risk = riskLevel(pos)
  const badge = RISK_BADGE[risk] || RISK_BADGE.ok
  const pnlPos = (pos.pnl || 0) >= 0

  return (
    <tr
      className="border-b cursor-pointer transition-colors hover:opacity-80"
      style={{ borderColor: 'var(--border)' }}
      onClick={() => onNavigate('Portfolios')}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}
          >
            {pos.ticker}
          </div>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{pos.ticker} Call</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Short Call · ${pos.strike} Strike</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm" style={{ color: 'var(--text)' }}>{pos.expiry}</div>
        <div
          className="text-xs font-mono"
          style={{ color: pos.dte <= 7 ? 'var(--red)' : pos.dte <= 21 ? 'var(--amber)' : 'var(--muted)' }}
        >
          {pos.dte}d to expiry
        </div>
      </td>
      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text)' }}>
        {pos.contracts} contracts
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{pos.contracts * 100} shares</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-mono" style={{ color: 'var(--text)' }}>${pos.sell_price?.toFixed(2)}</div>
        <div className="text-xs font-mono" style={{ color: 'var(--muted)' }}>now ${pos.current_price?.toFixed(2) ?? '—'}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-semibold font-mono" style={{ color: pnlPos ? 'var(--green)' : 'var(--red)' }}>
          {pnlPos ? '+' : ''}${pos.pnl?.toFixed(0)}
        </div>
        <div className="text-xs font-mono" style={{ color: pnlPos ? 'var(--green)' : 'var(--red)', opacity: 0.7 }}>
          {pos.profit_capture_pct?.toFixed(1)}% captured
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-1 font-medium" style={{ backgroundColor: badge.bg, color: badge.color }}>
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>→</td>
    </tr>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({ dashData, signalData, positions, holdings, alphaData, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')
  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const spyPrice = dashData?.spy?.price || 0
  const totalShares = (holdings || []).filter(h => h.ticker === 'SPY').reduce((s, h) => s + h.shares, 0)
  const underlyingValue = (totalShares || 600) * spyPrice
  const avgCapture = open.length
    ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length : 0
  const atRisk = open.filter(p => { const r = riskLevel(p); return r === 'critical' || r === 'breach' || r === 'roll' }).length

  const regime = signalData?.regime
  const regimeColor = regime === 'SELL PREMIUM' ? 'var(--green)'
    : regime === 'HOLD' ? 'var(--amber)'
    : regime === 'CAUTION' ? '#f97316'
    : 'var(--red)'

  return (
    <div className="space-y-6">

      {/* Headline */}
      <Headline positions={positions} holdings={holdings} dashData={dashData} signalData={signalData} />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Premium Collected"
          value={`$${totalPremium.toLocaleString()}`}
          sub="across all open positions"
          valueColor="var(--green)"
        />
        <StatCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString()}`}
          sub="if closed right now"
          valueColor={totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          label="Avg Profit Capture"
          value={`${avgCapture.toFixed(1)}%`}
          sub="50% = take-profit trigger"
          valueColor={avgCapture >= 50 ? 'var(--green)' : 'var(--text)'}
        />
        <StatCard
          label="Signal"
          value={regime || '—'}
          sub={`${signalData?.total_score ?? 0}/${signalData?.max_score ?? 12} factors bullish`}
          valueColor={regimeColor}
        />
      </div>

      {/* SPY Bar */}
      {dashData?.spy && (
        <div
          className="px-5 py-3 border flex flex-wrap items-center gap-6"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
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
              <span>VIX <span style={{ color: 'var(--text)' }}>{dashData.vix_history.current?.toFixed(1)}</span></span>
            )}
            {dashData.spy_ma && (
              <span>20-Day MA <span style={{ color: 'var(--text)' }}>${dashData.spy_ma.ma_20?.toFixed(2)}</span></span>
            )}
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Covered Call Positions</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Click any row to view full position detail</p>
          </div>
          <button
            onClick={() => onNavigate('Portfolios')}
            className="text-xs hover:underline"
            style={{ color: 'var(--blue)' }}
          >
            View all →
          </button>
        </div>

        {open.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
            No open positions. Go to Portfolios to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <th className="px-4 py-2 text-left font-normal">Position</th>
                  <th className="px-4 py-2 text-left font-normal">Expiry</th>
                  <th className="px-4 py-2 text-left font-normal">Qty</th>
                  <th className="px-4 py-2 text-left font-normal">Price</th>
                  <th className="px-4 py-2 text-left font-normal">P&amp;L</th>
                  <th className="px-4 py-2 text-left font-normal">Risk</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {open.map(pos => (
                  <PositionRow key={pos.id} pos={pos} onNavigate={onNavigate} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open.length > 0 && (
          <div className="px-5 py-3 border-t flex flex-wrap gap-6 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            <span>Underlying ({totalShares || 600} shares): <span style={{ color: 'var(--text)' }}>${underlyingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
            <span>Total premium at stake: <span style={{ color: 'var(--text)' }}>${totalPremium.toLocaleString()}</span></span>
            <span>{atRisk} position{atRisk !== 1 ? 's' : ''} need attention</span>
          </div>
        )}
      </div>

      {/* News Feed */}
      <NewsFeed news={alphaData?.news} />

    </div>
  )
}
