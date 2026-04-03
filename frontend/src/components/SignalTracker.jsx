const FACTOR_DEFS = {
  iv_rank: {
    name: 'IV Rank',
    question: 'Are premiums worth selling today?',
    explain: "IV Rank measures where today's VIX sits within its 52-week range. 0 = historically cheap options, 100 = historically expensive. Above 50 means you have a statistical edge as a seller. Below 15 means premiums are too thin — don't sell.",
  },
  vix_level: {
    name: 'VIX Level',
    question: 'Is volatility in a safe range?',
    explain: 'The raw VIX level matters beyond rank. VIX 20–28 is the sweet spot: premiums are fat enough to collect, but the market isn\'t in panic mode. Above 35 brings serial down-days that can overwhelm short call positions.',
  },
  vvix: {
    name: 'VVIX',
    question: 'Is volatility itself stable?',
    explain: "VVIX is the volatility of VIX. A calm VVIX means the vol regime is stable. Above 100 signals the market is panicking about volatility itself — VIX could spike suddenly, which is dangerous for short options.",
  },
  spy_trend: {
    name: 'SPY Trend',
    question: 'Is the market trending too fast to sell calls?',
    explain: 'Covered calls underperform in strong uptrends. If SPY is rocketing higher, your sold call caps upside and you risk getting called away. A flat or mildly rising trend is ideal — you collect premium and the call drifts toward zero.',
  },
  rates: {
    name: 'Rates (TNX)',
    question: 'Are bonds a headwind or tailwind for SPY?',
    explain: 'When the 10-year yield falls, bond prices rise and equities tend to rally — a tailwind for SPY. Rising rates can be a headwind. Tracked here because SPY direction determines whether your OTM calls stay safely out-of-the-money.',
  },
  curve: {
    name: 'Yield Curve',
    question: 'Is the economy signaling stress?',
    explain: 'Comparing the 5-year and 10-year Treasury yields. A normal curve (5yr < 10yr) is healthy. An inverted curve (5yr > 10yr) has historically preceded recessions and adds a macro risk overlay to the signal.',
  },
}

const REGIME_EXPLAIN = {
  'SELL PREMIUM': 'All or most factors are aligned. Implied volatility is elevated, the trend is not too steep, and the vol regime is stable. This is when the academic edge exists — sell calls.',
  'HOLD': 'Mixed signals. Some factors are supportive but others are marginal. Maintain existing positions but pause new entries until the picture clarifies.',
  'CAUTION': 'Multiple warning flags. Either premiums are too cheap, volatility is unstable, or the trend is too strong. Avoid adding risk.',
  'AVOID': 'Conditions are unfavorable. The volatility risk premium is absent or risk is too elevated. Stand pat — no new positions.',
}

function ScoreBar({ score, maxAbs = 3 }) {
  const pct = Math.abs(score) / maxAbs * 100
  const color = score > 0 ? '#00ff88' : score < 0 ? '#ff3d5a' : '#1e2d4a'
  return (
    <div className="w-24 h-1.5 bg-[#1e2d4a] relative">
      {score !== 0 && (
        <div
          className="absolute top-0 h-full"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            left: score > 0 ? 0 : 'auto',
            right: score < 0 ? 0 : 'auto',
          }}
        />
      )}
    </div>
  )
}

function FactorCard({ fkey, data }) {
  const def = FACTOR_DEFS[fkey] || { name: fkey, question: '', explain: '' }
  const score = data.score
  const scoreColor = score > 0 ? 'text-[#00ff88]' : score < 0 ? 'text-[#ff3d5a]' : 'text-[#4a5568]'
  const borderColor = score > 0 ? 'border-[#00ff88]/20' : score < 0 ? 'border-[#ff3d5a]/20' : 'border-[#1e2d4a]'

  return (
    <div className={`bg-[#0f1629] border ${borderColor} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{def.name}</div>
          <div className="text-xs text-[#4a5568] mt-0.5">{def.question}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xl font-bold font-mono ${scoreColor}`}>
            {score > 0 ? `+${score}` : score}
          </div>
          <div className={`text-xs font-mono ${scoreColor}`}>{data.label}</div>
        </div>
      </div>
      <ScoreBar score={score} />
      <p className="text-xs text-[#4a5568] leading-relaxed">{def.explain}</p>
      <div className="text-xs text-[#c8d6e5] border-t border-[#1e2d4a] pt-2">
        {data.reasoning}
      </div>
    </div>
  )
}

