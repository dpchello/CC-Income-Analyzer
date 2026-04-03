function ScoreBar({ score, maxAbs = 3 }) {
  const pct = Math.abs(score) / maxAbs * 100
  const color = score > 0 ? '#00ff88' : score < 0 ? '#ff3d5a' : '#4a5568'
  return (
    <div className="flex items-center gap-2 w-32">
      <div className="flex-1 h-2 bg-terminal-border">
        {score > 0
          ? <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
          : score < 0
          ? <div className="h-full ml-auto" style={{ width: `${pct}%`, backgroundColor: color }} />
          : <div className="h-full w-0" />
        }
      </div>
    </div>
  )
}

function FactorRow({ name, data }) {
  const score = data.score
  const color = score > 0 ? 'text-terminal-green' : score < 0 ? 'text-terminal-red' : 'text-terminal-muted'
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-terminal-border/40">
      <span className="text-xs font-mono text-terminal-muted w-28 shrink-0">{name}</span>
      <span className={`text-xs font-mono font-semibold w-8 shrink-0 ${color}`}>
        {score > 0 ? `+${score}` : score}
      </span>
      <ScoreBar score={score} />
      <span className={`text-xs font-mono px-1.5 py-0.5 shrink-0 ${
        score > 0 ? 'text-terminal-green bg-terminal-green/10' :
        score < 0 ? 'text-terminal-red bg-terminal-red/10' :
        'text-terminal-muted bg-terminal-muted/10'
      }`}>
        {data.label}
      </span>
      <span className="text-xs text-terminal-muted leading-tight hidden md:block">{data.reasoning}</span>
    </div>
  )
}

function AlertItem({ alert }) {
  const icon = alert.type === 'TAKE_PROFIT' ? '💰'
    : alert.type === 'GAMMA_DANGER' ? '🔥'
    : alert.type === 'ROLL_WARNING' ? '⏰'
    : alert.type === 'STRIKE_BREACH' ? '🚨'
    : '⚠️'
  const urgencyColor = alert.urgency === 'HIGH' ? 'text-terminal-red' : alert.urgency === 'MEDIUM' ? 'text-terminal-amber' : 'text-terminal-muted'
  return (
    <div className={`flex items-start gap-2 py-1.5 border-b border-terminal-border/40 text-xs font-mono ${urgencyColor}`}>
      <span>{icon}</span>
      <span>{alert.message}</span>
      <span className="ml-auto shrink-0 opacity-60">{alert.urgency}</span>
    </div>
  )
}

function StrikeRec({ rec }) {
  return (
    <div className="panel p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-mono px-1.5 py-0.5 ${
          rec.leg === 'near-term' ? 'text-terminal-blue bg-terminal-blue/10' : 'text-terminal-amber bg-terminal-amber/10'
        }`}>
          {rec.leg.toUpperCase()}
        </span>
        <span className="text-xs font-mono text-terminal-muted">{rec.dte} DTE</span>
      </div>
      <div className="font-mono text-white font-semibold">${rec.strike} Call · {rec.expiry}</div>
      <div className="flex flex-wrap gap-3 text-xs font-mono text-terminal-muted">
        <span>{rec.distance_pct?.toFixed(2)}% OTM</span>
        <span>Δ ~{rec.delta_target}</span>
        <span className="text-terminal-green">~${rec.estimated_premium?.toFixed(2)} est. premium</span>
      </div>
      <div className="text-xs text-terminal-muted leading-tight">{rec.rationale}</div>
    </div>
  )
}

export default function SignalEngine({ signalData }) {
  if (!signalData) return <div className="text-terminal-muted font-mono text-sm">Loading signal data...</div>

  const { regime, confidence, total_score, max_score, factor_scores, position_alerts, recommended_strikes, warnings } = signalData

  const regimeColor = regime === 'SELL PREMIUM' ? 'text-terminal-green border-terminal-green bg-terminal-green/5'
    : regime === 'HOLD' ? 'text-terminal-amber border-terminal-amber bg-terminal-amber/5'
    : regime === 'CAUTION' ? 'text-orange-400 border-orange-400 bg-orange-400/5'
    : 'text-terminal-red border-terminal-red bg-terminal-red/5'

  const factorNames = {
    iv_rank: 'IV Rank',
    vix_level: 'VIX Level',
    vvix: 'VVIX',
    spy_trend: 'SPY Trend',
    rates: 'Rates (TNX)',
    curve: 'Curve (FVX/TNX)',
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Regime Box */}
      <div className={`panel p-4 border ${regimeColor}`}>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="text-xs font-mono text-terminal-muted mb-1">SIGNAL REGIME</div>
            <div className="font-mono text-2xl font-semibold">{regime}</div>
          </div>
          <div className="border-l border-terminal-border pl-4">
            <div className="text-xs font-mono text-terminal-muted mb-1">CONFIDENCE</div>
            <div className="font-mono text-lg font-semibold">{confidence}</div>
          </div>
          <div className="border-l border-terminal-border pl-4">
            <div className="text-xs font-mono text-terminal-muted mb-1">TOTAL SCORE</div>
            <div className="font-mono text-lg font-semibold">{total_score}/{max_score}</div>
          </div>
        </div>
      </div>

      {/* Factor Scorecard */}
      <div className="panel p-4">
        <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-3">Factor Scorecard</div>
        {factor_scores && Object.entries(factor_scores).map(([key, data]) => (
          <FactorRow key={key} name={factorNames[key] || key} data={data} />
        ))}
      </div>

      {/* Position Alerts */}
      {position_alerts?.length > 0 && (
        <div className="panel p-4">
          <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-3">Position Alerts</div>
          {position_alerts.map((a, i) => <AlertItem key={i} alert={a} />)}
        </div>
      )}

      {/* Recommended Strikes */}
      {recommended_strikes?.length > 0 && (
        <div className="panel p-4">
          <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-3">Recommended New Entries</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommended_strikes.map((rec, i) => <StrikeRec key={i} rec={rec} />)}
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings?.length > 0 && (
        <div className="panel p-4 border border-terminal-amber/30">
          <div className="text-xs font-mono text-terminal-amber uppercase tracking-wider mb-3">Warnings</div>
          {warnings.map((w, i) => (
            <div key={i} className="text-xs font-mono text-terminal-amber py-1">⚠️ {w}</div>
          ))}
        </div>
      )}

      {/* Academic basis note */}
      <div className="panel p-3 border-l-2 border-terminal-muted/40">
        <div className="text-xs font-mono text-terminal-muted leading-relaxed">
          <strong className="text-terminal-text">Academic basis:</strong> Signal engine grounded in Israelov & Nielsen (AQR, FAJ 2015),
          Ibbotson Associates BXM study (2004), Whaley (2002). Core edge = Volatility Risk Premium (VRP).
          Optimal DTE 30–45d. 50% profit exit rule maximizes annualized return.
          OTM 2–3% outperforms ATM on risk-adjusted basis.
        </div>
      </div>
    </div>
  )
}
