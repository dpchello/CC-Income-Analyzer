# Harvest — Master Strategy

> **This is the source of truth for all product, technical, and marketing decisions.**
>
> Read this at the start of every session. Check every plan and feature against it before
> building. If something conflicts, surface the conflict and get approval before proceeding.
> Approved changes must be written back here first, then cascade to MARKETING_PLAN.md and
> PIPELINE.md.

---

## Product Vision

Harvest helps passive, buy-and-hold investors collect covered call income from stocks they
already own — without learning options trading, without watching the market, without jargon.

The target user owns stocks and earns $0 in covered call income today. Not because they can't,
but because every existing tool assumes they're an active trader. Harvest is the first tool
built for the holder, not the trader.

**Primary competitor:** Inaction. The user's current workflow is doing nothing.

---

## Positioning

**Tagline:** "Find, Track, and Capture Every Covered Call Opportunity."

**Positioning statement:** Harvest turns the stocks you already own into a source of monthly
income — without learning options, without watching the market, without the jargon.

**Voice:** Income, yield, momentum. No farming metaphors. No trader jargon unless explained
inline. Outcome-first ("earn $280 this month from AAPL"), calm, confident, trustworthy.

---

## Target Audience

Prioritized by first-user acquisition potential:

| Priority | Segment | Platform | Size | Why |
|---|---|---|---|---|
| #1 | Dividend-income investors | r/dividends, Seeking Alpha | 830K / 30M | Income-obsessed, no CC tool, pays for tools |
| #2 | Passive buy-and-hold holders | r/investing, r/Bogleheads | 3M+ | Largest pool, your origin story resonates |
| #3 | Tired theta traders | r/thetagang | 300K | Already sold on CC, want less grind |
| #4 | YouTube income community | Joseph Carlson, Options with Davis | 700K+ | High income motivation, no CC tool |
| #5 | Seeking Alpha writers/readers | seekingalpha.com | 30M/mo | Pays for tools, SA article is the play |

**First user acquisition:** r/dividends post + Seeking Alpha article. Not paid. Not SEO (6-month play).

**Message that converts:** "You track your dividends. Here's what you're leaving on the table
on the same stocks."

---

## Freemium Model

**Philosophy:** Show the income number on everything. Gate the recommendations and tracking.
Every free-tier interaction should end with a dollar amount the user can't yet act on.

### Free Tier
- Track up to **3 positions** (hard cap)
- **$1,000 cumulative-profit gate** — once a free user's banked profit from closed
  positions reaches $1,000, mutating actions (open / modify / close positions) are blocked
  until they upgrade. They've proven the value; now they pay.
  (`check_write_access`, `PROFIT_GATE_THRESHOLD` — backend-enforced, live)
- **Screener: unlimited runs**; results limited to the top opportunity (Pro unlocks all)
- Calculator: unlimited (public, no login, email gate at 3 anonymous uses)
- 7-day history
- No alerts, no roll targets, no scorecard, no OI chain

### Pro Tier — $29/month or $240/year ($20/mo effective)
- Unlimited positions
- Full screener — all ranked results (free sees only the top opportunity)
- 12-month history + CSV export
- Roll targets, scorecard, early exercise signals, tax context
- Email/push alerts
- OI chain access

**Pricing psychology:** Lead with annual ($240/yr). Frame against dividend yield:
"Most dividend stocks pay 2-3%. Harvest users average 8-15% annualized."

---

## Tech Stack

| Layer | Technology | Status |
|---|---|---|
| Frontend app | React 18 + Vite | Done |
| Charts | Airbnb Visx (replaces Recharts) | Done |
| Styling | Tailwind + CSS variables | Done |
| Marketing site | Next.js 14 App Router | Built, not deployed |
| Backend API | FastAPI + Python 3.9 | Done |
| Market data | yfinance (free) | Done |
| Financial data | AlphaVantage (25 calls/day free) | Done, key in env var |
| Auth | python-jose JWT + bcrypt | Backend done, frontend pending |
| Database | Supabase (Postgres) + RLS | Replacing SQLite — migration pending |
| Hosting — app | Self-hosted local Mac app (Harvest.app / harvestctl.sh) | Runs locally on the user's Mac (uvicorn on 127.0.0.1:8000) |
| Hosting — marketing | Vercel | Not yet deployed |
| Payments | Stripe Checkout + Customer Portal | Not yet built |
| Email | Resend (transactional) + Loops (drip) | Not yet built |

**Python version:** 3.9 — avoid 3.10+ union syntax (`X | Y`); use `Union[X, Y]` from typing.

---

## Position Defense / Repair

