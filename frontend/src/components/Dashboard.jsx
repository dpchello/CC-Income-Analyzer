import { useState, useEffect, useCallback } from 'react'
import { AreaClosed, LinePath } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisRight } from '@visx/axis'
import { LinearGradient } from '@visx/gradient'
import { curveMonotoneX } from '@visx/curve'
import { ParentSize } from '@visx/responsive'
import { useTooltip, TooltipWithBounds, defaultStyles as ttDefaults } from '@visx/tooltip'
import { ChevronRight } from 'lucide-react'
import { Eyebrow, Button } from './ui/primitives.jsx'
import { Term } from './Tooltip.jsx'
import { useAuth } from '../auth.jsx'
import { useIsMobile } from '../hooks/useMediaQuery.js'

// ── Urgency helpers ───────────────────────────────────────────────────────────

function getAction(pos) {
  const closeLossRatio = pos.loss_as_pct_of_premium != null ? pos.loss_as_pct_of_premium / 100 : 0
  const closingCostly  = closeLossRatio > 0.40

  if (pos.early_exercise_risk === 'CRITICAL' || pos.early_exercise_risk === 'HIGH') {
    const urgency = pos.early_exercise_risk === 'CRITICAL' ? 'URGENT' : 'HIGH'
    return { key: 'EARLY_EXERCISE', label: 'Shares May Be Called Early', urgency, closingCostly }
  }
  if (pos.dte <= 7) {
    return {
      key: 'GAMMA_DANGER',
      label: closingCostly ? 'Watch — Closing Expensive' : 'Expiring Soon',
      urgency: closingCostly ? 'HIGH' : 'URGENT',
      closingCostly,
    }
  }
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct > 0 && pos.distance_to_strike_pct <= 1.5) {
    return {
      key: 'BREACH_RISK',
      label: closingCostly ? 'Watch — Strike Nearby' : 'Strike Price at Risk',
      urgency: closingCostly ? 'HIGH' : 'URGENT',
      closingCostly,
    }
  }
  if (pos.delta != null && pos.delta > 0.35)
    return { key: 'CLOSE', label: 'High Assignment Risk', urgency: 'HIGH', closingCostly }
  return null
}

function fmt$(n) {
  if (n == null) return '—'
  return '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(n, decimals = 2) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%'
}

const RANGES = ['1M', '3M', 'YTD', '1Y', 'All']

// ── Equity header row ─────────────────────────────────────────────────────────

function EquityHeader({ holdings, positions, signalData }) {
  const isMobile = useIsMobile()
  const totalValue = holdings.reduce((s, h) => s + (h.market_value || 0), 0)
  const totalUnrealized = holdings.reduce((s, h) => s + (h.unrealized_pnl || 0), 0)
  const unrealizedPct = totalValue > 0 ? (totalUnrealized / (totalValue - totalUnrealized)) * 100 : 0

  // "Past 90 days" income = premiums from positions opened in that window
  const cutoff90 = new Date()
  cutoff90.setDate(cutoff90.getDate() - 90)
  const income90 = positions
    .filter(p => p.open_date && new Date(p.open_date) >= cutoff90)
    .reduce((s, p) => s + (p.premium_collected || 0), 0)

  // Opportunities = distinct tickers in holdings not currently fully covered
  const openByTicker = {}
  positions.filter(p => p.status === 'open').forEach(p => {
    openByTicker[p.ticker] = (openByTicker[p.ticker] || 0) + (p.contracts || 0) * 100
  })
  const eligible = holdings.filter(h => (openByTicker[h.ticker] || 0) < h.shares)
  const oppCount = eligible.length

  // Next expiry
  const openPos = positions.filter(p => p.status === 'open' && p.dte > 0)
  const nextExp = openPos.sort((a, b) => a.dte - b.dte)[0]

  const isUp = totalUnrealized >= 0

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr 1fr' : '1.4fr 1fr 1fr 1fr',
      gap: isMobile ? 16 : 24,
      padding: isMobile ? '20px 16px' : '28px 32px',
      borderBottom: '1px solid var(--line)',
    }}>
      {/* Big equity display — full-width on mobile so the hero number leads */}
      <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto' }}>
        <Eyebrow>Portfolio Value</Eyebrow>
        <div style={{
          fontFamily: 'var(--serif)',
          fontSize: isMobile ? 36 : 52,
          fontStyle: 'italic',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          marginTop: 6,
          color: 'var(--fg)',
        }}>
          {fmt$(totalValue)}
        </div>
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 8,
          fontFamily: 'var(--mono)',
          fontSize: 12,
        }}>
          <span style={{ color: isUp ? 'var(--acid)' : 'var(--down)' }}>
            {isUp ? '+' : '−'}{fmt$(Math.abs(totalUnrealized))} · {fmtPct(unrealizedPct)}
          </span>
          <span style={{ color: 'var(--fg-faint)' }}>unrealized</span>
        </div>
      </div>

      {/* Stat: past 90 days */}
      <StatCell
        label="Past 90 Days"
        value={fmt$(income90)}
        sub="premium collected"
      />

      {/* Stat: eligible opportunities */}
      <StatCell
        label="Eligible This Cycle"
        value={`${oppCount} position${oppCount !== 1 ? 's' : ''}`}
        sub={
          signalData?.regime === 'SELL PREMIUM' ? 'good time to open'
          : signalData?.regime === 'AVOID' ? 'regime says wait'
          : signalData?.regime ?? 'checking signals'
        }
        valueStyle={oppCount > 0 ? { color: 'var(--acid)' } : {}}
      />

      {/* Stat: next expiry */}
      <StatCell
        label="Next Expiry"
        value={nextExp ? `${nextExp.ticker} ${nextExp.expiry}` : '—'}
        sub={nextExp ? `${nextExp.dte} days` : 'no open calls'}
        valueStyle={nextExp && nextExp.dte <= 7 ? { color: 'var(--warn)', fontSize: 16 } : { fontSize: 16 }}
      />
    </div>
  )
}

