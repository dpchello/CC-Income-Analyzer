import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import Tooltip from './Tooltip.jsx'

const TICKER_DEFS = {
  VIX: 'The CBOE Volatility Index — measures the market\'s expected 30-day volatility for the S&P 500. Higher VIX = more fear = fatter option premiums. The sweet spot for selling covered calls is VIX 20–28.',
  VVIX: 'Volatility of VIX — measures how fast VIX itself is moving. A spike above 100 signals the market is panicking about volatility, which can cause VIX to jump suddenly and make short option positions riskier.',
  'TNX (10yr Yield)': 'The 10-year U.S. Treasury yield. Rising rates can act as a headwind for equities. Tracked here because rate moves influence SPY\'s direction, which affects whether your sold calls stay safely out-of-the-money.',
  'FVX (5yr Yield)': 'The 5-year U.S. Treasury yield. Compared to TNX to determine the shape of the yield curve. A normal curve (5yr < 10yr) is healthy; an inverted curve can signal economic stress.',
  TLT: 'iShares 20+ Year Treasury Bond ETF — a proxy for long-duration bonds. TLT rising usually means rates are falling, which is generally supportive for equities and for keeping your calls OTM.',
}

const FACTOR_PLAIN = {
  iv_rank: { name: 'IV Rank', why: 'Are premiums worth selling today?' },
  vix_level: { name: 'VIX Level', why: 'Is volatility in a safe range?' },
  vvix: { name: 'VVIX', why: 'Is volatility itself stable?' },
  spy_trend: { name: 'SPY Trend', why: 'Is the market trending too fast to sell calls?' },
  rates: { name: 'Rates (TNX)', why: 'Are bond markets a headwind or tailwind?' },
  curve: { name: 'Yield Curve', why: 'Is the economy signaling stress?' },
}

