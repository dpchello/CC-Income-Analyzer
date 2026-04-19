# Harvest — Marketing & Frontend Development Plan
# Freemium Relaunch, April 2026

> USER COMMENTS: prefix any inline feedback with "USER:" and I'll incorporate before executing.

---

## 1. Brand Voice & Positioning

### Name: Harvest
Keep it. Drop all farming metaphors (no "plant", "grow", "crop rotation", "seeds").
Instead, lean into **income, yield, and momentum** — the same emotional register as apps like
Robinhood, Acorns, and Stash that made finance feel approachable.

### Core Positioning Statement
> "Harvest turns the stocks you already own into a source of monthly income —
> without learning options, without watching the market, without the jargon."

### Tagline Options (pick one, USER: mark preferred)
- A) **"Your portfolio, finally earning more."**
- B) **"Turn your stocks into a paycheck."**
- C) **"Stop leaving money on the table."**
- D) **"Monthly income from stocks you already own."**

### Voice Principles
- No options jargon (no Greeks, no delta, no IV unless explained inline)
- Outcome-first ("earn $280 this month from AAPL") not process-first
- Confident but not bro-finance — calm, smart, trustworthy
- Short sentences. Real numbers. Plain English.

### What We Sound Like
| Don't say | Say instead |
|-----------|-------------|
| "Sell a covered call at delta 0.18" | "Collect income from AAPL this month" |
| "IV rank is elevated" | "Good time to earn more than usual on this stock" |
| "Roll the position" | "Extend your income window by a few weeks" |
| "Assignment risk" | "Your stock might get sold — here's what to do" |
| "Theta decay" | "Your premium builds up daily while you wait" |

---

## 2. Target Audience

### Primary Acquisition Target: The Dividend-Income Investor (r/dividends, Seeking Alpha)
- Already obsessed with income from stock holdings (dividends, REITs)
- Owns 10-30 positions, tracks dividends carefully
- Knows covered calls exist but has never had a tool built for them
- Platform: r/dividends (830K members), Seeking Alpha readers (30M/mo)
- Message: "You track your dividends. Here's what you're leaving on the table on the same stocks."

### Primary User: The "I Own Stocks, Now What?" Investor
- Holds 5-20 stocks or ETFs (SPY, QQQ, AAPL, MSFT, etc.)
- Has a brokerage account (Schwab, Fidelity, Robinhood, TD/thinkorswim)
- Wants passive income — dividends aren't enough
- Age 28-55, comfortable with apps, not a trader
- Has heard of covered calls but never tried them — intimidated by complexity

### Secondary: The Tired Theta Trader
- Started running the wheel strategy, found it exhausting
- Wants the income without the daily discipline — Harvest's passive angle is the pitch
- Platform: r/thetagang (300K members) — but already has tools, convert with "less work" angle