export default function SignalTracker({ signalData, dashData }) {
  if (!signalData) return <div className="text-[#4a5568] text-sm">Loading signal data…</div>

  const { regime, confidence, total_score, max_score, factor_scores, position_alerts, recommended_strikes, warnings } = signalData

  const regimeColor = regime === 'SELL PREMIUM' ? '#00ff88'
    : regime === 'HOLD' ? '#ffb020'
    : regime === 'CAUTION' ? '#f97316'
    : '#ff3d5a'

  const pct = Math.max(0, total_score) / max_score * 100

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Signal Tracker</h1>
        <p className="text-sm text-[#4a5568] mt-0.5">
          A multi-factor model that tells you <em>when</em> to sell covered calls, grounded in academic options research.
        </p>
      </div>

      {/* Regime card */}
      <div className="bg-[#0f1629] border border-[#1e2d4a] p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-[#4a5568] uppercase tracking-wider mb-1">Current Signal</div>
            <div className="text-3xl font-bold" style={{ color: regimeColor }}>{regime}</div>
            <div className="text-sm text-[#4a5568] mt-1">{confidence} confidence</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#4a5568] uppercase tracking-wider mb-1">Score</div>
            <div className="text-3xl font-bold font-mono" style={{ color: regimeColor }}>{total_score}<span className="text-lg text-[#4a5568]">/{max_score}</span></div>
            <div className="w-48 h-2 bg-[#1e2d4a] mt-2 ml-auto">
              <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: regimeColor }} />
            </div>
          </div>
        </div>
        <p className="text-sm text-[#c8d6e5] leading-relaxed border-t border-[#1e2d4a] pt-4">
          {REGIME_EXPLAIN[regime] || ''}
        </p>

        {warnings?.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-[#1e2d4a]">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs text-[#ffb020]">⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Factor grid */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Factor Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {factor_scores && Object.entries(factor_scores).map(([key, data]) => (
            <FactorCard key={key} fkey={key} data={data} />
          ))}
        </div>
      </div>

      {/* Strike Recommendations */}
      {recommended_strikes?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Recommended New Entries</h2>
          <p className="text-xs text-[#4a5568] mb-3">Based on current VIX level and available expiries in the 30–45 DTE sweet spot.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommended_strikes.map((rec, i) => (
              <div key={i} className="bg-[#0f1629] border border-[#1e2d4a] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 font-medium ${rec.leg === 'near-term' ? 'bg-[#4a9eff]/10 text-[#4a9eff]' : 'bg-[#ffb020]/10 text-[#ffb020]'}`}>
                    {rec.leg.toUpperCase()}
                  </span>
                  <span className="text-xs text-[#4a5568]">{rec.dte} days to expiry</span>
                </div>
                <div className="text-base font-semibold text-white">${rec.strike} Call · {rec.expiry}</div>
                <div className="flex flex-wrap gap-4 text-xs text-[#4a5568]">
                  <span>{rec.distance_pct?.toFixed(1)}% out-of-the-money</span>
                  <span>Target delta ~{rec.delta_target}</span>
                  <span className="text-[#00ff88]">~${rec.estimated_premium?.toFixed(2)} est. premium</span>
                </div>
                <p className="text-xs text-[#4a5568]">{rec.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Academic footnote */}
      <div className="bg-[#0f1629] border-l-2 border-[#1e2d4a] px-4 py-3">
        <p className="text-xs text-[#4a5568] leading-relaxed">
          <span className="text-[#c8d6e5] font-medium">Academic basis:</span>{' '}
          Israelov & Nielsen (AQR, FAJ 2015) · Ibbotson Associates BXM study (2004) · Whaley (2002, Journal of Derivatives).
          Core thesis: implied volatility historically exceeds realized volatility by ~3 points — the Volatility Risk Premium is the seller's systematic edge.
          Optimal window: 30–45 DTE. Exit at 50% profit to maximize annualized return.
        </p>
      </div>
    </div>
  )
}