function StatCell({ label, value, sub, valueStyle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <span style={{
        fontFamily: 'var(--sans)',
        fontWeight: 600,
        fontSize: 22,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        color: 'var(--fg)',
        marginTop: 4,
        ...valueStyle,
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

// ── Equity + income chart ─────────────────────────────────────────────────────

function EquityChart({ range, onRangeChange, apiFetch }) {
  const [data, setData] = useState(null)   // { dates, equity, income }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    apiFetch(`/api/equity-curve?range=${range}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [range, apiFetch])

  const points = data && data.dates.length > 0
    ? data.dates.map((date, i) => ({ date, equity: data.equity[i], income: data.income[i] }))
    : null

  return (
    <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Eyebrow>Portfolio equity</Eyebrow>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', letterSpacing: '0.06em' }}>
              <span style={{ width: 16, height: 1.5, background: 'var(--acid)', display: 'inline-block' }} />
              EQUITY
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', letterSpacing: '0.06em' }}>
              <span style={{ width: 16, height: 1.5, background: 'var(--olive)', display: 'inline-block', opacity: 0.7 }} />
              INCOME
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`h-chip${r === range ? ' active' : ''}`}
              style={{ cursor: 'pointer', height: 20, fontSize: 10, border: 'none', background: 'none', padding: '0 8px' }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 140, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              width: '100%', height: 1.5,
              background: 'var(--line-soft)',
              borderTop: '1px dashed var(--line)',
            }} />
          </div>
        )}
        {!loading && !points && (
          <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              No holdings data yet
            </span>
          </div>
        )}
        {!loading && points && (
          <ParentSize>
            {({ width, height }) => (
              <EquityChartInner points={points} width={width} height={height} />
            )}
          </ParentSize>
        )}
      </div>
    </div>
  )
}

