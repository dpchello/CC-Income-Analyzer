// PIPE-REC-09 — historical strategy performance panel.
//
// Renders a collapsible block below the ranked recommendations. When
// expanded, shows dual-track results (unconditional vs regime-gated) with
// engine-edge callout and a monthly outcome bar chart.
//
// Accepts `strategyId` and `ticker` props, fetches GET /api/backtest, caches
// per (strategyId, ticker) in component state. The endpoint itself caches
// 24h server-side, so re-opens are cheap.

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth.jsx'
import { Eyebrow, Skeleton } from './ui/primitives.jsx'

const LOOKBACK_DAYS = 1825 // 5y — enough samples for conservative strategies

const fmtPct = (x) => x == null ? '—' : `${(x * 100).toFixed(1)}%`
const fmtYield = (x) => x == null ? '—' : `${x.toFixed(1)}%`
const fmtPnl = (x) => x == null ? '—' : `$${x.toFixed(0)}`

// ── Stat cell ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 16px',
      background: 'var(--surface-2, rgba(255,255,255,0.02))',
      border: '1px solid var(--line)',
      borderRadius: 8,
      minWidth: 120,
    }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{
        fontSize: 22, fontWeight: 600, lineHeight: 1.1,
        color: accent ? 'var(--acid)' : 'var(--fg)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{sub}</div>}
    </div>
  )
}

// ── Monthly outcome bar chart ─────────────────────────────────────────────────
//
// Each month is a stacked bar — green=max_profit, amber=near_miss, red=assignment.
// Uses inline SVG (no chart lib dependency) to stay light.

function MonthlyChart({ monthlyOutcomes }) {
  if (!monthlyOutcomes || monthlyOutcomes.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--fg-mute)', fontSize: 13 }}>
        No monthly data — strategy filters excluded all entries in this window.
      </div>
    )
  }
  const W = 720
  const H = 140
  const PAD_L = 36
  const PAD_R = 8
  const PAD_T = 8
  const PAD_B = 24
  const inner = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = monthlyOutcomes.length
  const barW = Math.max(2, (inner / n) - 2)
  const maxN = Math.max(...monthlyOutcomes.map(m => m.max_profit + (m.closed_early_50pct || 0) + m.assignment), 1)

  // Y-axis ticks
  const ticks = [0, Math.ceil(maxN / 2), maxN]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Y axis */}
      {ticks.map(t => (
        <g key={t}>
          <line
            x1={PAD_L} y1={PAD_T + innerH - (t / maxN) * innerH}
            x2={W - PAD_R} y2={PAD_T + innerH - (t / maxN) * innerH}
            stroke="var(--line)" strokeDasharray="2 4"
          />
          <text
            x={PAD_L - 4} y={PAD_T + innerH - (t / maxN) * innerH + 3}
            fontSize="10" fill="var(--fg-mute)" textAnchor="end"
            fontFamily="var(--font-mono, monospace)"
          >
            {t}
          </text>
        </g>
      ))}
      {/* Bars */}
      {monthlyOutcomes.map((m, i) => {
        const ce = m.closed_early_50pct || 0
        const total = m.max_profit + ce + m.assignment
        if (total === 0) return null
        const x = PAD_L + i * (inner / n)
        const total_h = (total / maxN) * innerH
        const mp_h = (m.max_profit / total) * total_h
        const ce_h = (ce / total) * total_h
        const as_h = (m.assignment / total) * total_h
        const y = PAD_T + innerH - total_h
        return (
          <g key={m.month}>
            {m.max_profit > 0 && (
              <rect x={x} y={y} width={barW} height={mp_h} fill="var(--acid, #c9d65a)" />
            )}
            {ce > 0 && (
              <rect x={x} y={y + mp_h} width={barW} height={ce_h} fill="#d4a056" />
            )}
            {m.assignment > 0 && (
              <rect x={x} y={y + mp_h + ce_h} width={barW} height={as_h} fill="#b94a4a" />
            )}
            <title>{`${m.month}: ${m.max_profit} expired worthless, ${ce} closed early at 50%, ${m.assignment} assigned`}</title>
          </g>
        )
      })}
      {/* X-axis labels: first, middle, last only (avoid clutter) */}
      {[0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
        <text
          key={i}
          x={PAD_L + i * (inner / n) + barW / 2}
          y={H - 8}
          fontSize="10" fill="var(--fg-mute)" textAnchor="middle"
        >
          {monthlyOutcomes[i].month}
        </text>
      ))}
    </svg>
  )
}

