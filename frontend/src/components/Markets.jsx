import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../auth.jsx'
import { Group } from '@visx/group'
import { LinePath, Bar, Line } from '@visx/shape'
import { scaleLinear, scaleTime } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { ParentSize } from '@visx/responsive'
import { LinearGradient } from '@visx/gradient'
import { rsi, macd, bollinger } from '../lib/indicators.js'

// Cursor x-position relative to the SVG. Avoids needing @visx/event.
function localX(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientX - rect.left
}

// ── Constants ───────────────────────────────────────────────────────────────

const RANGES = [
  { id: '1M',  days: 30 },
  { id: '3M',  days: 90 },
  { id: '6M',  days: 180 },
  { id: '1Y',  days: 365 },
  { id: '2Y',  days: 730 },
  { id: '5Y',  days: 1825 },
  { id: 'Max', days: 1825 }, // we backfill 5y, so Max = 5y
]

const TOP_N_OPTIONS = [10, 50, 100, 500]

const COLORS = {
  primary:    'var(--gold, #d4a544)',
  spy:        '#4a90e2',
  qqq:        '#9b59b6',
  bbUpper:    'rgba(212, 165, 68, 0.35)',
  bbMiddle:   'rgba(212, 165, 68, 0.55)',
  bbLower:    'rgba(212, 165, 68, 0.35)',
  rsi:        '#7fbf7f',
  macd:       '#d4a544',
  signal:     '#e67e7e',
  histPos:    'rgba(127, 191, 127, 0.6)',
  histNeg:    'rgba(230, 126, 126, 0.6)',
  fg:         'var(--fg, #e8e6e1)',
  faint:      'var(--fg-faint, #88857f)',
  line:       'var(--line, #2a2825)',
  bg:         'var(--bg, #16140f)',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtVolume(v) {
  if (v == null) return '—'
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return v.toFixed(0)
}

function dateAxisFormat(d) {
  const dt = new Date(d)
  return dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

function dateTooltipFormat(d) {
  const dt = new Date(d)
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Filter UI ───────────────────────────────────────────────────────────────

function TickerTypeahead({ value, onChange, allTickers }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const matches = useMemo(() => {
    if (!query) return allTickers.slice(0, 20)
    const q = query.toUpperCase()
    return allTickers
      .filter(t => t.startsWith(q))
      .slice(0, 20)
  }, [query, allTickers])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      <input
        type="text"
        value={open ? query : (value || '')}
        placeholder="Type a ticker…"
        onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--bg-elev)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          color: 'var(--fg)',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          letterSpacing: '0.05em',
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
          maxHeight: 240, overflowY: 'auto', background: 'var(--bg-elev)',
          border: '1px solid var(--line)', borderRadius: 6, zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}>
          {matches.map(t => (
            <div
              key={t}
              onMouseDown={() => { onChange(t); setOpen(false); setQuery('') }}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--line)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  mode, setMode, ticker, setTicker, topN, setTopN, range, setRange,
  spyOn, setSpyOn, qqqOn, setQqqOn, rsiOn, setRsiOn, macdOn, setMacdOn,
  bbOn, setBbOn, allTickers,
}) {
  const btn = (active) => ({
    padding: '6px 12px',
    background: active ? 'var(--gold, #d4a544)' : 'var(--bg-elev)',
    color: active ? 'var(--bg, #16140f)' : 'var(--fg)',
    border: '1px solid ' + (active ? 'var(--gold, #d4a544)' : 'var(--line)'),
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    letterSpacing: '0.08em',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--line)', padding: 1, borderRadius: 6 }}>
          <button onClick={() => setMode('composite')} style={btn(mode === 'composite')}>COMPOSITE</button>
          <button onClick={() => setMode('top_n')}     style={btn(mode === 'top_n')}>TOP N</button>
          <button onClick={() => setMode('ticker')}    style={btn(mode === 'ticker')}>TICKER</button>
        </div>

        {/* Mode-specific input */}
        {mode === 'top_n' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {TOP_N_OPTIONS.map(n => (
              <button key={n} onClick={() => setTopN(n)} style={btn(topN === n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        {mode === 'ticker' && (
          <TickerTypeahead value={ticker} onChange={setTicker} allTickers={allTickers} />
        )}

        <div style={{ flex: 1 }} />

        {/* Range */}
        <div style={{ display: 'flex', gap: 2 }}>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)} style={btn(range === r.id)}>
              {r.id}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.08em', color: 'var(--fg-faint)' }}>
        <span>OVERLAYS:</span>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'center' }}>
          <input type="checkbox" checked={spyOn} onChange={e => setSpyOn(e.target.checked)} />
          <span style={{ color: COLORS.spy }}>SPY</span>
        </label>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'center' }}>
          <input type="checkbox" checked={qqqOn} onChange={e => setQqqOn(e.target.checked)} />
          <span style={{ color: COLORS.qqq }}>QQQ</span>
        </label>
        <span style={{ width: 16 }} />
        <span>INDICATORS:</span>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'center' }}>
          <input type="checkbox" checked={bbOn} onChange={e => setBbOn(e.target.checked)} />
          <span>BOLLINGER</span>
        </label>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'center' }}>
          <input type="checkbox" checked={rsiOn} onChange={e => setRsiOn(e.target.checked)} />
          <span>RSI</span>
        </label>
        <label style={{ display: 'flex', gap: 6, cursor: 'pointer', alignItems: 'center' }}>
          <input type="checkbox" checked={macdOn} onChange={e => setMacdOn(e.target.checked)} />
          <span>MACD</span>
        </label>
      </div>
    </div>
  )
}

