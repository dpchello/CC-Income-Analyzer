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

export default function SignalTracker({ signalData, dashData, alphaData }) {
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
    </div>
  )
}