function EquityChartInner({ points, width, height }) {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } = useTooltip()

  const M = { top: 8, right: 52, bottom: 22, left: 0 }
  const iW = Math.max(0, width - M.left - M.right)
  const iH = Math.max(0, height - M.top - M.bottom)

  const minE  = Math.min(...points.map(d => d.equity))
  const maxE  = Math.max(...points.map(d => d.equity), minE + 1)
  const pad   = (maxE - minE) * 0.12
  const maxInc = Math.max(...points.map(d => d.income), 1)

  const xScale = scaleLinear({ domain: [0, points.length - 1], range: [0, iW] })
  const yEq    = scaleLinear({ domain: [minE - pad, maxE + pad], range: [iH, 0] })
  const yInc   = scaleLinear({ domain: [0, maxInc * 1.25], range: [iH, 0] })

  const getX     = (_, i) => xScale(i)
  const getYEq   = d => yEq(d.equity)
  const getYInc  = d => yInc(d.income)

  // Sparse x-axis dates
  const step = Math.max(1, Math.floor(points.length / 5))
  const xLabels = points.filter((_, i) => i % step === 0 || i === points.length - 1)

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx   = e.clientX - rect.left - M.left
    const idx  = Math.round(xScale.invert(mx))
    const i    = Math.max(0, Math.min(idx, points.length - 1))
    const pt   = points[i]
    showTooltip({
      tooltipData: pt,
      tooltipLeft: xScale(i) + M.left,
      tooltipTop:  getYEq(pt) + M.top,
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <LinearGradient id="eqGrad" from="var(--acid)" fromOpacity={0.12} to="var(--acid)" toOpacity={0} vertical />
        <g transform={`translate(${M.left},${M.top})`}>
          {/* Subtle gridlines */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <line key={f}
              x1={0} x2={iW}
              y1={yEq(minE - pad + (maxE + pad - (minE - pad)) * f)}
              y2={yEq(minE - pad + (maxE + pad - (minE - pad)) * f)}
              stroke="var(--line-soft)" strokeWidth={1} />
          ))}

          {/* Equity area + line */}
          <AreaClosed
            data={points} x={getX} y={getYEq} yScale={yEq}
            curve={curveMonotoneX} fill="url(#eqGrad)" />
          <LinePath
            data={points} x={getX} y={getYEq}
            curve={curveMonotoneX}
            stroke="var(--acid)" strokeWidth={1.5} />

          {/* Income line (right axis scale) — dashed olive */}
          <LinePath
            data={points} x={getX} y={getYInc}
            curve={curveMonotoneX}
            stroke="var(--olive)" strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeOpacity={0.7} />

          {/* Right axis — income */}
          <AxisRight
            scale={yInc} left={iW}
            numTicks={4}
            stroke="transparent" tickStroke="transparent"
            tickLabelProps={() => ({
              fill: 'var(--fg-faint)',
              fontSize: 9,
              fontFamily: 'var(--mono)',
              textAnchor: 'start',
              dx: 4,
              letterSpacing: '0.04em',
            })}
            tickFormat={v => v === 0 ? '' : `$${(v / 1000).toFixed(0)}k`}
          />

          {/* X-axis date labels */}
          {xLabels.map((pt, i) => {
            const xi = points.indexOf(pt)
            return (
              <text key={i}
                x={xScale(xi)} y={iH + 16}
                textAnchor="middle"
                fill="var(--fg-faint)" fontSize={9} fontFamily="var(--mono)"
              >
                {fmtDate(pt.date)}
              </text>
            )
          })}

          {/* Invisible hover capture */}
          <rect width={iW} height={iH} fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={hideTooltip}
          />

          {/* Tooltip dots */}
          {tooltipOpen && tooltipData && (() => {
            const i = points.indexOf(tooltipData)
            return (
              <>
                <line x1={xScale(i)} x2={xScale(i)} y1={0} y2={iH}
                  stroke="var(--line)" strokeWidth={1} strokeDasharray="3 2" />
                <circle cx={xScale(i)} cy={getYEq(tooltipData)} r={3}
                  fill="var(--acid)" stroke="var(--bg-card)" strokeWidth={1.5} />
                {tooltipData.income > 0 && (
                  <circle cx={xScale(i)} cy={getYInc(tooltipData)} r={3}
                    fill="var(--olive)" stroke="var(--bg-card)" strokeWidth={1.5} />
                )}
              </>
            )
          })()}
        </g>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds top={tooltipTop} left={tooltipLeft + 12}
          style={{
            ...ttDefaults,
            background: 'var(--bg-card)',
            border: '1px solid var(--line-strong)',
            borderRadius: 2,
            fontSize: 12,
            color: 'var(--fg)',
            boxShadow: 'var(--shadow-card)',
            padding: '8px 10px',
            minWidth: 140,
          }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {fmtDate(tooltipData.date)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>Equity</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--acid)' }}>
                {fmt$(tooltipData.equity)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>Income (cumul.)</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: 'var(--olive)' }}>
                {fmt$(tooltipData.income)}
              </span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  )
}