// ── Chart panes ─────────────────────────────────────────────────────────────

const PADDING = { top: 12, right: 56, bottom: 28, left: 56 }

function VolumePane({
  width, height, dates, primary, primaryLabel,
  spyVolume, qqqVolume, bbValues, showBB, showSpy, showQqq,
  hoverIndex, setHoverIndex,
}) {
  if (!dates || dates.length === 0) return null
  const xs = dates.map(d => new Date(d))
  const xScale = scaleTime({
    domain: [xs[0], xs[xs.length - 1]],
    range: [PADDING.left, width - PADDING.right],
  })

  // y-axis: include any series we're showing
  const allValues = []
  primary.forEach(v => { if (v != null) allValues.push(v) })
  if (showSpy && spyVolume) spyVolume.forEach(v => { if (v != null) allValues.push(v) })
  if (showQqq && qqqVolume) qqqVolume.forEach(v => { if (v != null) allValues.push(v) })
  if (showBB && bbValues) {
    bbValues.upper.forEach(v => { if (v != null) allValues.push(v) })
    bbValues.lower.forEach(v => { if (v != null) allValues.push(v) })
  }
  if (allValues.length === 0) return null
  const yMin = Math.min(...allValues)
  const yMax = Math.max(...allValues)
  const pad = (yMax - yMin) * 0.08 || 1
  const yScale = scaleLinear({
    domain: [yMin - pad, yMax + pad],
    range: [height - PADDING.bottom, PADDING.top],
  })

  const handleMove = e => {
    const x = localX(e)
    if (x < PADDING.left || x > width - PADDING.right) {
      setHoverIndex(null)
      return
    }
    const t = xScale.invert(x)
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - t)
      if (d < best) { best = d; nearest = i }
    }
    setHoverIndex(nearest)
  }

  const definedPrimary = (i) => primary[i] != null
  const hoverX = hoverIndex != null ? xScale(xs[hoverIndex]) : null

  return (
    <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)} style={{ display: 'block' }}>
      <LinearGradient id="vol-grad" from={COLORS.primary} to={COLORS.primary} fromOpacity={0.18} toOpacity={0.0} />
      <GridRows scale={yScale} width={width - PADDING.left - PADDING.right} left={PADDING.left} stroke={COLORS.line} strokeOpacity={0.5} numTicks={4} />

      {/* Primary line */}
      <LinePath
        data={primary.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
        x={d => xScale(d.x)}
        y={d => yScale(d.y)}
        stroke={COLORS.primary}
        strokeWidth={1.6}
      />

      {/* Bollinger Bands */}
      {showBB && bbValues && (
        <>
          <LinePath
            data={bbValues.upper.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
            x={d => xScale(d.x)} y={d => yScale(d.y)}
            stroke={COLORS.bbUpper} strokeWidth={1} strokeDasharray="3,3"
          />
          <LinePath
            data={bbValues.middle.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
            x={d => xScale(d.x)} y={d => yScale(d.y)}
            stroke={COLORS.bbMiddle} strokeWidth={1} strokeDasharray="2,4"
          />
          <LinePath
            data={bbValues.lower.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
            x={d => xScale(d.x)} y={d => yScale(d.y)}
            stroke={COLORS.bbLower} strokeWidth={1} strokeDasharray="3,3"
          />
        </>
      )}

      {/* SPY overlay */}
      {showSpy && spyVolume && (
        <LinePath
          data={spyVolume.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
          x={d => xScale(d.x)} y={d => yScale(d.y)}
          stroke={COLORS.spy} strokeWidth={1.2} strokeOpacity={0.75}
        />
      )}

      {/* QQQ overlay */}
      {showQqq && qqqVolume && (
        <LinePath
          data={qqqVolume.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
          x={d => xScale(d.x)} y={d => yScale(d.y)}
          stroke={COLORS.qqq} strokeWidth={1.2} strokeOpacity={0.75}
        />
      )}

      {/* Crosshair */}
      {hoverX != null && (
        <Line
          from={{ x: hoverX, y: PADDING.top }}
          to={{ x: hoverX, y: height - PADDING.bottom }}
          stroke={COLORS.faint}
          strokeWidth={1}
          strokeDasharray="2,3"
          pointerEvents="none"
        />
      )}

      <AxisLeft
        scale={yScale} left={PADDING.left}
        tickFormat={fmtVolume}
        stroke={COLORS.line}
        tickStroke={COLORS.line}
        tickLabelProps={() => ({ fill: COLORS.faint, fontSize: 10, fontFamily: 'var(--mono)', textAnchor: 'end', dx: -4, dy: 3 })}
        numTicks={4}
      />
      <AxisBottom
        scale={xScale} top={height - PADDING.bottom}
        tickFormat={dateAxisFormat}
        stroke={COLORS.line}
        tickStroke={COLORS.line}
        tickLabelProps={() => ({ fill: COLORS.faint, fontSize: 10, fontFamily: 'var(--mono)', textAnchor: 'middle' })}
        numTicks={6}
      />
      {/* Pane label */}
      <text x={PADDING.left + 4} y={PADDING.top + 12} fill={COLORS.fg} fontSize={11} fontFamily="var(--mono)" letterSpacing="0.08em">
        {primaryLabel}
      </text>
    </svg>
  )
}

function RsiPane({ width, height, dates, values, hoverIndex, setHoverIndex }) {
  if (!dates || dates.length === 0) return null
  const xs = dates.map(d => new Date(d))
  const xScale = scaleTime({ domain: [xs[0], xs[xs.length - 1]], range: [PADDING.left, width - PADDING.right] })
  const yScale = scaleLinear({ domain: [0, 100], range: [height - PADDING.bottom, PADDING.top] })

  const handleMove = e => {
    const x = localX(e)
    if (x < PADDING.left || x > width - PADDING.right) { setHoverIndex(null); return }
    const t = xScale.invert(x)
    let nearest = 0, best = Infinity
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - t); if (d < best) { best = d; nearest = i }
    }
    setHoverIndex(nearest)
  }

  const hoverX = hoverIndex != null ? xScale(xs[hoverIndex]) : null

  return (
    <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)} style={{ display: 'block' }}>
      {/* Reference bands */}
      <Line from={{ x: PADDING.left, y: yScale(70) }} to={{ x: width - PADDING.right, y: yScale(70) }}
            stroke={COLORS.faint} strokeOpacity={0.4} strokeDasharray="2,4" />
      <Line from={{ x: PADDING.left, y: yScale(30) }} to={{ x: width - PADDING.right, y: yScale(30) }}
            stroke={COLORS.faint} strokeOpacity={0.4} strokeDasharray="2,4" />
      <LinePath
        data={values.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
        x={d => xScale(d.x)} y={d => yScale(d.y)}
        stroke={COLORS.rsi} strokeWidth={1.4}
      />
      {hoverX != null && (
        <Line from={{ x: hoverX, y: PADDING.top }} to={{ x: hoverX, y: height - PADDING.bottom }}
              stroke={COLORS.faint} strokeWidth={1} strokeDasharray="2,3" pointerEvents="none" />
      )}
      <AxisLeft scale={yScale} left={PADDING.left} tickValues={[30, 50, 70]}
                stroke={COLORS.line} tickStroke={COLORS.line}
                tickLabelProps={() => ({ fill: COLORS.faint, fontSize: 10, fontFamily: 'var(--mono)', textAnchor: 'end', dx: -4, dy: 3 })} />
      <text x={PADDING.left + 4} y={PADDING.top + 12} fill={COLORS.rsi} fontSize={11} fontFamily="var(--mono)" letterSpacing="0.08em">RSI (14)</text>
    </svg>
  )
}

function MacdPane({ width, height, dates, macdLine, signalLine, hist, hoverIndex, setHoverIndex }) {
  if (!dates || dates.length === 0) return null
  const xs = dates.map(d => new Date(d))
  const xScale = scaleTime({ domain: [xs[0], xs[xs.length - 1]], range: [PADDING.left, width - PADDING.right] })

  const allVals = []
  macdLine.forEach(v => { if (v != null) allVals.push(v) })
  signalLine.forEach(v => { if (v != null) allVals.push(v) })
  hist.forEach(v => { if (v != null) allVals.push(v) })
  if (allVals.length === 0) return null
  const yMax = Math.max(...allVals.map(Math.abs)) * 1.1 || 1
  const yScale = scaleLinear({ domain: [-yMax, yMax], range: [height - PADDING.bottom, PADDING.top] })

  const barWidth = Math.max(1, (width - PADDING.left - PADDING.right) / xs.length * 0.7)

  const handleMove = e => {
    const x = localX(e)
    if (x < PADDING.left || x > width - PADDING.right) { setHoverIndex(null); return }
    const t = xScale.invert(x)
    let nearest = 0, best = Infinity
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - t); if (d < best) { best = d; nearest = i }
    }
    setHoverIndex(nearest)
  }

  const hoverX = hoverIndex != null ? xScale(xs[hoverIndex]) : null
  const zeroY = yScale(0)

  return (
    <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)} style={{ display: 'block' }}>
      <Line from={{ x: PADDING.left, y: zeroY }} to={{ x: width - PADDING.right, y: zeroY }}
            stroke={COLORS.line} strokeOpacity={0.5} />
      {/* Histogram */}
      {hist.map((h, i) => {
        if (h == null) return null
        const x = xScale(xs[i]) - barWidth / 2
        const y = h >= 0 ? yScale(h) : zeroY
        const barH = Math.abs(zeroY - yScale(h))
        return <Bar key={i} x={x} y={y} width={barWidth} height={barH} fill={h >= 0 ? COLORS.histPos : COLORS.histNeg} />
      })}
      <LinePath
        data={macdLine.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
        x={d => xScale(d.x)} y={d => yScale(d.y)}
        stroke={COLORS.macd} strokeWidth={1.4}
      />
      <LinePath
        data={signalLine.map((v, i) => ({ x: xs[i], y: v })).filter(p => p.y != null)}
        x={d => xScale(d.x)} y={d => yScale(d.y)}
        stroke={COLORS.signal} strokeWidth={1.2} strokeDasharray="3,3"
      />
      {hoverX != null && (
        <Line from={{ x: hoverX, y: PADDING.top }} to={{ x: hoverX, y: height - PADDING.bottom }}
              stroke={COLORS.faint} strokeWidth={1} strokeDasharray="2,3" pointerEvents="none" />
      )}
      <AxisLeft scale={yScale} left={PADDING.left} numTicks={3}
                stroke={COLORS.line} tickStroke={COLORS.line}
                tickLabelProps={() => ({ fill: COLORS.faint, fontSize: 10, fontFamily: 'var(--mono)', textAnchor: 'end', dx: -4, dy: 3 })} />
      <text x={PADDING.left + 4} y={PADDING.top + 12} fill={COLORS.macd} fontSize={11} fontFamily="var(--mono)" letterSpacing="0.08em">MACD (12,26,9)</text>
    </svg>
  )
}

