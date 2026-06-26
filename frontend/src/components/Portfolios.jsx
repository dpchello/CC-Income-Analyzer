import { useState, useEffect, Fragment } from 'react'
import AddPosition from './AddPosition.jsx'
import AddHolding from './AddHolding.jsx'
import { Term } from './Tooltip.jsx'
import PositionLimitBanner from './PositionLimitBanner.jsx'
import { useAuth } from '../auth.jsx'
import ConnectBrokerage from './ConnectBrokerage.jsx'
import { useIsMobile } from '../hooks/useMediaQuery.js'

// ── Tax & P&L Aware Action Card (PIPE-019 + PIPE-020) ───────────────────────


const FEEDBACK_OPTIONS = [
  'I disagree with this recommendation',
  'I don\'t understand the reasoning',
  'The numbers seem wrong',
  'The timing doesn\'t feel right',
  'Other',
]

function FeedbackForm({ pos, action, onClose }) {
  const { apiFetch } = useAuth()
  const [chosen, setChosen] = useState(null)
  const [freeText, setFreeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!chosen) return
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_context: {
            ticker:      pos.ticker || '',
            strike:      pos.strike,
            expiry:      pos.expiry,
            action_type: action.key,
          },
          option_chosen: chosen,
          free_text:     chosen === 'Other' ? freeText : '',
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.detail || 'Failed to submit feedback.')
      } else {
        setDone(true)
      }
    } catch {
      setError('Request failed — backend may not be running.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
        <span style={{ color: 'var(--green)' }}>✓</span> Feedback recorded — thank you.{' '}
        <button onClick={onClose} className="underline" style={{ color: 'var(--muted)' }}>close</button>
      </div>
    )
  }

  return (
    <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
      <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>What doesn't feel right?</div>
      <div className="space-y-1">
        {FEEDBACK_OPTIONS.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name={`feedback-${pos.id}`}
              value={opt}
              checked={chosen === opt}
              onChange={() => setChosen(opt)}
              style={{ accentColor: 'var(--blue)' }}
            />
            <span style={{ color: chosen === opt ? 'var(--text)' : 'var(--muted)' }}>{opt}</span>
          </label>
        ))}
      </div>
      {chosen === 'Other' && (
        <textarea
          value={freeText}
          onChange={e => setFreeText(e.target.value.slice(0, 280))}
          placeholder="Tell us more (max 280 chars)"
          rows={2}
          className="w-full text-xs px-2 py-1.5 border resize-none"
          style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)' }}
        />
      )}
      {error && <div className="text-xs" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!chosen || saving}
          className="text-xs px-3 py-1.5 border disabled:opacity-40"
          style={{ borderColor: 'var(--blue)', color: 'var(--blue)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(96,165,250,0.08)' }}
        >
          {saving ? 'Submitting…' : 'Submit'}
        </button>
        <button onClick={onClose} className="text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
      </div>
    </div>
  )
}

function RollScenarioCard({ scenario: s, contracts, isITM, onRollTo }) {
  const creditColor = (s.net_credit ?? 0) >= 0 ? 'var(--green)' : 'var(--amber)'
  const creditLabel = (s.net_credit ?? 0) >= 0 ? 'Credit' : 'Debit'
  const intrinsicColor = (s.new_intrinsic ?? 0) > 0 ? 'var(--amber)' : 'var(--muted)'
  // For ITM positions, relabel the DEFENSIVE scenario to tie it to Goal #6 (Position Defense)
  const displayLabel = (isITM && s.scenario === 'DEFENSIVE') ? 'Defend These Shares' : s.label
  if (!s.viable) {
    return (
      <div className="px-3 py-2 border text-xs" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
        <div className="font-semibold mb-0.5" style={{ color: 'var(--muted)' }}>{displayLabel}</div>
        <div style={{ color: 'var(--muted)' }}>No suitable target available right now.</div>
      </div>
    )
  }
  return (
    <div className="px-3 py-2.5 border text-xs" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: isITM && s.scenario === 'DEFENSIVE' ? 'rgba(74,158,255,0.06)' : 'rgba(128,128,128,0.04)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold" style={{ color: isITM && s.scenario === 'DEFENSIVE' ? 'var(--blue)' : 'var(--text)' }}>{displayLabel}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ color: creditColor, backgroundColor: `${creditColor}20`, border: `1px solid ${creditColor}40`, borderRadius: 'var(--radius-sm)' }}>
          {(s.net_credit ?? 0) >= 0 ? '+' : ''}${(s.net_credit ?? 0).toFixed(2)} {creditLabel}
        </span>
      </div>
      <p className="mb-2 leading-snug" style={{ color: 'var(--muted)' }}>{isITM && s.scenario === 'DEFENSIVE' ? 'Move to a higher strike to keep your shares and stay out of the money — this is a roll up and out.' : s.description}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>New strike:</span><span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' }}>${s.new_strike}</span></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Expiry:</span><span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' }}>{s.new_expiry} ({s.new_dte}d)</span></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Time value:</span><span style={{ color: 'var(--green)', minWidth: 0, overflowWrap: 'break-word' }}>${(s.new_time_premium ?? 0).toFixed(2)}</span></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Intrinsic kept:</span><span style={{ color: intrinsicColor, minWidth: 0, overflowWrap: 'break-word' }}>{(s.new_intrinsic ?? 0) > 0 ? `$${(s.new_intrinsic).toFixed(2)}` : '—'}</span></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Net {creditLabel.toLowerCase()}:</span><span style={{ color: creditColor, minWidth: 0, overflowWrap: 'break-word' }}>${Math.abs(s.net_credit_total ?? 0).toFixed(0)} total</span></div>
        <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Break-even:</span><span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' }}>${(s.break_even_price ?? 0).toFixed(2)}</span></div>
      </div>
      {s.new_delta != null && (
        <div className="mt-1.5 text-[10px]" style={{ color: 'var(--muted)' }}>
          Assignment risk at new strike: Δ {s.new_delta.toFixed(2)}
        </div>
      )}
      {onRollTo && (
        <button
          onClick={(e) => { e.stopPropagation(); onRollTo(s) }}
          className="mt-2 w-full py-1.5 text-xs font-semibold border transition-colors"
          style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-sm)' }}
        >
          Roll to this
        </button>
      )}
    </div>
  )
}

// ── Diagonal restructure panel (Position Defense — roll far out & higher) ──────
// Lazy-loads /api/diagonal-restructure when opened. Unlike the 30–45d roll
// scenarios above, this scans the full LEAP horizon so the holder can see how
// far out (and how high a strike) they can go at a net credit — lifting the
// ceiling, deferring the tax event, and optionally uncapping shares.
const WEIGHT_FACTORS = [
  { key: 'upside',   label: 'Upside',     hint: 'Keep more of the stock’s future gains (higher strike)' },
  { key: 'tax',      label: 'Tax',        hint: 'Defer the taxable event into a later year' },
  { key: 'credit',   label: 'Credit',     hint: 'Collect the most net premium' },
  { key: 'safety',   label: 'Safety',     hint: 'Lowest chance of being assigned (lower delta)' },
  { key: 'duration', label: 'Short lock', hint: 'Don’t tie the shares up for years' },
]