function IVRankGauge({ rank }) {
  const color = rank >= 70 ? '#00ff88' : rank >= 50 ? '#aaff00' : rank >= 30 ? '#ffb020' : '#ff3d5a'
  const label = rank >= 70 ? 'STRONG SELL' : rank >= 50 ? 'SELL' : rank >= 30 ? 'CAUTION' : 'AVOID'
  const meaning = rank >= 70
    ? 'Implied volatility is historically elevated. Option buyers are paying up — ideal time to be the seller.'
    : rank >= 50
    ? 'Premiums are above average. Good conditions for selling covered calls.'
    : rank >= 30
    ? 'Premiums are near average. Proceed carefully — the edge is thin.'
    : 'Premiums are historically cheap. Selling options here offers little edge — consider waiting.'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Tooltip text={`IV Rank measures where today's VIX sits within its 52-week range. 0 = historically cheap volatility, 100 = historically expensive. Above 50 is generally when covered call sellers have an edge. Current reading: ${meaning}`}>
          <span className="text-xs font-mono text-terminal-muted uppercase tracking-wider">IV Rank</span>
        </Tooltip>
        <span className="text-xs font-mono font-semibold" style={{ color }}>{label}</span>
      </div>
      <div className="h-3 bg-terminal-border relative overflow-hidden">
        <div className="h-full transition-all duration-700" style={{ width: `${Math.min(rank, 100)}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between text-xs font-mono text-terminal-muted">
        <span>0 — Cheap vol</span>
        <span style={{ color }} className="font-semibold text-sm">{rank?.toFixed(1)} / 100</span>
        <span>100 — Expensive vol</span>
      </div>
      <p className="text-xs text-terminal-muted leading-relaxed border-l-2 border-terminal-border pl-2 mt-1">
        {meaning}
      </p>
    </div>
  )
}

function TickerCell({ label, price, change, change_pct, unit = '' }) {
  const up = change >= 0
  const def = TICKER_DEFS[label]
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <div className="flex items-center">
        {def
          ? <Tooltip text={def}><span className="text-xs font-mono text-terminal-muted">{label}</span></Tooltip>
          : <span className="text-xs font-mono text-terminal-muted">{label}</span>
        }
      </div>
      <span className="font-mono text-white text-lg font-semibold">
        {price?.toFixed(2)}{unit}
      </span>
      <span className={`text-xs font-mono ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
        {up ? '+' : ''}{change?.toFixed(2)} ({up ? '+' : ''}{change_pct?.toFixed(2)}%)
      </span>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="panel p-2 text-xs font-mono border border-terminal-border">
        <p className="text-terminal-muted mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: ${p.value?.toFixed(2)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

function SignalStrip({ signalData }) {
  if (!signalData) return null
  const { regime, confidence, total_score, max_score, factor_scores, position_alerts, warnings } = signalData

  const regimeColor = regime === 'SELL PREMIUM' ? '#00ff88'
    : regime === 'HOLD' ? '#ffb020'
    : regime === 'CAUTION' ? '#f97316'
    : '#ff3d5a'

  const regimeExplain = regime === 'SELL PREMIUM'
    ? 'Conditions are favorable. IV is elevated, the trend is not too steep, and volatility is stable. This is when your strategy has an academic edge.'
    : regime === 'HOLD'
    ? 'Conditions are marginal. Premiums are thin or the trend is rising. Consider waiting for a better entry.'
    : regime === 'CAUTION'
    ? 'Multiple warning signs are present. Premiums may be too cheap or risk is elevated. Avoid opening new positions.'
    : 'Conditions are unfavorable. The volatility risk premium is absent or risk is too high. Stand pat.'

  // top 2 bullish and top 1 bearish factors for callout
  const factors = factor_scores ? Object.entries(factor_scores) : []
  const bullish = factors.filter(([, d]) => d.score > 0).sort((a, b) => b[1].score - a[1].score).slice(0, 2)
  const bearish = factors.filter(([, d]) => d.score < 0).sort((a, b) => a[1].score - b[1].score).slice(0, 1)

  const highAlerts = (position_alerts || []).filter(a => a.urgency === 'HIGH')

  return (
    <div className="panel p-4 space-y-4">
      {/* Regime headline */}
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="text-xs font-mono text-terminal-muted mb-1 uppercase tracking-wider">Today's Signal</div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-bold" style={{ color: regimeColor }}>{regime}</span>
            <span className="text-xs font-mono text-terminal-muted">{confidence} confidence · {total_score}/{max_score} pts</span>
          </div>
          <p className="text-xs text-terminal-muted mt-1 max-w-lg leading-relaxed">{regimeExplain}</p>
        </div>
        {/* Score bar */}
        <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-mono text-terminal-muted">Signal Score</span>
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-terminal-border">
              <div className="h-full" style={{ width: `${Math.max(0, total_score) / max_score * 100}%`, backgroundColor: regimeColor }} />
            </div>
            <span className="font-mono text-sm font-semibold" style={{ color: regimeColor }}>{total_score}/{max_score}</span>
          </div>
        </div>
      </div>

      {/* Factor callouts */}
      {(bullish.length > 0 || bearish.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {bullish.map(([key, data]) => (
            <div key={key} className="bg-terminal-green/5 border border-terminal-green/20 px-3 py-2">
              <div className="text-xs font-mono text-terminal-green font-semibold">
                ↑ {FACTOR_PLAIN[key]?.name || key}
              </div>
              <div className="text-xs text-terminal-muted mt-0.5">{FACTOR_PLAIN[key]?.why}</div>
              <div className="text-xs font-mono text-terminal-green mt-1">{data.label}</div>
            </div>
          ))}
          {bearish.map(([key, data]) => (
            <div key={key} className="bg-terminal-red/5 border border-terminal-red/20 px-3 py-2">
              <div className="text-xs font-mono text-terminal-red font-semibold">
                ↓ {FACTOR_PLAIN[key]?.name || key}
              </div>
              <div className="text-xs text-terminal-muted mt-0.5">{FACTOR_PLAIN[key]?.why}</div>
              <div className="text-xs font-mono text-terminal-red mt-1">{data.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Active position alerts summary */}
      {highAlerts.length > 0 && (
        <div className="border-t border-terminal-border pt-3 space-y-1">
          <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-2">Position Alerts Requiring Action</div>
          {highAlerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs font-mono text-terminal-red">
              <span className="shrink-0">
                {a.type === 'TAKE_PROFIT' ? '💰' : a.type === 'GAMMA_DANGER' ? '🔥' : '🚨'}
              </span>
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {warnings?.length > 0 && (
        <div className="border-t border-terminal-border pt-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-xs font-mono text-terminal-amber">⚠️ {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ dashData, signalData }) {
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetch('/api/history/spy')
      .then(r => r.json())
      .then(setHistory)
      .catch(() => {})
  }, [])

  if (!dashData) return <div className="text-terminal-muted font-mono text-sm">Loading...</div>

  const { spy, signal_tickers, vix_history, spy_ma } = dashData
  const vix = signal_tickers?.['^VIX']
  const vvix = signal_tickers?.['^VVIX']
  const tnx = signal_tickers?.['^TNX']
  const fvx = signal_tickers?.['^FVX']
  const tlt = signal_tickers?.['TLT']

  return (
    <div className="space-y-4">

      {/* Signal strip — key decision surface */}
      <SignalStrip signalData={signalData} />

      {/* IV Rank */}
      {vix_history && (
        <div className="panel p-4">
          <IVRankGauge rank={vix_history.iv_rank} />
          <div className="mt-3 flex gap-4 text-xs font-mono text-terminal-muted">
            <span>52wk VIX High: <span className="text-terminal-text">{vix_history.high_52wk}</span></span>
            <span>52wk VIX Low: <span className="text-terminal-text">{vix_history.low_52wk}</span></span>
            <span>Current VIX: <span className="text-terminal-text">{vix_history.current}</span></span>
          </div>
        </div>
      )}

      {/* SPY Trend */}
      {spy_ma && (
        <div className="panel p-3 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Tooltip text="The 20-day moving average smooths out daily noise to show SPY's underlying trend direction. If SPY is above it and the slope is flat or mild, that's the ideal environment for covered calls — upside is limited but not runaway.">
              <span className="text-xs font-mono text-terminal-muted">SPY vs 20-Day Moving Average</span>
            </Tooltip>
            <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 ${spy_ma.above_ma ? 'text-terminal-green bg-terminal-green/10' : 'text-terminal-red bg-terminal-red/10'}`}>
              {spy_ma.above_ma ? 'ABOVE' : 'BELOW'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip text="The MA slope shows how fast the trend is moving. Above +1.5%/month means SPY is rallying hard — covered calls tend to underperform in strong uptrends because the stock gets called away or you have to buy back the call at a loss.">
              <span className="text-xs font-mono text-terminal-muted">Trend Slope</span>
            </Tooltip>
            <span className={`text-xs font-mono font-semibold ${Math.abs(spy_ma.slope_pct) > 1.5 ? 'text-terminal-red' : spy_ma.slope_pct > 0.5 ? 'text-terminal-amber' : 'text-terminal-green'}`}>
              {spy_ma.slope_pct > 0 ? '+' : ''}{spy_ma.slope_pct?.toFixed(2)}%/mo
              {Math.abs(spy_ma.slope_pct) > 1.5 ? ' — TOO STEEP' : spy_ma.slope_pct > 0.5 ? ' — MODERATE' : ' — FLAT/MILD ✓'}
            </span>
          </div>
          <span className="text-xs font-mono text-terminal-muted">20MA: <span className="text-terminal-text">${spy_ma.ma_20?.toFixed(2)}</span></span>
        </div>
      )}

      {/* Signal Tickers */}
      <div>
        <div className="text-xs font-mono text-terminal-muted uppercase tracking-wider mb-2 px-1">Market Signals</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {vix && <TickerCell label="VIX" price={vix.price} change={vix.change} change_pct={vix.change_pct} />}
          {vvix && <TickerCell label="VVIX" price={vvix.price} change={vvix.change} change_pct={vvix.change_pct} />}
          {tnx && <TickerCell label="TNX (10yr Yield)" price={tnx.price} change={tnx.change} change_pct={tnx.change_pct} unit="%" />}
          {fvx && <TickerCell label="FVX (5yr Yield)" price={fvx.price} change={fvx.change} change_pct={fvx.change_pct} unit="%" />}
          {tlt && <TickerCell label="TLT" price={tlt.price} change={tlt.change} change_pct={tlt.change_pct} />}
        </div>
      </div>

      {/* Chart */}
      {history.length > 0 && (
        <div className="panel p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-mono text-terminal-muted uppercase tracking-wider">SPY — 60 Day Price Chart</span>
            <span className="flex items-center gap-1 text-xs font-mono text-terminal-blue">
              <span className="inline-block w-6 border-t border-terminal-blue" /> Price
            </span>
            <span className="flex items-center gap-1 text-xs font-mono text-terminal-amber">
              <span className="inline-block w-6 border-t-2 border-dashed border-terminal-amber" /> 20-Day MA
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#4a5568', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                tickFormatter={v => v.slice(5)}
                interval={9}
              />
              <YAxis
                tick={{ fill: '#4a5568', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                domain={['auto', 'auto']}
                tickFormatter={v => `$${v}`}
              />
              <RechartsTooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="close" name="SPY" stroke="#4a9eff" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="ma_20" name="20MA" stroke="#ffb020" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-terminal-muted mt-2 leading-relaxed">
            The 20-day moving average (amber dashed line) is the key trend filter for this strategy.
            When SPY is above it and the slope is flat, your sold calls are unlikely to be breached.
            When SPY is rising steeply through the MA, the risk of getting called away increases.
          </p>
        </div>
      )}
    </div>
  )
}
