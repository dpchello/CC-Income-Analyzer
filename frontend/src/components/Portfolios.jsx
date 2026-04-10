import { useState, useEffect, Fragment } from 'react'
import AddPosition from './AddPosition.jsx'
import AddHolding from './AddHolding.jsx'
import { Term } from './Tooltip.jsx'

// ── Alert definitions ─────────────────────────────────────────────────────────

const ALERT_DEFS = {
  TAKE_PROFIT:    { icon: '💰', label: 'Lock In Profits',              color: 'var(--green)', title: '50% of Max Income Already Captured',           explain: "You've already earned 50% or more of the maximum income this trade could generate. Closing here frees up your shares for the next trade sooner and avoids the riskier final weeks before expiry.", action: 'Buy back this call at market and open a new position at a later expiry.' },
  ROLL_WARNING:   { icon: '⏰', label: 'Time to Renew',                 color: 'var(--amber)', title: '21 Days Until Expiry — High-Sensitivity Zone', explain: 'With 21 days or fewer until expiry, small stock price moves start causing larger, faster changes in your option price. This is a good time to close this position and open a fresh one further out.', action: 'Close this position and sell a new call at the same or higher strike, targeting 30–45 days until expiry.' },
  GAMMA_DANGER:   { icon: '🔥', label: 'Expiring Soon — Act Now',      color: 'var(--red)',   title: 'Expires in 7 Days or Fewer',                   explain: 'This option expires very soon. In the final week, a 1% move in the stock can cause an outsized swing in your option price with very little time to react or recover.', action: 'Close or roll to a later date immediately.' },
  STRIKE_BREACH:  { icon: '🚨', label: 'Strike Price at Risk',         color: 'var(--red)',   title: 'Stock Is Within 1.5% of Your Strike',         explain: "The stock price is very close to your strike price. If the stock closes above your strike at expiry, your shares will be sold at that price — you miss any upside above it.", action: 'Consider rolling to a higher strike price with a later expiry date, or close the position.' },
  RECOVERY_MODE:  { icon: '↗', label: 'Market Recovery — Review Calls', color: 'var(--amber)', title: 'Market Is Bouncing Back — Your Call Caps Gains', explain: "The market is recovering strongly from a recent dip. When stocks rally hard, a short call limits how much you benefit from that recovery — you are capped at your strike price. Academic research identifies this as the primary source of underperformance in options-selling strategies during recoveries.", action: 'Consider closing or rolling calls to a higher strike to participate in the recovery. Avoid opening new positions until the rebound stabilizes.' },
  TREND_REVERSAL: { icon: '📈', label: 'Strong Uptrend — Watch Calls', color: 'var(--amber)', title: 'Market Is Trending Up Sharply',                explain: 'The stock is rising steeply. When the market moves up fast, your short call limits your upside and increases the chance your shares get called away.', action: 'Pause new entries. Watch existing positions closely for strike breach risk.' },
}

function alertTypes(pos) {
  const t = []
  if ((pos.profit_capture_pct || 0) >= 50) t.push('TAKE_PROFIT')
  if (pos.dte <= 7) t.push('GAMMA_DANGER')
  else if (pos.dte <= 21) t.push('ROLL_WARNING')
  if (pos.distance_to_strike_pct != null && pos.distance_to_strike_pct <= 1.5 && pos.distance_to_strike_pct > 0) t.push('STRIKE_BREACH')
  return t
}

function AlertCard({ type }) {
  const [open, setOpen] = useState(false)
  const d = ALERT_DEFS[type]
  return (
    <div className="border text-xs mb-1 last:mb-0" style={{ borderColor: d.color + '40', backgroundColor: d.color + '0d', borderRadius: 'var(--radius-sm)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left" style={{ color: d.color }}>
        <span>{d.icon}</span><span className="font-semibold">{d.label}</span>
        <span className="ml-auto opacity-50 text-[10px]">{open ? '▲ less' : '▼ why?'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1 border-t" style={{ borderColor: d.color + '30' }}>
          <p className="font-semibold" style={{ color: d.color }}>{d.title}</p>
          <p style={{ color: 'var(--muted)' }} className="leading-relaxed">{d.explain}</p>
          <p style={{ color: d.color }}>→ {d.action}</p>
        </div>
      )}
    </div>
  )
}

// ── Tax & P&L Aware Action Card (PIPE-019 + PIPE-020) ───────────────────────

function ConfidenceBar({ confidence, factors }) {
  const color = confidence >= 80 ? 'var(--green)'
    : confidence >= 60 ? 'var(--amber)'
    : 'var(--muted)'
  const label = confidence >= 80 ? 'High' : confidence >= 60 ? 'Moderate' : 'Low'
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Confidence</span>
        <div className="flex-1 h-1" style={{ backgroundColor: 'var(--border)' }}>
          <div className="h-full" style={{ width: `${confidence}%`, backgroundColor: color }} />
        </div>
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>{confidence}% — {label}</span>
      </div>
      {factors && factors.length > 0 && (
        <div className="text-[10px] leading-snug" style={{ color: 'var(--muted)' }}>
          Based on: {factors.join(' · ')}
        </div>
      )}
    </div>
  )
}

const FEEDBACK_OPTIONS = [
  'I disagree with this recommendation',
  'I don\'t understand the reasoning',
  'The numbers seem wrong',
  'The timing doesn\'t feel right',
  'Other',
]

