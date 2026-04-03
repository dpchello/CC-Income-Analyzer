import { useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pctColor(val) {
  if (val > 0) return 'text-[#00ff88]'
  if (val < 0) return 'text-[#ff3d5a]'
  return 'text-[#c8d6e5]'
}

function riskLevel(pos) {
  if (!pos || pos.status !== 'open') return null
  if (pos.dte <= 7) return 'critical'
  if (pos.profit_capture_pct >= 50) return 'take-profit'
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5) return 'breach'
  if (pos.dte <= 21) return 'roll'
  return 'ok'
}

const RISK_BADGE = {
  critical:     { label: 'Expiring', color: 'bg-[#ff3d5a]/15 text-[#ff3d5a] border border-[#ff3d5a]/30' },
  'take-profit':{ label: 'Take Profit', color: 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30' },
  breach:       { label: 'Breach Risk', color: 'bg-[#ff3d5a]/15 text-[#ff3d5a] border border-[#ff3d5a]/30' },
  roll:         { label: 'Roll Soon', color: 'bg-[#ffb020]/10 text-[#ffb020] border border-[#ffb020]/30' },
  ok:           { label: 'On Track', color: 'bg-[#1e2d4a] text-[#4a5568] border border-[#1e2d4a]' },
}

// ── Headline ─────────────────────────────────────────────────────────────────

function Headline({ positions, dashData, signalData }) {
  const open = positions.filter(p => p.status === 'open')

  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const spyPrice = dashData?.spy?.price || 0

  // Approximate underlying value: 600 SPY shares
  const underlyingValue = 600 * spyPrice

  // Annualized return estimate: totalPremium / underlyingValue * 12 (assume monthly)
  const annualizedPct = underlyingValue > 0
    ? ((totalPremium / underlyingValue) * 12 * 100).toFixed(1)
    : '—'

  // Daily income = total premium / average DTE remaining
  const avgDte = open.length
    ? open.reduce((s, p) => s + (p.dte || 30), 0) / open.length
    : 30
  const dailyIncome = avgDte > 0 ? (totalPremium / avgDte).toFixed(0) : '—'

  const atRisk = open.filter(p => {
    const r = riskLevel(p)
    return r === 'critical' || r === 'breach'
  }).length

  const regime = signalData?.regime
  const regimeText = regime === 'SELL PREMIUM' ? 'Market conditions favor selling new covered calls.'
    : regime === 'HOLD' ? 'Conditions are marginal — hold existing positions, pause new entries.'
    : regime === 'CAUTION' ? 'Elevated risk — review open positions carefully before adding.'
    : 'Unfavorable conditions — avoid new positions until signals improve.'

  return (
    <div className="bg-[#0f1629] border border-[#1e2d4a] rounded-none p-5 space-y-1">
      <p className="text-[#c8d6e5] text-base leading-relaxed">
        Your <span className="text-white font-semibold">{open.length} open covered call{open.length !== 1 ? 's' : ''}</span> are
        generating an estimated{' '}
        <span className="text-[#00ff88] font-semibold">${dailyIncome}/day</span> in income
        with a projected annualized return of{' '}
        <span className="text-[#00ff88] font-semibold">{annualizedPct}%</span> on the underlying position.
        {atRisk > 0
          ? <> <span className="text-[#ff3d5a] font-semibold">{atRisk} position{atRisk !== 1 ? 's' : ''} need{atRisk === 1 ? 's' : ''} immediate attention.</span></>
          : <> All positions are on track.</>
        }
      </p>
      <p className="text-[#4a5568] text-sm">{regimeText}</p>
    </div>
  )
}

// ── Portfolio Row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, spyPrice, onNavigate }) {
  const risk = riskLevel(pos)
  const badge = RISK_BADGE[risk] || RISK_BADGE.ok
  const pnlPos = (pos.pnl || 0) >= 0

  return (
    <tr
      className="border-b border-[#1e2d4a] hover:bg-white/[0.02] cursor-pointer transition-colors"
      onClick={() => onNavigate('Portfolios')}
    >
      {/* Ticker + description */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1e2d4a] flex items-center justify-center text-xs font-semibold text-[#4a9eff]">
            {pos.ticker}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{pos.ticker} Call</div>
            <div className="text-xs text-[#4a5568]">Short Call · ${pos.strike} Strike</div>
          </div>
        </div>
      </td>

      {/* Expiry / DTE */}
      <td className="px-4 py-3">
        <div className="text-sm text-[#c8d6e5]">{pos.expiry}</div>
        <div className={`text-xs font-mono ${pos.dte <= 7 ? 'text-[#ff3d5a]' : pos.dte <= 21 ? 'text-[#ffb020]' : 'text-[#4a5568]'}`}>
          {pos.dte}d to expiry
        </div>
      </td>

      {/* Qty */}
      <td className="px-4 py-3 text-sm text-[#c8d6e5]">
        {pos.contracts} contracts
        <div className="text-xs text-[#4a5568]">{pos.contracts * 100} shares</div>
      </td>

      {/* Prices */}
      <td className="px-4 py-3">
        <div className="text-sm text-[#c8d6e5] font-mono">${pos.sell_price?.toFixed(2)}</div>
        <div className="text-xs text-[#4a5568] font-mono">
          now ${pos.current_price?.toFixed(2) ?? '—'}
        </div>
      </td>

      {/* P&L */}
      <td className="px-4 py-3">
        <div className={`text-sm font-semibold font-mono ${pnlPos ? 'text-[#00ff88]' : 'text-[#ff3d5a]'}`}>
          {pnlPos ? '+' : ''}${pos.pnl?.toFixed(0)}
        </div>
        <div className={`text-xs font-mono ${pnlPos ? 'text-[#00ff88]/70' : 'text-[#ff3d5a]/70'}`}>
          {pos.profit_capture_pct?.toFixed(1)}% captured
        </div>
      </td>

      {/* Risk */}
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-1 rounded-sm font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </td>

      {/* Arrow */}
      <td className="px-4 py-3 text-[#4a5568] text-sm">→</td>
    </tr>
  )
}

// ── Summary Stat Card ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="bg-[#0f1629] border border-[#1e2d4a] p-4 space-y-1">
      <div className="text-xs text-[#4a5568] uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold font-mono ${valueColor || 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-[#4a5568]">{sub}</div>}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({ dashData, signalData, positions, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')

  const totalPremium = open.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl = open.reduce((s, p) => s + (p.pnl || 0), 0)
  const spyPrice = dashData?.spy?.price || 0
  const underlyingValue = 600 * spyPrice
  const avgCapture = open.length
    ? open.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / open.length
    : 0

  const atRisk = open.filter(p => {
    const r = riskLevel(p)
    return r === 'critical' || r === 'breach' || r === 'roll'
  }).length

  const regime = signalData?.regime
  const regimeColor = regime === 'SELL PREMIUM' ? 'text-[#00ff88]'
    : regime === 'HOLD' ? 'text-[#ffb020]'
    : regime === 'CAUTION' ? 'text-orange-400'
    : 'text-[#ff3d5a]'

  return (
    <div className="space-y-6">

      {/* ── Headline ─────────────────────────────────────────── */}
      <Headline positions={positions} dashData={dashData} signalData={signalData} />

      {/* ── Stat Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Premium Collected"
          value={`$${totalPremium.toLocaleString()}`}
          sub="across all open positions"
          valueColor="text-[#00ff88]"
        />
        <StatCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString()}`}
          sub="if closed right now"
          valueColor={totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff3d5a]'}
        />
        <StatCard
          label="Avg Profit Capture"
          value={`${avgCapture.toFixed(1)}%`}
          sub="50% = take-profit trigger"
          valueColor={avgCapture >= 50 ? 'text-[#00ff88]' : 'text-white'}
        />
        <StatCard
          label="Signal"
          value={regime || '—'}
          sub={`${signalData?.total_score ?? 0}/${signalData?.max_score ?? 12} factors bullish`}
          valueColor={regimeColor}
        />
      </div>

      {/* ── SPY Live Price Bar ───────────────────────────────── */}
      {dashData?.spy && (
        <div className="bg-[#0f1629] border border-[#1e2d4a] px-5 py-3 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1e2d4a] flex items-center justify-center text-xs font-semibold text-[#4a9eff]">SPY</div>
            <div>
              <div className="text-xs text-[#4a5568]">SPDR S&P 500 ETF Trust</div>
              <div className="flex items-center gap-2">
                <span className="text-white text-lg font-semibold font-mono">${dashData.spy.price.toFixed(2)}</span>
                <span className={`text-sm font-mono ${dashData.spy.change >= 0 ? 'text-[#00ff88]' : 'text-[#ff3d5a]'}`}>
                  {dashData.spy.change >= 0 ? '+' : ''}{dashData.spy.change.toFixed(2)} ({dashData.spy.change_pct.toFixed(2)}%)
                </span>
                <span className="text-xs text-[#4a5568] pulse-green">● Live</span>
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-xs text-[#4a5568]">
            <span>Day High <span className="text-[#c8d6e5]">${dashData.spy.day_high?.toFixed(2)}</span></span>
            <span>Day Low <span className="text-[#c8d6e5]">${dashData.spy.day_low?.toFixed(2)}</span></span>
            {dashData.vix_history && (
              <span>VIX <span className="text-[#c8d6e5]">{dashData.vix_history.current?.toFixed(1)}</span></span>
            )}
            {dashData.spy_ma && (
              <span>20-Day MA <span className="text-[#c8d6e5]">${dashData.spy_ma.ma_20?.toFixed(2)}</span></span>
            )}
          </div>
        </div>
      )}

      {/* ── Positions Table ──────────────────────────────────── */}
      <div className="bg-[#0f1629] border border-[#1e2d4a]">
        <div className="px-5 py-3 border-b border-[#1e2d4a] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Covered Call Positions</h2>
            <p className="text-xs text-[#4a5568] mt-0.5">Click any row to view full position detail</p>
          </div>
          <button
            onClick={() => onNavigate('Portfolios')}
            className="text-xs text-[#4a9eff] hover:underline"
          >
            View all →
          </button>
        </div>

        {open.length === 0 ? (
          <div className="px-5 py-12 text-center text-[#4a5568] text-sm">
            No open positions. Go to Portfolios to add one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e2d4a] text-xs text-[#4a5568] uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Position</th>
                  <th className="px-4 py-2 text-left">Expiry</th>
                  <th className="px-4 py-2 text-left">Qty</th>
                  <th className="px-4 py-2 text-left">Price</th>
                  <th className="px-4 py-2 text-left">P&amp;L</th>
                  <th className="px-4 py-2 text-left">Risk</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {open.map(pos => (
                  <PositionRow key={pos.id} pos={pos} spyPrice={spyPrice} onNavigate={onNavigate} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer summary */}
        {open.length > 0 && (
          <div className="px-5 py-3 border-t border-[#1e2d4a] flex flex-wrap gap-6 text-xs text-[#4a5568]">
            <span>Underlying (600 shares): <span className="text-[#c8d6e5]">${underlyingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
            <span>Total premium at stake: <span className="text-[#c8d6e5]">${totalPremium.toLocaleString()}</span></span>
            <span>{atRisk} position{atRisk !== 1 ? 's' : ''} need attention</span>
          </div>
        )}
      </div>

    </div>
  )
}
