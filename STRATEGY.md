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
- Track up to **3 positions**
- **1 screener run per day** (UsageLog table, backend-enforced)
- Calculator: unlimited (public, no login, email gate at 3 anonymous uses)
- 7-day history
- No alerts, no roll targets, no scorecard, no OI chain

### Pro Tier — $29/month or $240/year ($20/mo effective)
- Unlimited positions
- Full screener (all results, unlimited runs)
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
| Auth | python-jose JWT + bcrypt + SQLite | Backend done, frontend pending |
| Database | SQLite via SQLModel | Done |
| Hosting — app | Railway | Not yet deployed publicly |
| Hosting — marketing | Vercel | Not yet deployed |
| Payments | Stripe Checkout + Customer Portal | Not yet built |
| Email | Resend (transactional) + Loops (drip) | Not yet built |

**Python version:** 3.9 — avoid 3.10+ union syntax (`X | Y`); use `Union[X, Y]` from typing.

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
- Freemium gates — 3-position limit, 1 screener/day, Pro-only scorecard + OI chain
- Upgrade UI — `UpgradeModal.jsx`, `LockedFeature.jsx`, `PositionLimitBanner.jsx`
- Marketing site deployed to Vercel: `https://marketing-five-taupe.vercel.app`
  - 15 static pages including `/learn/[slug]` article templates
  - HowTo, Article, FAQPage JSON-LD schema
  - Calculator widget with email gate after 3 anonymous uses

### What's Next
1. Deploy backend to Railway (app still running locally)
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
| PIPE-029 | Freemium gates + upgrade UI | Backend: 3-position slice, 1 screener/day (UsageLog), Pro-only scorecard + OI chain; Frontend: UpgradeModal, LockedFeature, PositionLimitBanner |
| MKTG | Marketing site | Next.js, 15 static pages, JSON-LD SEO, calculator widget, pricing, /learn/[slug] — deployed to Vercel |

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
- **Auth stack:** JWT + bcrypt + SQLite — not Supabase, not Firebase
- **Free tier primary gate:** 3 positions (hard limit)
- **Free tier secondary gate:** 1 screener run/day (soft, with upgrade prompt)
- **Calculator gate:** 3 anonymous uses (localStorage), then email — no login required
- **First acquisition channel:** r/dividends post + Seeking Alpha article
- **Charts library:** Airbnb Visx — not Recharts (removed)
- **Python target:** 3.9 — no 3.10+ union syntax