function FeedbackForm({ pos, action, onClose }) {
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
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_context: {
            ticker:      pos.ticker || 'SPY',
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

function TaxAwareActionCard({ pos, action }) {
  const [expanded, setExpanded] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const closePnl     = pos.close_pnl_impact != null ? pos.close_pnl_impact : null
  const closePnlPos  = closePnl != null && closePnl >= 0
  const premiumSold  = (pos.sell_price || 0) * (pos.contracts || 0) * 100
  const costToClose  = (pos.current_price || 0) * (pos.contracts || 0) * 100

  const confidence       = pos.confidence != null ? pos.confidence : null
  const confidenceFactors = pos.confidence_factors || []
  const lowConfidence    = confidence != null && confidence < 60

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
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
      >
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
          {/* Rule softening notice */}
          {action.closingCostly && (
            <div className="mt-1 leading-snug" style={{ color: 'var(--amber)' }}>
              Closing now costs more than holding — the buy-back price has eaten into your original premium. Consider rolling instead of closing outright.
            </div>
          )}
          {/* Macro event context (PIPE-021) */}
          {pos.macro_event && (
            <div className="mt-1 leading-snug text-[10px] px-2 py-1" style={{ backgroundColor: 'var(--amber)12', color: 'var(--amber)', border: '1px solid var(--amber)30', borderRadius: 'var(--radius-sm)' }}>
              {pos.macro_event.description} in {pos.macro_event.days_away} day{pos.macro_event.days_away !== 1 ? 's' : ''}.
              Waiting until after the announcement reduces your timing risk.
            </div>
          )}
          {/* Confidence bar (PIPE-020) */}
          {confidence != null && (
            <ConfidenceBar confidence={confidence} factors={confidenceFactors} />
          )}
        </div>
        <span className="text-[10px] shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>
          {expanded ? '▲ less' : '▼ your options'}
        </span>
      </button>

      {/* Expanded: your options panels */}
      {expanded && (
        <div className="border-t space-y-0" style={{ borderColor: action.color + '30' }}>

          {/* ── Option A: Close now (label softened to "Review your options" when confidence < 60%) */}
          <div className="px-4 py-3 border-b" style={{ borderColor: action.color + '20' }}>
            <div className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
              {lowConfidence ? 'Review your options' : 'Close now'}
            </div>
            <div className="space-y-1" style={{ color: 'var(--muted)' }}>
              <div className="flex justify-between">
                <span>P&L if you close:</span>
                <span className="font-mono font-semibold" style={{ color: closePnl == null ? 'var(--muted)' : closePnlPos ? 'var(--green)' : 'var(--red)' }}>
                  {closePnl == null ? '—' : `${closePnlPos ? '+' : ''}$${Math.abs(closePnl).toFixed(0)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cost to buy back:</span>
                <span className="font-mono">${costToClose.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax impact:</span>
                <span className="font-mono">Taxable event this year</span>
              </div>
            </div>
            <div className="mt-2 leading-snug" style={{ color: 'var(--muted)' }}>
              Choose this if you believe SPY will keep rising above ${breakEvenPrice?.toFixed(0)}.
            </div>
          </div>

          {/* ── Option B: Wait and see ──────────────────────────────── */}
          <div className="px-4 py-3 border-b" style={{ borderColor: action.color + '20' }}>
            <div className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Wait and see</div>
            <div className="space-y-1" style={{ color: 'var(--muted)' }}>
              <div className="flex justify-between">
                <span>What you're waiting for:</span>
                <span className="font-mono">SPY to stay below ${breakEvenPrice?.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Risk if wrong:</span>
                <span className="font-mono" style={{ color: 'var(--amber)' }}>Assignment — shares called away</span>
              </div>
            </div>
            <div className="mt-2 leading-snug" style={{ color: 'var(--muted)' }}>
              SPY needs to stay below ${breakEvenPrice?.toFixed(0)} through expiry for holding to be the better financial choice.
            </div>
          </div>

          {/* ── Option C: Roll ──────────────────────────────────────── */}
          <div className="px-4 py-3">
            <div className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Roll to next month</div>
            <div className="space-y-1" style={{ color: 'var(--muted)' }}>
              <div className="flex justify-between">
                <span>P&L realized:</span>
                <span className="font-mono">$0 (no loss locked in)</span>
              </div>
              <div className="flex justify-between">
                <span>Tax impact:</span>
                <span className="font-mono">No new taxable event</span>
              </div>
              {rollIncomeEst != null && (
                <div className="flex justify-between">
                  <span>New income potential:</span>
                  <span className="font-mono" style={{ color: 'var(--green)' }}>~${rollIncomeEst.toLocaleString()} at current prices</span>
                </div>
              )}
            </div>
            <div className="mt-2 leading-snug" style={{ color: 'var(--muted)' }}>
              Buy back this call and sell a new one at the same or higher strike, targeting 30–45 days until expiry.
            </div>
          </div>

        </div>
      )}

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

function PortfolioIntelligence({ portfolioId, openPos, holdings, signalData, onRefresh }) {
  const [collapsed, setCollapsed]           = useState(false)
  const [opportunities, setOpportunities]   = useState([])
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [screenerError, setScreenerError]   = useState(null)
  const [openingKey, setOpeningKey]         = useState(null)

  // ── Health metrics ────────────────────────────────────────────────────────
  const totalShares    = holdings.reduce((s, h) => s + (h.shares || 0), 0)
  const coveredShares  = openPos.reduce((s, p) => s + (p.contracts || 0) * 100, 0)
  const callCoveragePct = totalShares > 0 ? Math.round(coveredShares / totalShares * 100) : null

  const totalContracts = openPos.reduce((s, p) => s + (p.contracts || 0), 0)

  const weightedAvgDte = totalContracts > 0
    ? Math.round(openPos.reduce((s, p) => s + (p.dte || 0) * (p.contracts || 0), 0) / totalContracts)
    : null

  const posWithDelta  = openPos.filter(p => p.delta != null)
  const weightedAvgDelta = posWithDelta.length > 0
    ? posWithDelta.reduce((s, p) => s + p.delta * p.contracts, 0) /
      posWithDelta.reduce((s, p) => s + p.contracts, 0)
    : null

  const premiumAtRisk = openPos.reduce((s, p) => s + (p.current_price || 0) * (p.contracts || 0) * 100, 0)

  // Concentration base = total available contracts (shares / 100), matching backend rule
  const availableContracts = Math.floor(totalShares / 100)

  const concentrationWarnings = []
  if (availableContracts > 0) {
    const byStrike = {}, byExpiry = {}
    for (const p of openPos) {
      const s = String(p.strike)
      byStrike[s] = (byStrike[s] || 0) + (p.contracts || 0)
      byExpiry[p.expiry] = (byExpiry[p.expiry] || 0) + (p.contracts || 0)
    }
    for (const [k, cts] of Object.entries(byStrike))
      if (cts / availableContracts > 0.30)
        concentrationWarnings.push({ label: `$${k} strike`, pct: Math.round(cts / availableContracts * 100) })
    for (const [k, cts] of Object.entries(byExpiry))
      if (cts / availableContracts > 0.30)
        concentrationWarnings.push({ label: k, pct: Math.round(cts / availableContracts * 100) })
  }

  // ── Action items ──────────────────────────────────────────────────────────
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
  const urgencyOrder = { URGENT: 0, HIGH: 1, RECOMMENDED: 2, WATCH: 3 }
  const actionItems = openPos
    .map(pos => ({ pos, action: getAction(pos) }))
    .filter(({ action }) => action !== null)
    .sort((a, b) => (urgencyOrder[a.action.urgency] ?? 4) - (urgencyOrder[b.action.urgency] ?? 4))

  // ── Screener fetch ────────────────────────────────────────────────────────
  const regime = signalData?.regime
  useEffect(() => {
    if (!portfolioId) return
    if (regime === 'AVOID') { setOpportunities([]); return }
    let cancelled = false
    setScreenerLoading(true)
    setScreenerError(null)
    fetch(`/api/screener?portfolio_id=${portfolioId}&limit=5&min_dte=21&max_dte=45&min_delta=0.10&max_delta=0.30`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setOpportunities(
          (data.candidates || []).filter(c => !c.has_position && c.contracts_suggested > 0).slice(0, 3)
        )
      })
      .catch(() => { if (!cancelled) setScreenerError('Could not load opportunities.') })
      .finally(() => { if (!cancelled) setScreenerLoading(false) })
    return () => { cancelled = true }
  }, [portfolioId, regime])

  async function handleOpen(c) {
    const key = `${c.strike}-${c.expiry}`
    setOpeningKey(key)
    const cts = c.contracts_suggested > 0 ? c.contracts_suggested : 1
    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: 'SPY', type: 'short_call',
          strike: c.strike, expiry: c.expiry,
          contracts: cts, sell_price: c.mid,
          premium_collected: Math.round(c.mid * cts * 100 * 100) / 100,
          portfolio_id: portfolioId,
        }),
      })
      if (res.ok) {
        onRefresh()
        setOpportunities(prev => prev.filter(o => !(o.strike === c.strike && o.expiry === c.expiry)))
      }
    } finally { setOpeningKey(null) }
  }

  // ── Regime config ─────────────────────────────────────────────────────────
  const RC = {
    'SELL PREMIUM': { label: 'Good Time to Open',          color: 'var(--green)',  bg: 'rgba(16,185,129,0.08)', headline: 'Conditions support adding new positions.' },
    'HOLD':         { label: 'Hold — Pause New Positions', color: 'var(--amber)',  bg: 'rgba(255,176,32,0.06)', headline: 'Hold existing positions and pause new entries until signals improve.' },
    'CAUTION':      { label: 'Be Careful',                 color: 'var(--orange)', bg: 'rgba(249,115,22,0.06)', headline: 'Multiple warning signs — review positions carefully before adding.' },
    'AVOID':        { label: 'Not a Good Time',            color: 'var(--red)',    bg: 'rgba(255,61,90,0.06)',  headline: 'Unfavorable conditions. No new positions until signals improve.' },
  }
  const rc = RC[regime] || RC['HOLD']
  const cellStyle = { backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>

      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs uppercase tracking-wider font-mono font-semibold" style={{ color: 'var(--muted)' }}>
          Portfolio Intelligence
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{collapsed ? '▶ show' : '▼ hide'}</span>
      </button>

      {!collapsed && (
        <div>

          {/* 1 — Regime Banner */}
          <div className="px-5 py-2.5 flex items-center gap-3 border-b" style={{ backgroundColor: rc.bg, borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider font-mono" style={{ color: rc.color }}>
              {rc.label || regime || '—'}
            </span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{rc.headline}</span>
            {signalData?.total_score != null && (
              <span className="ml-auto text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>
                <Term id="SignalScore">Signal</Term> {signalData.total_score}/{signalData.max_score ?? 14}
              </span>
            )}
          </div>

          {/* 2 — Portfolio Health */}
          <div className="px-5 py-3 border-b flex flex-wrap gap-6 items-center" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs uppercase tracking-wider font-mono shrink-0" style={{ color: 'var(--muted)' }}>Health</span>

            {/* Call Coverage */}
            <div>
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Call Coverage</div>
              {callCoveragePct === null ? (
                <div className="text-sm font-mono font-semibold" style={{ color: 'var(--muted)' }}>No holdings</div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5" style={{ backgroundColor: 'var(--border)' }}>
                    <div className="h-full" style={{
                      width: `${Math.min(callCoveragePct, 100)}%`,
                      backgroundColor: callCoveragePct >= 100 ? 'var(--amber)' : callCoveragePct >= 50 ? 'var(--green)' : 'var(--blue)',
                    }} />
                  </div>
                  <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>{callCoveragePct}%</span>
                </div>
              )}
            </div>

            {/* Avg DTE */}
            {weightedAvgDte !== null && (
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>
                  <Term id="DTE">Avg Days Until Expiry</Term>
                </div>
                <div className="text-sm font-mono font-semibold" style={{
                  color: weightedAvgDte <= 7 ? 'var(--red)' : weightedAvgDte <= 21 ? 'var(--amber)' : 'var(--text)',
                }}>{weightedAvgDte}d</div>
              </div>
            )}

            {/* Avg Delta */}
            {weightedAvgDelta !== null && (
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>
                  <Term id="Delta">Avg Assignment Risk</Term>
                </div>
                <div className="text-sm font-mono font-semibold" style={{
                  color: weightedAvgDelta > 0.35 ? 'var(--red)' : weightedAvgDelta > 0.25 ? 'var(--amber)' : 'var(--text)',
                }}>{weightedAvgDelta.toFixed(2)}</div>
              </div>
            )}

            {/* Cost to Close All */}
            {openPos.length > 0 && (
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Cost to Close All</div>
                <div className="text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>
                  ${premiumAtRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            )}

            {/* Concentration Warnings */}
            {concentrationWarnings.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-xs" style={{ color: 'var(--amber)' }}>Concentration:</span>
                {concentrationWarnings.map((w, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 font-mono" style={{
                    backgroundColor: 'rgba(255,176,32,0.12)', color: 'var(--amber)', border: '1px solid rgba(255,176,32,0.3)',
                  }}>{w.label} {w.pct}%</span>
                ))}
              </div>
            )}
          </div>

          {/* 3 — Action Items */}
          {actionItems.length > 0 && (
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="text-xs uppercase tracking-wider font-mono mb-2" style={{ color: 'var(--muted)' }}>
                Action Items ({actionItems.length})
              </div>
              <div className="space-y-3">
                {actionItems.map(({ pos, action }) => (
                  <TaxAwareActionCard key={pos.id} pos={pos} action={action} />
                ))}
              </div>
            </div>
          )}

          {/* 4 — Top Opportunities */}
          <div className="px-5 py-3">
            <div className="text-xs uppercase tracking-wider font-mono mb-2" style={{ color: 'var(--muted)' }}>
              Top Opportunities
            </div>

            {regime === 'AVOID' ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                No strong candidates right now. The market signal is Not a Good Time — conditions aren't ideal for new positions. Check back after the next market session.
              </p>
            ) : screenerLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Scanning options chain…</span>
              </div>
            ) : screenerError ? (
              <p className="text-xs" style={{ color: 'var(--red)' }}>{screenerError}</p>
            ) : opportunities.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                No strong candidates right now in the 21–45 DTE · 0.10–0.30 delta range. Check back after the next market session.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {opportunities.map(c => {
                  const oppKey = `${c.strike}-${c.expiry}`
                  const isOpening = openingKey === oppKey
                  return (
                    <div key={oppKey} className="border px-3 py-2.5 text-xs min-w-[200px]"
                      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold font-mono" style={{ color: 'var(--text)' }}>${c.strike}C</span>
                        <span style={{ color: 'var(--muted)' }}>{c.expiry}</span>
                      </div>
                      <div className="flex gap-3 mb-2 font-mono">
                        <div>
                          <div style={{ color: 'var(--muted)' }}><Term id="CompositeScore">Score</Term></div>
                          <div className="font-semibold" style={{ color: 'var(--green)' }}>{c.composite_score}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--muted)' }}><Term id="Delta">Δ Risk</Term></div>
                          <div className="font-semibold" style={{ color: 'var(--text)' }}>{c.delta?.toFixed(2)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--muted)' }}><Term id="DTE">DTE</Term></div>
                          <div className="font-semibold" style={{ color: 'var(--text)' }}>{c.dte}d</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--muted)' }}>Yield%</div>
                          <div className="font-semibold" style={{ color: 'var(--green)' }}>{(c.raw_yield_pct ?? 0).toFixed(2)}%</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--muted)' }}>
                          ${c.mid} mid · {c.contracts_suggested > 0 ? `${c.contracts_suggested} cts` : 'full'}
                        </span>
                        <button
                          onClick={() => handleOpen(c)}
                          disabled={isOpening || c.contracts_suggested <= 0}
                          className="px-2 py-1 border text-xs font-semibold disabled:opacity-40"
                          style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)' }}
                        >
                          {isOpening ? '…' : '+ Open'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── All Portfolios aggregate view ─────────────────────────────────────────────

function AllPortfoliosView({ positions, portfolios, holdings }) {
  const [expandedCell, setExpandedCell] = useState(null) // 'strike|expiry'

  const allOpen = positions.filter(p => p.status === 'open')
  const totalContracts = allOpen.reduce((s, p) => s + (p.contracts || 0), 0)
  const totalPremium   = allOpen.reduce((s, p) => s + (p.premium_collected || 0), 0)
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
          { labelKey: 'IncomeEarned',      label: <Term id="PremiumCollected">Income Earned</Term>,                    value: `$${totalPremium.toLocaleString()}`,                              color: 'var(--green)' },
          { labelKey: 'UnrealizedPnL',     label: 'Unrealized P&L',                                                    value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { labelKey: 'TotalContracts',    label: <Term id="Contracts">Total Positions (×100)</Term>,                  value: String(totalContracts),                                          color: 'var(--text)' },
        ].map(s => (
          <div key={s.labelKey} className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
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

function PortfolioTab({ portfolio, active, onClick }) {
  const stats = portfolio.stats || {}
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-l-2 transition-colors"
      style={{
        borderColor: active ? 'var(--green)' : 'transparent',
        backgroundColor: active ? 'var(--green)08' : 'transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: active ? 'var(--text)' : 'var(--muted)' }}>
          {portfolio.name}
        </span>
        {stats.open_count > 0 && (
          <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
            {stats.open_count}
          </span>
        )}
      </div>
      {stats.total_premium_collected > 0 && (
        <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--green)' }}>
          ${stats.total_premium_collected.toLocaleString()} premium
        </div>
      )}
    </button>
  )
}

// ── Holdings row ──────────────────────────────────────────────────────────────

function HoldingRow({ holding, coveredShares, onDelete, onEdit }) {
  const pnlPos = (holding.unrealized_pnl || 0) >= 0
  const totalShares = holding.shares
  const covered = Math.min(coveredShares, totalShares)
  const coveragePct = totalShares > 0 ? Math.round(covered / totalShares * 100) : 0

  return (
    <div className="flex flex-wrap items-center gap-4 py-3 border-b text-sm" style={{ borderColor: 'var(--border)' }}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}
      >
        {holding.ticker}
      </div>

      <div className="flex flex-wrap gap-5 flex-1 text-sm">
        {[
          { label: 'Shares', value: holding.shares.toLocaleString(), color: 'var(--text)' },
          { label: 'Avg Cost', value: `$${holding.avg_cost.toFixed(2)}`, color: 'var(--text)' },
          { label: 'Current', value: `$${holding.current_price?.toFixed(2) ?? '—'}`, color: 'var(--text)' },
          { label: 'Market Value', value: `$${(holding.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'var(--text)' },
          { label: 'Unrealized P&L', value: `${pnlPos ? '+' : ''}$${(holding.unrealized_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} (${holding.unrealized_pnl_pct?.toFixed(1)}%)`, color: pnlPos ? 'var(--green)' : 'var(--red)' },
        ].map(f => (
          <div key={f.label}>
            <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
            <div className="font-mono font-semibold" style={{ color: f.color }}>{f.value}</div>
          </div>
        ))}

        {/* Coverage bar */}
        <div className="min-w-[120px]">
          <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Call Coverage</div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5" style={{ backgroundColor: 'var(--border)' }}>
              <div className="h-full" style={{ width: `${coveragePct}%`, backgroundColor: 'var(--green)' }} />
            </div>
            <span className="text-xs font-mono" style={{ color: coveragePct === 100 ? 'var(--green)' : 'var(--amber)' }}>
              {covered}/{totalShares} ({coveragePct}%)
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 shrink-0 text-xs">
        <button onClick={onEdit} style={{ color: 'var(--amber)' }} className="hover:underline">Edit</button>
        <button onClick={onDelete} style={{ color: 'var(--muted)' }} className="hover:underline">Remove</button>
      </div>
    </div>
  )
}

// ── Edit holding modal ────────────────────────────────────────────────────────

function EditHoldingModal({ holding, onSave, onClose }) {
  const [shares, setShares] = useState(String(holding.shares))
  const [avgCost, setAvgCost] = useState(String(holding.avg_cost))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/holdings/${holding.id}`, {
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
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Position card ─────────────────────────────────────────────────────────────

function PositionCard({ pos, portfolios, currentPortfolioId, onClose, onDelete, onMove }) {
  const [isClosing, setIsClosing] = useState(false)
  const [closePrice, setClosePrice] = useState('')
  const [moving, setMoving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContracts, setEditContracts] = useState(String(pos.contracts))
  const [editSellPrice, setEditSellPrice] = useState(String(pos.sell_price ?? ''))
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState(pos.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const alerts = alertTypes(pos)
  const pnlPos = (pos.pnl || 0) >= 0
  const otherPortfolios = portfolios.filter(p => p.id !== currentPortfolioId && !p.archived)

  async function doSaveNotes() {
    setNotesSaving(true)
    await fetch(`/api/positions/${pos.id}`, {
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
    if (isNaN(price)) return
    await fetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed', close_price: price }),
    })
    setIsClosing(false)
    onClose()
  }

  async function doEdit() {
    const cts = parseInt(editContracts, 10)
    const sp  = parseFloat(editSellPrice)
    if (isNaN(cts) || cts <= 0 || isNaN(sp) || sp <= 0) return
    await fetch(`/api/positions/${pos.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts: cts, sell_price: sp }),
    })
    setIsEditing(false)
    onClose()  // onClose just triggers a refresh in the parent
  }

  async function doMove(portfolioId) {
    await fetch(`/api/positions/${pos.id}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolioId }),
    })
    setMoving(false)
    onMove()
  }

  return (
    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap gap-4 items-start">
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-[160px]">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
               style={{ backgroundColor: 'var(--border)', color: 'var(--blue)' }}>
            {pos.ticker}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>${pos.strike} Call</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Expires {pos.expiry}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 flex-1">
          {[
            { label: <Term id="DTE">Days Until Expiry</Term>,      labelKey: 'DTE',           value: `${pos.dte}d`,                                                                        color: pos.dte <= 7 ? 'var(--red)' : pos.dte <= 21 ? 'var(--amber)' : 'var(--text)' },
            { label: <Term id="Contracts">Positions (×100 shares)</Term>, labelKey: 'Contracts', value: `${pos.contracts} × 100`,                                                            color: 'var(--text)' },
            { label: 'Sold At',                                    labelKey: 'SoldAt',        value: `$${pos.sell_price?.toFixed(2)}`,                                                      color: 'var(--text)' },
            { label: <Term id="Premium">Current Price</Term>,      labelKey: 'CurrentPrice',  value: `$${pos.current_price?.toFixed(2) ?? '—'}`,                                            color: 'var(--text)' },
            { label: 'P&L',                                        labelKey: 'PnL',           value: `${pnlPos?'+':''}$${pos.pnl?.toFixed(0)}`,                                             color: pnlPos ? 'var(--green)' : 'var(--red)' },
            { label: <Term id="ProfitCapturePct">% of Max Income</Term>, labelKey: 'ProfitCapture', value: `${pos.profit_capture_pct?.toFixed(1)}%`,                                       color: pos.profit_capture_pct >= 50 ? 'var(--green)' : 'var(--text)' },
            { label: <Term id="Delta">Assignment Risk</Term>,      labelKey: 'Delta',         value: pos.delta != null ? pos.delta.toFixed(2) : '—',                                        color: pos.delta > 0.35 ? 'var(--red)' : pos.delta > 0.25 ? 'var(--amber)' : 'var(--text)' },
            { label: <Term id="Strike">Distance to Strike</Term>,  labelKey: 'StrikeDist',    value: pos.distance_to_strike_pct != null ? `${pos.distance_to_strike_pct.toFixed(2)}%` : '—', color: (pos.distance_to_strike_pct || 99) <= 1.5 ? 'var(--red)' : 'var(--text)' },
          ].map(f => (
            <div key={f.labelKey}>
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{f.label}</div>
              <div className="text-sm font-mono font-semibold" style={{ color: f.color }}>{f.value}</div>
            </div>
          ))}

          {/* OI tracking */}
          {pos.open_interest != null && (() => {
            const sig = pos.oi_signal
            const chg = pos.oi_change_1d_pct
            const oiColor = sig === 'MAJOR_UNWIND' ? 'var(--red)'
              : sig === 'UNWINDING' ? 'var(--amber)'
              : sig === 'BUILDING'  ? 'var(--blue)'
              : 'var(--muted)'
            return (
              <div>
                <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>
                  <Term id="OpenInterest">Open Interest</Term>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text)' }}>
                    {pos.open_interest.toLocaleString()}
                  </span>
                  {chg != null && (
                    <span className="text-[10px] px-1.5 py-0.5 font-mono font-semibold"
                          style={{ backgroundColor: oiColor + '20', color: oiColor }}>
                      {chg > 0 ? '+' : ''}{chg}%
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col gap-2 items-end">
          {isClosing ? (
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.01" placeholder="buy-back price" value={closePrice}
                onChange={e => setClosePrice(e.target.value)}
                className="w-28 px-2 py-1 text-xs font-mono border focus:outline-none"
                style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
              <button onClick={doClose} className="text-sm" style={{ color: 'var(--green)' }}>✓</button>
              <button onClick={() => setIsClosing(false)} className="text-sm" style={{ color: 'var(--muted)' }}>✗</button>
            </div>
          ) : (
            <button onClick={() => setIsClosing(true)} className="text-xs hover:underline" style={{ color: 'var(--amber)' }}>
              Close position
            </button>
          )}

          {/* Edit contracts / sell price */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs w-20 shrink-0" style={{ color: 'var(--muted)' }}>Contracts</span>
                <input
                  type="number" min="1" step="1" value={editContracts}
                  onChange={e => setEditContracts(e.target.value)}
                  className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs w-20 shrink-0" style={{ color: 'var(--muted)' }}>Sold at $</span>
                <input
                  type="number" min="0.01" step="0.01" value={editSellPrice}
                  onChange={e => setEditSellPrice(e.target.value)}
                  className="w-20 px-2 py-1 text-xs font-mono border focus:outline-none"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div className="flex gap-2 mt-0.5">
                <button onClick={doEdit} className="text-xs px-2 py-0.5 border" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>Save</button>
                <button onClick={() => { setIsEditing(false); setEditContracts(String(pos.contracts)); setEditSellPrice(String(pos.sell_price ?? '')) }} className="text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)} className="text-xs hover:underline" style={{ color: 'var(--blue)' }}>
              Edit position
            </button>
          )}

          {/* Move to */}
          {otherPortfolios.length > 0 && (
            moving ? (
              <div className="flex flex-wrap gap-1">
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
              <button onClick={() => setMoving(true)} className="text-xs hover:underline" style={{ color: 'var(--blue)' }}>
                Move to…
              </button>
            )
          )}

          <button onClick={() => { if (confirm('Remove this position?')) onDelete(pos.id) }}
            className="text-xs" style={{ color: 'var(--muted)' }}>
            Remove
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mt-3 max-w-lg space-y-1">
          {alerts.map(type => <AlertCard key={type} type={type} />)}
        </div>
      )}

      {/* Notes */}
      <div className="mt-3">
        {notesOpen ? (
          <div className="flex flex-col gap-2">
            <textarea
              rows={3}
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder="Add notes about this position…"
              className="w-full px-3 py-2 text-xs border resize-none focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <div className="flex gap-2">
              <button onClick={doSaveNotes} disabled={notesSaving}
                className="text-xs px-2 py-0.5 border"
                style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
                {notesSaving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setNotesOpen(false); setNotesDraft(pos.notes || '') }}
                className="text-xs" style={{ color: 'var(--muted)' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            {pos.notes && (
              <p className="text-xs flex-1" style={{ color: 'var(--muted)' }}>{pos.notes}</p>
            )}
            <button onClick={() => setNotesOpen(true)}
              className="text-xs hover:underline shrink-0"
              style={{ color: 'var(--blue)' }}>
              {pos.notes ? 'Edit note' : '+ Add note'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scorecard ─────────────────────────────────────────────────────────────────

function ScorecardView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/scorecard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Could not load scorecard.'); setLoading(false) })
  }, [])

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
            <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
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

export default function Portfolios({ positions, portfolios, holdings, dashData, signalData, onRefresh }) {
  const active = portfolios.filter(p => !p.archived)
  const archived = portfolios.filter(p => p.archived)

  const [selectedId, setSelectedId] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [creating, setCreating] = useState(false)

  // Auto-select first portfolio on load
  useEffect(() => {
    if (!selectedId && active.length > 0) {
      setSelectedId(active[0].id)
    }
  }, [portfolios])

  const selected = portfolios.find(p => p.id === selectedId)
  const myPositions = positions.filter(p => p.portfolio_id === selectedId)
  const myHoldings  = holdings.filter(h => h.portfolio_id === selectedId)
  const openPos  = myPositions.filter(p => p.status === 'open')
  const closedPos = myPositions.filter(p => p.status === 'closed')

  // Covered shares per ticker
  const coveredByTicker = {}
  for (const p of openPos) {
    coveredByTicker[p.ticker] = (coveredByTicker[p.ticker] || 0) + p.contracts * 100
  }

  const totalPremium = openPos.reduce((s, p) => s + (p.premium_collected || 0), 0)
  const totalPnl     = openPos.reduce((s, p) => s + (p.pnl || 0), 0)
  const avgCapture   = openPos.length ? openPos.reduce((s, p) => s + (p.profit_capture_pct || 0), 0) / openPos.length : 0

  async function createPortfolio() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const res = await fetch('/api/portfolios', {
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
    const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      alert(err.detail)
      return
    }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function archivePortfolio(id) {
    const res = await fetch(`/api/portfolios/${id}/archive`, { method: 'PUT' })
    if (!res.ok) { const err = await res.json(); alert(err.detail); return }
    if (selectedId === id) setSelectedId(active.find(p => p.id !== id)?.id || null)
    onRefresh()
  }

  async function unarchivePortfolio(id) {
    await fetch(`/api/portfolios/${id}/unarchive`, { method: 'PUT' })
    onRefresh()
  }

  async function deletePosition(id) {
    await fetch(`/api/positions/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  async function deleteHolding(id) {
    if (!confirm('Remove this holding?')) return
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div className="flex gap-6 min-h-[70vh]">

      {/* ── Left sidebar: portfolio list ─────────────────────── */}
      <div className="w-56 shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wider font-mono" style={{ color: 'var(--muted)' }}>Portfolios</span>
          <button onClick={() => setShowNewForm(s => !s)}
            className="text-xs px-2 py-1 border" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
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
              className="text-xs px-2" style={{ color: 'var(--green)' }}>
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
            borderLeftColor: selectedId === '__all__' ? 'var(--green)' : 'transparent',
            color: selectedId === '__all__' ? 'var(--text)' : 'var(--muted)',
            backgroundColor: selectedId === '__all__' ? 'rgba(16,185,129,0.06)' : 'transparent',
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

        {/* Active portfolios */}
        {active.map(p => (
          <div key={p.id} className="group relative">
            <PortfolioTab portfolio={p} active={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
            {p.id !== 'default' && (
              <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                <button onClick={() => archivePortfolio(p.id)} title="Archive"
                  className="text-xs px-1" style={{ color: 'var(--muted)' }}>▾</button>
                <button onClick={() => deletePortfolio(p.id)} title="Delete"
                  className="text-xs px-1" style={{ color: 'var(--muted)' }}>✕</button>
              </div>
            )}
          </div>
        ))}

        {/* Archived toggle */}
        {archived.length > 0 && (
          <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setShowArchived(s => !s)}
              className="text-xs w-full text-left px-4 py-1" style={{ color: 'var(--muted)' }}>
              {showArchived ? '▲' : '▶'} Archived ({archived.length})
            </button>
            {showArchived && archived.map(p => (
              <div key={p.id} className="group relative opacity-50 hover:opacity-80">
                <PortfolioTab portfolio={p} active={selectedId === p.id} onClick={() => setSelectedId(p.id)} />
                <div className="absolute right-2 top-2 hidden group-hover:flex">
                  <button onClick={() => unarchivePortfolio(p.id)} title="Restore" className="text-xs px-1" style={{ color: 'var(--muted)' }}>↑</button>
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
                You'll need: your SPY share count and the options you've already sold (if any).
              </p>
              <button
                onClick={() => setShowNewForm(true)}
                className="text-sm px-4 py-2 border transition-colors"
                style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)' }}
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
                <button onClick={() => setShowAddHolding(s => !s)}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--blue)', color: 'var(--blue)', backgroundColor: showAddHolding ? 'rgba(74,158,255,0.1)' : 'transparent' }}>
                  {showAddHolding ? '✕ Cancel' : '+ Add Holding'}
                </button>
                <button onClick={() => setShowAddPosition(s => !s)}
                  className="px-3 py-1.5 text-xs border transition-colors"
                  style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: showAddPosition ? 'rgba(16,185,129,0.1)' : 'transparent' }}>
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
                <div className="text-xs uppercase tracking-wider mb-3 font-mono" style={{ color: 'var(--muted)' }}>Add Position</div>
                <AddPosition portfolioId={selectedId} onAdded={() => { setShowAddPosition(false); onRefresh() }} />
              </div>
            )}

            {/* ── Portfolio Intelligence ─────────────────────────── */}
            <PortfolioIntelligence
              portfolioId={selectedId}
              openPos={openPos}
              holdings={myHoldings}
              signalData={signalData}
              onRefresh={onRefresh}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Open Positions',          value: String(openPos.length),                                       color: 'var(--text)' },
                { label: 'Income Earned',            value: `$${totalPremium.toLocaleString()}`,                          color: 'var(--green)' },
                { label: 'Unrealized P&L',           value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(0)}`, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: '% of Max Income Collected', value: `${avgCapture.toFixed(1)}%`,                                  color: 'var(--amber)' },
              ].map(s => (
                <div key={s.label} className="p-5 border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{s.label}</div>
                  <div className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
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
                    No holdings recorded yet. Add your SPY shares to unlock call coverage tracking and position sizing.
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
                <div className="px-5">
                  {myHoldings.map(h => (
                    <HoldingRow
                      key={h.id}
                      holding={h}
                      coveredShares={coveredByTicker[h.ticker] || 0}
                      onDelete={() => deleteHolding(h.id)}
                      onEdit={() => setEditingHolding(h)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Open Positions ────────────────────────────────── */}
            <div className="border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Open Positions</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  You profit when the option loses value. Positive P&L means the call has declined since you sold it.
                </p>
              </div>
              {openPos.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-3">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    You don't have any open positions yet. Check the Market Conditions tab to see if now is a good time to start.
                  </p>
                  <button
                    className="text-xs px-3 py-1.5 border transition-colors inline-block"
                    style={{ borderColor: 'var(--green)', color: 'var(--green)', backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => setShowAddPosition(true)}
                  >
                    + Add your first position →
                  </button>
                </div>
              ) : (
                openPos.map(pos => (
                  <PositionCard
                    key={pos.id} pos={pos}
                    portfolios={portfolios}
                    currentPortfolioId={selectedId}
                    onClose={onRefresh}
                    onDelete={deletePosition}
                    onMove={onRefresh}
                  />
                ))
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
                        {['Strike','Expiry','Contracts','Sold At','Closed At','Final P&L','Date'].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closedPos.map(pos => (
                        <tr key={pos.id} className="border-b opacity-50" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.strike}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.expiry}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{pos.contracts}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.sell_price?.toFixed(2)}</td>
                          <td className="px-4 py-2" style={{ color: 'var(--text)' }}>${pos.close_price?.toFixed(2) ?? '—'}</td>
                          <td className="px-4 py-2 font-semibold" style={{ color: (pos.final_pnl||0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {(pos.final_pnl||0) >= 0 ? '+' : ''}${pos.final_pnl?.toFixed(2) ?? '—'}
                          </td>
                          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{pos.close_date ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
    </div>
  )
}