### Not our user (for now)
- Active day traders (WingmanTracker, TastyTrade serve them)
- Institutional/professional options traders
- People with <$5K in holdings (covered calls don't pencil out below ~100 shares)

---

## 3. Freemium Model

### Philosophy
The free tier is a **taste of the income number** — just enough to make them feel what
they're leaving on the table. Every free-tier interaction should end with a
locked/blurred screen that shows a dollar amount they can't yet access.

### Free Tier — "Harvest Free"
- Track up to **3 positions**
- See **1 recommendation per day** (rotates through their positions)
- **Income calculator**: up to 2 stocks, current month only
- **7-day income history**
- **No alerts** (no email, no push)
- Blurred/locked view of all remaining positions with income estimates visible
- "You could be earning $X more this month" upsell banner on every screen

### Paid Tier — "Harvest Pro" ($29/month or $240/year — $20/mo effective)
- **Unlimited positions**
- **All daily recommendations** — every position, every day
- **Full income history** (12 months)
- **Alert system**: email + push for roll reminders, earnings warnings, ex-dividend dates
- **Early exercise risk signals**
- **Tax context**: short-term vs long-term impact warnings
- **CSV export**
- **Priority support**

### Freemium Conversion Triggers (UI moments that drive upgrades)
1. **Income blur**: Show total estimated monthly income, blur the breakdown. "Unlock $420/mo →"
2. **Position limit hit**: "You have 4 more positions that could be earning. Upgrade to track all of them."
3. **Recommendation gate**: "3 more recommendations ready today. Upgrade to see them."
4. **Alert tease**: "AAPL earnings in 4 days — this affects your position. Upgrade for the alert."
5. **History gate**: "You earned $380 last month. Upgrade to see your full income history."
6. **Roll reminder**: "One of your positions needs attention. Upgrade to see which one."

### Pricing Psychology
- Lead with annual ($240/yr = $20/month) — feels cheaper than $29/month
- Frame against dividend yield: "Most dividend stocks pay 2-3%. Harvest users average 8-15% annualized."
- No free trial — free tier IS the trial. No credit card needed to start.
- Single plan keeps decision simple (no "starter vs pro" paralysis)

---

## 4. Marketing Site — Page Architecture

### Pages to Build (Priority Order)

#### P1 — Homepage (/)
The conversion machine. Every section earns the scroll.

**Hero section:**
- Headline: [chosen tagline]
- Subheadline: "Track your covered call income, get plain-English recommendations, and collect more from the stocks you already own."
- CTA: "See what your portfolio could earn — free" → income calculator
- Supporting visual: Harvest dashboard screenshot with real income numbers

**Problem section:**
- "Most investors own great stocks. Most are leaving 8-15% in annual income sitting uncollected."
- 3-stat social proof: avg premium, # of users, total income tracked

**How it works (3 steps, no jargon):**
1. "Add your stocks" — connect or enter manually
2. "See your income estimate" — Harvest calculates what each position could earn
3. "Follow the recommendation" — plain-English instructions, one trade per position

**Live income preview:**
- Interactive: enter a stock ticker → see estimated monthly income
- No login required. Instant. This is the top-of-funnel hook.

**Testimonials / Social proof:**
- 3 quotes from users with dollar amounts ("I earn ~$400/month extra from my AAPL shares")
- Star ratings

**FAQ section (schema-marked for AI search):**
- What is a covered call?
- Do I need options experience?
- What stocks work best?
- How much can I realistically earn?
- Is this risky?
- How is this different from dividends?

**Final CTA:**
- "Start tracking free — no credit card needed"

---

#### P2 — How It Works (/how-it-works)
Deeper walkthrough for consideration-stage visitors. Explainer + screenshot walkthrough.

#### P3 — Pricing (/pricing)
Free vs Pro table. Annual/monthly toggle. FAQ. Conversion-focused.

#### P4 — Free Covered Call Calculator (/calculator)
- Enter ticker + # of shares → see estimated monthly income
- No login required
- "Want recommendations for your full portfolio? Get Harvest free →"
- SEO magnet: targets "covered call calculator" (high volume, low competition)

#### P5 — Learn Hub (/learn)
AI search / SEO content hub. Plain-English articles targeting long-tail keywords.

Priority articles:
- "What is a covered call? (Plain English)"
- "How much income can I make selling covered calls?"
- "Best stocks for covered calls in 2026"
- "SPY covered calls: a beginner's guide"
- "Covered calls vs dividends: which pays more?"
- "How to track your covered call income"
- "When should I roll a covered call?"

#### P6 — Comparison Pages (/vs/spreadsheets, /vs/income-factory, /vs/born-to-sell)
Explicit comparison pages rank in search and capture high-intent buyers.

---

## 5. Homepage Visual Design Direction

### Aesthetic
- **Not** Bloomberg terminal. **Not** fintech bro.
- Reference: Acorns, Monarch Money, Copilot — clean, warm, trustworthy
- Dark mode primary (financial apps feel more credible in dark)
- Accent color: amber/gold (#F59E0B range) — "yield", "earnings", "gold"
- Typography: Inter or Geist — clean, modern, legible

### Hero Screenshot / Product Visual
Show a real-feeling Harvest dashboard card:
- Position name (e.g., "Apple — 100 shares")
- Status chip: "Earning this month"
- Income line: "$247 collected · $312 estimated"
- Next action: "Nothing needed — collect on May 16"
- Simple, calm, no jargon

---

## 6. SEO + AI Search Strategy

### Schema Markup (implement from day one)
```json
SoftwareApplication — name, description, applicationCategory: "FinanceApplication", offers
FAQPage — 8 Q&A blocks targeting "what is a covered call", "how much income", etc.
HowTo — 3-step covered call guide
Product — with aggregateRating
Article — on all /learn posts
```

### Top Target Keywords
| Keyword | Intent | Page |
|---------|--------|------|
| covered call income tracker | Transactional | Homepage |
| covered call calculator | Tool | /calculator |
| how much can I earn selling covered calls | Informational | /learn |
| best stocks for covered calls | Informational | /learn |
| covered call passive income | Informational | Homepage + /learn |
| SPY covered calls | Informational | /learn/spy-covered-calls |
| covered call vs dividend | Informational | /learn/vs-dividends |
| options income tracker app | Transactional | Homepage |

### AI Search (Perplexity, ChatGPT, Gemini) Optimization
- FAQ schema answers questions AI engines pull directly
- /learn articles should be structured as: question → direct answer → explanation
- Include concrete numbers in every article ("SPY weekly premiums average 0.3-0.6% of value")
- Cite sources in articles for credibility signals

---

## 7. Frontend Build Plan

### Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion (hero, scroll reveals)
- **Hosting**: Vercel (free tier, custom domain)
- **Analytics**: Plausible (privacy-first, good for finance audience)
- **Email capture**: Resend or Loops

### Component Build Order
1. Layout shell (nav, footer, mobile menu)
2. Hero section with CTA
3. Ticker income calculator widget (the free lead-gen tool)
4. How It Works 3-step section
5. Pricing table (free vs pro, annual/monthly toggle)
6. FAQ accordion (with schema markup)
7. Testimonials carousel
8. Blog/Learn index + article template
9. Comparison page template

### Freemium Gate Implementation (App)
```
Free users:
- positions: max 3 in DB query
- recommendations: max 1 per day (tracked server-side, not client)
- history: last 7 days only
- alerts: disabled (UI shows locked state with upgrade CTA)

Upgrade triggers:
- PositionLimitBanner — shows when user has >3 positions
- RecommendationGate — shows after 1st rec with blur + count of remaining
- IncomeBlur — total income visible, breakdown blurred
- AlertLock — alert UI visible, click triggers upgrade modal
```

### Auth + Payments
- **Auth**: JWT (python-jose) + bcrypt + SQLite via SQLModel — already built in `backend/auth.py`
  and `backend/database.py`. Frontend auth gate (AuthProvider, AuthGate, apiFetch) still to build.
- **Payments**: Stripe Checkout + Customer Portal
- **Subscription state**: stored in SQLite `Subscription` table, synced via Stripe webhook
  at `POST /api/webhooks/stripe`

---

## 8. Launch Sequence

### DONE — Phase 1 (Marketing Site + Calculator)
- [x] Build Next.js marketing site (`marketing/` directory, fully built)
- [x] Homepage, /calculator, /pricing, /how-it-works, /learn, sitemap
- [x] JSON-LD schema (SoftwareApplication, FAQPage, HowTo)
- [x] `GET /api/calculator` endpoint — any ticker, IP rate-limited, pro users bypass limit
- [x] `POST /api/waitlist` endpoint
- [x] AlphaVantage API key moved to env var (security fix)

### DONE — Phase 2 Backend (Auth + User Isolation)
- [x] `backend/database.py` — SQLite, User/Subscription/UsageLog models
- [x] `backend/auth.py` — JWT signup/login/me, bcrypt passwords, `get_current_user` dependency
- [x] `backend/seed_test_users.py` — pro@harvest.test + free@harvest.test test users

### THIS SPRINT — Complete Phase 2 Frontend + Phase 3 (First User)
- [ ] `frontend/src/auth.jsx` — AuthProvider, JWT localStorage, login/logout/signup
- [ ] `frontend/src/components/AuthGate.jsx` — login/signup shown to unauthenticated visitors
- [ ] `frontend/src/App.jsx` — auth gate wrap + apiFetch helper with Bearer token
- [ ] Backend free tier: positions sliced to 3, screener 1/day via UsageLog
- [ ] `UpgradeModal.jsx` + `LockedFeature.jsx` + `PositionLimitBanner.jsx`
- [ ] Deploy `marketing/` to Vercel
- [ ] `/qa` pass on full flow (anonymous calculator → signup → hit limits → upgrade prompt)
- [ ] Post in r/dividends with calculator as free tool

### Next — Phase 3 Payments (Stripe)
- [ ] `backend/billing.py` — Stripe Checkout + Customer Portal + webhook
- [ ] Wire `checkout.session.completed` → set `User.tier = "pro"`
- [ ] Wire `customer.subscription.deleted` → set `User.tier = "free"`
- [ ] Integrate Stripe into UpgradeModal

### Growth (post-first-user)
- [ ] Write Seeking Alpha article ("How I use covered calls to supplement dividend income")
- [ ] Write 7 /learn articles for SEO
- [ ] Submit sitemap to Google Search Console
- [ ] A/B test hero taglines
- [ ] Creator outreach (Joseph Carlson, Options with Davis) after 10-20 real users

---

## Decisions Made

1. **Tagline**: "Find, Track, and Capture Every Covered Call Opportunity."
2. **Free tier gate**: 3 positions (primary, hard) + 1 screener run/day (secondary, soft)
3. **Pricing**: $29/month or $240/year ($20/mo effective)
4. **Theme**: System default with user toggle (dark/light already supported)
5. **Calculator gate**: 3 anonymous uses (localStorage), then email gate — NO login required
6. **Repo**: Same monorepo (`marketing/` subdirectory in existing repo)
7. **Auth stack**: JWT (python-jose) + bcrypt + SQLite — NOT Supabase
8. **First acquisition channel**: r/dividends post + Seeking Alpha article (not paid, not SEO first)