function DiagonalRestructurePanel({ pos, onRollTo }) {
  const { apiFetch } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [weights, setWeights] = useState({ upside: 1, tax: 1, credit: 1, safety: 1, duration: 1 })

  useEffect(() => {
    if (!open) return
    const qs = WEIGHT_FACTORS.map(f => `w_${f.key}=${weights[f.key]}`).join('&')
    const t = setTimeout(() => {
      setLoading(true); setError(null)
      apiFetch(`/api/diagonal-restructure/${pos.id}?${qs}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then(d => setData(d))
        .catch(() => setError('Could not load restructure options.'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [open, weights]) // eslint-disable-line react-hooks/exhaustive-deps

  const cov = data?.coverage
  return (
    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] font-semibold"
        style={{ color: 'var(--blue)' }}
      >
        {open ? '▾' : '▸'} Roll further out & higher (restructure)
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
            Buy this call back and re-sell it <strong>further out</strong> — often at a
            higher strike and still a net credit. Going longer lifts your ceiling,
            pushes the tax event into a later year, and (if you sell fewer contracts)
            frees shares to keep running.
          </p>

          {/* Priority weights — retune what "best" means and re-rank live */}
          <div className="px-2.5 py-2 border" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>What matters most</span>
              <button
                onClick={() => setWeights({ upside: 1, tax: 1, credit: 1, safety: 1, duration: 1 })}
                className="text-[10px]" style={{ color: 'var(--blue)' }}
              >
                Reset
              </button>
            </div>
            <div className="space-y-1.5">
              {WEIGHT_FACTORS.map(f => (
                <div key={f.key} className="flex items-center gap-2" title={f.hint}>
                  <span className="text-[11px] w-20 shrink-0" style={{ color: 'var(--text)' }}>{f.label}</span>
                  <input
                    type="range" min="0" max="3" step="0.5" value={weights[f.key]}
                    onChange={e => setWeights(w => ({ ...w, [f.key]: parseFloat(e.target.value) }))}
                    className="flex-1 h-1 accent-current" style={{ color: 'var(--blue)' }}
                  />
                  <span className="text-[10px] font-mono w-6 text-right" style={{ color: weights[f.key] === 0 ? 'var(--muted)' : 'var(--text)' }}>
                    {weights[f.key] === 0 ? 'off' : `×${weights[f.key]}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {loading && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Scanning the LEAP chain…</div>}
          {error && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{error}</div>}

          {data && (
            <>
              {/* Coverage / contract-count lever */}
              {cov && (
                <div className="text-[11px] px-2.5 py-2 border" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
                  <span style={{ color: 'var(--text)' }}>{cov.coverage_pct}% covered</span>
                  {' · '}{cov.uncovered_shares?.toLocaleString()} shares
                  {' ('}{cov.writable_contracts_free} contracts{') uncapped. '}
                  Re-selling fewer than {pos.contracts} contracts leaves more upside uncapped.
                </div>
              )}

              {/* Net-credit frontier — how far out / how high at a credit */}
              {data.frontier?.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                    Highest strike still at a net credit, by expiry
                  </div>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {data.frontier.map(f => (
                      <div key={f.expiry} className="flex justify-between gap-2">
                        <span style={{ color: 'var(--muted)' }}>{f.expiry} ({f.dte}d)</span>
                        <span style={{ color: 'var(--text)' }}>
                          ${f.max_credit_strike} <span style={{ color: 'var(--green)' }}>+${f.net_credit.toFixed(2)}</span>
                          <span style={{ color: 'var(--muted)' }}> · ceiling +{f.ceiling_lift.toFixed(0)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top composite-ranked candidates */}
              {data.candidates?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    Best balance (upside · tax · credit · safety)
                  </div>
                  {data.candidates.slice(0, 3).map((c, i) => {
                    const creditPos = (c.net_credit ?? 0) >= 0
                    const creditColor = creditPos ? 'var(--green)' : 'var(--amber)'
                    return (
                      <div key={`${c.strike}-${c.expiry}`} className="px-3 py-2.5 border text-xs"
                        style={{ borderColor: i === 0 ? 'var(--blue)' : 'var(--border)', borderRadius: 'var(--radius-sm)',
                                 backgroundColor: i === 0 ? 'rgba(74,158,255,0.06)' : 'rgba(128,128,128,0.04)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold font-mono" style={{ color: i === 0 ? 'var(--blue)' : 'var(--text)' }}>
                            ${c.strike} Call · {c.expiry}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5"
                            style={{ color: creditColor, backgroundColor: `${creditColor}20`, border: `1px solid ${creditColor}40`, borderRadius: 'var(--radius-sm)' }}>
                            {creditPos ? '+' : ''}${(c.net_credit ?? 0).toFixed(2)} {creditPos ? 'Credit' : 'Debit'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Days out:</span><span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' }}>{c.dte}d</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Net total:</span><span style={{ color: creditColor, minWidth: 0, overflowWrap: 'break-word' }}>{creditPos ? '+' : ''}${Math.abs(c.net_credit_total ?? 0).toFixed(0)}</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Ceiling lift:</span><span style={{ color: 'var(--green)', minWidth: 0, overflowWrap: 'break-word' }}>+${(c.strike - pos.strike).toFixed(0)}</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Assign. risk:</span><span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'break-word' }}>{c.delta != null ? `Δ ${c.delta.toFixed(2)}` : '—'}</span></div>
                        </div>
                        {c.sub_scores && (
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]" style={{ color: 'var(--muted)' }}>
                            <span>Upside {Math.round(c.sub_scores.upside)}</span>
                            <span>Tax {Math.round(c.sub_scores.tax)}</span>
                            <span>Credit {Math.round(c.sub_scores.credit)}</span>
                            <span>Safety {Math.round(c.sub_scores.safety)}</span>
                            {c.sub_scores.duration != null && <span>Lock {Math.round(c.sub_scores.duration)}</span>}
                          </div>
                        )}
                        {c.crosses_tax_year && (
                          <div className="mt-1 text-[10px]" style={{ color: 'var(--green)' }}>✓ Defers the taxable event to {c.expiry.slice(0, 4)}</div>
                        )}
                        {onRollTo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRollTo({ pos, scenario: { new_strike: c.strike, new_expiry: c.expiry, new_mid: c.mid } }) }}
                            className="mt-2 w-full py-1.5 text-xs font-semibold border"
                            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-sm)' }}
                          >
                            Restructure to this
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Finance-the-Buyback panel (PIPE-036) ────────────────────────────────────
// When a covered call is deep ITM and a roll alone can't fund the close, this
// panel shows short-dated income trades on the user's other holdings plus a
// runway forecast: how many cycles to neutralize the position.

function FinanceBuybackPanel({ pos }) {
  const { apiFetch } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true); setError(null)
    apiFetch(`/api/finance-buyback/${pos.id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setData(d))
      .catch(() => setError('Could not load financing plan.'))
      .finally(() => setLoading(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render the toggle if data loaded and position isn't deep ITM
  if (data && !data.deep_itm) return null

  const ctc = data?.cost_to_close
  const runway = data?.runway
  const candidates = data?.income_candidates || []
  const summary = data?.plain_english

  return (
    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] font-semibold"
        style={{ color: 'var(--amber)' }}
      >
        {open ? '▾' : '▸'} Finance the buyback
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {loading && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Scanning income opportunities…</div>}
          {error && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{error}</div>}

          {data && data.deep_itm && (
            <>
              {/* Headline + detail */}
              {summary && (
                <div className="px-2.5 py-2 border text-[11px] leading-snug" style={{ borderColor: 'var(--amber)40', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(245,158,11,0.06)' }}>
                  <div className="font-semibold mb-1" style={{ color: 'var(--amber)' }}>{summary.headline}</div>
                  <div style={{ color: 'var(--muted)' }}>{summary.detail}</div>
                </div>
              )}

              {/* Cost-to-close breakdown */}
              {ctc && (
                <div className="px-2.5 py-2 border text-[11px] font-mono" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
                  <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Cost to close:</span><span style={{ color: 'var(--red)' }}>${ctc.buyback_total.toLocaleString()}</span></div>
                  {ctc.best_roll_credit > 0 && (
                    <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Best roll credit:</span><span style={{ color: 'var(--green)' }}>−${ctc.best_roll_credit.toLocaleString()}</span></div>
                  )}
                  <div className="flex justify-between mt-0.5 pt-0.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--text)' }}>Gap to fund:</span>
                    <span style={{ color: ctc.shortfall > 0 ? 'var(--amber)' : 'var(--green)' }}>${ctc.shortfall.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Runway forecast */}
              {runway && runway.cycles_to_neutralize != null && (
                <div className="px-2.5 py-2 border text-[11px]" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(128,128,128,0.04)' }}>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Runway forecast</div>
                  <div className="font-mono space-y-0.5">
                    <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Income per cycle (~{runway.cycle_dte}d):</span><span style={{ color: 'var(--green)' }}>${runway.per_cycle_income.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Monthly pace:</span><span style={{ color: 'var(--green)' }}>~${runway.monthly_income.toLocaleString()}/mo</span></div>
                    <div className="flex justify-between mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text)' }}>Cycles to neutralize:</span>
                      <span style={{ color: 'var(--text)' }}>~{runway.cycles_to_neutralize} ({runway.months_to_neutralize} mo)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Income candidates */}
              {candidates.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                    Income trades (short-dated, low assignment risk)
                  </div>
                  <div className="space-y-1.5">
                    {candidates.slice(0, 5).map((c, i) => (
                      <div key={`${c.ticker}-${c.strike}-${c.expiry}`} className="px-3 py-2 border text-xs"
                        style={{ borderColor: i === 0 ? 'var(--amber)' : 'var(--border)', borderRadius: 'var(--radius-sm)',
                                 backgroundColor: i === 0 ? 'rgba(245,158,11,0.06)' : 'rgba(128,128,128,0.04)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold font-mono" style={{ color: i === 0 ? 'var(--amber)' : 'var(--text)' }}>
                            {c.ticker} ${c.strike} Call · {c.expiry}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5" style={{ color: 'var(--green)', backgroundColor: 'var(--green)20', border: '1px solid var(--green)40', borderRadius: 'var(--radius-sm)' }}>
                            ${c.mid.toFixed(2)}/contract
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Days out:</span><span style={{ color: 'var(--text)' }}>{c.dte}d</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Assign. risk:</span><span style={{ color: 'var(--text)' }}>{c.delta != null ? `Δ ${c.delta.toFixed(2)}` : '—'}</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>$/day:</span><span style={{ color: 'var(--green)' }}>${c.premium_per_day.toFixed(3)}</span></div>
                          <div className="flex justify-between gap-2"><span style={{ color: 'var(--muted)' }}>Up to:</span><span style={{ color: 'var(--text)' }}>{c.max_contracts}×  ${c.max_premium.toLocaleString()}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {candidates.length > 5 && (
                    <div className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                      +{candidates.length - 5} more candidates available
                    </div>
                  )}
                </div>
              )}

              {candidates.length === 0 && !loading && (
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  No income candidates found — you may not have uncovered shares to sell calls against right now.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TaxAwareActionCard({ pos, action, onRollTo }) {
  const { apiFetch } = useAuth()
  const [expanded] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [rollTargets, setRollTargets] = useState(null)
  const [rollLoading, setRollLoading] = useState(false)
  const [rollError, setRollError] = useState(null)

  const shouldShowRolls = ['ROLL', 'GAMMA_DANGER', 'BREACH_RISK', 'EARLY_EXERCISE', 'CLOSE'].includes(action.key)

  // Lazy-fetch roll targets when card is expanded and the action warrants it
  useEffect(() => {
    if (!expanded || !shouldShowRolls || rollTargets !== null || rollLoading) return
    setRollLoading(true)
    apiFetch(`/api/roll-targets/${pos.id}`)
      .then(r => r.json())
      .then(d => setRollTargets(d))
      .catch(() => setRollError('Could not load roll suggestions.'))
      .finally(() => setRollLoading(false))
  }, [expanded, shouldShowRolls, pos.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const closePnl     = pos.close_pnl_impact != null ? pos.close_pnl_impact : null
  const closePnlPos  = closePnl != null && closePnl >= 0
  const premiumSold  = (pos.sell_price || 0) * (pos.contracts || 0) * 100
  const costToClose  = (pos.current_price || 0) * (pos.contracts || 0) * 100

  const confidence    = pos.confidence != null ? pos.confidence : null
  const lowConfidence = confidence != null && confidence < 60

  // Urgency label display
  const urgencyLabel = action.urgency === 'URGENT' ? 'Act Now'
    : action.urgency === 'HIGH'        ? 'Watch'
    : action.urgency === 'RECOMMENDED' ? 'Recommended'
    : 'Watch'

  const urgencyColor = action.urgency === 'URGENT' ? 'var(--red)'
    : action.urgency === 'HIGH'        ? 'var(--amber)'
    : action.urgency === 'RECOMMENDED' ? 'var(--green)'
    : 'var(--muted)'

  // Break-even explanation
  const breakEvenPrice = pos.break_even_price != null ? pos.break_even_price : pos.strike

  // Roll new income estimate: very rough — keep same DTE, ~same premium per the theta decay model
  const rollIncomeEst = premiumSold > 0 ? Math.round(premiumSold * 0.80) : null

  return (
    <div className="border text-xs" style={{ backgroundColor: action.color + '0d', borderColor: action.color + '40', borderRadius: 'var(--radius-md)' }}>
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold" style={{ color: action.color }}>{action.label}</span>
            <span className="px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: urgencyColor + '20', color: urgencyColor, borderRadius: 'var(--radius-sm)' }}>
              {urgencyLabel}
            </span>
          </div>
          {/* Position identity */}
          <div className="font-mono font-semibold" style={{ color: 'var(--text)' }}>
            ${pos.strike} Call · {pos.expiry} · {pos.dte}d left
          </div>
          {/* Explanation */}
          <div className="mt-0.5 leading-snug" style={{ color: 'var(--muted)' }}>{action.instruction}</div>
        </div>
      </div>

      {/* Options panels */}
      <div className="border-t space-y-0" style={{ borderColor: action.color + '30' }}>

          {/* ── Option A: Close now (label softened to "Review your options" when confidence < 60%) */}
          <div className="px-4 py-3 border-b" style={{ borderColor: action.color + '20' }}>
            <div className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
              {lowConfidence ? 'Review your options' : 'Close now'}
            </div>
            <div className="space-y-1" style={{ color: 'var(--muted)' }}>
              <div className="flex justify-between">
                <span>P&L if you close:</span>
                <span className="font-mono font-semibold" style={{ color: closePnl == null ? 'var(--muted)' : closePnlPos ? 'var(--green)' : 'var(--red)', minWidth: 0, overflowWrap: 'break-word' }}>
                  {closePnl == null ? '—' : `${closePnlPos ? '+' : ''}$${Math.abs(closePnl).toFixed(0)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cost to buy back:</span>
                <span className="font-mono" style={{ minWidth: 0, overflowWrap: 'break-word' }}>${costToClose.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax impact:</span>
                <span className="font-mono">Taxable event this year</span>
              </div>
            </div>
            <div className="mt-2 leading-snug" style={{ color: 'var(--muted)' }}>
              Choose this if you believe {pos.ticker} will keep rising above ${breakEvenPrice?.toFixed(0)}.
            </div>
          </div>

          {/* ── Option B: Wait and see ──────────────────────────────── */}
          <div className="px-4 py-3 border-b" style={{ borderColor: action.color + '20' }}>
            <div className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Wait and see</div>
            <div className="font-mono text-2xl font-bold" style={{ color: pos.delta != null && (1 - pos.delta) >= 0.5 ? 'var(--green)' : 'var(--amber)' }}>
              {pos.delta != null ? Math.round((1 - pos.delta) * 100) : '—'}%
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
              chance {pos.ticker} stays below ${breakEvenPrice?.toFixed(0)} by expiry
            </div>
          </div>

          {/* ── Option C: Roll — live scenarios when available ────────── */}
          <div className="px-4 py-3">
            <div className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Roll to next month</div>
            {shouldShowRolls && rollLoading && (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Finding roll targets…</div>
            )}
            {shouldShowRolls && rollError && (
              <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                <div className="flex justify-between"><span>P&L realized:</span><span className="font-mono">$0 (no loss locked in)</span></div>
                <div className="flex justify-between"><span>Tax impact:</span><span className="font-mono">No new taxable event</span></div>
                {rollIncomeEst != null && <div className="flex justify-between"><span>New income potential:</span><span className="font-mono" style={{ color: 'var(--green)' }}>~${rollIncomeEst.toLocaleString()} est.</span></div>}
                <div className="mt-1" style={{ color: 'var(--muted)' }}>Buy back this call and sell a new one at the same or higher strike, targeting 30–45 days until expiry.</div>
              </div>
            )}
            {shouldShowRolls && rollTargets?.scenarios && (
              <div className="space-y-2">
                {rollTargets.scenarios.map(s => (
                  <RollScenarioCard key={s.scenario} scenario={s} contracts={pos.contracts} isITM={(pos.intrinsic_value ?? 0) > 0} onRollTo={onRollTo ? (scenario) => onRollTo({ pos, scenario }) : undefined} />
                ))}
              </div>
            )}
            {/* Deep-ITM defense: when a 30–45d roll can't lift the ceiling much, offer the LEAP restructure */}
            {shouldShowRolls && (pos.intrinsic_value ?? 0) > 0 && (
              <DiagonalRestructurePanel pos={pos} onRollTo={onRollTo} />
            )}
            {/* Finance-the-buyback: when deep ITM, offer income trades + runway forecast */}
            {shouldShowRolls && (pos.intrinsic_value ?? 0) > 0 && (
              <FinanceBuybackPanel pos={pos} />
            )}
            {!shouldShowRolls && (
              <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                <div className="flex justify-between"><span>P&L realized:</span><span className="font-mono">$0 (no loss locked in)</span></div>
                <div className="flex justify-between"><span>Tax impact:</span><span className="font-mono">No new taxable event</span></div>
                {rollIncomeEst != null && <div className="flex justify-between"><span>New income potential:</span><span className="font-mono" style={{ color: 'var(--green)' }}>~${rollIncomeEst.toLocaleString()} est.</span></div>}
                <div className="mt-1">Buy back this call and sell a new one at the same or higher strike, targeting 30–45 days until expiry.</div>
              </div>
            )}
          </div>

      </div>

      {/* ── Feedback row (always visible at card bottom) ─────────────────── */}
      {!feedbackOpen ? (
        <div className="px-4 py-2 border-t" style={{ borderColor: action.color + '20' }}>
          <button
            onClick={() => setFeedbackOpen(true)}
            className="text-[10px]"
            style={{ color: 'var(--muted)' }}
          >
            💬 This doesn't make sense to me
          </button>
        </div>
      ) : (
        <FeedbackForm pos={pos} action={action} onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  )
}

// ── Portfolio Intelligence Panel ──────────────────────────────────────────────

// ── Action logic (module-level so PositionRow can use it) ────────────────────

function getAction(pos) {
    // Rule softening: if closing would give back > 40% of original premium, downgrade urgency
    const closeLossRatio = pos.loss_as_pct_of_premium != null ? pos.loss_as_pct_of_premium / 100 : 0
    const closingCostly = closeLossRatio > 0.40

    // Macro softening (PIPE-021): downgrade urgency one level when a major event is within 5 days
    const hasMacroEvent = pos.macro_event != null

    function macroDowngrade(urgency) {
      if (!hasMacroEvent) return urgency
      if (urgency === 'URGENT') return 'HIGH'
      if (urgency === 'HIGH')   return 'WATCH'
      return urgency
    }

    // Early exercise risk — highest-priority assignment scenario (before DTE checks)
    if (pos.early_exercise_risk === 'CRITICAL') {
      const urgency = macroDowngrade('URGENT')
      const divLabel = pos.days_until_ex_div != null
        ? ` — Dividend in ${pos.days_until_ex_div}d`
        : ''
      return { key: 'EARLY_EXERCISE',
        label: `Shares May Be Called Early${divLabel}`,
        color: 'var(--red)', urgency,
        instruction: `Your call has almost no time value left ($${(pos.time_premium ?? 0).toFixed(2)}) and expires after the upcoming ${pos.ticker} dividend ($${(pos.upcoming_dividend ?? 0).toFixed(2)}). The buyer is very likely to exercise early to collect that dividend — taking your shares before expiry.`,
        closingCostly }
    }
    if (pos.early_exercise_risk === 'HIGH') {
      const urgency = macroDowngrade('HIGH')
      return { key: 'EARLY_EXERCISE',
        label: 'Shares May Be Called Early',
        color: 'var(--red)', urgency,
        instruction: `Time value is only $${(pos.time_premium ?? 0).toFixed(2)} — nearly all premium has decayed. Research shows that when time value drops below $0.20, early exercise becomes highly likely. Your shares could be called away before expiry.`,
        closingCostly }
    }
    if (pos.dte <= 7) {
      const baseUrgency = closingCostly ? 'HIGH' : 'URGENT'
      const urgency = macroDowngrade(baseUrgency)
      const label   = closingCostly ? 'Watch Carefully — Closing Costs More Than Holding' : 'Expiring Soon — Act Now'
      return { key: 'GAMMA_DANGER', label, color: 'var(--red)', urgency,
        instruction: 'Expires in 7 days or fewer — close or renew immediately.',
        closingCostly }
    }
    if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct > 0 && pos.distance_to_strike_pct <= 1.5) {
      const baseUrgency = closingCostly ? 'HIGH' : 'URGENT'
      const urgency = macroDowngrade(baseUrgency)
      const label   = closingCostly ? 'Watch Carefully — Strike Nearby, Closing Expensive' : 'Strike Price at Risk'
      return { key: 'BREACH_RISK', label, color: 'var(--red)', urgency,
        instruction: 'Stock is within 1.5% of your strike. Roll to a higher strike or close now.',
        closingCostly }
    }
    if (pos.delta != null && pos.delta > 0.35)
      return { key: 'CLOSE', label: 'High Assignment Risk — Close', color: 'var(--red)', urgency: 'HIGH',
        instruction: `Assignment risk (${pos.delta.toFixed(2)}) is too high — this call is moving toward the money. Close now.`,
        closingCostly }
    if ((pos.profit_capture_pct || 0) >= 50)
      return { key: 'CLOSE_EARLY', label: 'Lock In Profits', color: 'var(--green)', urgency: 'RECOMMENDED',
        instruction: `${pos.profit_capture_pct?.toFixed(0)}% of max income collected. Lock in gains and open a fresh position.`,
        closingCostly: false }
    if (pos.oi_signal === 'MAJOR_UNWIND')
      return { key: 'OI_UNWIND', label: 'Large Sellers Exiting', color: 'var(--amber)', urgency: 'WATCH',
        instruction: `${pos.oi_signal_label || 'Large drop in open interest at this strike'} — big players are closing out. Monitor; consider closing early if the option price stops falling.`,
        closingCostly }
    if (pos.dte <= 21)
      return { key: 'ROLL', label: 'Time to Renew', color: 'var(--amber)', urgency: 'WATCH',
        instruction: 'Entering the high-sensitivity zone (under 21 days). Renew to 30–45 days at the same or higher strike.',
        closingCostly }
    if (pos.oi_signal === 'UNWINDING')
      return { key: 'OI_WATCH', label: 'Interest Declining', color: 'var(--muted)', urgency: 'WATCH',
        instruction: `${pos.oi_signal_label || 'Open interest declining at this strike'} — positions being closed here. No immediate action needed.`,
        closingCostly }
    return null
}

// ── All Portfolios aggregate view ─────────────────────────────────────────────

function AllPortfoliosView({ positions, portfolios, holdings }) {
  const [expandedCell, setExpandedCell] = useState(null) // 'strike|expiry'

  const allOpen = positions.filter(p => p.status === 'open')
  const totalContracts = allOpen.reduce((s, p) => s + (p.contracts || 0), 0)
  // Income Earned = net premium kept across all positions: Sold At less Closed/Bought,
  // × 100 × contracts. Open positions (no buy-back yet) count their full premium.
  const totalIncome    = positions.reduce(
    (s, p) => s + ((p.sell_price || 0) - (p.close_price || 0)) * 100 * (p.contracts || 0),
    0
  )
  const totalPnl       = allOpen.reduce((s, p) => s + (p.pnl || 0), 0)

  // Concentration base = total available contracts across all portfolios (shares / 100)
  const totalAvailableContracts = Math.floor(
    holdings.reduce((s, h) => s + (h.shares || 0), 0) / 100
  )

  // Build grid map
  const gridMap = {}
  for (const p of allOpen) {
    const sk = String(p.strike)
    if (!gridMap[sk]) gridMap[sk] = {}
    if (!gridMap[sk][p.expiry]) gridMap[sk][p.expiry] = []
    gridMap[sk][p.expiry].push(p)
  }

  const strikes  = [...new Set(allOpen.map(p => String(p.strike)))].sort((a, b) => Number(b) - Number(a))
  const expiries = [...new Set(allOpen.map(p => p.expiry))].sort()

  const rowTotals = {}
  const colTotals = {}
  for (const p of allOpen) {
    const sk = String(p.strike)
    rowTotals[sk] = (rowTotals[sk] || 0) + (p.contracts || 0)
    colTotals[p.expiry] = (colTotals[p.expiry] || 0) + (p.contracts || 0)
  }

  // Concentration warnings (30% rule) — denominator = available contracts (shares/100)
  const concBase = totalAvailableContracts > 0 ? totalAvailableContracts : totalContracts
  const warnings = []
  if (concBase > 0) {
    for (const [sk, cts] of Object.entries(rowTotals)) {
      const pct = Math.round(cts / concBase * 100)
      if (pct >= 25) warnings.push({ label: `$${sk} strike`, cts, pct })
    }
    for (const [ex, cts] of Object.entries(colTotals)) {
      const pct = Math.round(cts / concBase * 100)
      if (pct >= 25) warnings.push({ label: `${ex} expiry`, cts, pct })
    }
  }

  function cellBg(cts) {
    if (!cts) return 'transparent'
    return `rgba(74,158,255,${Math.min(0.08 + (cts / 6) * 0.35, 0.43)})`
  }

  function toggleCell(sk, ex) {
    const key = `${sk}|${ex}`
    setExpandedCell(prev => prev === key ? null : key)
  }

  const activePortfolioCount = portfolios.filter(p => !p.archived).length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>All Portfolios</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Aggregate view across {activePortfolioCount} active portfolio{activePortfolioCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { labelKey: 'OpenPositions',     label: 'Open Positions',                                                    value: String(allOpen.length),                                          color: 'var(--text)' },
          { labelKey: 'IncomeEarned',      label: <Term id="PremiumCollected">Income Earned</Term>,                    value: `$${Math.round(totalIncome).toLocaleString()}`,                   color: 'var(--green)' },
          { labelKey: 'UnrealizedPnL',     label: 'Unrealized P&L',                                                    value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { labelKey: 'TotalContracts',    label: <Term id="Contracts">Total Positions (×100)</Term>,                  value: String(totalContracts),                                          color: 'var(--text)' },
        ].map(s => (
          <div key={s.labelKey} className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: s.color, minWidth: 0, overflowWrap: 'break-word' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Exposure grid */}
      <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Exposure Grid — Contracts by Strike × Expiry
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Click any filled cell to see portfolio breakdown · Darker blue = more contracts
          </p>
        </div>

        {allOpen.length === 0 ? (
          <div className="px-5 py-10 text-center space-y-2">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No open positions across any portfolio yet.
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Select a portfolio from the sidebar and click "+ Add Position" to record your first trade.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-right font-normal border-b border-r"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted)', minWidth: '72px' }}>
                    Strike
                  </th>
                  {expiries.map(ex => (
                    <th key={ex} className="px-3 py-3 text-center font-normal border-b border-r"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)', minWidth: '80px' }}>
                      <div>{ex}</div>
                      <div style={{ color: 'var(--border)', fontSize: '10px' }}>
                        {colTotals[ex]} ct
                        {concBase > 0 && (
                          <span style={{ color: Math.round(colTotals[ex] / concBase * 100) >= 30 ? 'var(--red)' : 'var(--muted)' }}>
                            {' '}· {Math.round(colTotals[ex] / concBase * 100)}%
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold border-b"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', minWidth: '56px' }}>
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {strikes.map(sk => {
                  const expandedExpiry = expiries.find(ex => expandedCell === `${sk}|${ex}`)
                  const expandedPositions = expandedExpiry ? (gridMap[sk]?.[expandedExpiry] || []) : null

                  return (
                    <Fragment key={sk}>
                      {/* Data row */}
                      <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-3 text-right font-semibold border-r"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                          ${sk}
                        </td>
                        {expiries.map(ex => {
                          const cellPos = gridMap[sk]?.[ex] || []
                          const cts = cellPos.reduce((s, p) => s + (p.contracts || 0), 0)
                          const key = `${sk}|${ex}`
                          const isActive = expandedCell === key
                          return (
                            <td key={ex}
                                className="px-3 py-3 text-center border-r"
                                style={{
                                  borderColor: 'var(--border)',
                                  backgroundColor: isActive ? 'rgba(74,158,255,0.12)' : cellBg(cts),
                                  cursor: cts > 0 ? 'pointer' : 'default',
                                  outline: isActive ? '2px solid rgba(74,158,255,0.5)' : 'none',
                                  outlineOffset: '-2px',
                                }}
                                onClick={() => cts > 0 && toggleCell(sk, ex)}>
                              {cts > 0
                                ? <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{cts}</span>
                                : <span style={{ color: 'var(--border)' }}>·</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-3 text-center font-semibold"
                            style={{ color: 'var(--text)' }}>
                          <div>{rowTotals[sk] || 0}</div>
                          {concBase > 0 && (
                            <div className="text-[10px] font-normal"
                                 style={{ color: Math.round((rowTotals[sk] || 0) / concBase * 100) >= 30 ? 'var(--red)' : 'var(--muted)' }}>
                              {Math.round((rowTotals[sk] || 0) / concBase * 100)}%
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded cell detail */}
                      {expandedPositions && (
                        <tr>
                          <td colSpan={expiries.length + 2}
                              className="px-5 py-3 border-b"
                              style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(74,158,255,0.04)' }}>
                            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--blue)' }}>
                              ${sk} Call · {expandedExpiry} · {expandedPositions.reduce((s, p) => s + (p.contracts || 0), 0)} contracts
                            </div>
                            <div className="space-y-1.5">
                              {expandedPositions.map(p => {
                                const ptf = portfolios.find(x => x.id === p.portfolio_id)
                                return (
                                  <div key={p.id} className="flex flex-wrap gap-x-5 gap-y-0.5 items-center">
                                    <span className="w-28 truncate font-semibold" style={{ color: 'var(--text)' }}>
                                      {ptf?.name || p.portfolio_id}
                                    </span>
                                    <span style={{ color: 'var(--muted)' }}>{p.contracts} ct</span>
                                    <span style={{ color: 'var(--muted)' }}>sold ${p.sell_price?.toFixed(2)}</span>
                                    {p.pnl != null && (
                                      <span style={{ color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                        P&L {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(0)}
                                      </span>
                                    )}
                                    {p.dte != null && (
                                      <span style={{ color: p.dte <= 7 ? 'var(--red)' : p.dte <= 21 ? 'var(--amber)' : 'var(--muted)' }}>
                                        {p.dte}d until expiry
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {/* Column totals row */}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="px-4 py-3 text-right font-semibold border-r"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                    TOTAL
                  </td>
                  {expiries.map(ex => (
                    <td key={ex} className="px-3 py-3 text-center font-semibold border-r"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                      <div>{colTotals[ex] || 0}</div>
                      {concBase > 0 && (
                        <div className="text-[10px] font-normal"
                             style={{ color: Math.round((colTotals[ex] || 0) / concBase * 100) >= 30 ? 'var(--red)' : 'var(--muted)' }}>
                          {Math.round((colTotals[ex] || 0) / concBase * 100)}%
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold" style={{ color: 'var(--green)' }}>
                    <div>{totalContracts}</div>
                    {concBase > 0 && (
                      <div className="text-[10px] font-normal" style={{ color: 'var(--muted)' }}>
                        of {concBase}
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Concentration warnings */}
        {warnings.length > 0 && (
          <div className="px-5 py-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span style={{ color: w.pct >= 30 ? 'var(--red)' : 'var(--amber)' }}>⚠</span>
                <span style={{ color: 'var(--text)' }}>
                  <strong>{w.label}</strong>: {w.cts} contracts = {w.pct}% of total
                  {w.pct >= 30 ? ' — at or above concentration limit' : ' — approaching 30% limit'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Portfolio sidebar item ────────────────────────────────────────────────────

function PortfolioTab({ portfolio, active, indent, onClick, onStar, onRename, onArchive, onDelete }) {
  const stats = portfolio.stats || {}
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(portfolio.name)

  function startRename(e) {
    e.stopPropagation()
    setRenameVal(portfolio.name)
    setRenaming(true)
  }

  function commitRename(e) {
    e.stopPropagation()
    const trimmed = renameVal.trim()
    if (trimmed && trimmed !== portfolio.name) onRename(trimmed)
    setRenaming(false)
  }

  function cancelRename(e) {
    e.stopPropagation()
    setRenaming(false)
  }

  const isDefault = portfolio.name === 'Default' && !portfolio.brokerage_connection_id

  return (
    <div
      className="group relative"
      style={{ paddingLeft: indent ? 12 : 0 }}
    >
      {renaming ? (
        <div className="flex items-center gap-1 px-2 py-2 border-l-2" style={{ borderColor: 'var(--gold)' }}>
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(e); if (e.key === 'Escape') cancelRename(e) }}
            className="flex-1 px-1.5 py-0.5 text-xs border focus:outline-none"
            style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            onClick={e => e.stopPropagation()}
          />
          <button onClick={commitRename} className="text-xs" style={{ color: 'var(--gold)' }}>✓</button>
          <button onClick={cancelRename} className="text-xs" style={{ color: 'var(--muted)' }}>✗</button>
        </div>
      ) : (
        <button
          onClick={onClick}
          className="w-full text-left px-4 py-2.5 border-l-2 transition-colors"
          style={{
            borderColor: active ? 'var(--gold)' : 'transparent',
            backgroundColor: active ? 'var(--gold-dim)' : 'transparent',
          }}
        >
          <div className="flex items-center gap-1.5">
            {/* Star indicator */}
            {portfolio.starred && (
              <span style={{ fontSize: 10, color: 'var(--gold)', lineHeight: 1 }}>★</span>
            )}
            <span className="flex-1 text-sm font-medium truncate" style={{ color: active ? 'var(--text)' : 'var(--muted)' }}>
              {portfolio.name}
            </span>
            {stats.open_count > 0 && (
              <span className="text-xs px-1 py-0.5 font-mono shrink-0" style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
                {stats.open_count}
              </span>
            )}
          </div>
          {stats.total_premium_collected > 0 && (
            <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--green)', paddingLeft: portfolio.starred ? 14 : 0 }}>
              ${stats.total_premium_collected.toLocaleString()} premium
            </div>
          )}
        </button>
      )}

      {/* Hover actions */}
      {!renaming && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={e => { e.stopPropagation(); onStar(!portfolio.starred) }}
            title={portfolio.starred ? 'Unstar' : 'Star'}
            className="text-xs px-1 py-0.5 rounded"
            style={{ color: portfolio.starred ? 'var(--gold)' : 'var(--muted)', background: 'var(--bg-card)' }}
          >
            {portfolio.starred ? '★' : '☆'}
          </button>
          <button
            onClick={startRename}
            title="Rename"
            className="text-xs px-1 py-0.5 rounded"
            style={{ color: 'var(--muted)', background: 'var(--bg-card)' }}
          >
            ✎
          </button>
          {!isDefault && (
            <>
              <button onClick={e => { e.stopPropagation(); onArchive() }} title="Archive"
                className="text-xs px-1 py-0.5 rounded" style={{ color: 'var(--muted)', background: 'var(--bg-card)' }}>▾</button>
              <button onClick={e => { e.stopPropagation(); onDelete() }} title="Delete"
                className="text-xs px-1 py-0.5 rounded" style={{ color: 'var(--muted)', background: 'var(--bg-card)' }}>✕</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Holdings row ──────────────────────────────────────────────────────────────

function HoldingRow({ holding, coveredShares, ccLots = [], onDelete, onEdit }) {
  const isMobile   = useIsMobile()
  const shares     = holding.shares ?? 0
  const covered    = Math.min(coveredShares, shares)
  const coveragePct = shares > 0 ? Math.round(covered / shares * 100) : 0
  const price      = holding.current_price
  const pnl        = holding.unrealized_pnl
  const pnlPct     = holding.unrealized_pnl_pct
  const pnlPos     = (pnl ?? 0) >= 0

  // Weighted-average share value: covered shares are capped at their call strike
  // (worth the lower of current price or strike); floating shares are worth the
  // current price. No open calls ⇒ equals current price.
  let wtdAvgValue = null
  if (shares > 0 && price != null && price > 0) {
    let remaining = shares
    let valueSum  = 0
    for (const lot of ccLots) {
      if (remaining <= 0) break
      const lotShares = Math.min(lot.shares || 0, remaining)
      valueSum += lotShares * Math.min(price, lot.strike)
      remaining -= lotShares
    }
    if (remaining > 0) valueSum += remaining * price   // floating (uncovered) shares
    wtdAvgValue = valueSum / shares
  }

  const fmt = (n, dec = 2) => n != null ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}` : '—'
  const fmtShares = n => n != null ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'

  // ── Mobile: stacked card (uses full screen width instead of a 9-col scroll) ──
  if (isMobile) {
    const pnlText = pnl != null
      ? `${pnlPos ? '+' : ''}$${Math.abs(Math.round(pnl)).toLocaleString()}${pnlPct != null ? ` (${pnlPct.toFixed(1)}%)` : ''}`
      : '—'
    const mktText = holding.market_value != null ? `$${Math.round(holding.market_value).toLocaleString()}` : '—'
    const cells = [
      ['Shares', fmtShares(shares), 'var(--fg)'],
      ['Avg cost', fmt(holding.avg_cost), 'var(--fg)'],
      ['Current', fmt(holding.current_price), 'var(--fg)'],
      ['Wtd avg value', fmt(wtdAvgValue), 'var(--fg)'],
      ['Mkt value', mktText, 'var(--fg)'],
      ['Unreal. P&L', pnlText, pnl != null ? (pnlPos ? 'var(--acid)' : 'var(--red)') : 'var(--fg-mute)'],
    ]
    return (
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.04em' }}>
            {holding.ticker}
          </span>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ fontSize: 12, color: 'var(--fg-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
            <button onClick={onDelete} style={{ fontSize: 12, color: 'var(--fg-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          {cells.map(([label, value, color]) => (
            <div key={label} style={{ minWidth: 0 }}>
              <div className="h-eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color, overflowWrap: 'break-word' }}>{value}</div>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <div className="h-eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>Call coverage</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 4, background: 'var(--line)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${coveragePct}%`, background: coveragePct === 100 ? 'var(--acid)' : 'var(--fg-mute)', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: coveragePct === 100 ? 'var(--acid)' : 'var(--fg-mute)', whiteSpace: 'nowrap' }}>{coveragePct}%</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '44px 1fr 1fr 1fr 1fr 1fr 1fr 140px 64px',
      alignItems: 'center',
      gap: '0 20px',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 4,
        background: 'var(--bg-card)', border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
        color: 'var(--blue)', letterSpacing: '0.04em',
      }}>
        {holding.ticker}
      </div>

      {/* Shares */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--fg)' }}>{fmtShares(shares)}</div>

      {/* Avg Cost */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--fg)' }}>{fmt(holding.avg_cost)}</div>

      {/* Current */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--fg)' }}>{fmt(holding.current_price)}</div>

      {/* Weighted avg share value (call-adjusted) */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--fg)' }}>{fmt(wtdAvgValue)}</div>

      {/* Market Value */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--fg)' }}>
        {holding.market_value != null ? `$${Math.round(holding.market_value).toLocaleString()}` : '—'}
      </div>

      {/* Unrealized P&L */}
      <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: pnl != null ? (pnlPos ? 'var(--acid)' : 'var(--red)') : 'var(--fg-mute)' }}>
        {pnl != null
          ? `${pnlPos ? '+' : ''}$${Math.abs(Math.round(pnl)).toLocaleString()}${pnlPct != null ? ` (${pnlPct.toFixed(1)}%)` : ''}`
          : '—'}
      </div>

      {/* Call Coverage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--line)', borderRadius: 2, minWidth: 48 }}>
          <div style={{ height: '100%', width: `${coveragePct}%`, background: coveragePct === 100 ? 'var(--acid)' : 'var(--fg-mute)', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: coveragePct === 100 ? 'var(--acid)' : 'var(--fg-mute)', whiteSpace: 'nowrap' }}>
          {coveragePct}%
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onEdit} style={{ fontSize: 11, color: 'var(--fg-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
        <button onClick={onDelete} style={{ fontSize: 11, color: 'var(--fg-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
      </div>
    </div>
  )
}

// ── Edit holding modal ────────────────────────────────────────────────────────

function EditHoldingModal({ holding, onSave, onClose }) {
  const { apiFetch } = useAuth()
  const [shares, setShares] = useState(holding.shares != null ? String(holding.shares) : '')
  const [avgCost, setAvgCost] = useState(holding.avg_cost != null ? String(holding.avg_cost) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await apiFetch(`/api/holdings/${holding.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares: parseInt(shares), avg_cost: parseFloat(avgCost) }),
    })
    setSaving(false)
    onSave()
  }

  const field = 'px-3 py-2 text-sm font-mono border w-full focus:outline-none'
  const fStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="p-6 space-y-4 w-80" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Edit {holding.ticker} Holding</div>
        <div>
          <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Shares</label>
          <input type="number" className={field} style={fStyle} value={shares} onChange={e => setShares(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--muted)' }}>Avg Cost / Share</label>
          <input type="number" step="0.01" className={field} style={fStyle} value={avgCost} onChange={e => setAvgCost(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Position row (table + inline drawer) ──────────────────────────────────────

function statusFromPos(pos) {
  if (pos.dte <= 7) return { label: 'Urgent', color: 'var(--red)' }
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct > 0 && pos.distance_to_strike_pct <= 1.5)
    return { label: 'Urgent', color: 'var(--red)' }
  // Live mark missing (data provider down) — don't fake a "Take Profit" off a $0 price.
  if (pos.price_unavailable) return { label: 'Price unavailable', color: 'var(--muted)' }
  if (pos.delta != null && pos.delta > 0.35) return { label: 'Watch', color: 'var(--amber)' }
  if ((pos.profit_capture_pct || 0) >= 50) return { label: 'Take Profit', color: 'var(--green)' }
  if (pos.dte <= 21) return { label: 'Watch', color: 'var(--amber)' }
  return { label: 'On Track', color: 'var(--muted)' }
}

// Open Positions table — sortable columns. `get` returns the value each column
// sorts on (positions with no live price sink to the bottom rather than masquerade).
const STATUS_RANK = { 'Urgent': 0, 'Watch': 1, 'Take Profit': 2, 'On Track': 3, 'Price unavailable': 4 }
const POS_COLUMNS = [
  { label: 'Position',   key: 'strike',    get: p => p.strike ?? 0 },
  { label: 'Expiry',     key: 'expiry',    get: p => p.expiry || '' },
  { label: 'Contracts',  key: 'contracts', get: p => p.contracts ?? 0 },
  { label: 'P&L',        key: 'pnl',       get: p => (p.price_unavailable ? -Infinity : (p.pnl ?? -Infinity)) },
  { label: 'Theta Left', key: 'theta',     get: p => (p.price_unavailable ? -Infinity : (p.time_premium ?? 0) * 100 * (p.contracts || 0)) },
  { label: 'Delta',      key: 'delta',     get: p => p.delta ?? -Infinity },
  { label: 'Status',     key: 'status',    get: p => STATUS_RANK[statusFromPos(p).label] ?? 99 },
]

function sortPositions(list, { key, dir }) {
  const col = key && POS_COLUMNS.find(c => c.key === key)
  if (!col) return list
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const av = col.get(a), bv = col.get(b)
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sign
    return (av - bv) * sign
  })
}

function PositionRow({ pos, portfolios, currentPortfolioId, onClose, onDelete, onMove, onRollTo }) {
  const { apiFetch } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [closeMode, setCloseMode] = useState('bought_back')  // 'bought_back' | 'assigned'
  const [closePrice, setClosePrice] = useState('')
  const [contractsToClose, setContractsToClose] = useState(String(pos.contracts))
  const [moving, setMoving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContracts, setEditContracts] = useState(String(pos.contracts))
  const [editSellPrice, setEditSellPrice] = useState(String(pos.sell_price ?? ''))
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState(pos.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const action = getAction(pos)
  const pnlPos = (pos.pnl || 0) >= 0
  const otherPortfolios = portfolios.filter(p => p.id !== currentPortfolioId && !p.archived)
  const status = statusFromPos(pos)

  const rowBg = status.label === 'Urgent' ? 'rgba(248,113,113,0.06)'
    : status.label === 'Watch' ? 'rgba(255,176,32,0.03)'
    : 'transparent'

  async function doSaveNotes() {
    setNotesSaving(true)
    await apiFetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesDraft }),
    })
    setNotesSaving(false)
    setNotesOpen(false)
    onClose()
  }

  async function doClose() {
    const price = parseFloat(closePrice)
    const n = parseInt(contractsToClose, 10)
    if (isNaN(price) || price < 0) return
    if (isNaN(n) || n <= 0 || n > pos.contracts) return
    const r = n < pos.contracts
      ? await apiFetch(`/api/positions/${pos.id}/partial-close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contracts_to_close: n, close_price: price }),
        })
      : await apiFetch(`/api/positions/${pos.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'closed', close_price: price }),
        })
    if (!r.ok) {
      const detail = await r.json().catch(() => null)
      alert(`Couldn't close the position (${r.status}). ${detail?.detail || 'Is the backend up to date?'}`)
      return
    }
    setIsClosing(false)
    setClosePrice('')
    setContractsToClose(String(pos.contracts))
    onClose()
  }

  // Cash-secured put (shares put to you) vs covered call (shares called away).
  const isPut = /put/i.test(pos.harvest_category || '')
    || (!/call/i.test(pos.harvest_category || '') && /put/i.test(pos.type || ''))

  async function doAssign() {
    const n = parseInt(contractsToClose, 10)
    if (isNaN(n) || n <= 0 || n > pos.contracts) return
    const r = await apiFetch(`/api/positions/${pos.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: n }),
    })
    if (!r.ok) {
      const detail = await r.json().catch(() => null)
      alert(`Couldn't record the assignment (${r.status}). ${detail?.detail || 'Is the backend up to date?'}`)
      return
    }
    setIsClosing(false)
    setCloseMode('bought_back')
    setClosePrice('')
    setContractsToClose(String(pos.contracts))
    onClose()
  }

  async function doEdit() {
    const cts = parseInt(editContracts, 10)
    const sp  = parseFloat(editSellPrice)
    if (isNaN(cts) || cts <= 0 || isNaN(sp) || sp <= 0) return
    await apiFetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: cts, sell_price: sp }),
    })
    setIsEditing(false)
    onClose()  // onClose just triggers a refresh in the parent
  }

  async function doMove(portfolioId) {
    await apiFetch(`/api/positions/${pos.id}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolioId }),
    })
    setMoving(false)
    onMove()
  }

  return (
    <Fragment>
      {/* ── Table row ── */}
      <tr
        className="border-b cursor-pointer transition-colors"
        style={{ borderColor: 'var(--border)', backgroundColor: expanded ? 'rgba(255,255,255,0.02)' : rowBg }}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3 font-mono font-semibold text-xs">
          <span style={{ color: 'var(--blue)' }}>{pos.ticker}</span>
          <span className="ml-1.5" style={{ color: 'var(--text)' }}>${pos.strike}</span>
        </td>
        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--muted)' }}>
          {pos.expiry}
        </td>
        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text)' }}>
          {pos.contracts}
        </td>
        <td className="px-4 py-3">
          {pos.price_unavailable ? (
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>—</span>
          ) : (
            <span className="text-xs font-mono font-semibold" style={{ color: pnlPos ? 'var(--green)' : 'var(--red)' }}>
              {pnlPos ? '+' : ''}${pos.pnl?.toFixed(0) ?? '—'}
            </span>
          )}
        </td>
        {/* Theta remaining = total time value left to decay in your favor ($) */}
        <td className="px-4 py-3">
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--green)' }}>
            {!pos.price_unavailable && pos.time_premium != null
              ? `$${Math.round(pos.time_premium * 100 * (pos.contracts || 0)).toLocaleString()}`
              : '—'}
          </span>
        </td>
        {/* Delta — per-contract option delta, as a decimal */}
        <td className="px-4 py-3">
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: pos.delta == null ? 'var(--muted)' : pos.delta > 0.35 ? 'var(--red)' : pos.delta > 0.25 ? 'var(--amber)' : 'var(--text)' }}
          >
            {pos.delta != null ? pos.delta.toFixed(2) : '—'}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-[11px] px-2 py-0.5 font-medium"
            style={{ backgroundColor: status.color + '20', color: status.color, borderRadius: 'var(--radius-sm)' }}
          >
            {status.label}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-right" style={{ color: 'var(--muted)' }}>
          {expanded ? '▲' : '▼'}
        </td>
      </tr>

      {/* ── Inline drawer ── */}
      {expanded && (
        <tr>
          <td colSpan={8} className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}>
            <div className="px-5 py-4 space-y-4">

              {/* Detail stats */}
              <div className="flex flex-wrap gap-5 text-xs">
                {[
                  { label: 'Contracts', value: `${pos.contracts} × 100` },
                  { label: 'Sold At', value: `$${pos.sell_price?.toFixed(2)}` },
                  { label: 'Current Price', value: `$${pos.current_price?.toFixed(2) ?? '—'}`, subtitle: pos.pricing_stale ? `last close${pos.priced_as_of ? ` · ${pos.priced_as_of}` : ''} — market data not live yet` : undefined },
                  pos.time_premium != null ? { label: 'Time Value', value: `$${pos.time_premium.toFixed(2)}`, color: 'var(--green)' } : null,
                  pos.intrinsic_value != null ? { label: 'Intrinsic', value: `$${pos.intrinsic_value.toFixed(2)}`, color: pos.intrinsic_value > 0 ? 'var(--red)' : 'var(--muted)' } : null,
                  pos.early_exercise_risk && pos.early_exercise_risk !== 'NONE' ? { label: 'Exercise Risk', value: pos.early_exercise_risk, color: (pos.early_exercise_risk === 'CRITICAL' || pos.early_exercise_risk === 'HIGH') ? 'var(--red)' : pos.early_exercise_risk === 'MEDIUM' ? 'var(--amber)' : 'var(--muted)', subtitle: pos.early_exercise_risk === 'CRITICAL' ? `Dividend ($${(pos.upcoming_dividend ?? 0).toFixed(2)}) exceeds time value ($${(pos.time_premium ?? 0).toFixed(2)}) — early exercise very likely` : pos.early_exercise_risk === 'HIGH' ? `Time value only $${(pos.time_premium ?? 0).toFixed(2)} — buyer has little reason to wait` : pos.early_exercise_risk === 'MEDIUM' ? `Time value $${(pos.time_premium ?? 0).toFixed(2)} is thinning — monitor closely` : 'Low time premium remaining' } : null,
                  pos.days_until_ex_div != null && pos.days_until_ex_div >= 0 ? { label: 'Ex-Div', value: `${pos.next_ex_div_date} (${pos.days_until_ex_div}d)`, color: pos.days_until_ex_div <= 14 ? 'var(--amber)' : 'var(--muted)' } : null,
                  { label: '% of Max Income', value: `${pos.profit_capture_pct?.toFixed(1) ?? '—'}%`, color: (pos.profit_capture_pct || 0) >= 50 ? 'var(--green)' : 'var(--text)' },
                  { label: 'Assignment Risk (Δ)', value: pos.delta != null ? pos.delta.toFixed(2) : '—', color: (pos.delta || 0) > 0.35 ? 'var(--red)' : (pos.delta || 0) > 0.25 ? 'var(--amber)' : 'var(--text)' },
                  pos.distance_to_strike_pct != null ? { label: 'Distance to Strike', value: `${pos.distance_to_strike_pct.toFixed(2)}%`, color: (pos.distance_to_strike_pct || 99) <= 1.5 ? 'var(--red)' : 'var(--text)' } : null,
                  pos.open_interest != null ? { label: 'Open Interest', value: pos.open_interest.toLocaleString() } : null,
                ].filter(Boolean).map(f => (
                  <div key={f.label}>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
                    <div className="font-mono font-semibold" style={{ color: f.color || 'var(--text)' }}>{f.value}</div>
                    {f.subtitle && <div className="text-[10px] mt-0.5 leading-snug max-w-[180px]" style={{ color: 'var(--muted)' }}>{f.subtitle}</div>}
                  </div>
                ))}
              </div>

              {/* If-assigned tax preview: embedded gain/loss, term, wash-sale window */}
              {pos.assignment_preview && (() => {
                const ap = pos.assignment_preview
                const g = ap.stock_gain_if_assigned
                const money = v => (v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 }))
                const termLabel = ap.term === 'long' ? 'long-term' : ap.term === 'short' ? 'short-term' : ap.term === 'mixed' ? 'mixed-term' : ''
                const accent = !ap.basis_known ? 'var(--muted)' : ap.is_loss ? 'var(--amber)' : 'var(--green)'
                const cleanAlt = pos.ticker === 'SPY' ? ' A different-index fund (VTI/ITOT) sidesteps it; VOO/IVV are the common-but-grayer swap.' : ''
                return (
                  <div className="text-xs px-3 py-2.5" style={{ borderLeft: `2px solid ${accent}`, backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
                      If assigned at ${pos.strike}
                    </div>
                    {!ap.basis_known ? (
                      <div style={{ color: 'var(--muted)' }}>
                        No matching stock lot in this portfolio — add your {pos.ticker} shares to see the tax impact of an assignment.
                      </div>
                    ) : (
                      <>
                        <div className="font-mono font-semibold" style={{ color: g >= 0 ? 'var(--green)' : 'var(--amber)' }}>
                          {g >= 0 ? 'Taxable gain' : 'Taxable loss'} {money(g)}{termLabel ? ` · ${termLabel}` : ''}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
                          {ap.shares} sh × ${pos.strike} + premium = {money(ap.tax_proceeds_total)} proceeds vs {money(ap.cost_basis_total)} basis (FIFO)
                        </div>
                        {ap.is_loss && (
                          <div className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--amber)' }}>
                            ⚠ A loss starts a <strong>30-day wash-sale window</strong> — rebuying {pos.ticker} (or {pos.ticker} calls) within 30 days before/after disallows the loss, across all your accounts (an IRA rebuy disallows it permanently).{cleanAlt}
                          </div>
                        )}
                        {!ap.is_loss && ap.term === 'long' && (
                          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>
                            Long-term — taxed at lower rates. No wash-sale concern on a gain.
                          </div>
                        )}
                        {!ap.is_loss && ap.term === 'short' && (
                          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>
                            Short-term — taxed as ordinary income. Holding past one year would qualify for lower long-term rates.
                          </div>
                        )}
                        {!ap.covered && (
                          <div className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                            Only {ap.shares_available} of {ap.shares} covered shares are tracked here — basis covers what's tracked.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}

              {/* Action card (close / wait / roll) */}
              {action && <TaxAwareActionCard pos={pos} action={action} onRollTo={onRollTo} />}

              {/* Notes */}
              <div>
                {notesOpen ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      rows={2} value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
                      placeholder="Add notes about this position…"
                      className="w-full max-w-md px-3 py-2 text-xs border resize-none focus:outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    />
                    <div className="flex gap-2">
                      <button onClick={doSaveNotes} disabled={notesSaving}
                        className="text-xs px-2 py-0.5 border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                        {notesSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => { setNotesOpen(false); setNotesDraft(pos.notes || '') }}
                        className="text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {pos.notes && <p className="text-xs" style={{ color: 'var(--muted)' }}>{pos.notes}</p>}
                    <button onClick={e => { e.stopPropagation(); setNotesOpen(true) }}
                      className="text-xs hover:underline shrink-0" style={{ color: 'var(--blue)' }}>
                      {pos.notes ? 'Edit note' : '+ Add note'}
                    </button>
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                {isClosing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* How did this close? Bought back (you pay to close) vs Assigned (shares move) */}
                    <select
                      value={closeMode}
                      onChange={e => setCloseMode(e.target.value)}
                      className="px-2 py-1 text-xs border focus:outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      title="How did this position close?"
                    >
                      <option value="bought_back">Bought back</option>
                      <option value="assigned">Assigned</option>
                    </select>
                    <input
                      type="number" min="1" max={pos.contracts} step="1"
                      value={contractsToClose}
                      onChange={e => setContractsToClose(e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      title={`Contracts (max ${pos.contracts})`}
                    />
                    {closeMode === 'bought_back' ? (
                      <>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>of {pos.contracts} @ buy-back</span>
                        <input
                          type="number" step="0.01" min="0" placeholder="price" value={closePrice}
                          onChange={e => setClosePrice(e.target.value)}
                          className="w-24 px-2 py-1 text-xs font-mono border focus:outline-none"
                          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        />
                        <button onClick={doClose} className="text-xs" style={{ color: 'var(--green)' }}>✓ Confirm</button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          of {pos.contracts} → {(parseInt(contractsToClose, 10) || 0) * 100} shares{' '}
                          {isPut ? 'put to you' : 'called away'} @ ${pos.strike}
                        </span>
                        <button onClick={doAssign} className="text-xs" style={{ color: 'var(--amber)' }}>✓ Confirm assignment</button>
                      </>
                    )}
                    <button onClick={() => { setIsClosing(false); setCloseMode('bought_back'); setContractsToClose(String(pos.contracts)); setClosePrice('') }}
                      className="text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setIsClosing(true) }}
                    className="text-xs hover:underline" style={{ color: 'var(--amber)' }}>
                    Close position
                  </button>
                )}

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="number" min="1" step="1" value={editContracts}
                      onChange={e => setEditContracts(e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none" placeholder="contracts"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                    <input type="number" min="0.01" step="0.01" value={editSellPrice}
                      onChange={e => setEditSellPrice(e.target.value)}
                      className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none" placeholder="sold at"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                    <button onClick={doEdit} className="text-xs px-2 py-0.5 border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>Save</button>
                    <button onClick={() => { setIsEditing(false); setEditContracts(String(pos.contracts)); setEditSellPrice(String(pos.sell_price ?? '')) }}
                      className="text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setIsEditing(true) }}
                    className="text-xs hover:underline" style={{ color: 'var(--blue)' }}>Edit position</button>
                )}

                {otherPortfolios.length > 0 && (
                  moving ? (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>Move to:</span>
                      {otherPortfolios.map(p => (
                        <button key={p.id} onClick={() => doMove(p.id)}
                          className="text-xs px-2 py-0.5 border" style={{ borderColor: 'var(--border)', color: 'var(--blue)' }}>
                          {p.name}
                        </button>
                      ))}
                      <button onClick={() => setMoving(false)} className="text-xs" style={{ color: 'var(--muted)' }}>✗</button>
                    </div>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setMoving(true) }}
                      className="text-xs hover:underline" style={{ color: 'var(--blue)' }}>Move to…</button>
                  )
                )}

                <button onClick={() => { if (confirm('Remove this position?')) onDelete(pos.id) }}
                  className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>Remove</button>
              </div>

            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// ── Scorecard ─────────────────────────────────────────────────────────────────

function ScorecardView() {
  const { apiFetch } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/api/scorecard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Could not load scorecard.'); setLoading(false) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading scorecard…</div>
  if (error)   return <div className="py-12 text-center text-sm" style={{ color: 'var(--red)' }}>{error}</div>
  if (!data)   return null

  const adherenceColor = data.adherence_rate >= 70 ? 'var(--green)' : data.adherence_rate >= 40 ? 'var(--amber)' : 'var(--red)'
  const signalColor    = data.avg_signal_score_at_open >= 8 ? 'var(--green)' : data.avg_signal_score_at_open >= 5 ? 'var(--amber)' : 'var(--red)'

  return (
    <div className="space-y-6">

      {data.collecting && (
        <div className="px-4 py-3 border text-xs" style={{ borderColor: 'var(--amber)', color: 'var(--amber)', backgroundColor: 'rgba(255,176,32,0.06)' }}>
          Data collecting since first screener run — scorecard accuracy improves after 10+ recommendation batches.
          Currently {data.log_entries} batch{data.log_entries !== 1 ? 'es' : ''} recorded.
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Adherence Rate',            value: `${data.adherence_rate}%`,        color: adherenceColor,    sub: `${data.total_acted_on} of ${data.total_open_now_recommendations} signals acted on` },
          { label: 'Avg Signal When Opened',    value: `${data.avg_signal_score_at_open}/14`, color: signalColor,  sub: `${data.positions_with_signal_data} positions with signal data` },
          { label: 'Actual Income Banked',      value: `${data.actual_realized_pnl >= 0 ? '+' : ''}$${Math.abs(data.actual_realized_pnl).toLocaleString()}`, color: data.actual_realized_pnl >= 0 ? 'var(--green)' : 'var(--red)', sub: 'from closed positions' },
          { label: 'Income Left on the Table',  value: `~$${data.hypothetical_missed_pnl.toLocaleString()}`, color: 'var(--amber)', sub: '"Good Time to Open" signals not followed (50% capture est.)' },
        ].map(s => (
          <div key={s.label} className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: s.color, minWidth: 0, overflowWrap: 'break-word' }}>{s.value}</div>
            {s.sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Behavioral feedback */}
      {data.feedback.length > 0 && (
        <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Behavioral Feedback</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            {data.feedback.map((f, i) => (
              <div key={i} className="flex items-start gap-3 text-sm" style={{ color: 'var(--text)' }}>
                <span style={{ color: 'var(--amber)' }}>→</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent recommendation log */}
      <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent Recommendation Log</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Last 20 screener runs — ✓ = position opened from this batch</p>
        </div>
        {(data.recent_log || []).length === 0 ? (
          <div className="px-5 py-8 text-center space-y-2">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No feedback recorded yet. Use the "This doesn't make sense" button on any recommendation to start logging.
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Run the screener to also start building recommendation history.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  {['Date', 'Signal', 'Score', 'Top Strike', 'Expiry', 'Recommendation', 'Acted On'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(data.recent_log || [])].reverse().map(batch => {
                  const top = batch.recommendations?.[0]
                  const acted = batch.acted_on?.length > 0
                  const regimeColor = batch.regime === 'SELL PREMIUM' ? 'var(--green)' : batch.regime === 'HOLD' ? 'var(--amber)' : batch.regime === 'CAUTION' ? 'var(--orange)' : 'var(--red)'
                  const regimeDisplayLabel = batch.regime === 'SELL PREMIUM' ? 'Good Time to Open' : batch.regime === 'HOLD' ? 'Hold' : batch.regime === 'CAUTION' ? 'Be Careful' : batch.regime === 'AVOID' ? 'Not a Good Time' : (batch.regime || '—')
                  return (
                    <tr key={batch.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{batch.timestamp?.slice(0, 16).replace('T', ' ')}</td>
                      <td className="px-4 py-2" style={{ color: regimeColor }}>{regimeDisplayLabel}</td>
                      <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{batch.total_score ?? '—'}/14</td>
                      <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{top ? `$${top.strike}` : '—'}</td>
                      <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{top?.expiry ?? '—'}</td>
                      <td className="px-4 py-2" style={{ color: top?.recommendation === 'OPEN NOW' ? 'var(--green)' : 'var(--muted)' }}>{top?.recommendation ?? '—'}</td>
                      <td className="px-4 py-2" style={{ color: acted ? 'var(--green)' : 'var(--muted)' }}>{acted ? '✓' : '✗'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Portfolios component ─────────────────────────────────────────────────

export default function Portfolios({ positions, portfolios, holdings, dashData, signalData, onRefresh, userTier, onUpgrade }) {
  const { apiFetch } = useAuth()
  const isMobile = useIsMobile()
  const active = portfolios.filter(p => !p.archived)
  const archived = portfolios.filter(p => p.archived)

  const [selectedId, setSelectedId] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [rollPrefill, setRollPrefill] = useState(null)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showConnectBrokerage, setShowConnectBrokerage] = useState(false)
  const [brokerageSyncOnly, setBrokerageSyncOnly] = useState(false)
  const [collapsedBrokers, setCollapsedBrokers] = useState({})
  const [posSort, setPosSort] = useState({ key: null, dir: 'asc' })   // Open Positions sort

  // "Roll to this" handler — pre-fills the close form on the current position
  // and opens AddPosition with the new scenario's strike/expiry/mid
  function handleRollTo({ pos, scenario }) {
    setRollPrefill({
      ticker: pos.ticker,
      strike: String(scenario.new_strike),
      expiry: scenario.new_expiry,
      contracts: pos.contracts,
      sell_price: scenario.new_mid != null ? scenario.new_mid.toFixed(2) : '',
    })
    setShowAddPosition(true)
  }

  // Auto-select first portfolio on load
  useEffect(() => {
    if (!selectedId && active.length > 0) {
      setSelectedId(active[0].id)
    }
  }, [portfolios])

  // Assigned-shares history for the selected portfolio. Refetches when positions change
  // (e.g. right after an assignment closes a position via onRefresh).
  const [assignments, setAssignments] = useState([])
  useEffect(() => {
    if (!selectedId) { setAssignments([]); return }
    let cancelled = false
    apiFetch(`/api/assignments?portfolio_id=${selectedId}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (!cancelled) setAssignments(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setAssignments([]) })
    return () => { cancelled = true }
  }, [selectedId, positions])

  const selected = portfolios.find(p => p.id === selectedId)
  const myPositions = positions.filter(p => p.portfolio_id === selectedId)
  const myHoldings  = holdings.filter(h => h.portfolio_id === selectedId)
  const openPos  = myPositions.filter(p => p.status === 'open')
  const sortedOpenPos = sortPositions(openPos, posSort)
  const closedPos = myPositions.filter(p => p.status === 'closed')

  // Covered shares per ticker, plus per-strike lots for weighted-average value math
  const coveredByTicker = {}
  const ccLotsByTicker = {}
  for (const p of openPos) {
    coveredByTicker[p.ticker] = (coveredByTicker[p.ticker] || 0) + p.contracts * 100
    if (!ccLotsByTicker[p.ticker]) ccLotsByTicker[p.ticker] = []
    ccLotsByTicker[p.ticker].push({ strike: p.strike, shares: (p.contracts || 0) * 100 })
  }

  // Income Earned = net premium kept across the whole portfolio: what we sold for,
  // less what we paid to buy back, × 100 × contracts. Open positions have no buy-back
  // yet (close_price null) so their full premium counts; closed positions net out.
  const totalIncome = myPositions.reduce(
    (s, p) => s + ((p.sell_price || 0) - (p.close_price || 0)) * 100 * (p.contracts || 0),
    0
  )
  const totalPnl     = openPos.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture   = openPos.length ? openPos.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / openPos.length : 0

  // Open positions summary stats (for header strip)
  const _totalShares   = myHoldings.reduce((s, h) => s + (h.shares || 0), 0)

  const _costToClose   = openPos.reduce((s, p) => s + (p.current_price || 0) * (p.contracts || 0) * 100, 0)
  const _availCts      = Math.floor(_totalShares / 100)
  const _concBase      = _availCts > 0 ? _availCts : openPos.reduce((s, p) => s + (p.contracts || 0), 0)
  const _concWarns     = []
  if (_concBase > 0 && openPos.length > 0) {
    const bySk = {}, byEx = {}
    for (const p of openPos) {
      const sk = String(p.strike)
      bySk[sk] = (bySk[sk] || 0) + (p.contracts || 0)
      byEx[p.expiry] = (byEx[p.expiry] || 0) + (p.contracts || 0)
    }
    for (const [k, c] of Object.entries(bySk))
      if (c / _concBase >= 0.30) _concWarns.push(`$${k} ${Math.round(c / _concBase * 100)}%`)
    for (const [k, c] of Object.entries(byEx))
      if (c / _concBase >= 0.30) _concWarns.push(`${k} ${Math.round(c / _concBase * 100)}%`)
  }

  async function createPortfolio() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const res = await apiFetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json()
      setNewName('')
      setShowNewForm(false)
      await onRefresh()
      setSelectedId(created.id)
    }
    setCreating(false)
  }

  async function deletePortfolio(id) {
    if (!confirm('Delete this portfolio? Closed positions will move to Default.')) return
    const res = await apiFetch(`/api/portfolios/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.detail)
      return
    }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function archivePortfolio(id) {
    const res = await apiFetch(`/api/portfolios/${id}/archive`, { method: 'PUT' })
    if (!res.ok) { const err = await res.json(); alert(err.detail); return }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function unarchivePortfolio(id) {
    await apiFetch(`/api/portfolios/${id}/unarchive`, { method: 'PUT' })
    onRefresh()
  }

  async function toggleStar(id, starred) {
    await apiFetch(`/api/portfolios/${id}/star`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred }),
    })
    onRefresh()
  }

  async function renamePortfolio(id, name) {
    const res = await apiFetch(`/api/portfolios/${id}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) { const err = await res.json(); alert(err.detail); return }
    onRefresh()
  }

  async function deletePosition(id) {
    await apiFetch(`/api/positions/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  async function deleteHolding(id) {
    if (!confirm('Remove this holding?')) return
    await apiFetch(`/api/holdings/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-[70vh]">

      {/* ── Mobile: portfolio picker dropdown (replaces the sidebar) ─── */}
      <div className="md:hidden">
        <div className="flex items-center gap-2">
          <select
            value={selectedId ?? '__all__'}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', minWidth: 0 }}
          >
            <option value="__all__">All Portfolios</option>
            <option value="__scorecard__">Scorecard</option>
            {(() => {
              const starred = active.filter(p => p.starred)
              const custom = active.filter(p => !p.brokerage_connection_id && !p.starred)
              const brokerage = active.filter(p => p.brokerage_connection_id)
              const groups = {}
              for (const p of brokerage) {
                const k = p.brokerage_name || 'Connected Brokerage'
                ;(groups[k] = groups[k] || []).push(p)
              }
              return (
                <Fragment>
                  {starred.length > 0 && (
                    <optgroup label="★ Starred">
                      {starred.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {custom.length > 0 && (
                    <optgroup label="My Portfolios">
                      {custom.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {Object.entries(groups).map(([name, items]) => (
                    <optgroup key={name} label={name}>
                      {items.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  ))}
                  {archived.length > 0 && (
                    <optgroup label="Archived">
                      {archived.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                </Fragment>
              )
            })()}
          </select>
          <button onClick={() => setShowNewForm(s => !s)}
            className="text-xs px-3 py-2 border shrink-0" style={{ borderColor: 'var(--gold)', color: 'var(--gold)', borderRadius: 'var(--radius-sm)' }}>
            + New
          </button>
        </div>
        {showNewForm && (
          <div className="flex gap-1 mt-2">
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPortfolio()}
              placeholder="Portfolio name"
              className="flex-1 px-2 py-1.5 text-sm border focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)', minWidth: 0 }}
            />
            <button onClick={createPortfolio} disabled={creating} className="text-sm px-3" style={{ color: 'var(--gold)' }}>{creating ? '…' : '✓'}</button>
            <button onClick={() => { setShowNewForm(false); setNewName('') }} className="text-sm px-3" style={{ color: 'var(--muted)' }}>✗</button>
          </div>
        )}
      </div>

      {/* ── Left sidebar: portfolio list (desktop) ───────────── */}
      <div className="w-60 shrink-0 hidden md:block">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>Portfolios</span>
          <button onClick={() => setShowNewForm(s => !s)}
            className="text-xs px-2 py-1 border" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            + New
          </button>
        </div>

        {/* New portfolio input */}
        {showNewForm && (
          <div className="flex gap-1 mb-2">
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPortfolio()}
              placeholder="Portfolio name"
              className="flex-1 px-2 py-1 text-xs border focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <button onClick={createPortfolio} disabled={creating}
              className="text-xs px-2" style={{ color: 'var(--gold)' }}>
              {creating ? '…' : '✓'}
            </button>
            <button onClick={() => { setShowNewForm(false); setNewName('') }}
              className="text-xs px-2" style={{ color: 'var(--muted)' }}>✗</button>
          </div>
        )}

        {/* All Portfolios aggregate tab */}
        <button
          onClick={() => setSelectedId('__all__')}
          className="w-full text-left px-4 py-2.5 text-sm border-l-2"
          style={{
            borderLeftColor: selectedId === '__all__' ? 'var(--gold)' : 'transparent',
            color: selectedId === '__all__' ? 'var(--text)' : 'var(--muted)',
            backgroundColor: selectedId === '__all__' ? 'var(--gold-dim)' : 'transparent',
          }}
        >
          All Portfolios
        </button>

        {/* Scorecard tab */}
        <button
          onClick={() => setSelectedId('__scorecard__')}
          className="w-full text-left px-4 py-2.5 text-sm border-l-2 mb-2"
          style={{
            borderLeftColor: selectedId === '__scorecard__' ? 'var(--blue)' : 'transparent',
            color: selectedId === '__scorecard__' ? 'var(--text)' : 'var(--muted)',
            backgroundColor: selectedId === '__scorecard__' ? 'rgba(74,158,255,0.06)' : 'transparent',
          }}
        >
          Scorecard
        </button>

        {/* ── Starred ──────────────────────────────────────────── */}
        {(() => {
          const starred = active.filter(p => p.starred)
          if (!starred.length) return null
          return (
            <div className="mb-1">
              <div className="px-4 pt-1 pb-0.5 text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--gold)' }}>★ Starred</div>
              {starred.map(p => (
                <PortfolioTab key={p.id} portfolio={p} active={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  onStar={s => toggleStar(p.id, s)}
                  onRename={name => renamePortfolio(p.id, name)}
                  onArchive={() => archivePortfolio(p.id)}
                  onDelete={() => deletePortfolio(p.id)}
                />
              ))}
            </div>
          )
        })()}

        {/* ── Custom (non-brokerage) portfolios ────────────────── */}
        {(() => {
          const custom = active.filter(p => !p.brokerage_connection_id && !p.starred)
          if (!custom.length) return null
          return (
            <div className="mb-1">
              <div className="px-4 pt-1 pb-0.5 text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>My Portfolios</div>
              {custom.map(p => (
                <PortfolioTab key={p.id} portfolio={p} active={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  onStar={s => toggleStar(p.id, s)}
                  onRename={name => renamePortfolio(p.id, name)}
                  onArchive={() => archivePortfolio(p.id)}
                  onDelete={() => deletePortfolio(p.id)}
                />
              ))}
            </div>
          )
        })()}

        {/* ── Brokerage folders ─────────────────────────────────── */}
        {(() => {
          const brokerageItems = active.filter(p => p.brokerage_connection_id)
          if (!brokerageItems.length) return null
          // Group by brokerage_name
          const groups = {}
          for (const p of brokerageItems) {
            const key = p.brokerage_name || 'Connected Brokerage'
            if (!groups[key]) groups[key] = []
            groups[key].push(p)
          }
          return (
            <div className="mb-1">
              <div className="px-4 pt-1 pb-0.5 text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>Brokerages</div>
              {Object.entries(groups).map(([brokerageName, items]) => {
                const collapsed = collapsedBrokers[brokerageName]
                return (
                  <div key={brokerageName}>
                    {/* Folder header */}
                    <button
                      onClick={() => setCollapsedBrokers(prev => ({ ...prev, [brokerageName]: !prev[brokerageName] }))}
                      className="w-full text-left px-4 py-2 flex items-center gap-1.5"
                      style={{ color: 'var(--text)' }}
                    >
                      <span style={{ fontSize: 9, color: 'var(--muted)' }}>{collapsed ? '▶' : '▼'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{brokerageName}</span>
                      <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>{items.length}</span>
                    </button>
                    {/* Sub-portfolios */}
                    {!collapsed && items.map(p => (
                      <PortfolioTab key={p.id} portfolio={p} active={selectedId === p.id} indent
                        onClick={() => setSelectedId(p.id)}
                        onStar={s => toggleStar(p.id, s)}
                        onRename={name => renamePortfolio(p.id, name)}
                        onArchive={() => archivePortfolio(p.id)}
                        onDelete={() => deletePortfolio(p.id)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Archived toggle */}
        {archived.length > 0 && (
          <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setShowArchived(s => !s)}
              className="text-xs w-full text-left px-4 py-1" style={{ color: 'var(--muted)' }}>
              {showArchived ? '▲' : '▶'} Archived ({archived.length})
            </button>
            {showArchived && archived.map(p => (
              <div key={p.id} className="group relative opacity-50 hover:opacity-80">
                <PortfolioTab portfolio={p} active={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                  onStar={s => toggleStar(p.id, s)}
                  onRename={name => renamePortfolio(p.id, name)}
                  onArchive={() => {}}
                  onDelete={() => deletePortfolio(p.id)}
                />
                <div className="absolute right-1 top-1.5 hidden group-hover:flex">
                  <button onClick={() => unarchivePortfolio(p.id)} title="Restore"
                    className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--muted)', background: 'var(--bg-card)' }}>↑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: selected portfolio detail ────────────── */}
      <div className="flex-1 space-y-6 min-w-0">
        {selectedId === '__all__' ? (
          <AllPortfoliosView positions={positions} portfolios={portfolios} holdings={holdings} />
        ) : selectedId === '__scorecard__' ? (
          <ScorecardView />
        ) : !selected ? (
          <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div className="px-6 py-12 text-center space-y-4 max-w-md mx-auto">
              <div className="text-2xl">🌾</div>
              <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>Let's set up your first portfolio</div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                You'll need: your share count and any options you've already sold (if any).
              </p>
              <button
                onClick={() => setShowNewForm(true)}
                className="text-sm px-4 py-2 border transition-colors"
                style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}
              >
                Create portfolio →
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Portfolio header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{selected.name}</h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Created {selected.created_date}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setBrokerageSyncOnly(true); setShowConnectBrokerage(true) }}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
                  ↻ Refresh holdings
                </button>
                <button
                  onClick={() => { setBrokerageSyncOnly(false); setShowConnectBrokerage(true) }}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--fg-mute)' }}>
                  + Connect Brokerage
                </button>
                <button onClick={() => setShowAddHolding(s => !s)}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--blue)', color: 'var(--blue)', backgroundColor: showAddHolding ? 'rgba(74,158,255,0.1)' : 'transparent' }}>
                  {showAddHolding ? '✕ Cancel' : '+ Add Holding'}
                </button>
                <button onClick={() => { setShowAddPosition(s => !s); if (showAddPosition) setRollPrefill(null) }}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: showAddPosition ? 'var(--gold-dim)' : 'transparent' }}>
                  {showAddPosition ? '✕ Cancel' : '+ Add Position'}
                </button>
              </div>
            </div>

            {/* Inline forms */}
            {showAddHolding && (
              <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="text-xs uppercase tracking-wider mb-3 font-mono" style={{ color: 'var(--muted)' }}>Add Stock Holding</div>
                <AddHolding portfolioId={selectedId} onAdded={() => { setShowAddHolding(false); onRefresh() }} />
              </div>
            )}
            {showAddPosition && (
              <div className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="text-xs uppercase tracking-wider mb-3 font-mono" style={{ color: rollPrefill ? 'var(--blue)' : 'var(--muted)' }}>{rollPrefill ? 'Roll — New Position' : 'Add Position'}</div>
                <AddPosition portfolioId={selectedId} holdings={myHoldings} prefill={rollPrefill} onAdded={() => { setShowAddPosition(false); setRollPrefill(null); onRefresh() }} />
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Open Positions',          value: String(openPos.length),                                       color: 'var(--text)' },
                { label: 'Income Earned',            value: `$${Math.round(totalIncome).toLocaleString()}`,               color: 'var(--green)' },
                { label: 'Unrealized P&L',           value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: '% of Max Income Collected', value: `${avgCapture.toFixed(1)}%`,                                  color: 'var(--amber)' },
              ].map(s => (
                <div key={s.label} className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
                  <div className="text-3xl font-bold font-mono" style={{ color: s.color, minWidth: 0, overflowWrap: 'break-word' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* ── Holdings ─────────────────────────────────────── */}
            <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Stock Holdings</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Shares owned that are covered by your calls</p>
                </div>
              </div>
              {myHoldings.length === 0 ? (
                <div className="px-5 py-8 text-center space-y-2">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    No holdings recorded yet. Add your shares to unlock call coverage tracking and position sizing.
                  </p>
                  <button
                    onClick={() => setShowAddHolding(true)}
                    className="text-xs px-3 py-1.5 border transition-colors"
                    style={{ borderColor: 'var(--blue)', color: 'var(--blue)', backgroundColor: 'rgba(74,158,255,0.08)', borderRadius: 'var(--radius-sm)' }}
                  >
                    + Add Holding →
                  </button>
                </div>
              ) : (
                <div style={{ padding: '0 20px' }}>
                 {/* Desktop: dense grid scrolls sideways in its track. Mobile: HoldingRow renders full-width cards (no scroll). */}
                 <div className={isMobile ? undefined : 'h-scroll-x'}>
                  <div style={{ minWidth: isMobile ? undefined : 760 }}>
                  {/* Column headers — hidden on mobile (cards carry their own labels) */}
                  <div style={{
                    display: isMobile ? 'none' : 'grid',
                    gridTemplateColumns: '44px 1fr 1fr 1fr 1fr 1fr 1fr 140px 64px',
                    gap: '0 20px',
                    padding: '8px 0 4px',
                    borderBottom: '1px solid var(--line)',
                  }}>
                    {[
                      { label: '' },
                      { label: 'Shares' },
                      { label: 'Avg Cost' },
                      { label: 'Current' },
                      { label: 'Wtd Avg Value', title: 'Average value per share after accounting for your calls. Covered shares are capped at their call strike (the lower of current price or strike); uncovered shares are valued at the current price.' },
                      { label: 'Mkt Value' },
                      { label: 'Unreal. P&L' },
                      { label: 'Call Coverage' },
                      { label: '' },
                    ].map((col, i) => (
                      <div key={i} title={col.title} style={{ fontSize: 10, color: 'var(--fg-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--mono)', cursor: col.title ? 'help' : undefined }}>
                        {col.label}
                      </div>
                    ))}
                  </div>
                  {myHoldings.map(h => (
                    <HoldingRow
                      key={h.id}
                      holding={h}
                      coveredShares={coveredByTicker[h.ticker] || 0}
                      ccLots={ccLotsByTicker[h.ticker] || []}
                      onDelete={() => deleteHolding(h.id)}
                      onEdit={() => setEditingHolding(h)}
                    />
                  ))}
                  </div>
                 </div>
                </div>
              )}
            </div>

            {/* ── Free tier limit banner ──────────────────────────── */}
            {userTier === 'free' && positions.length >= 3 && (
              <PositionLimitBanner onUpgrade={() => onUpgrade?.('You\'ve hit the 3-position limit on the free tier.')} />
            )}

            {/* ── Open Positions ────────────────────────────────── */}
            <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div className="px-5 py-3 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold shrink-0" style={{ color: 'var(--text)' }}>Open Positions</h2>
                <div className="flex items-center gap-x-4 text-xs font-mono" style={{ color: 'var(--muted)' }}>
                  {_costToClose > 0 && (
                    <span>${_costToClose.toLocaleString(undefined, { maximumFractionDigits: 0 })} to close</span>
                  )}
                </div>
              </div>
              {openPos.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-4">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    You don't have any open positions yet.
                  </p>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button
                      className="text-xs px-4 py-2 border transition-colors"
                      style={{ borderColor: 'var(--gold)', color: 'var(--gold)', backgroundColor: 'var(--gold-dim)', borderRadius: 'var(--radius-md)' }}
                      onClick={() => setShowAddPosition(true)}
                    >
                      + Add position manually
                    </button>
                    <button
                      className="text-xs px-4 py-2 border transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--fg-mute)', borderRadius: 'var(--radius-md)' }}
                      onClick={() => setShowConnectBrokerage(true)}
                    >
                      ↓ Import from brokerage
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                        {POS_COLUMNS.map(col => {
                          const active = posSort.key === col.key
                          return (
                            <th
                              key={col.key}
                              onClick={() => setPosSort(s => s.key === col.key
                                ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                                : { key: col.key, dir: 'asc' })}
                              className="px-4 py-2.5 text-left font-normal text-[11px] uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-[var(--text)] transition-colors"
                              style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
                            >
                              {col.label}{active && <span style={{ color: 'var(--blue)' }}>{posSort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                            </th>
                          )
                        })}
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOpenPos.map(pos => (
                        <PositionRow
                          key={pos.id} pos={pos}
                          portfolios={portfolios}
                          currentPortfolioId={selectedId}
                          onClose={onRefresh}
                          onDelete={deletePosition}
                          onMove={onRefresh}
                          onRollTo={handleRollTo}
                        />
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => setShowAddPosition(true)} className="text-xs" style={{ color: 'var(--gold)' }}>
                      + Add Position
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Closed Positions ──────────────────────────────── */}
            {closedPos.length > 0 && (
              <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Closed Positions</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                        {['Strike','Expiry','Contracts','Sold At','Closed At','How','Final P&L','Date',''].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closedPos.map(p => (
                        <tr key={p.id} className="border-b opacity-60 hover:opacity-100 transition-opacity" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${p.strike}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{p.expiry}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{p.contracts}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${p.sell_price?.toFixed(2)}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${p.close_price?.toFixed(2) ?? '—'}</td>
                          <td className="px-4 py-2">
                            {(() => {
                              const reason = p.close_reason || 'bought_back'
                              const label = { assigned: 'Assigned', bought_back: 'Bought back', expired: 'Expired', rolled: 'Rolled' }[reason] || 'Bought back'
                              const color = reason === 'assigned' ? 'var(--amber)' : 'var(--muted)'
                              return (
                                <span className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: color + '20', color, borderRadius: 'var(--radius-sm)' }}>
                                  {label}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-2 font-semibold" style={{ color: (p.final_pnl||0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {(p.final_pnl||0) >= 0 ? '+' : ''}${p.final_pnl?.toFixed(2) ?? '—'}
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{p.close_date ?? '—'}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/positions/${p.id}/reopen`, { method: 'PUT' })
                                onRefresh()
                              }}
                              className="text-xs hover:underline"
                              style={{ color: 'var(--muted)' }}
                            >
                              Reopen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Assigned Shares ────────────────────────────────── */}
            {assignments.length > 0 && (
              <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Assigned Shares</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    Shares that moved when an option was assigned — with the cost basis you'll need at tax time.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                        {['Date','Ticker','Event','Shares','Strike','Cost Basis','Proceeds (tax)','Realized Gain','Term'].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(a => {
                        const called = a.direction === 'called_away'
                        const gain = a.realized_gain
                        const money = v => (v == null ? null : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                        return (
                          <tr key={a.id} className="border-b hover:opacity-100 transition-opacity" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{a.assignment_date}</td>
                            <td className="px-4 py-2 font-semibold" style={{ color: 'var(--blue)' }}>{a.ticker}</td>
                            <td className="px-4 py-2">
                              <span className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: 'var(--amber)20', color: 'var(--amber)', borderRadius: 'var(--radius-sm)' }}>
                                {called ? 'Called away' : 'Put to you'}
                              </span>
                            </td>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{a.shares}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${a.strike}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                              {a.basis_known === false
                                ? <span title="No matching stock holding found — add the lot to record its basis." style={{ color: 'var(--amber)' }}>unknown</span>
                                : (money(a.cost_basis_total) ?? '—')}
                            </td>
                            <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                              {called ? (money(a.tax_proceeds_total) ?? '—') : <span style={{ color: 'var(--muted)' }}>— acquired</span>}
                            </td>
                            <td className="px-4 py-2 font-semibold" style={{ color: gain == null ? 'var(--muted)' : gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {gain == null ? '—' : (gain >= 0 ? '+' : '') + money(gain)}
                            </td>
                            <td className="px-4 py-2">
                              {a.term
                                ? <span className="text-[10px] px-1.5 py-0.5" style={{ backgroundColor: 'var(--border)', color: 'var(--muted)', borderRadius: 'var(--radius-sm)' }}>
                                    {a.term === 'long' ? 'Long-term' : a.term === 'short' ? 'Short-term' : 'Mixed'}
                                  </span>
                                : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t text-[11px] leading-relaxed" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>Tax basis:</strong> For called-away shares, proceeds include the option
                  premium added to the strike (IRS), and basis is relieved oldest-lot-first (FIFO). For shares put to you,
                  the premium reduces the new shares' cost basis. Not tax advice — confirm with your broker's 1099-B.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit holding modal */}
      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          onSave={() => { setEditingHolding(null); onRefresh() }}
          onClose={() => setEditingHolding(null)}
        />
      )}

      {showConnectBrokerage && (
        <ConnectBrokerage
          syncOnly={brokerageSyncOnly}
          onClose={() => setShowConnectBrokerage(false)}
          onImported={() => { setShowConnectBrokerage(false); onRefresh() }}
        />
      )}
    </div>
  )
}