function fmtDate(s) {
  const d = new Date(s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Open contracts strip ──────────────────────────────────────────────────────

function OpenContractsStrip({ positions, onNavigate }) {
  const open = positions.filter(p => p.status === 'open')
  if (!open.length) return null

  return (
    <div style={{
      padding: '12px 32px',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      overflowX: 'auto',
    }}>
      <Eyebrow style={{ flexShrink: 0, marginRight: 4 }}>Open</Eyebrow>
      {open.sort((a, b) => a.dte - b.dte).map(pos => {
        const action = getAction(pos)
        const urgent = action?.urgency === 'URGENT'
        const pnl    = pos.pnl ?? 0
        return (
          <div
            key={pos.id}
            onClick={() => onNavigate('Portfolios')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: '8px 12px',
              border: `1px solid ${urgent ? 'var(--warn)' : 'var(--line)'}`,
              borderRadius: 2,
              background: urgent ? 'var(--warn-faint)' : 'var(--bg-card)',
              cursor: 'pointer',
              flexShrink: 0,
              minWidth: 130,
              transition: 'background var(--ui)',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>
                {pos.ticker}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                color: pnl >= 0 ? 'var(--acid)' : 'var(--down)',
              }}>
                {pnl >= 0 ? '+' : ''}{fmt$(pnl)}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', letterSpacing: '0.04em' }}>
              ${pos.strike} · {pos.expiry}
            </div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10,
              color: pos.dte <= 7 ? 'var(--warn)' : 'var(--fg-faint)',
            }}>
              {pos.dte}d
              {action && <span style={{ marginLeft: 4, color: 'var(--warn)' }}>⚠</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Holdings table + CC drawer ────────────────────────────────────────────────

function HoldingsTable({ holdings, positions, onNavigate }) {
  const [openTicker, setOpenTicker] = useState(null)
  const isMobile = useIsMobile()

  // Index open CC positions by ticker
  const ccByTicker = {}
  positions.filter(p => p.status === 'open').forEach(p => {
    if (!ccByTicker[p.ticker]) ccByTicker[p.ticker] = []
    ccByTicker[p.ticker].push(p)
  })

  if (!holdings.length) {
    return (
      <div style={{
        padding: '48px 32px', textAlign: 'center',
        borderTop: '1px solid var(--line)',
      }}>
        <p style={{ fontSize: 14, color: 'var(--fg-mute)', marginBottom: 12 }}>
          No holdings added yet.
        </p>
        <Button variant="primary" size="sm" onClick={() => onNavigate('Portfolios')}>
          Add your first position →
        </Button>
      </div>
    )
  }

  return (
    <div>
     {/* On mobile the dense table scrolls horizontally inside its own track so the page never does */}
     <div className={isMobile ? 'h-scroll-x' : undefined}>
      <div style={{ minWidth: isMobile ? 720 : undefined }}>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr 80px 110px 100px 80px 90px 24px',
        padding: '10px 32px',
        gap: 12,
        background: 'var(--bg-elev)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}>
        {['Symbol', 'Name', 'Shares', 'Avg cost', 'Last', 'Unreal.', 'Open calls', ''].map((col, i) => (
          <span key={i} className="h-eyebrow" style={{ textAlign: i >= 2 && i <= 5 ? 'right' : 'left' }}>
            {col}
          </span>
        ))}
      </div>

      {/* Rows */}
      {holdings.map((h, i) => {
        const isOpen    = openTicker === h.ticker
        const openCalls = ccByTicker[h.ticker] || []
        const callValue = openCalls.reduce((s, p) => s + (p.premium_collected || 0), 0)
        const unrPct    = h.unrealized_pnl_pct ?? 0
        const unrPnl    = h.unrealized_pnl ?? 0
        const isUp      = unrPnl >= 0

        return (
          <div key={h.id ?? h.ticker}>
            {/* Main row */}
            <div
              onClick={() => setOpenTicker(isOpen ? null : h.ticker)}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 80px 110px 100px 80px 90px 24px',
                padding: '14px 32px',
                gap: 12,
                borderBottom: '1px solid var(--line-soft)',
                alignItems: 'center',
                cursor: 'pointer',
                background: isOpen ? 'var(--acid-faint)' : 'transparent',
                borderLeft: isOpen ? '2px solid var(--acid)' : '2px solid transparent',
                marginLeft: -2,
                transition: 'background var(--ui)',
                fontSize: 13,
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
                {h.ticker}
              </span>
              <span style={{ color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.name || h.ticker}
              </span>
              <span className="num" style={{ textAlign: 'right', color: 'var(--fg)' }}>
                {(h.shares || 0).toLocaleString()}
              </span>
              <span className="num" style={{ textAlign: 'right', color: 'var(--fg-dim)' }}>
                {h.avg_cost != null ? `$${h.avg_cost.toFixed(2)}` : '—'}
              </span>
              <span className="num" style={{ textAlign: 'right', color: 'var(--fg)' }}>
                {h.current_price != null ? `$${h.current_price.toFixed(2)}` : '—'}
              </span>
              <span className="num" style={{
                textAlign: 'right',
                color: isUp ? 'var(--acid)' : 'var(--down)',
              }}>
                {isUp ? '+' : ''}{unrPct.toFixed(1)}%
              </span>
              <span className="num" style={{
                textAlign: 'right',
                color: callValue > 0 ? 'var(--acid)' : 'var(--fg-faint)',
              }}>
                {callValue > 0 ? fmt$(callValue) : openCalls.length > 0 ? '—' : '—'}
              </span>
              <span style={{
                color: 'var(--fg-mute)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                transition: 'transform 0.15s',
                transform: isOpen ? 'rotate(90deg)' : 'none',
              }}>
                <ChevronRight size={14} strokeWidth={1.5} />
              </span>
            </div>

            {/* Expandable drawer */}
            {isOpen && (
              <CCDrawer
                ticker={h.ticker}
                holding={h}
                openCalls={openCalls}
                onNavigate={onNavigate}
              />
            )}
          </div>
        )
      })}
      </div>
     </div>

      {/* Footer */}
      <div style={{ padding: '14px 32px', borderTop: '1px solid var(--line)' }}>
        <Button variant="ghost" size="sm" onClick={() => onNavigate('Portfolios')}>
          Manage positions →
        </Button>
      </div>
    </div>
  )
}

// ── Covered call drawer ───────────────────────────────────────────────────────

function CCDrawer({ ticker, holding, openCalls, onNavigate }) {
  const isMobile = useIsMobile()
  return (
    <div style={{
      padding: isMobile ? '16px' : '20px 32px',
      background: 'var(--bg-elev)',
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.8fr', gap: isMobile ? 16 : 24 }}>

        {/* Left: position summary */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          borderRadius: 2,
          padding: 16,
        }}>
          <Eyebrow style={{ marginBottom: 12 }}>{ticker} · overview</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { k: 'Shares held',    v: (holding.shares || 0).toLocaleString() },
              { k: 'Avg cost',       v: holding.avg_cost != null ? `$${holding.avg_cost.toFixed(2)}` : '—' },
              { k: 'Current price',  v: holding.current_price != null ? `$${holding.current_price.toFixed(2)}` : '—' },
              { k: 'Unrealized P&L', v: holding.unrealized_pnl != null
                  ? `${holding.unrealized_pnl >= 0 ? '+' : ''}${fmt$(holding.unrealized_pnl)} (${holding.unrealized_pnl_pct?.toFixed(1)}%)`
                  : '—', accent: (holding.unrealized_pnl ?? 0) >= 0 },
              { k: 'Coverable lots', v: Math.floor((holding.shares || 0) / 100).toString() },
            ].map(row => (
              <div key={row.k} style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
                paddingBottom: 6,
                borderBottom: '1px solid var(--line-soft)',
              }}>
                <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {row.k}
                </span>
                <span className="num" style={{ color: row.accent ? 'var(--acid)' : 'var(--fg)', fontSize: 12 }}>
                  {row.v}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Button size="sm" variant="primary" onClick={() => onNavigate('Screener')}>
              Find calls →
            </Button>
          </div>
        </div>

        {/* Right: open CC positions or prompt */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <Eyebrow>
              {openCalls.length > 0
                ? `${openCalls.length} open call${openCalls.length > 1 ? 's' : ''}`
                : 'No open calls'}
            </Eyebrow>
          </div>

          {openCalls.length === 0 ? (
            <div style={{
              padding: '24px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--line)',
              borderRadius: 2,
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 12 }}>
                You own {(holding.shares || 0).toLocaleString()} shares of {ticker} with no covered calls written.
              </p>
              <Button size="sm" variant="primary" onClick={() => onNavigate('Screener')}>
                Find a call to write →
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openCalls.map(pos => <OpenCallCard key={pos.id} pos={pos} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OpenCallCard({ pos }) {
  const isMobile = useIsMobile()
  const action  = getAction(pos)
  const pnl     = pos.pnl ?? 0
  const urgent  = action?.urgency === 'URGENT'
  const high    = action?.urgency === 'HIGH'

  const borderColor = urgent ? 'var(--warn)'
    : high ? 'rgba(184,80,46,0.40)'
    : 'var(--line)'

  const capturePct = Math.max(0, Math.min(100, pos.profit_capture_pct || 0))

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${borderColor}`,
      borderLeft: `2px solid ${urgent ? 'var(--warn)' : high ? 'var(--warn)' : 'var(--acid)'}`,
      borderRadius: 2,
      padding: '14px 16px',
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : '1.6fr 1fr 1fr 1fr 1fr',
      gap: isMobile ? 12 : 16,
      alignItems: 'center',
    }}>
      {/* Info */}
      <div style={{ gridColumn: isMobile ? '1 / -1' : 'auto' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg)', marginBottom: 4 }}>
          ${pos.strike} Call · {pos.expiry}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: pos.dte <= 7 ? 'var(--warn)' : 'var(--fg-mute)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {pos.dte}d to expiry
          </span>
          {action && (
            <span className="h-chip warn" style={{ height: 18, fontSize: 10 }}>
              {action.label}
            </span>
          )}
        </div>
        {/* Capture progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--line)', borderRadius: 2 }}>
            <div style={{
              width: `${capturePct}%`, height: '100%',
              background: 'var(--acid)', borderRadius: 2,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)' }}>
            {capturePct.toFixed(0)}%
          </span>
        </div>
      </div>

      <MiniStat label="Premium" value={fmt$(pos.premium_collected)} accent />
      <MiniStat label="P&L"
        value={`${pnl >= 0 ? '+' : ''}${fmt$(pnl)}`}
        accent={pnl >= 0}
        down={pnl < 0}
      />
      <MiniStat label="Contracts" value={String(pos.contracts || 1)} />
      <MiniStat label="Delta"
        value={pos.delta != null ? pos.delta.toFixed(2) : '—'}
        warn={pos.delta != null && pos.delta > 0.35}
      />
    </div>
  )
}

function MiniStat({ label, value, accent, down, warn }) {
  return (
    <div>
      <Eyebrow style={{ marginBottom: 4 }}>{label}</Eyebrow>
      <span className="num" style={{
        fontSize: 16,
        color: accent ? 'var(--acid)' : down ? 'var(--down)' : warn ? 'var(--warn)' : 'var(--fg)',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </span>
    </div>
  )
}

// ── Status banner ─────────────────────────────────────────────────────────────

function StatusBanner({ positions, signalData }) {
  const open = positions.filter(p => p.status === 'open')
  const urgent = open.filter(p => {
    const a = getAction(p)
    return a?.urgency === 'URGENT'
  })
  const high = open.filter(p => {
    const a = getAction(p)
    return a?.urgency === 'HIGH'
  })

  const regime = signalData?.regime
  const regimelabel = {
    'SELL PREMIUM': '● Good time to open',
    'HOLD': '◎ Hold new positions',
    'CAUTION': '◐ Use caution',
    'AVOID': '○ Avoid new positions',
  }[regime] ?? (regime || 'Checking signals…')

  const regimeColor = regime === 'SELL PREMIUM' ? 'var(--acid)'
    : regime === 'HOLD' ? 'var(--fg-mute)'
    : regime === 'CAUTION' ? 'var(--warn)'
    : regime === 'AVOID' ? 'var(--down)'
    : 'var(--fg-faint)'

  const needsAttention = urgent.length + high.length

  return (
    <div style={{
      padding: '10px 32px',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      background: needsAttention > 0 ? 'var(--warn-faint)' : 'transparent',
    }}>
      {needsAttention === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--acid)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
          ✓ All positions on track
        </span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--warn)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
          ⚠ {needsAttention} position{needsAttention > 1 ? 's' : ''} need attention
        </span>
      )}
      <span style={{ color: 'var(--line-strong)' }}>·</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-mute)', letterSpacing: '0.04em' }}>
        Market regime:{' '}
        <span style={{ color: regimeColor }}>{regimelabel}</span>
        {signalData?.total_score != null && (
          <span style={{ color: 'var(--fg-faint)' }}>
            {' '}({signalData.total_score}/{signalData.max_score ?? 14} signals)
          </span>
        )}
      </span>
    </div>
  )
}

// ── P&L summary bar ───────────────────────────────────────────────────────────

function PnlBar({ pnlData }) {
  const isMobile = useIsMobile()
  if (!pnlData) return null
  const { total_realized, total_unrealized, estimated_tax_this_year, win_rate, closed_positions } = pnlData

  const cells = [
    { label: 'Realized P&L',        value: `${total_realized >= 0 ? '+' : ''}${fmt$(total_realized)}`,       color: total_realized >= 0 ? 'var(--acid)' : 'var(--down)' },
    { label: 'Unrealized P&L',      value: `${total_unrealized >= 0 ? '+' : ''}${fmt$(total_unrealized)}`,   color: total_unrealized >= 0 ? 'var(--acid)' : 'var(--down)' },
    { label: 'Est. tax this year',  value: fmt$(estimated_tax_this_year),                                     color: 'var(--warn)' },
    { label: 'Win rate',            value: closed_positions > 0 ? `${win_rate}%` : '—',                      color: win_rate >= 70 ? 'var(--acid)' : win_rate >= 50 ? 'var(--fg-dim)' : 'var(--down)' },
  ]

  return (
    <div style={{
      margin: '0 32px 32px',
      border: '1px solid var(--line)',
      borderRadius: 2,
      background: 'var(--bg-card)',
    }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
        <Eyebrow>Banked Income &amp; Tax</Eyebrow>
        <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--mono)' }}>
          Based on {closed_positions} closed position{closed_positions !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? (cells.length <= 2 ? `repeat(${cells.length}, 1fr)` : 'repeat(2, 1fr)') : `repeat(${cells.length}, 1fr)` }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{
            padding: '18px 20px',
            borderRight: i < cells.length - 1 ? '1px solid var(--line)' : 'none',
          }}>
            <Eyebrow style={{ marginBottom: 6 }}>{c.label}</Eyebrow>
            <div className="num" style={{ fontSize: 22, color: c.color, letterSpacing: '-0.02em' }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({
  dashData: _dashData,
  signalData,
  positions,
  holdings,
  alphaData: _alphaData,
  pnlData,
  onNavigate,
}) {
  const { apiFetch } = useAuth()
  const isMobile = useIsMobile()
  const [chartRange, setChartRange] = useState('3M')

  // Bleed past <main>'s padding so section dividers run edge-to-edge. The offset
  // MUST match main's padding (App.jsx): 16px on mobile, 28/32px on desktop —
  // otherwise the negative margin overflows the viewport on mobile.
  return (
    <div style={{ margin: isMobile ? '-16px -16px' : '-28px -32px', display: 'flex', flexDirection: 'column' }}>

      {/* Equity header */}
      <EquityHeader
        holdings={holdings}
        positions={positions}
        signalData={signalData}
      />

      {/* Equity + income chart */}
      <EquityChart
        range={chartRange}
        onRangeChange={setChartRange}
        apiFetch={apiFetch}
      />

      {/* Status banner */}
      <StatusBanner positions={positions} signalData={signalData} />

      {/* Open contracts strip */}
      <OpenContractsStrip positions={positions} onNavigate={onNavigate} />

      {/* Holdings table with CC drawer */}
      <div style={{ padding: '20px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 32px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <Eyebrow>Holdings</Eyebrow>
            <span style={{ fontSize: 12, color: 'var(--fg-mute)', fontFamily: 'var(--mono)' }}>
              {holdings.length} position{holdings.length !== 1 ? 's' : ''} · click a row for covered call status
            </span>
          </div>
          <Button size="sm" onClick={() => onNavigate('Portfolios')}>
            Manage →
          </Button>
        </div>
        <HoldingsTable
          holdings={holdings}
          positions={positions}
          onNavigate={onNavigate}
        />
      </div>

      {/* P&L summary */}
      {pnlData && <PnlBar pnlData={pnlData} />}
    </div>
  )
}
