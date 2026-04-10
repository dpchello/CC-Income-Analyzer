// ── How It Works ──────────────────────────────────────────────────────────────
// Plain-English guide for non-trader users. Explains Harvest strategy,
// market signal, scoring, alerts, and common questions.

import { useState } from 'react'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Section({ id, title, subtitle, children }) {
  return (
    <div id={id} className="space-y-5">
      <div className="border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Card({ children, accent }) {
  const borderStyle = accent ? { borderColor: accent, borderLeftWidth: 3 } : { borderColor: 'var(--border)' }
  return (
    <div
      className="p-4 border"
      style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', ...borderStyle }}
    >
      {children}
    </div>
  )
}

function RegimePill({ regime, color }) {
  return (
    <span
      className="px-2 py-0.5 text-[11px] font-semibold font-mono inline-block"
      style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}40`, borderRadius: 'var(--radius-sm)' }}
    >
      {regime}
    </span>
  )
}

function FormulaBar({ label, pct, color, pts }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="flex-1 h-2" style={{ backgroundColor: 'var(--border)', borderRadius: 2 }}>
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
      </div>
      <div className="w-20 text-xs font-mono text-right shrink-0" style={{ color }}>{pts}</div>
    </div>
  )
}

function FAQ({ question, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border" style={{ borderColor: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button
        className="w-full px-4 py-3 text-left flex items-center justify-between gap-3"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--text)' }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-medium">{question}</span>
        <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-xs leading-relaxed space-y-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--surface)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScoreGuide() {
  const green  = 'var(--green)'
  const amber  = 'var(--amber)'
  const red    = 'var(--red)'
  const muted  = 'var(--muted)'
  const text   = 'var(--text)'
  const orange = 'var(--orange)'

  return (
    <div className="space-y-12 max-w-3xl">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: text }}>How It Works</h1>
        <p className="text-sm mt-1" style={{ color: muted }}>
          Everything you need to understand what Harvest is doing and why — no financial background required.
        </p>
      </div>

      {/* ── 1. What is Harvest? ───────────────────────────────────────────────── */}
      <Section
        id="what-is-harvest"
        title="1 · What is Harvest?"
        subtitle="Plain English overview of the strategy"
      >
        <Card>
          <p className="text-sm leading-relaxed" style={{ color: text }}>
            Harvest helps you earn regular income from stocks you already own — without selling them.
          </p>
          <p className="text-sm leading-relaxed mt-3" style={{ color: muted }}>
            Here's how it works in plain English: when you own shares of SPY (the S&P 500 ETF),
            you can sell someone else the <em>right</em> to buy those shares at a set price in the future.
            For giving them that right, they pay you a fee upfront — that's your income.
            If the stock price never reaches the agreed price, they walk away and you keep the fee.
            If it does, you sell your shares at the agreed price — which is usually fine because you chose a price
            well above what you paid.
          </p>
          <p className="text-sm leading-relaxed mt-3" style={{ color: muted }}>
            This strategy is called a <strong style={{ color: text }}>covered call</strong>.
            The "covered" part means you actually own the shares — you're not making risky bets, just renting out
            the upside you're not using right now.
          </p>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3" style={{ color: text }}>Why does this work?</div>
          <p className="text-xs leading-relaxed" style={{ color: muted }}>
            Options buyers consistently overpay for the right to future gains. On average, implied volatility
            (what the market charges for options) is about 3 percentage points higher than what actually happens.
            As a seller, that gap is your statistical edge — you're the "house" collecting the overpriced premium.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: muted }}>
            Academic research confirms this: the CBOE BXM buy-write index has historically matched
            S&P 500 returns with one-third less volatility. That's not luck — it's the options pricing premium
            being harvested consistently over time.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: muted }}>
            The edge only shows up when conditions are right, which is why Harvest monitors six market factors
            before giving you a recommendation.
          </p>
        </Card>
      </Section>

      {/* ── 2. The Market Signal ─────────────────────────────────────────────── */}
      <Section
        id="market-signal"
        title="2 · The Market Signal"
        subtitle="What each signal means and when to act"
      >
        <p className="text-sm leading-relaxed" style={{ color: muted }}>
          Harvest checks six market conditions every time you load the app. The results are combined into
          a single signal that tells you whether now is a good time to open new positions.
        </p>

        <div className="space-y-3">

          <Card accent={green}>
            <div className="flex items-center gap-2 mb-2">
              <RegimePill regime="Good Time to Open" color={green} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Most factors are pointing in your favor. Option premiums are elevated (more income for you),
              the market isn't moving too fast, and volatility is stable. This is the best environment
              for opening new positions — your statistical edge is at its highest.
            </p>
            <p className="text-xs mt-2 font-medium" style={{ color: green }}>
              What to do: Check the Find Opportunities tab. If the score for a specific option is 60 or above, it's worth considering.
            </p>
          </Card>

          <Card accent={amber}>
            <div className="flex items-center gap-2 mb-2">
              <RegimePill regime="Hold — Pause New Positions" color={amber} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              The signals are mixed. Your existing positions should keep running — time is still working in
              your favor. But opening new ones right now carries more uncertainty than usual.
            </p>
            <p className="text-xs mt-2 font-medium" style={{ color: amber }}>
              What to do: Check your open positions. No action needed unless an alert shows up. Wait for a cleaner signal.
            </p>
          </Card>

          <Card accent={orange}>
            <div className="flex items-center gap-2 mb-2">
              <RegimePill regime="Be Careful" color={orange} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Multiple warning signs are present. Premiums might be too thin, volatility could be unstable,
              or the market is trending too strongly. Adding new risk here is not recommended.
            </p>
            <p className="text-xs mt-2 font-medium" style={{ color: orange }}>
              What to do: Review existing positions for alerts. Don't open new ones until the signal improves.
            </p>
          </Card>

          <Card accent={red}>
            <div className="flex items-center gap-2 mb-2">
              <RegimePill regime="Not a Good Time" color={red} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Conditions are unfavorable. The edge that options sellers normally have is absent or inverted.
              The market may be in a sharp downtrend or panic mode — dangerous territory for covered calls.
            </p>
            <p className="text-xs mt-2 font-medium" style={{ color: red }}>
              What to do: Hold existing positions carefully. Check for alerts. Don't open anything new until conditions improve.
            </p>
          </Card>
        </div>

        <Card>
          <div className="text-sm font-semibold mb-3" style={{ color: text }}>The six factors behind the signal</div>
          <div className="space-y-3 text-xs" style={{ color: muted }}>
            {[
              { label: 'Option Price Level',    why: 'Are options priced generously enough to sell? When they are, you earn more per trade. When they\'re cheap, the income isn\'t worth the risk of your shares getting called away.' },
              { label: 'Volatility Level',      why: 'Is market turbulence in a healthy range? A moderate amount of volatility is good — it\'s what makes options valuable. Too much panic and the market can move too fast for covered calls to work well.' },
              { label: 'Volatility Stability',  why: 'Is volatility itself predictable right now? Sudden spikes in volatility increase option prices after you\'ve sold — that\'s bad for sellers. Stable volatility makes your outcome more predictable.' },
              { label: 'Market Trend',          why: 'Is the market moving too fast in one direction? Covered calls work best when the market is flat or rising gently. A sharp runup means your shares might get called away before you want.' },
              { label: 'Interest Rates',        why: 'Is the bond market signaling good or bad news for stocks? Rising rates can be a headwind for equities — which increases the chance a sharp move takes your position into trouble.' },
              { label: 'Economic Stress Signal', why: 'Is the broader economy showing signs of strain? An inverted yield curve has historically preceded recessions. It\'s a tie-breaker that adds context when other signals are mixed.' },
            ].map(f => (
              <div key={f.label} className="flex gap-3">
                <div className="w-36 shrink-0 font-semibold" style={{ color: text }}>{f.label}</div>
                <div>{f.why}</div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* ── 3. How We Score Opportunities ────────────────────────────────────── */}
      <Section
        id="how-we-score"
        title="3 · How We Score Opportunities"
        subtitle="The 4-part formula that ranks every option"
      >
        <p className="text-sm leading-relaxed" style={{ color: muted }}>
          When the market signal is positive, Harvest looks at every available SPY option and ranks them.
          Each option gets a score from 0 to 100. The higher the score, the better the opportunity.
        </p>

        <Card>
          <div className="text-sm font-semibold mb-4" style={{ color: text }}>Score = A + B + C + D</div>
          <div className="space-y-4">
            <FormulaBar label="A · Market Signal"      pct={25} color={green} pts="up to 25 pts" />
            <FormulaBar label="B · Income Potential"   pct={30} color={green} pts="up to 30 pts" />
            <FormulaBar label="C · Assignment Risk"    pct={20} color={amber} pts="up to 20 pts" />
            <FormulaBar label="D · Timing Sweet Spot"  pct={25} color={amber} pts="up to 25 pts" />
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          <Card accent={green}>
            <div className="text-sm font-semibold mb-2" style={{ color: text }}>A · Market Signal <span className="text-xs font-normal" style={{ color: muted }}>(up to 25 pts)</span></div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              The current market signal score (out of 12) is scaled into 25 points.
              If the signal is strong, every option starts from a better baseline.
              If the signal says "Not a Good Time," no option can score above 75 — protecting you from acting on good-looking numbers in bad conditions.
            </p>
            <p className="text-xs mt-2" style={{ color: green }}>
              Why it matters: A great-looking option in a bad market is still a bad trade.
            </p>
          </Card>

          <Card accent={green}>
            <div className="text-sm font-semibold mb-2" style={{ color: text }}>B · Income Potential <span className="text-xs font-normal" style={{ color: muted }}>(up to 30 pts)</span></div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              How much income you'd collect as a percentage of what SPY is worth right now.
              A higher income-to-price ratio means better bang for your risk.
              Options collecting less than a reasonable threshold score low here — the income just isn't worth tying up your shares.
            </p>
            <p className="text-xs mt-2" style={{ color: green }}>
              Why it matters: Income potential is the primary reason for doing this. It gets the most weight.
            </p>
          </Card>

          <Card accent={amber}>
            <div className="text-sm font-semibold mb-2" style={{ color: text }}>C · Assignment Risk <span className="text-xs font-normal" style={{ color: muted }}>(up to 20 pts)</span></div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              How likely is it that SPY reaches your strike price and your shares get called away?
              Lower assignment risk (a lower delta number) means more buffer between where SPY is now and where it needs to be to trigger a sale.
              High-risk options score low here even if they pay more — because the risk of assignment outweighs the income.
            </p>
            <p className="text-xs mt-2" style={{ color: amber }}>
              Why it matters: Getting assigned isn't always bad, but it should be on your terms, not the market's.
            </p>
          </Card>

          <Card accent={amber}>
            <div className="text-sm font-semibold mb-2" style={{ color: text }}>D · Timing Sweet Spot <span className="text-xs font-normal" style={{ color: muted }}>(up to 25 pts)</span></div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Options lose value (decay) as they approach expiration — which is what you want as a seller.
              This decay accelerates most in the 21–45 day window before expiry.
              Options in that window get full points. Very short-dated options (under 7 days) get zero — the risk of last-minute moves isn't worth it.
              Very long-dated options also score lower — too much capital tied up for too long.
            </p>
            <p className="text-xs mt-2" style={{ color: amber }}>
              Why it matters: Selling in the sweet spot means faster, more predictable income decay in your favor.
            </p>
          </Card>
        </div>

        {/* Score → Recommendation */}
        <Card>
          <div className="text-sm font-semibold mb-3" style={{ color: text }}>What the score means</div>
          <div className="space-y-3">
            {[
              { score: '75 – 100',  label: 'Open Now — Best Pick',  color: green, desc: 'All four components are strong and the market signal is aligned. This is the highest-conviction opportunity available right now.' },
              { score: '60 – 74',  label: 'Open — Good Choice',    color: green, desc: 'A solid candidate. Good income, low assignment risk, expiry in the right window.' },
              { score: '45 – 59',  label: 'Consider',               color: amber, desc: 'Acceptable but not ideal. One component is weaker than the others — try a different expiry date to see if you can score higher.' },
              { score: 'Under 45', label: 'Skip',                   color: muted, desc: 'Score too low. The income is too thin, the risk is too high, or the timing is off.' },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-3 text-xs">
                <div className="shrink-0 w-20 font-mono font-bold" style={{ color: r.color }}>{r.score}</div>
                <div>
                  <div className="font-semibold mb-0.5" style={{ color: r.color }}>{r.label}</div>
                  <div style={{ color: muted }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* ── 4. Understanding Your Alerts ─────────────────────────────────────── */}
      <Section
        id="alerts"
        title="4 · Understanding Your Alerts"
        subtitle="Every alert type explained, with example scenarios"
      >
        <p className="text-sm leading-relaxed" style={{ color: muted }}>
          Once you have open positions, Harvest monitors them continuously and surfaces alerts when action may be needed.
          Here's what each one means and what to do about it.
        </p>

        <div className="space-y-3">

          <Card accent={red}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: red }}>Expiring Soon — Act Now</span>
              <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: `${red}18`, color: red, borderRadius: 'var(--radius-sm)' }}>URGENT</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Your option expires in 7 days or fewer. At this stage, the "gamma" risk is high —
              meaning the option's delta (assignment probability) can change very quickly with small moves in SPY.
              If you haven't already locked in most of your profit, now is the time to close or roll.
            </p>
            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: muted, borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: text }}>Example:</strong> You sold a $540 call expiring Friday. SPY is at $537 and rising.
              With 3 days left, even a 1% move could push you into assignment territory. Close now and redeploy next week.
            </p>
          </Card>

          <Card accent={red}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: red }}>Strike Price at Risk</span>
              <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: `${red}18`, color: red, borderRadius: 'var(--radius-sm)' }}>URGENT</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              SPY is within 1.5% of your strike price. This means the call is close to the money
              and your shares are at real risk of being called away before expiry.
              You need to decide: close the position to protect your upside, wait and hope SPY pulls back,
              or roll to a higher strike.
            </p>
            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: muted, borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: text }}>Example:</strong> You sold a $545 call. SPY is now at $537.
              That's only $8 away — a normal day's move. The assignment risk badge will show red.
              If SPY breaks $545, the buyer exercises and you sell your shares at $545.
            </p>
          </Card>

          <Card accent={amber}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: amber }}>Time to Renew</span>
              <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: `${amber}18`, color: amber, borderRadius: 'var(--radius-sm)' }}>HIGH</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              Your position is getting close to expiry (typically 7–21 days out) and you've captured
              most of the premium that was available. This is the sweet spot for rolling:
              close the current position and open a new one further out to collect fresh income.
            </p>
            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: muted, borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: text }}>Example:</strong> You sold a call 35 days ago for $2.50. Now it's worth $0.40 and has 12 days left.
              You've captured 84% of the premium. Roll now — buy it back for $0.40 and sell a new one with 30+ days left.
            </p>
          </Card>

          <Card accent={green}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: green }}>Lock In Profits</span>
              <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: `${green}18`, color: green, borderRadius: 'var(--radius-sm)' }}>HIGH</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              The option has decayed to 50% or less of what you sold it for. Closing here locks in at least half
              your max profit while removing all remaining risk of assignment. This is the professional standard
              for covered call management — don't get greedy holding for the last few cents.
            </p>
            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: muted, borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: text }}>Example:</strong> You sold a call for $2.50. It's now worth $1.10 — you've captured $1.40 (56%).
              Close it, keep the $1.40 per share in income, and free up your shares to sell another call.
            </p>
          </Card>

          <Card accent={amber}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold" style={{ color: amber }}>Market Recovery — Review Calls</span>
              <span className="text-xs px-1.5 py-0.5 font-mono" style={{ backgroundColor: `${amber}18`, color: amber, borderRadius: 'var(--radius-sm)' }}>WATCH</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: muted }}>
              The market just dropped sharply and is now bouncing back. This is actually a risky time for covered calls —
              if SPY rebounds quickly, your call caps the gains your shares would otherwise make.
              Consider whether the recovery is likely to be fast (you'd want to close the call) or slow (you can hold).
            </p>
            <p className="text-xs mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: muted, borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: text }}>Example:</strong> SPY fell 4% last week and is now sharply recovering. Your $540 call,
              which seemed safely out of the money, suddenly looks vulnerable as SPY climbs back toward it.
            </p>
          </Card>
        </div>
      </Section>

      {/* ── 5. Common Questions ───────────────────────────────────────────────── */}
      <Section
        id="faq"
        title="5 · Common Questions"
        subtitle="Answers to the questions that come up most often"
      >
        <div className="space-y-2">

          <FAQ question="What happens if my shares get called away?">
            <p>
              If SPY closes above your strike price at expiry, the buyer exercises their right and your shares are sold at the strike price.
              This isn't a disaster — you chose the strike price, you collected the premium, and you sell at a price you agreed to in advance.
            </p>
            <p>
              <strong style={{ color: text }}>What you gain:</strong> You keep all the premium income you collected upfront. You sell your shares at the strike (often above your original purchase price). You can use the cash to buy SPY back and start again.
            </p>
            <p>
              <strong style={{ color: text }}>What you give up:</strong> Any gains above the strike price. If SPY was $540 and shot to $560, you sold at $540 and missed the last $20 per share of upside.
            </p>
            <p>
              This is the core tradeoff of covered calls: consistent income now, in exchange for capping your upside on extreme rallies.
              For most long-term holders, this is a favorable trade.
            </p>
          </FAQ>

          <FAQ question="Should I always follow the recommendation?">
            <p>
              No — and Harvest is designed to help you make an informed decision, not to make it for you.
              The recommendation is based on market conditions and position math, but it doesn't know your personal situation.
            </p>
            <p>
              <strong style={{ color: text }}>Things Harvest doesn't know:</strong> Your tax situation (closing a position may trigger a taxable gain this year). Your personal view on the market. Upcoming expenses that affect how much you want tied up in shares. Macro events you're aware of.
            </p>
            <p>
              Use the recommendations as a starting point. The confidence score and the "your options" breakdown are there to help you weigh the tradeoffs yourself.
            </p>
          </FAQ>

          <FAQ question="What do I do in a market crash?">
            <p>
              During a sharp market decline, the signal will move to "Be Careful" or "Not a Good Time." That's your cue to stop opening new positions.
            </p>
            <p>
              <strong style={{ color: text }}>For existing positions:</strong> Short calls actually work in your favor during a declining market — the calls lose value quickly and you can close them at a profit. Check the "Lock In Profits" alert — it may fire early if the market drops fast.
            </p>
            <p>
              <strong style={{ color: text }}>After the crash:</strong> The tricky period is the recovery phase. If the market bounces sharply, calls you opened near the bottom can quickly move into the money. The "Market Recovery" alert will flag this. Consider rolling to a higher strike or closing if the recovery is fast.
            </p>
            <p>
              Covered calls historically perform best in flat-to-slightly-bullish markets and still provide partial protection in moderate declines (you keep the premium). The worst case is a sharp crash followed by an equally sharp recovery — which is why the recovery phase flag exists.
            </p>
          </FAQ>

          <FAQ question="What does 'assignment' mean and should I be afraid of it?">
            <p>
              Assignment happens when the buyer of your call option decides to exercise their right and buy your shares.
              This occurs when SPY closes above your strike price at expiry.
            </p>
            <p>
              <strong style={{ color: text }}>Is it bad?</strong> Not necessarily. You sold your shares at the strike price (which you agreed to), kept the premium, and now have cash. You can simply buy SPY back and sell another call.
            </p>
            <p>
              <strong style={{ color: text }}>What to watch out for:</strong> Taxes. Selling shares is a taxable event. If you've held them a long time, the sale may trigger long-term capital gains. Check with your tax advisor if you're close to a strike and want to avoid assignment for tax reasons — rolling to a higher strike is usually the solution.
            </p>
          </FAQ>

          <FAQ question="Why doesn't Harvest factor in my tax situation when picking strikes?">
            <p>
              This is intentional. Professional covered call managers — including those behind the CBOE BXM index,
              AQR, and Parametric — all select strikes on a pre-tax basis. Tax is managed separately through rolling,
              lot selection, and other post-trade techniques.
            </p>
            <p>
              Incorporating tax into strike selection has a known problem: it tends to push toward higher-delta or
              longer-dated options, which violates the risk controls that make the strategy work in the first place.
              The app shows your estimated tax exposure in the screener for awareness, but doesn't let it override
              the strike quality scoring.
            </p>
          </FAQ>

          <FAQ question="How often should I check the app?">
            <p>
              For most positions, once per day (or even every few days) is enough. Covered calls are not a day-trading strategy.
            </p>
            <p>
              <strong style={{ color: text }}>Check more often when:</strong> You have a position with under 14 days to expiry. SPY has moved more than 1% in a day. A red alert badge appears on "My Positions" in the sidebar.
            </p>
            <p>
              The sidebar badge and the alert strip at the top are designed to make urgency visible without requiring you to navigate into the app to find out if something needs attention.
            </p>
          </FAQ>

          <FAQ question="What is 'rolling' and when should I do it?">
            <p>
              Rolling means closing your current option and immediately opening a new one further in the future.
              It's how you maintain continuous income without ever running out of positions to manage.
            </p>
            <p>
              <strong style={{ color: text }}>Roll when:</strong> Your current position has decayed to 50% of its value (capture profit, redeploy). You have fewer than 21 days to expiry and a new 30–45 day option is available. SPY is approaching your strike and you want to move the ceiling higher.
            </p>
            <p>
              <strong style={{ color: text }}>What happens to your shares:</strong> Nothing. You still own them throughout. Rolling is just two trades: buy back the old call, sell a new one. Your shares never leave your account.
            </p>
          </FAQ>

        </div>
      </Section>

      {/* Academic footnote */}
      <div className="border-l-2 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs leading-relaxed" style={{ color: muted }}>
          <span className="font-medium" style={{ color: text }}>Academic basis:</span>{' '}
          Israelov & Nielsen (AQR, FAJ 2015) — regime-aware premium harvesting · Whaley (2002) — CBOE BXM buy-write study ·
          Ibbotson Associates (2004) — BXM Sharpe ratio research · Harvey & Whaley — VRP mean reversion ·
          TastyTrade research — 50% profit rule · Foltice (SSRN 2021) — after-tax OTM covered call returns.
          Core thesis: implied volatility historically exceeds realized volatility by ~3 points — the Volatility Risk Premium is the seller's edge.
        </p>
      </div>

    </div>
  )
}
