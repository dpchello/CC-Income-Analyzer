import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { Eyebrow, ConvictionChip, Skeleton } from './ui/primitives.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY PRESETS — static in v1 per handoff spec
// TODO PIPE-REC-01: Move to GET /strategies endpoint so thresholds can be
//   tuned server-side without a frontend deploy.
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGIES = [
  // TODO PIPE-REC-10: "available" strategy — backend must use free_contracts as
  //   primary sort key (total $ income) and skip minIvr / minYield gates entirely.
  { id: 'available', label: 'My Available Shares',    hint: 'Everything you can write today', filt: { maxDelta: 0.40, minIvr: 0,  minYield: 0  } },
  { id: 'wheel',     label: 'Wheel starters',         hint: 'Low risk, 30-delta ceiling',     filt: { maxDelta: 0.32, minIvr: 20, minYield: 12 } },
  { id: 'income',    label: 'High-IV income',         hint: 'Aggressive yield, 40-delta',     filt: { maxDelta: 0.40, minIvr: 40, minYield: 22 } },
  { id: 'safe',      label: 'Low-delta conservative', hint: 'Capital preservation first',     filt: { maxDelta: 0.25, minIvr: 10, minYield: 8  } },
  { id: 'watch',     label: 'From my watchlist',      hint: 'Watchlist ideas only',           filt: { maxDelta: 0.40, minIvr: 15, minYield: 10 } },
  { id: 'custom',    label: 'Custom',                 hint: 'No filters applied',             filt: { maxDelta: 0.50, minIvr: 0,  minYield: 0  } },
]

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — stand-in until GET /recommendations + GET /portfolios (recs
//   shape) APIs ship. Remove once PIPE-REC-02 is done.
// TODO PIPE-REC-02: Build GET /recommendations?portfolio=&strategy=&conviction=
//   returning { meta, dots[], recs[] } per handoff data contract.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_META = { updatedAt: new Date().toISOString(), eligibleCount: 4 }

const MOCK_DOTS = [
  { id: 'd1', sym: 'AAPL', x: 1.8, y: 28, delta: 0.25, ivr: 45, eligible: true  },
  { id: 'd2', sym: 'MSFT', x: 1.2, y: 18, delta: 0.22, ivr: 32, eligible: true  },
  { id: 'd3', sym: 'NVDA', x: 3.1, y: 48, delta: 0.38, ivr: 72, eligible: true  },
  { id: 'd4', sym: 'TSLA', x: 4.2, y: 55, delta: 0.41, ivr: 88, eligible: false },
  { id: 'd5', sym: 'META', x: 2.0, y: 31, delta: 0.28, ivr: 51, eligible: true  },
  { id: 'd6', sym: 'AMZN', x: 0.9, y: 12, delta: 0.18, ivr: 22, eligible: false },
  { id: 'd7', sym: 'GOOGL',x: 1.4, y: 20, delta: 0.24, ivr: 38, eligible: true  },
  { id: 'd8', sym: 'JPM',  x: 0.7, y: 9,  delta: 0.16, ivr: 18, eligible: false },
  { id: 'd9', sym: 'AMD',  x: 2.6, y: 38, delta: 0.33, ivr: 60, eligible: true  },
  { id: 'd10',sym: 'INTC', x: 1.1, y: 14, delta: 0.20, ivr: 28, eligible: false },
]

// P.O.P. approximated as round((1 − delta) × 100).
// True value is N(−d₂) from Black-Scholes, slightly higher than (1 − delta)
// because d₂ < d₁ by σ√T. Backend will compute N(−d₂) once PIPE-REC-02 ships.
const MOCK_RECS = [
  {
    id: 'r1', sym: 'NVDA', conviction: 'High', score: 88,
    action: 'Sell 2× Jun 20 $900 Call',
    premium: 1240, annYield: 48, pop: 62, delta: 0.38,
    thesis: 'IV is near 52-week highs at 72%. The $900 strike sits 8% above the current price with 31 days until expiry — wide enough buffer to ride near-term chop while collecting premium near peak levels.',
    tags: ['HIGH IV', 'EARNINGS BUFFER', 'STRONG TREND'],
  },
  {
    id: 'r2', sym: 'META', conviction: 'High', score: 82,
    action: 'Sell 3× Jun 6 $540 Call',
    premium: 870, annYield: 31, pop: 72, delta: 0.28,
    thesis: "Post-earnings IV hasn't fully compressed. The $540 strike captures solid premium without aggressively capping upside. 23 days until expiry is in the ideal decay window.",
    tags: ['IV EXPANSION', '23 DTE', 'POST-EARNINGS'],
  },
  {
    id: 'r3', sym: 'AAPL', conviction: 'Med', score: 71,
    action: 'Sell 1× Jun 6 $200 Call',
    premium: 310, annYield: 28, pop: 75, delta: 0.25,
    thesis: 'Current IV is moderate at 45%. The $200 strike offers a solid premium-to-risk balance. WWDC in 3 weeks creates a natural catalyst — the call expires before the event.',
    tags: ['MODERATE IV', 'CATALYST BUFFER'],
  },
  {
    id: 'r4', sym: 'AMD', conviction: 'Med', score: 67,
    action: 'Sell 1× Jun 20 $180 Call',
    premium: 290, annYield: 38, pop: 67, delta: 0.33,
    thesis: 'IV is elevated relative to recent history. The $180 strike is near a resistance level. Moderate conviction — semiconductor sector rotations can spike unexpectedly.',
    tags: ['RESISTANCE LEVEL', 'SEMI SECTOR'],
  },
  {
    id: 'r5', sym: 'GOOGL', conviction: 'Low', score: 55,
    action: 'Sell 1× Jun 20 $175 Call',
    premium: 195, annYield: 20, pop: 76, delta: 0.24,
    thesis: 'Low current IV limits the income potential here. The $175 strike is conservative with a 76% probability of expiring worthless. Best suited for capital preservation, not income.',
    tags: ['LOW IV', 'CONSERVATIVE'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// SVG DOT PLOT constants
// ─────────────────────────────────────────────────────────────────────────────

const SVG_W = 1100
const SVG_H = 340
const PAD   = 44      // axis label padding
const PL = PAD        // plot left
const PR = SVG_W - PAD  // plot right
const PT = PAD        // plot top
const PB = SVG_H - PAD  // plot bottom
const IW  = PR - PL   // inner width  = 1012
const IH  = PB - PT   // inner height = 252

// Domain: X 0–5% premium, Y 0–60% annualized yield
function toSvgX(pct)   { return PL + (pct / 5)  * IW }
function toSvgY(yield_) { return PB - (yield_ / 60) * IH }

// ─────────────────────────────────────────────────────────────────────────────
// localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

function readPrefs() {
  try {
    const raw = localStorage.getItem('harvest.recs')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function writePrefs(p) {
  try { localStorage.setItem('harvest.recs', JSON.stringify(p)) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown — shared by Portfolio + Strategy
// items may include section separator objects: { type: 'section', label }
// Regular items: { id, label, sub?, hint? }
// ─────────────────────────────────────────────────────────────────────────────

function Dropdown({ label, trigger, items, open, onToggle, onSelect, selected, acid = false, minWidth }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onToggle(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: minWidth ?? (label === 'Portfolio' ? 280 : 280), flexShrink: 0 }}>
      <Eyebrow style={{ display: 'block', marginBottom: 6 }}>{label}</Eyebrow>
      <button
        onClick={() => onToggle(!open)}
        style={{
          width: '100%',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          background: acid ? 'var(--acid-faint)' : 'var(--bg-card)',
          border: acid ? '1px solid var(--acid-line)' : '1px solid var(--line-strong)',
          borderRadius: 'var(--r-2)',
          textAlign: 'left',
        }}
      >
        {acid && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--acid)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>▸</span>
        )}
        {!acid && <span className="h-dot" style={{ flexShrink: 0 }} />}
        {trigger}
        <ChevronDown size={12} style={{ color: acid ? 'var(--acid)' : 'var(--fg-mute)', marginLeft: 'auto', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 10,
          background: 'var(--bg-card)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--r-2)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {items.map((item, i) => {
            // Section separator
            if (item.type === 'section') {
              return (
                <div key={`sec-${i}`} style={{
                  padding: '10px 14px 4px',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-faint)',
                  borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                  marginTop: i > 0 ? 4 : 0,
                }}>
                  {item.label}
                </div>
              )
            }

            const active = item.id === selected
            return (
              <div
                key={item.id}
                onClick={() => { onSelect(item.id); onToggle(false) }}
                style={{
                  padding: '8px 14px',
                  cursor: 'pointer',
                  background: active ? 'var(--acid-faint)' : 'transparent',
                  borderBottom: '1px solid var(--line-soft)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--acid)' : 'var(--fg)' }}>{item.label}</div>
                {item.sub && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--fg-mute)', marginTop: 1 }}>{item.sub}</div>
                )}
                {item.hint && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--fg-mute)', marginTop: 1 }}>{item.hint}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Toolbar
// ─────────────────────────────────────────────────────────────────────────────

function Toolbar({ portfolios, strategyId, portfolioId, conviction, onStrategyChange, onPortfolioChange, onConvictionChange, meta, onRefresh, loading }) {
  const [pfOpen, setPfOpen]   = useState(false)
  const [strOpen, setStrOpen] = useState(false)

  const strategy  = STRATEGIES.find(s => s.id === strategyId) || STRATEGIES[0]
  const portfolio = portfolios.find(p => p.id === portfolioId) || portfolios[0] || { label: 'All portfolios', sub: '' }

  const CONVICTIONS = ['ALL', 'HIGH', 'MED', 'LOW']

  function handleStrOpen(v) {
    setStrOpen(v)
    if (v) setPfOpen(false)
  }
  function handlePfOpen(v) {
    setPfOpen(v)
    if (v) setStrOpen(false)
  }

  const updatedTime = meta?.updatedAt
    ? new Date(meta.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).replace(':00 ', ' ')
    : null

  return (
    <div style={{
      padding: '28px 32px 20px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--sans)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', margin: 0 }}>
          Recommendations
        </h2>
        {meta && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
            {updatedTime ? `Updated ${updatedTime} · ` : ''}
            {meta.eligibleCount} pass this strategy
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="h-btn ghost sm" onClick={onRefresh} disabled={loading} style={{ gap: 6 }}>
          <RefreshCw size={12} style={{ opacity: loading ? 0.4 : 1 }} />
          Refresh
        </button>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>

        {/* Portfolio dropdown */}
        {/* TODO PIPE-REC-03: GET /portfolios needs to return the synthetic "all" entry
            + one entry per connected brokerage account + watchlist.
            Currently transforms existing portfolios prop into the needed shape. */}
        <Dropdown
          label="Portfolio"
          selected={portfolioId}
          open={pfOpen}
          onToggle={handlePfOpen}
          onSelect={id => { onPortfolioChange(id) }}
          items={portfolios}
          trigger={
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{portfolio.label}</div>
              {portfolio.sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--fg-mute)' }}>{portfolio.sub}</div>}
            </div>
          }
        />

        {/* Strategy dropdown — acid styled */}
        {/* TODO PIPE-REC-04: "Custom" strategy needs a Tune drawer with three
            sliders (maxDelta, minIvr, minYield) — deferred to v2 per handoff. */}
        <Dropdown
          label="Strategy"
          selected={strategyId}
          open={strOpen}
          onToggle={handleStrOpen}
          onSelect={onStrategyChange}
          items={STRATEGIES}
          acid
          trigger={
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--acid)' }}>{strategy.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--acid)', opacity: 0.7 }}>{strategy.hint}</div>
            </div>
          }
        />

        {/* Conviction segmented control — client-side filter, no refetch */}
        <div>
          <Eyebrow style={{ display: 'block', marginBottom: 6 }}>Conviction</Eyebrow>
          <div style={{
            display: 'flex',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r-2)',
            background: 'var(--bg-card)',
            padding: 2,
          }}>
            {CONVICTIONS.map(c => {
              const active = conviction === c
              return (
                <button
                  key={c}
                  onClick={() => onConvictionChange(c)}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '5px 12px',
                    border: 'none',
                    borderRadius: 'var(--r-1)',
                    cursor: 'pointer',
                    background: active ? 'var(--fg)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--fg-dim)',
                    transition: 'background var(--ui), color var(--ui)',
                  }}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Dot plot
// ─────────────────────────────────────────────────────────────────────────────

function DotPlot({ dots, strategy, portfolioLabel, highlight, onHighlight, cardRefs }) {
  const strat   = STRATEGIES.find(s => s.id === strategy) || STRATEGIES[0]
  const minY    = strat.filt.minYield

  // Eligible zone: top of chart down to minYield threshold
  const zoneTop    = PT
  const zoneBottom = toSvgY(minY)
  const zoneHeight = zoneBottom - zoneTop

  // X ticks: 0, 1.25, 2.5, 3.75, 5
  const xTicks = [0, 1.25, 2.5, 3.75, 5]
  // Y ticks: 0, 15, 30, 45, 60
  const yTicks = [0, 15, 30, 45, 60]

  function handleDotClick(dot) {
    if (!dot.eligible) return
    const ref = cardRefs.current?.[dot.sym]
    if (!ref) return
    // Manual scroll — avoid scrollIntoView per handoff spec
    const container = document.getElementById('rec-cards-container')
    if (container) {
      const cardTop = ref.offsetTop - container.offsetTop
      container.scrollTo({ top: cardTop - 16, behavior: 'smooth' })
    }
  }

  if (!dots || dots.length === 0) {
    return (
      <div style={{
        padding: '24px 32px',
        background: 'var(--bg-elev)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 160,
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-mute)' }}>
          No holdings in this portfolio match the universe.
        </span>
      </div>
    )
  }

  return (
    <div style={{
      padding: '24px 32px',
      background: 'var(--bg-elev)',
      borderBottom: '1px solid var(--line)',
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Eyebrow style={{ display: 'block' }}>Ideas in {portfolioLabel}</Eyebrow>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-mute)', marginTop: 2, display: 'block' }}>
            Each dot is a ticker's best near-month {Math.round(strat.filt.maxDelta * 100)}-delta call.
            Solid = passes {strat.label}. Hover to select.
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Axis chips + legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="h-chip solid">X: Premium %</span>
          <span className="h-chip solid">Y: Ann. yield</span>
          <div style={{ width: 1, height: 16, background: 'var(--line-strong)', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={8} height={8}><circle cx={4} cy={4} r={4} fill="var(--acid)" /></svg>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)' }}>Eligible</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={8} height={8}><circle cx={4} cy={4} r={4} fill="transparent" stroke="var(--line-strong)" strokeWidth={1.5} /></svg>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)' }}>Below threshold</span>
          </div>
        </div>
      </div>

      {/* Chart card */}
      <div className="h-card" style={{ padding: '16px 20px', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="auto"
          style={{ display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={`Scatter plot of covered call opportunities. Top eligible: ${dots.filter(d => d.eligible).slice(0,3).map(d => d.sym).join(', ')}.`}
        >
          <title>{`Top eligible ideas: ${dots.filter(d => d.eligible).slice(0,3).map(d => d.sym).join(', ')}`}</title>

          {/* Eligible zone */}
          <rect
            x={PL} y={zoneTop}
            width={IW} height={zoneHeight}
            fill="var(--acid-faint)"
            opacity={0.6}
          />

          {/* Grid lines */}
          {xTicks.map(v => (
            <line
              key={`xg${v}`}
              x1={toSvgX(v)} y1={PT}
              x2={toSvgX(v)} y2={PB}
              stroke="var(--line-soft)"
              strokeWidth={1}
            />
          ))}
          {yTicks.map(v => (
            <line
              key={`yg${v}`}
              x1={PL} y1={toSvgY(v)}
              x2={PR} y2={toSvgY(v)}
              stroke="var(--line-soft)"
              strokeWidth={1}
            />
          ))}

          {/* Threshold dashed line */}
          <line
            x1={PL} y1={zoneBottom}
            x2={PR} y2={zoneBottom}
            stroke="var(--acid-line)"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
          <text
            x={PR - 4} y={zoneBottom - 5}
            fontFamily="var(--mono)"
            fontSize={10}
            fill="var(--acid)"
            letterSpacing="0.08em"
            textAnchor="end"
          >
            MIN YIELD · {minY}%
          </text>

          {/* X axis ticks + label */}
          {xTicks.map(v => (
            <text
              key={`xt${v}`}
              x={toSvgX(v)} y={PB + 14}
              fontFamily="var(--mono)" fontSize={10}
              fill="var(--fg-faint)"
              textAnchor="middle"
            >
              {v.toFixed(1)}%
            </text>
          ))}
          <text
            x={PL + IW / 2} y={SVG_H - 2}
            fontFamily="var(--mono)" fontSize={10}
            fill="var(--fg-mute)"
            textAnchor="middle"
            letterSpacing="0.10em"
          >
            PREMIUM (% OF PRICE)
          </text>

          {/* Y axis ticks + label */}
          {yTicks.map(v => (
            <text
              key={`yt${v}`}
              x={PL - 6} y={toSvgY(v) + 4}
              fontFamily="var(--mono)" fontSize={10}
              fill="var(--fg-faint)"
              textAnchor="end"
            >
              {v}%
            </text>
          ))}
          <text
            x={8} y={PT + IH / 2}
            fontFamily="var(--mono)" fontSize={10}
            fill="var(--fg-mute)"
            textAnchor="middle"
            letterSpacing="0.10em"
            transform={`rotate(-90, 8, ${PT + IH / 2})`}
          >
            ANNUALIZED YIELD
          </text>

          {/* Dots */}
          {dots.map(dot => {
            const cx = toSvgX(dot.x)
            const cy = toSvgY(dot.y)
            const isHl = highlight === dot.id
            const r = isHl ? 7 : dot.eligible ? 5.5 : 4

            return (
              <g
                key={dot.id}
                style={{ cursor: dot.eligible ? 'pointer' : 'default' }}
                onMouseEnter={() => onHighlight(dot.id)}
                onMouseLeave={() => onHighlight(null)}
                onClick={() => handleDotClick(dot)}
              >
                <circle
                  cx={cx} cy={cy} r={r}
                  fill={dot.eligible ? `rgba(47,82,51,${isHl ? 1 : 0.85})` : 'transparent'}
                  stroke={isHl ? 'var(--acid)' : dot.eligible ? 'none' : 'var(--fg-faint)'}
                  strokeWidth={isHl ? 2 : 1}
                />
                <text
                  x={cx + r + 3} y={cy + 4}
                  fontFamily="var(--mono)"
                  fontSize={isHl ? 12 : 10}
                  fontWeight={isHl ? 600 : 400}
                  fill={isHl ? 'var(--fg)' : dot.eligible ? 'var(--fg-dim)' : 'var(--fg-faint)'}
                >
                  {dot.sym}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Single recommendation card
// ─────────────────────────────────────────────────────────────────────────────

function RecCard({ rec, highlight, onHighlight, onNavigate, cardRef }) {
  const isHl = highlight === rec.sym || highlight === rec.id
  const isHoldSkip = rec.premium == null

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => onHighlight(rec.sym)}
      onMouseLeave={() => onHighlight(null)}
      style={{
        background: 'var(--bg-card)',
        border: isHl ? '1px solid var(--acid)' : '1px solid var(--line)',
        borderRadius: 'var(--r-2)',
        padding: 20,
        boxShadow: isHl ? '0 0 0 3px var(--acid-faint)' : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* 1. Meta row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--fg)', fontWeight: 600 }}>
          {rec.sym}
        </span>
        <ConvictionChip conviction={rec.conviction} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)' }}>
          score {rec.score}
        </span>
        <div style={{ flex: 1 }} />
        {!isHoldSkip && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--acid)' }}>
            +${rec.premium.toLocaleString()}
          </span>
        )}
      </div>

      {/* 2. Action string */}
      <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.005em', marginBottom: 8, color: 'var(--fg)', overflowWrap: 'break-word' }}>
        {rec.action}
      </div>

      {/* 3. Stat row
          P.O.P. = probability the option expires worthless (stock stays below
          strike at expiry). Calculated as N(−d₂) from Black-Scholes; shown as
          the chance you keep 100% of the premium. */}
      {!isHoldSkip && (
        <div style={{ display: 'flex', gap: 18, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-mute)', marginBottom: 10, flexWrap: 'wrap' }}>
          <span>Ann. yield <strong style={{ color: 'var(--fg)' }}>{rec.annYield}%</strong></span>
          <span title="Probability of Profit — chance the option expires worthless and you keep all the premium">
            P.O.P. <strong style={{ color: 'var(--fg)' }}>{rec.pop}%</strong>
          </span>
          <span>Δ <strong style={{ color: 'var(--fg)' }}>{rec.delta.toFixed(2)}</strong></span>
        </div>
      )}

      {/* 4. Thesis */}
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg-dim)', margin: 0 }}>
        {rec.thesis}
      </p>

      {/* 5. Footer */}
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {rec.tags.slice(0, 3).map(tag => (
          <span key={tag} className="h-chip">{tag}</span>
        ))}
        <div style={{ flex: 1 }} />
        {/* TODO PIPE-REC-05: "Details" should navigate to the position detail view.
            That deep-link route isn't wired — navigates to Portfolios for now. */}
        <button
          className="h-btn ghost sm"
          onClick={() => onNavigate?.('Portfolios')}
        >
          Details
        </button>
        {/* TODO PIPE-REC-06: "Trade →" should pre-fill the trade ticket with this
            ticker, strike, expiry, and contract count. No ticket flow exists yet.
            Navigates to Screener with the ticker as fallback. */}
        {!isHoldSkip && (
          <button
            className="h-btn primary sm"
            onClick={() => onNavigate?.('Screener', { ticker: rec.sym })}
          >
            Trade →
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Dot plot skeleton */}
      <div style={{ padding: '24px 32px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--line)', marginBottom: 0 }}>
        <Skeleton width={200} height={12} className="mb-3" />
        <div className="h-card" style={{ padding: '16px 20px' }}>
          <Skeleton width="100%" height={200} />
        </div>
      </div>

      {/* Cards skeleton */}
      <div style={{ padding: '28px 0 0' }}>
        <Skeleton width={160} height={12} className="mb-4" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(480px, 100%), 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <Skeleton width={60} height={18} />
                <Skeleton width={40} height={18} />
              </div>
              <Skeleton width="70%" height={14} className="mb-2" />
              <Skeleton width="90%" height={12} className="mb-1" />
              <Skeleton width="80%" height={12} className="mb-1" />
              <Skeleton width="60%" height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export default function Recommendations({ portfolios: rawPortfolios = [], holdings = [], positions = [], onNavigate }) {
  const { apiFetch } = useAuth()

  // ── Filter state (persisted in localStorage) ────────────────────────────────
  const prefs = readPrefs()
  const [portfolioId, setPortfolioId] = useState(prefs.portfolio || 'all')
  const [strategyId,  setStrategyId]  = useState(prefs.strategy  || 'available')
  const [conviction,  setConviction]  = useState(prefs.conviction || 'ALL')
  const [highlight,   setHighlight]   = useState(null) // dot.id or sym

  // ── Data state ───────────────────────────────────────────────────────────────
  const [meta,    setMeta]    = useState(null)
  const [dots,    setDots]    = useState([])
  const [recs,    setRecs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // ── Card refs for dot-click scroll ──────────────────────────────────────────
  const cardRefs = useRef({})

  // ── Build grouped portfolio list ─────────────────────────────────────────────
  // "All portfolios" = synthetic entry that passes portfolio_id=all to the API
  // (backend maps this to db.get_holdings(user_id, portfolio_id=None)).
  // Custom portfolios: no brokerage_name → "My Portfolios" section.
  // Brokerage portfolios: have brokerage_name → "Brokerages" section.
  // TODO PIPE-REC-07: Add Watchlist entry once Watchlist feature ships.
  const customPortfolios = rawPortfolios.filter(p => !p.brokerage_name)
  const brokeragePortfolios = rawPortfolios.filter(p => !!p.brokerage_name)

  const portfolioList = [
    { id: 'all', label: 'All portfolios', sub: `${rawPortfolios.length} portfolio${rawPortfolios.length !== 1 ? 's' : ''} · all holdings` },
    ...(customPortfolios.length > 0 ? [
      { type: 'section', label: 'My Portfolios' },
      ...customPortfolios.map(p => {
        const holdingCount = (holdings || []).filter(h => h.portfolio_id === p.id).length
        return { id: p.id, label: p.name || p.id, sub: `${holdingCount} holding${holdingCount !== 1 ? 's' : ''}` }
      }),
    ] : []),
    ...(brokeragePortfolios.length > 0 ? [
      { type: 'section', label: 'Brokerages' },
      ...brokeragePortfolios.map(p => {
        const holdingCount = (holdings || []).filter(h => h.portfolio_id === p.id).length
        return {
          id: p.id,
          label: p.name || p.id,
          sub: `${p.brokerage_name} · ${holdingCount} holding${holdingCount !== 1 ? 's' : ''}`,
        }
      }),
    ] : []),
  ]

  // ── Fetch recommendations ────────────────────────────────────────────────────
  const fetchRecs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // TODO PIPE-REC-02: Replace with real GET /recommendations endpoint.
      // For now, simulate a fetch delay and return mock data.
      const resp = await apiFetch(
        `/api/recommendations?portfolio=${portfolioId}&strategy=${strategyId}`
      ).catch(() => null)

      if (resp?.ok) {
        const data = await resp.json()
        setMeta(data.meta)
        setDots(data.dots)
        setRecs(data.recs)
      } else {
        // Endpoint doesn't exist yet — fall through to mock data
        throw new Error('endpoint_not_ready')
      }
    } catch {
      // Gracefully fall back to mock data so the UI is previewable
      setMeta(MOCK_META)
      setDots(MOCK_DOTS)
      setRecs(MOCK_RECS)
    } finally {
      setLoading(false)
    }
  }, [apiFetch, portfolioId, strategyId])

  useEffect(() => { fetchRecs() }, [fetchRecs])

  // ── Persist filter changes ───────────────────────────────────────────────────
  function handlePortfolioChange(id) {
    setPortfolioId(id)
    setHighlight(null) // reset highlight on portfolio change per spec
    writePrefs({ ...readPrefs(), portfolio: id })
  }
  function handleStrategyChange(id) {
    setStrategyId(id)
    writePrefs({ ...readPrefs(), strategy: id })
  }
  function handleConvictionChange(c) {
    setConviction(c)
    writePrefs({ ...readPrefs(), conviction: c })
  }

  // ── Client-side conviction filter ────────────────────────────────────────────
  const filteredRecs = conviction === 'ALL'
    ? recs
    : recs.filter(r => r.conviction?.toLowerCase() === conviction.toLowerCase())

  // ── Dot eligibility recompute when strategy changes ──────────────────────────
  // TODO PIPE-REC-02: Server should recompute eligibility per strategy.filt.
  // For now, client-side check against mock dots is fine.
  const strat = STRATEGIES.find(s => s.id === strategyId) || STRATEGIES[0]
  const recomputedDots = dots.map(d => ({
    ...d,
    eligible: d.delta <= strat.filt.maxDelta && d.ivr >= strat.filt.minIvr && d.y >= strat.filt.minYield,
  }))

  const portfolio = portfolioList.find(p => p.id === portfolioId) || portfolioList[0]

  return (
    <div style={{ margin: '-28px -32px', minHeight: '100%' }}>

      {/* Section 1 — Toolbar */}
      <Toolbar
        portfolios={portfolioList}
        portfolioId={portfolioId}
        strategyId={strategyId}
        conviction={conviction}
        meta={meta}
        loading={loading}
        onRefresh={fetchRecs}
        onPortfolioChange={handlePortfolioChange}
        onStrategyChange={handleStrategyChange}
        onConvictionChange={handleConvictionChange}
      />

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '10px 32px',
          background: 'var(--warn-faint)',
          borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--warn)' }}>
            Failed to load recommendations.
          </span>
          <button
            className="h-btn ghost sm"
            onClick={fetchRecs}
            style={{ color: 'var(--warn)', borderColor: 'transparent' }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Section 2 — Dot plot */}
          <DotPlot
            dots={recomputedDots}
            strategy={strategyId}
            portfolioLabel={portfolio.label}
            highlight={highlight}
            onHighlight={setHighlight}
            cardRefs={cardRefs}
          />

          {/* Section 3 — Ranked cards */}
          <div style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <Eyebrow>Ranked ideas · {filteredRecs.length}</Eyebrow>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)' }}>
                Sorted by score
                {/* TODO PIPE-REC-08: Wire this as a sort dropdown (Score / Yield / PoP / Premium $) */}
              </span>
            </div>

            {filteredRecs.length === 0 ? (
              <div style={{
                border: '1px dashed var(--line-strong)',
                borderRadius: 'var(--r-2)',
                background: 'var(--bg-elev)',
                padding: '32px 24px',
                textAlign: 'center',
              }}>
                <p style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg-mute)', margin: 0 }}>
                  No ideas match this portfolio + strategy. Try a looser preset.
                </p>
              </div>
            ) : (
              <div
                id="rec-cards-container"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(480px, 100%), 1fr))',
                  gap: 12,
                }}
              >
                {filteredRecs.map(rec => (
                  <RecCard
                    key={rec.id}
                    rec={rec}
                    highlight={highlight}
                    onHighlight={sym => setHighlight(sym)}
                    onNavigate={onNavigate}
                    cardRef={el => { cardRefs.current[rec.sym] = el }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