A covered-call writer's worst non-loss outcome is having a winning stock called away below
where it now trades — capping the upside on shares they wanted to keep. When a short call goes
**deep in-the-money** and assignment looms, Harvest's job is to hand the holder a concrete
escape plan, not just a warning. This extends the core promise ("keep the shares you want to
keep") into the moment it matters most.

**The escape plan, in order of preference:**

1. **Roll up / out / up-and-out** — lift the assignment ceiling, preferring a net credit (or the
   smallest debit the chain allows). Flag clearly when no roll avoids realizing a loss.
2. **Finance the buyback** — when a roll alone can't cover the cost to close, surface short-dated,
   low-delta income trades (high probability of expiring worthless — low chance of being called)
   whose premium generates the cash to buy back the tested call.
3. **Track the runway** — show *cost-to-close* and *financing runway*: how many income cycles, at
   the current premium pace, to neutralize the position.

**Status:** **partially built.** Item #1 (roll up / out / up-and-out) is live: near-dated
3-scenario roll targets surface in the action cards (PIPE-001), and the **diagonal-restructure
LEAP engine** (PIPE-002) extends it across the full long-dated horizon — ranking candidates on
upside kept, tax deferral, net credit, and assignment safety, and exposing the coverage-ratio
(contract-count) lever. Item #2 (finance-the-buyback) and item #3 (runway) remain queued
(PIPE-036). Scored as goal #6 in the `/whats-next` strategist rubric; leading indicator is
*positions defended without a forced assignment* and the trend in their cost-to-close.

**Why it's a wedge:** holder-focused tools *warn* you about assignment; none *engineer the way
out*. A visible "roll-to-credit + finance-the-buyback, with a runway" workflow is differentiated
and on-brand for the holder, not the trader.

---

## Current Product State

**Ready for first real user.** Auth gate, freemium limits, upgrade UI, and marketing site are all live.

### What's Done
- Full React dashboard: Overview, My Positions, Find Opportunities, Market Conditions, How It Works, Settings
- Signal engine (6-factor: IV Rank, VIX, VVIX, Trend, Rates, Curve)
- Composite screener (Signal 25 + Yield 30 + Delta 20 + DTE 25)
- Portfolio management (multi-portfolio, archive, holdings)
- Covered call calculator — any ticker, IP rate-limited, pro users bypass limit
- JWT auth backend + frontend gate (`auth.jsx`, `AuthGate.jsx`, `apiFetch()`)
- Freemium gates — $1,000 cumulative-profit gate (live), Pro-only scorecard + OI chain (live); 3-position hard cap enforced in UI, backend enforcement queued (PIPE-029); screener run-limit removed 2026-05-31
- Upgrade UI — `UpgradeModal.jsx`, `LockedFeature.jsx`, `PositionLimitBanner.jsx`
- Marketing site deployed to Vercel: `https://marketing-five-taupe.vercel.app`
  - 15 static pages including `/learn/[slug]` article templates
  - HowTo, Article, FAQPage JSON-LD schema
  - Calculator widget with email gate after 3 anonymous uses

### What's Next
1. Finalize the local Mac app packaging (Harvest.app launcher + harvestctl.sh) — self-hosted, no cloud host
2. Stripe billing (PIPE-031)
3. r/dividends post + Seeking Alpha article (first acquisition)
4. QA pass — test full free user flow end to end

---

## Feature Log

Every shipped feature, what it does, and why it exists.

| ID | Feature | Purpose |
|---|---|---|
| — | Signal Engine (6-factor) | Regime-gated entry: tells users WHEN to write calls, not just what strike |
| — | Composite Screener Score | Ranks opportunities by income potential + safety, not just yield |
| — | Portfolio Management | Multi-portfolio tracking, archive, holdings — core product utility |
| — | Portfolio Intelligence Panel | Regime banner + action items surfaced on every position |
| — | All Portfolios Aggregate View | Concentration warnings, total exposure across all portfolios |
| — | OI Tracker | Daily OI snapshots + 1d/7d change signals for institutional flow |
| PIPE-003 | Position Notes | Free-text notes per position for rationale and audit trail |
| PIPE-005 | OI Snapshot Button | Manual OI capture in Settings to seed history on demand |
| PIPE-009 | Signal Snapshot on Open/Close | Records market conditions at trade time — required for scorecard |
| PIPE-010 | True Realized P&L + Tax Summary | Banked gains, tax exposure, win rate — not just mark-to-market |
| PIPE-011 | Full Chain OI Chart | Put/call OI by strike — reveals institutional positioning and pin risk |
| PIPE-012 | Recommendation Log | Persistent log of what the app recommended and when, for scorecard |
| PIPE-013 | Execution Scorecard | Adherence rate, hypothetical missed P&L, behavioral feedback |
| PIPE-014 | App Rename → Harvest | New brand, removed SPY-specific labels, generalized for multi-ticker |
| PIPE-015 | Design System Foundations | Rounded corners, warmer greens, larger numbers — personal finance feel |
| PIPE-016 | Plain English Labels + Glossary | Removed all jargon, central GLOSSARY, `<Term>` tooltip component |
| PIPE-017 | Sidebar + Alert Navigation | Left sidebar (desktop), drawer (mobile), alert badge on My Positions |
| PIPE-018 | Overview Page Redesign | "Is everything okay?" hero + urgent action strip + income summary |
| PIPE-019 | Tax & P&L Aware Action Cards | Shows P&L and tax impact of close vs. wait vs. roll on every card |
| PIPE-020 | Confidence Scoring | % confidence + factor breakdown on every recommendation |
| PIPE-021 | Macro-Aware Rule Engine | FOMC calendar + user events + news keywords soften timing rules |
| PIPE-022 | Feedback + Notification Delivery | "This doesn't make sense" button, SMTP/SMS delivery |
| PIPE-023 | Alert Persistence + Nav Badges | Alert count badge, header strip when urgent and not on My Positions |
| PIPE-025 | Contextual Tooltips | (?) on every financial term, hover + tap, pulls from GLOSSARY |
| PIPE-026 | Score Guide → How It Works | Non-trader audience rewrite, 5-section explainer, FAQ |
| PIPE-027 | Empty State Redesign | Action-oriented prompts with next steps — no passive empty states |
| CALC | Calculator (any ticker) | Public, rate-limited, pro bypass — top-of-funnel lead gen tool |
| AUTH-BE | Auth backend | JWT signup/login/me, bcrypt, SQLite User/Subscription/UsageLog |
| PIPE-028 | Frontend auth gate | AuthProvider + AuthGate + apiFetch — app requires login, token in localStorage |
| PIPE-029 | Freemium gates + upgrade UI | $1,000 profit gate (live) + 3-position hard cap (backend enforcement queued) + Pro-only scorecard + OI chain; Frontend: UpgradeModal, LockedFeature, PositionLimitBanner. Screener run-limit removed 2026-05-31. |
| MKTG | Marketing site | Next.js, 15 static pages, JSON-LD SEO, calculator widget, pricing, /learn/[slug] — deployed to Vercel |
| PIPE-034 | SnapTrade Brokerage Import | Full SnapTrade integration: register user, connect portal, account selection, holdings import with dedup (upsert by snaptrade_account_id), category mapping (long_stock/covered_call/options), avg_cost from average_purchase_price |
| PIPE-035 | Brokerage Portfolio Folders | Auto-creates one portfolio per SnapTrade account on sync, grouped into collapsible brokerage folders in sidebar; starred portfolios float to top; any portfolio renameable inline; dedup fixed with unique index on (user_id, snaptrade_account_id) |
| PIPE-001 | Roll Targets + Defense in Action Cards | Near-dated 3-scenario roll targets, early-exercise risk badges, and "Roll to this" prefill surfaced on ITM positions — the roll-up/out leg of Position Defense |
| PIPE-002 | Diagonal Restructure (LEAP roll engine) | `/api/diagonal-restructure` scans the full LEAP horizon and ranks rolls on a 4-factor composite (upside kept · tax deferral · net credit · assignment safety); surfaces a net-credit frontier ("how far out / how high") + coverage-ratio lever in the action card. Extends Position Defense item #1 beyond near-dated rolls |

---

## Document Hierarchy

```
STRATEGY.md          ← you are here (master, read first)
├── MARKETING_PLAN.md    ← commercial detail, launch sequence, audience
├── PIPELINE.md          ← technical build queue, status per item
├── Viability.md         ← market research (reference, Section 8 superseded)
├── Felix.md             ← Ben Felix covered call critique (research)
└── API_REFERENCE.md     ← API docs
```

Changes approved in STRATEGY.md cascade to MARKETING_PLAN.md and PIPELINE.md.
PIPELINE.md and MARKETING_PLAN.md do NOT override STRATEGY.md.

---

## Locked Decisions

These are not up for re-discussion without an explicit strategy conversation:

- **Name:** Harvest (no farming metaphors)
- **Tagline:** "Find, Track, and Capture Every Covered Call Opportunity."
- **Pricing:** $29/mo or $240/yr — not lower
- **Auth stack:** JWT + bcrypt — auth layer stays custom. Database is Supabase (Postgres) with RLS for data isolation. No Supabase Auth.
- **Free tier hard cap:** 3 positions (hard limit)
- **Free tier profit gate:** $1,000 cumulative closed-position profit → mutating actions
  blocked until upgrade. Supplements the 3-position cap (`check_write_access`,
  `PROFIT_GATE_THRESHOLD`). Instituted 2026-05-31.
- **Screener:** unlimited runs for free users; results limited to the top opportunity
  (Pro unlocks all). The former "1 run/day" limit was removed 2026-05-31.
- **Calculator gate:** 3 anonymous uses (localStorage), then email — no login required
- **First acquisition channel:** r/dividends post + Seeking Alpha article
- **Charts library:** Airbnb Visx — not Recharts (removed)
- **Python target:** 3.9 — no 3.10+ union syntax
- **App hosting:** Self-hosted as a local Mac app (Harvest.app / harvestctl.sh, uvicorn on
  127.0.0.1:8000). **Railway is deprecated and fully removed (2026-06-03)** — no `railway.json`,
  `Procfile`, or `Dockerfile`. Marketing site stays on Vercel. A cloud host (Fly, Render, etc.)
  is a future migration option only when revenue justifies it.
