import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

function IVRankGauge({ rank }) {
  const color = rank >= 70 ? '#00ff88' : rank >= 50 ? '#aaff00' : rank >= 30 ? '#ffb020' : '#ff3d5a'
  const label = rank >= 70 ? 'STRONG SELL' : rank >= 50 ? 'SELL' : rank >= 30 ? 'CAUTION' : 'AVOID'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-mono text-terminal-muted">
        <span>IV RANK</span>
        <span style={{ color }}>{label}</span>
      </div>
      <div className="h-3 bg-terminal-border rounded-none relative overflow-hidden">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${Math.min(rank, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-xs font-mono">
        <span className="text-terminal-muted">0</span>
        <span style={{ color }} className="font-semibold">{rank?.toFixed(1)}/100</span>
        <span className="text-terminal-muted">100</span>
      </div>
    </div>
  )
}

function TickerCell({ label, price, change, change_pct, unit = '' }) {
  const up = change >= 0
  return (
    <div className="panel p-3 flex flex-col gap-1">
      <span className="text-xs font-mono text-terminal-muted">{label}</span>
      <span className="font-mono text-white text-lg font-semibold">
        {price?.toFixed(2)}{unit}
      </span>
      <span className={`text-xs font-mono ${up ? 'text-terminal-green' : 'text-terminal-red'}`}>
        {up ? '+' : ''}{change?.toFixed(2)} ({up ? '+' : ''}{change_pct?.toFixed(2)}%)
      </span>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
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

  const regime = signalData?.regime
  const regimeColor = regime === 'SELL PREMIUM' ? 'text-terminal-green border-terminal-green'
    : regime === 'HOLD' ? 'text-terminal-amber border-terminal-amber'
    : regime === 'CAUTION' ? 'text-orange-400 border-orange-400'
    : 'text-terminal-red border-terminal-red'

  return (
    <div className="space-y-4">
      {/* Regime + SPY MA Bar */}
      <div className="panel p-3 flex flex-wrap items-center gap-6">
        <div>
          <span className="text-xs font-mono text-terminal-muted mr-2">REGIME</span>
          <span className={`font-mono text-sm font-semibold px-2 py-0.5 border ${regimeColor}`}>
            {regime || '—'}
          </span>
          {signalData && (
            <span className="ml-2 font-mono text-xs text-terminal-muted">
              Score {signalData.total_score}/{signalData.max_score} · {signalData.confidence}
            </span>
          )}
        </div>
        {spy_ma && (
          <div className="font-mono text-xs text-terminal-muted">
            <span>SPY vs 20MA: </span>
            <span className={spy_ma.above_ma ? 'text-terminal-green' : 'text-terminal-red'}>
              {spy_ma.above_ma ? 'ABOVE' : 'BELOW'}
            </span>
            <span className="ml-3">MA Slope: </span>
            <span className={Math.abs(spy_ma.slope_pct) > 1.5 ? 'text-terminal-red' : 'text-terminal-amber'}>
              {spy_ma.slope_pct > 0 ? '+' : ''}{spy_ma.slope_pct?.toFixed(2)}%/mo
            </span>
            <span className="ml-3 text-terminal-muted">20MA: ${spy_ma.ma_20?.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* IV Rank */}
      {vix_history && (
        <div className="panel p-4">
          <IVRankGauge rank={vix_history.iv_rank} />
          <div className="mt-2 flex gap-4 text-xs font-mono text-terminal-muted">
            <span>52wk High: <span className="text-terminal-text">{vix_history.high_52wk}</span></span>
            <span>52wk Low: <span className="text-terminal-text">{vix_history.low_52wk}</span></span>
            <span>Current VIX: <span className="text-terminal-text">{vix_history.current}</span></span>
          </div>
        </div>
      )}

      {/* Signal Tickers */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {vix && <TickerCell label="VIX" price={vix.price} change={vix.change} change_pct={vix.change_pct} />}
        {vvix && <TickerCell label="VVIX" price={vvix.price} change={vvix.change} change_pct={vvix.change_pct} />}
        {tnx && <TickerCell label="TNX (10yr)" price={tnx.price} change={tnx.change} change_pct={tnx.change_pct} unit="%" />}
        {fvx && <TickerCell label="FVX (5yr)" price={fvx.price} change={fvx.change} change_pct={fvx.change_pct} unit="%" />}
        {tlt && <TickerCell label="TLT" price={tlt.price} change={tlt.change} change_pct={tlt.change_pct} />}
      </div>

      {/* SPY 60-day chart */}
      {history.length > 0 && (
        <div className="panel p-4">
          <div className="text-xs font-mono text-terminal-muted mb-3">SPY 60-DAY PRICE + 20MA</div>
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
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="close"
                name="SPY"
                stroke="#4a9eff"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="ma_20"
                name="20MA"
                stroke="#ffb020"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