// ── Hover legend ────────────────────────────────────────────────────────────

function HoverLegend({ dates, primary, primaryLabel, spyVolume, qqqVolume, showSpy, showQqq, hoverIndex, rsiValues, macdData, showRsi, showMacd }) {
  if (hoverIndex == null || !dates || dates.length === 0) return null
  const i = hoverIndex
  return (
    <div style={{
      position: 'absolute', top: 12, right: 16,
      background: 'rgba(22, 20, 15, 0.92)',
      border: '1px solid var(--line)', borderRadius: 6,
      padding: '8px 12px', fontSize: 11, fontFamily: 'var(--mono)',
      letterSpacing: '0.05em', minWidth: 200, color: 'var(--fg)',
      pointerEvents: 'none', zIndex: 5,
    }}>
      <div style={{ color: COLORS.faint, marginBottom: 4 }}>{dateTooltipFormat(dates[i])}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: COLORS.primary }}>{primaryLabel}</span>
        <span>{fmtVolume(primary[i])}</span>
      </div>
      {showSpy && spyVolume && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.spy }}>SPY</span>
          <span>{fmtVolume(spyVolume[i])}</span>
        </div>
      )}
      {showQqq && qqqVolume && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.qqq }}>QQQ</span>
          <span>{fmtVolume(qqqVolume[i])}</span>
        </div>
      )}
      {showRsi && rsiValues && rsiValues[i] != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.rsi }}>RSI</span>
          <span>{rsiValues[i].toFixed(1)}</span>
        </div>
      )}
      {showMacd && macdData && macdData.macd[i] != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: COLORS.macd }}>MACD</span>
          <span>{macdData.macd[i].toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Markets({ user, onUpgrade }) {
  const { apiFetch } = useAuth()
  const [mode,    setMode]    = useState('composite')      // composite | top_n | ticker
  const [topN,    setTopN]    = useState(50)
  const [ticker,  setTicker]  = useState('AAPL')
  const [range,   setRange]   = useState('1Y')
  const [spyOn,   setSpyOn]   = useState(true)
  const [qqqOn,   setQqqOn]   = useState(false)
  const [rsiOn,   setRsiOn]   = useState(false)
  const [macdOn,  setMacdOn]  = useState(false)
  const [bbOn,    setBbOn]    = useState(false)
  const [hoverIndex, setHoverIndex] = useState(null)

  const [primary,    setPrimary]    = useState(null)
  const [etfs,       setEtfs]       = useState(null)
  const [allTickers, setAllTickers] = useState([])
  const [error,      setError]      = useState(null)
  const [loading,    setLoading]    = useState(true)

  // Pro gate
  if (user && user.tier !== 'pro') {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: '40px 32px', textAlign: 'center', background: 'var(--bg-elev)', borderRadius: 12, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Markets is a Pro feature</div>
        <div style={{ color: 'var(--fg-faint)', marginBottom: 24, lineHeight: 1.6 }}>
          Track market-cap-weighted volume across the S&P 500, with overlays for SPY, QQQ, and standard
          technical indicators. Available on the Pro plan.
        </div>
        <button onClick={onUpgrade} style={{
          padding: '12px 24px', background: 'var(--gold, #d4a544)', color: 'var(--bg, #16140f)',
          border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14,
        }}>
          Upgrade to Pro
        </button>
      </div>
    )
  }

  // Compute date window
  const { startStr, endStr } = useMemo(() => {
    const today = new Date()
    const r = RANGES.find(x => x.id === range) || RANGES[3]
    const start = new Date(today.getTime() - r.days * 86400000)
    return {
      startStr: start.toISOString().slice(0, 10),
      endStr: today.toISOString().slice(0, 10),
    }
  }, [range])

  // Load ticker list once
  useEffect(() => {
    apiFetch('/api/markets/membership/current')
      .then(r => r.ok ? r.json() : { tickers: [] })
      .then(data => setAllTickers([...(data.tickers || []), 'SPY', 'QQQ'].sort()))
      .catch(() => setAllTickers(['SPY', 'QQQ']))
  }, [apiFetch])

  // Load primary series
  useEffect(() => {
    setLoading(true)
    setError(null)
    let url
    if (mode === 'composite') {
      url = `/api/markets/composite?start=${startStr}&end=${endStr}`
    } else if (mode === 'top_n') {
      url = `/api/markets/top-n?n=${topN}&start=${startStr}&end=${endStr}`
    } else {
      url = `/api/markets/ticker/${encodeURIComponent(ticker)}?start=${startStr}&end=${endStr}`
    }
    apiFetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setPrimary(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [mode, topN, ticker, startStr, endStr, apiFetch])

  // Load ETF overlay if needed
  useEffect(() => {
    if (!spyOn && !qqqOn) { setEtfs(null); return }
    apiFetch(`/api/markets/etfs?start=${startStr}&end=${endStr}`)
      .then(r => r.ok ? r.json() : null)
      .then(setEtfs)
      .catch(() => setEtfs(null))
  }, [spyOn, qqqOn, startStr, endStr, apiFetch])

  // Derive series
  const dates = primary?.dates || []
  const primaryValues = useMemo(() => {
    if (!primary) return []
    if (primary.kind === 'ticker') return primary.volume || []
    return primary.weighted_volume || []
  }, [primary])
  const primaryLabel = primary?.label || ''

  // Align ETF series to primary dates
  const alignedSpy = useMemo(() => {
    if (!etfs?.SPY || !dates.length) return null
    const map = new Map(etfs.SPY.dates.map((d, i) => [d, etfs.SPY.volume[i]]))
    return dates.map(d => map.get(d) ?? null)
  }, [etfs, dates])
  const alignedQqq = useMemo(() => {
    if (!etfs?.QQQ || !dates.length) return null
    const map = new Map(etfs.QQQ.dates.map((d, i) => [d, etfs.QQQ.volume[i]]))
    return dates.map(d => map.get(d) ?? null)
  }, [etfs, dates])

  // Indicators on primary series
  const rsiValues  = useMemo(() => rsiOn ? rsi(primaryValues) : null, [rsiOn, primaryValues])
  const macdData   = useMemo(() => macdOn ? macd(primaryValues) : null, [macdOn, primaryValues])
  const bbValues   = useMemo(() => bbOn ? bollinger(primaryValues) : null, [bbOn, primaryValues])

  // Layout: which panes are shown?
  const paneCount = 1 + (rsiOn ? 1 : 0) + (macdOn ? 1 : 0)
  const totalChartHeight = 520
  const subPaneHeight = 120
  const mainPaneHeight = totalChartHeight - (paneCount - 1) * subPaneHeight

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Markets</h1>
        {primary?.kind === 'composite' && primary.ticker_count?.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>
            {primary.ticker_count[primary.ticker_count.length - 1]} tickers ≈ 80% of S&P market cap
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginBottom: 20 }}>
        Market-cap-weighted volume across the S&P 500, with SPY/QQQ overlay and technical indicators.
      </div>

      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <FilterRow
          mode={mode} setMode={setMode}
          ticker={ticker} setTicker={setTicker}
          topN={topN} setTopN={setTopN}
          range={range} setRange={setRange}
          spyOn={spyOn} setSpyOn={setSpyOn}
          qqqOn={qqqOn} setQqqOn={setQqqOn}
          rsiOn={rsiOn} setRsiOn={setRsiOn}
          macdOn={macdOn} setMacdOn={setMacdOn}
          bbOn={bbOn} setBbOn={setBbOn}
          allTickers={allTickers}
        />
      </div>

      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, position: 'relative' }}>
        {loading && (
          <div style={{ height: totalChartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)' }}>
            Loading…
          </div>
        )}
        {error && !loading && (
          <div style={{ height: totalChartHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', textAlign: 'center', padding: '0 32px' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Could not load market data</div>
            <div style={{ fontSize: 11 }}>{error}</div>
            <div style={{ fontSize: 11, marginTop: 12 }}>
              If this is a fresh install, the 5-year backfill may not have run yet. See <code>scripts/backfill_markets.py</code>.
            </div>
          </div>
        )}
        {!loading && !error && dates.length === 0 && (
          <div style={{ height: totalChartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)' }}>
            No data in selected range.
          </div>
        )}
        {!loading && !error && dates.length > 0 && (
          <div style={{ position: 'relative' }}>
            <ParentSize>
              {({ width }) => (
                <>
                  <VolumePane
                    width={width} height={mainPaneHeight}
                    dates={dates} primary={primaryValues} primaryLabel={primaryLabel}
                    spyVolume={alignedSpy} qqqVolume={alignedQqq}
                    bbValues={bbValues} showBB={bbOn}
                    showSpy={spyOn && alignedSpy}
                    showQqq={qqqOn && alignedQqq}
                    hoverIndex={hoverIndex} setHoverIndex={setHoverIndex}
                  />
                  {rsiOn && (
                    <RsiPane
                      width={width} height={subPaneHeight}
                      dates={dates} values={rsiValues}
                      hoverIndex={hoverIndex} setHoverIndex={setHoverIndex}
                    />
                  )}
                  {macdOn && macdData && (
                    <MacdPane
                      width={width} height={subPaneHeight}
                      dates={dates} macdLine={macdData.macd} signalLine={macdData.signal} hist={macdData.hist}
                      hoverIndex={hoverIndex} setHoverIndex={setHoverIndex}
                    />
                  )}
                </>
              )}
            </ParentSize>
            <HoverLegend
              dates={dates} primary={primaryValues} primaryLabel={primaryLabel}
              spyVolume={alignedSpy} qqqVolume={alignedQqq}
              showSpy={spyOn && alignedSpy} showQqq={qqqOn && alignedQqq}
              hoverIndex={hoverIndex}
              rsiValues={rsiValues} macdData={macdData}
              showRsi={rsiOn} showMacd={macdOn}
            />
          </div>
        )}
      </div>
    </div>
  )
}