// ── Track stats — one row per cadence ─────────────────────────────────────────

// Format dollar amount with proper sign and commas
function fmtDollar(x) {
  if (x == null) return '—'
  const sign = x < 0 ? '−' : ''
  return `${sign}$${Math.abs(Math.round(x)).toLocaleString()}`
}

function TrackStats({ label, data, accent = false }) {
  const empty = !data || data.trades_simulated === 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Eyebrow style={{ color: accent ? 'var(--acid)' : 'var(--fg-mute)' }}>{label}</Eyebrow>
        {data && data.trades_simulated > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-mute)' }}>
            {data.trades_simulated} trade{data.trades_simulated === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {empty ? (
        <div style={{ fontSize: 13, color: 'var(--fg-mute)', padding: '8px 0' }}>
          No qualifying trades in this window — the strategy's filters excluded every entry.
        </div>
      ) : (
        <>
          {/* Headline: alpha + portfolio dollars */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat
              label="Alpha vs buy-and-hold"
              value={fmtDollar(data.alpha_dollar)}
              sub="strategy P&L − B&H P&L"
              accent={accent}
            />
            <Stat
              label="Strategy P&L (100 sh)"
              value={fmtDollar(data.total_profit_100sh)}
            />
            <Stat
              label="Buy-and-hold P&L (100 sh)"
              value={fmtDollar(data.buy_and_hold_total_profit)}
            />
          </div>
          {/* Outcome breakdown — 5 buckets with rolling enabled */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat
              label="Expired worthless"
              value={`${data.max_profit_count ?? 0} (${fmtPct(data.max_profit_rate)})`}
              accent={accent}
            />
            <Stat
              label="Closed early at 50%"
              value={`${data.closed_early_count ?? 0} (${fmtPct(data.closed_early_rate)})`}
            />
            <Stat
              label="Rolled up-and-out"
              value={`${data.rolled_up_count ?? 0} (${fmtPct(data.rolled_up_rate)})`}
            />
            <Stat
              label="Rolled at 21 DTE"
              value={`${data.rolled_21dte_count ?? 0} (${fmtPct(data.rolled_21dte_rate)})`}
            />
            <Stat
              label="Assigned"
              value={`${data.assignment_count ?? 0} (${fmtPct(data.assignment_rate)})`}
            />
            <Stat label="Avg ann yield" value={fmtYield(data.avg_ann_yield)} />
            <Stat label="Sharpe" value={data.sharpe_ratio?.toFixed(2) ?? '—'} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StrategyPerformance({ strategyId, ticker = 'SPY', shareCount = 100 }) {
  const { apiFetch } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Cadence toggle — default to regime_gated per product decision 2026-04-25.
  // Regime-gated reflects "what Harvest would have actually recommended."
  const [activeCadence, setActiveCadence] = useState('regime_gated')

  const fetchData = useCallback(async () => {
    if (!strategyId) return
    setLoading(true)
    setError(null)
    try {
      const url = `/api/backtest?strategy=${encodeURIComponent(strategyId)}` +
                  `&ticker=${encodeURIComponent(ticker)}` +
                  `&lookback=${LOOKBACK_DAYS}&cadence=both` +
                  `&share_count=${encodeURIComponent(shareCount)}`
      const resp = await apiFetch(url)
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        if (resp.status === 402) {
          setError({ type: 'pro', message: 'Strategy backtests are a Pro feature.' })
        } else if (resp.status === 422) {
          setError({ type: 'coverage', message: body.detail || 'No historical coverage for this ticker.' })
        } else {
          setError({ type: 'generic', message: body.detail || `Request failed (${resp.status})` })
        }
        setData(null)
      } else {
        const json = await resp.json()
        setData(json)
      }
    } catch (e) {
      setError({ type: 'network', message: e.message || 'Network error' })
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [apiFetch, strategyId, ticker])

  // Auto-fetch on first open
  useEffect(() => {
    if (open && !data && !loading && !error) {
      fetchData()
    }
  }, [open, data, loading, error, fetchData])

  // Reset when strategy / ticker / shareCount changes
  useEffect(() => {
    setData(null)
    setError(null)
    setOpen(false)
  }, [strategyId, ticker, shareCount])

  // ── Collapsed header + stats teaser (uses active cadence) ─────────────────

  const teaser = (() => {
    if (!data) return null
    const headline = data[activeCadence]
    // Fall back to the other cadence if the active one is empty (e.g.
    // regime_gated has 0 trades for INCOME on SPY)
    const fallback = activeCadence === 'regime_gated' ? data.unconditional : data.regime_gated
    const useData = (headline && headline.trades_simulated > 0) ? headline : fallback
    if (!useData || useData.trades_simulated === 0) return null
    return `${useData.trades_simulated} simulated trades · ${fmtPct(useData.max_profit_rate)} max profit · ${fmtYield(useData.avg_ann_yield)} avg yield`
  })()

  return (
    <div style={{
      marginTop: 24,
      borderRadius: 10,
      border: '1px solid var(--line)',
      overflow: 'hidden',
      background: 'var(--surface, rgba(255,255,255,0.01))',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          color: 'var(--fg)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            See how this strategy has performed historically
          </div>
          {teaser && (
            <div style={{ fontSize: 12, color: 'var(--fg-mute)' }}>
              {teaser}
            </div>
          )}
        </div>
        <ChevronDown
          size={18}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
            color: 'var(--fg-mute)',
          }}
        />
      </button>

      {open && (
        <div style={{
          padding: '0 18px 20px',
          borderTop: '1px solid var(--line)',
          paddingTop: 16,
        }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton style={{ height: 18, width: '40%' }} />
              <Skeleton style={{ height: 60 }} />
              <Skeleton style={{ height: 140 }} />
            </div>
          )}

          {error && error.type === 'pro' && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-mute)' }}>
              <div style={{ marginBottom: 6, color: 'var(--fg)', fontWeight: 500 }}>
                Pro feature
              </div>
              Historical performance backtesting is part of the Pro tier.
            </div>
          )}

          {error && error.type === 'coverage' && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-mute)' }}>
              <div style={{ marginBottom: 6, color: 'var(--fg)', fontWeight: 500 }}>
                No historical coverage for {ticker}
              </div>
              Backtests currently run on SPY, QQQ, and IWM. Multi-ticker support is coming.
            </div>
          )}

          {error && (error.type === 'generic' || error.type === 'network') && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-mute)' }}>
              <div style={{ marginBottom: 6, color: 'var(--fg)', fontWeight: 500 }}>
                Couldn't load backtest
              </div>
              {error.message}
              <button
                onClick={fetchData}
                style={{
                  marginTop: 10, padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  color: 'var(--fg)',
                  borderRadius: 6, cursor: 'pointer',
                  fontSize: 12,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div style={{
                fontSize: 12, color: 'var(--fg-mute)', marginBottom: 14,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {data.ticker} · {data.lookback_days}-day lookback ({data.data_window?.start} → {data.data_window?.end}) ·
                {' '}{data.entry_dates_evaluated} entry dates evaluated
              </div>

              {/* Cadence toggle */}
              <div style={{
                display: 'inline-flex',
                marginBottom: 16,
                border: '1px solid var(--line)',
                borderRadius: 8,
                overflow: 'hidden',
              }}>
                {[
                  { key: 'regime_gated', label: "With Harvest's signal engine" },
                  { key: 'unconditional', label: 'Strategy alone' },
                ].map(opt => {
                  const active = activeCadence === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setActiveCadence(opt.key)}
                      style={{
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'var(--bg)' : 'var(--fg-mute)',
                        background: active ? 'var(--acid)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* Active cadence stats */}
              <TrackStats
                label={activeCadence === 'regime_gated'
                  ? "With Harvest's signal engine (regime-gated)"
                  : 'Strategy alone, no timing filter'}
                data={data[activeCadence]}
                accent={activeCadence === 'regime_gated'}
              />

              {/* Engine edge — clearly labeled as cadence-vs-cadence delta, NOT alpha */}
              {data.engine_edge && (
                <div style={{
                  marginTop: 16, padding: '10px 14px',
                  border: '1px solid var(--acid-line, rgba(201, 214, 90, 0.3))',
                  background: 'var(--acid-faint, rgba(201, 214, 90, 0.06))',
                  borderRadius: 8,
                  fontSize: 13, color: 'var(--fg)',
                }}>
                  <strong>Engine edge</strong>
                  <span style={{ color: 'var(--fg-mute)', marginLeft: 6, fontSize: 11 }}>
                    regime-gated minus unconditional · this is the engine's lift, not absolute alpha
                  </span>
                  <div style={{ marginTop: 6, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {data.engine_edge.alpha_lift_dollar != null && (
                      <span>
                        Alpha lift:{' '}
                        <strong>
                          {fmtDollar(data.engine_edge.alpha_lift_dollar)}
                        </strong>
                      </span>
                    )}
                    {data.engine_edge.sharpe_delta != null && (
                      <span>
                        Sharpe lift:{' '}
                        <strong>
                          {data.engine_edge.sharpe_delta >= 0 ? '+' : ''}
                          {data.engine_edge.sharpe_delta.toFixed(2)}
                        </strong>
                      </span>
                    )}
                    <span>
                      Max profit rate:{' '}
                      <strong>
                        {data.engine_edge.max_profit_rate_delta >= 0 ? '+' : ''}
                        {(data.engine_edge.max_profit_rate_delta * 100).toFixed(1)} pts
                      </strong>
                    </span>
                    <span>
                      Trade count:{' '}
                      <strong>
                        {data.engine_edge.trade_count_regime_gated} vs {data.engine_edge.trade_count_unconditional}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {data.unconditional?.monthly_outcomes?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <Eyebrow style={{ marginBottom: 8 }}>
                    Monthly outcomes (unconditional cadence)
                  </Eyebrow>
                  <MonthlyChart monthlyOutcomes={data.unconditional.monthly_outcomes} />
                  <div style={{
                    display: 'flex', gap: 14, marginTop: 6,
                    fontSize: 11, color: 'var(--fg-mute)',
                  }}>
                    <span>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10,
                        background: 'var(--acid)', marginRight: 4, verticalAlign: 'middle',
                      }} />
                      Expired worthless
                    </span>
                    <span>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10,
                        background: '#d4a056', marginRight: 4, verticalAlign: 'middle',
                      }} />
                      Closed early at 50%
                    </span>
                    <span>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10,
                        background: '#b94a4a', marginRight: 4, verticalAlign: 'middle',
                      }} />
                      Assigned
                    </span>
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 18, padding: '10px 12px',
                fontSize: 11, color: 'var(--fg-mute)',
                background: 'var(--surface-2, rgba(255,255,255,0.02))',
                border: '1px solid var(--line)',
                borderRadius: 6,
                lineHeight: 1.5,
              }}>
                Estimated using real historical option chains (bid/ask/IV from{' '}
                {data.data_source === 'duckdb' ? 'institutional EOD data' : 'realized vol approximation'}).
                Yields use mid-price fills, which are typically a half-spread better than
                actual broker fills (real yields run 1-3% lower per trade due to slippage).
                Assignment is not a loss — it means your shares sold at the price you
                agreed to. Past simulation results do not predict future performance.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
