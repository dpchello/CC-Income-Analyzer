# CC Income Analyzer — Development Pipeline

## How the pipeline works

1. **Review** items in the backlog below and change any item's `Status` from `pending` to `approved`
2. The cron job checks this file daily (weekdays ~9am) and picks up the **first `approved` item** in order
3. Claude implements it, then marks the item `done` and adds implementation notes
4. If a build fails or is rejected mid-flight, Claude marks it `failed` with a reason

**Only one item runs at a time.** Approve multiple items if you want to queue them — they execute in order, one per cron cycle.

---

## Status legend

| Status | Meaning |
|--------|---------|
| `pending` | Not yet reviewed — do not execute |
| `approved` | Reviewed and cleared — execute next |
| `in-progress` | Currently being implemented |
| `done` | Complete — see implementation notes |
| `failed` | Could not complete — see reason |
| `rejected` | Cancelled — will not be built |

---

## Pipeline

### PIPE-040 · Assignment Tracking (shares assigned by a position)
**Status:** `done` (built 2026-06-18, v0.4.2.0)
**Description:** Track shares that move when an option is *assigned* — covered calls (shares called
away) and cash-secured puts (shares put to you) — with tax-correct cost basis. Adds a
`close_reason` to positions, a new `assignment_events` table, auto-adjusts holdings on assignment
(FIFO lot relief for calls, basis-reduced new lot for puts), and surfaces an **Assigned Shares**
history with realized gain + holding-period term.

**Why:** A covered-call writer's positions don't only get bought back — they get assigned, and the
shares move. Today the app can't distinguish "bought back" from "assigned" and never reflects the
share movement, leaving stale holdings and no tax record. Extends the "Track" half of the tagline.

**Tax model (IRS equity options):**
- *Call called away* — sell at strike. Option leg keeps full premium as income (existing semantics);
  stock leg records `(strike − avg_cost) × shares` realized gain at the pure strike (premium already
  on the option leg → no double-count); UI shows the 1099-B-style *strike + premium* tax proceeds.
  Holdings relieved FIFO oldest-first; term per lot (`short`/`long`/`mixed`).
- *Put assigned* — buy at strike. Premium **reduces basis**: new lot `avg_cost = strike − premium`,
  option leg books `$0` (premium not double-counted as income); gain realized later on sale.

**Scope:** `backend/migrations/006_assignments.sql` (new), `backend/db.py`, `backend/main.py`
(`AssignIn`, `POST /api/positions/{id}/assign`, `GET /api/assignments`, basis helpers),
`frontend/src/components/Portfolios.jsx` (close-form "How did this close?" selector, Assigned Shares
section, close_reason badge). Full plan + rationale in `ASSIGNMENT_PLAN.md`.

**Out of scope (logged):** specific-lot (non-FIFO) selection, wash-sale detection, 8949/CSV export
(Pro follow-up post-Stripe).

**Implementation notes (2026-06-18):**
- `backend/migrations/006_assignments.sql` (new) — `positions.close_reason TEXT` + `assignment_events`
  table (RLS owner policy + indexes). **Must be run in the Supabase SQL editor** (same manual
  convention as `001_schema.sql`); the supabase-py client can't issue DDL.
- `backend/db.py` — `get_assignment_events`, `create_assignment_event`.
- `backend/main.py` — `AssignIn`; `POST /api/positions/{id}/assign` (infers call/put via
  `_is_put_position`, relieves holdings FIFO via `_relieve_holdings_fifo`, computes term via
  `_term_for`, writes the event, then full- or partial-closes the option with
  `close_reason='assigned'`); `GET /api/assignments` (adds `tax_proceeds_total` = strike proceeds +
  premium for called-away rows). Existing buy-back/partial-close paths now tag `close_reason='bought_back'`;
  reopen clears it. Premium accounting avoids double-count: calls book full premium on the option leg
  (`close_price=0`) and the stock gain at the pure strike; puts book `$0` option P&L and fold the
  premium into the new lot's basis.
- `frontend/src/components/Portfolios.jsx` — close drawer "How did this close?" selector
  (Bought back / Assigned) with a live share-movement preview; Closed Positions gains a "How" badge;
  new **Assigned Shares** table (date, event, shares, strike, cost basis, tax proceeds, realized gain,
  term) with a tax-basis footnote and an "unknown basis" flag when no matching stock lot exists.
- Frontend build passed (v0.4.2.0); `main.py`/`db.py` parse clean.

---

### PIPE-041 · If-Assigned Tax Preview (embedded gain/loss + wash-sale flag)
**Status:** `done` (built 2026-06-18, v0.4.3.0)
**Description:** On every open covered call, preview the tax consequence of an assignment *before*
it happens — the embedded gain/loss on the underlying shares, the holding-period term, and a
wash-sale-window warning when an assignment would realize a loss. Direct follow-up to PIPE-040,
prompted by a real user question about whether deliberately assigning shares avoids tax (it
doesn't — it realizes the gain/loss, and a loss triggers the 30-day wash-sale rule on rebuy).

**Implementation notes (2026-06-18):**
- `backend/main.py` — `_preview_fifo_basis` (non-mutating twin of `_relieve_holdings_fifo`) and
  `_assignment_preview(pos, matching_holdings)`: computes `stock_gain_if_assigned`
  (= strike × shares + premium − FIFO basis, IRS premium-fold-in), `term`, `is_loss`,
  `wash_sale_risk`, `basis_known`, `covered`. `GET /api/positions` loads holdings once and
  attaches `assignment_preview` to each open covered call (puts → null).
- `frontend/src/components/Portfolios.jsx` — "If assigned at $X" callout in the position drawer:
  taxable gain/loss + term, a proceeds-vs-basis breakdown, and an amber 30-day wash-sale warning
  (names SPY's clean VTI/ITOT vs. gray VOO/IVV substitutes; notes IRA permanence). Falls back to
  "add your stock lot" when basis is unknown.
- Also hardened `doClose`/`doAssign` to surface non-OK responses (they previously closed the drawer
  silently — the cause of the "nothing happens on Confirm" report when the backend was stale).
- Frontend build passed (v0.4.3.0); `main.py` parses clean; backend reloaded.

**Not tax advice — UI says so.** Out of scope (logged): cross-account wash-sale detection from real
trade history, automatic substitute-fund routing, multi-lot specific-ID basis selection.

---

### PIPE-039 · Portfolios vanish on cold restart (transient Supabase 500 → first-run empty state)
**Status:** `done`
**Severity:** P0 — looks like total data loss to the user; data is actually intact.
**Reported:** 2026-06-10 — user opened the app after the overnight cycle and saw the empty
"Let's set up your first portfolio" screen instead of their portfolios (app header showed v0.3.4.0).

**Root cause (investigated 2026-06-10 — data is NOT lost):**
The overnight 1AM nightly-upgrade job did **nothing** — it refused to run because the working
tree was dirty (`M WHATS_NEXT.md`) and skipped immediately. `git reflog` confirms zero overnight
HEAD movement; zero commits between 2026-06-09 16:00 and the report. The trigger was the **7:35AM
cold backend restart** (`harvestctl.sh reload`), which exposed two latent bugs:

1. **Backend — no resilience on transient Supabase errors.** `backend/db.py:get_holdings/get_portfolios/
   get_positions` call `sb.table(...).execute()` with no try/except and no retry. On a cold start the
   Supabase HTTP pool throws `httpx.ReadError: [Errno 35] Resource temporarily unavailable`, so the
   endpoint returns a 500. Confirmed in `~/Library/Logs/Harvest/backend.log`.
2. **Frontend — a single failed fetch blanks the whole dashboard.** `frontend/src/App.jsx:48-59`
   fetches `/api/dashboard|signals|positions|portfolios|holdings` in one `Promise.all` with **no
   per-call `.catch()`** (the optional calls below them all have `.catch(() => null)`). A transient
   500 on any one of the five drops `portfolios` to `[]`, and `frontend/src/components/Portfolios.jsx:1700`
   then renders the first-run "Let's set up your first portfolio" empty state — indistinguishable from
   data loss. The very next request returns 200 (logs show 500 bursts immediately followed by 200 OK),
   so a manual refresh already restores the view.
3. **Related (same migration-fragility family) — stale `portfolio_id=default`.** The client still
   sends the old pre-migration string id `default` (now a UUID column post-2026-05-25 migration),
   producing `invalid input syntax for type uuid: "default"` (Postgres 22P02) 500s on the screener.
   The old string ids live in `backend/portfolios.json` (`"id": "default"`); persisted client state
   (localStorage selected-portfolio) replays them.

**Fix (minimal diff, three layers):**
1. `backend/db.py` — add a small `_with_retry()` wrapper around `.execute()` for read paths
   (`get_portfolios`, `get_positions`, `get_holdings`): retry 2–3x with short backoff on
   `httpx.ReadError`/connection-reset/`[Errno 35]`; re-raise anything else. Optionally warm the
   Supabase connection pool once on startup so the first real request isn't the cold one.
2. `frontend/src/App.jsx` — give the five critical fetches the same resilience as the optional ones:
   check `r.ok` / add `.catch()` so a transient failure does **not** overwrite good state, and never
   render the first-run empty state on a fetch *error*. Distinguish three states: loading, load-failed
   (show "Couldn't load — retry", not the setup screen), and genuinely-empty (zero portfolios).
3. Stale id: validate the persisted/selected `portfolio_id` against the fetched portfolios; if it's not
   a real UUID in the list (e.g. `"default"`), clear it and fall back to the first portfolio. Prevents
   the 22P02 screener 500s.

**Regression tests:**
- Backend: simulate `httpx.ReadError` on the first `.execute()` and assert `get_portfolios` retries and
  returns data (fails before the retry wrapper, passes after).
- Frontend: mock `/api/portfolios` → 500 and assert the UI shows the retry/error state, NOT
  "Let's set up your first portfolio", and that previously-loaded portfolios are not wiped.

**Scope:** `backend/db.py`, `frontend/src/App.jsx`, `frontend/src/components/Portfolios.jsx` (empty-state
guard), then rebuild dist. No backend API contract change.
**Rationale:** Goal #5 (trust). A holder who sees "set up your first portfolio" believes the app ate
their data — the fastest possible way to lose trust on a self-hosted app that cold-restarts every night.
**Implementation notes:** Three-layer fix. (1) `backend/db.py` — added `_with_retry(fn, retries=3, backoff=0.5)` wrapper that catches transient `httpx.ReadError`/`[Errno 35]`/connection-reset exceptions and retries with exponential backoff; applied to `get_portfolios`, `get_positions`, `get_holdings`. Added `warm_connection()` that fires a cheap query on startup to prime the HTTP pool. `backend/main.py` — added `@app.on_event("startup")` calling `db.warm_connection()`. (2) `frontend/src/App.jsx` — all five critical fetches (`dashboard`, `signals`, `positions`, `portfolios`, `holdings`) now have individual `.catch(() => undefined)`; on failure the setter is skipped so previously-loaded state is never overwritten with `[]`. Added `fetchError` state + error banner ("Couldn't load some data") with a Retry button, shown above the main content when any core fetch fails. (3) `frontend/src/components/SignalTracker.jsx` — changed screener default `selectedPortfolioId` from `'default'` (stale pre-migration string) to `''`, preventing Postgres `22P02` invalid UUID errors. Frontend dist rebuilt. Build passed.

---

### PIPE-028 · Frontend Auth Gate (Phase 2)
**Status:** `done`
**Implementation notes:** Created `frontend/src/auth.jsx` — AuthProvider context with JWT stored in `harvest-token` localStorage key; validates token via `GET /api/auth/me` on mount; exposes `login()`, `signup()`, `logout()`, and `apiFetch()` (injects Bearer header, auto-logouts on 401). Created `frontend/src/components/AuthGate.jsx` — login/signup form using CSS variables, toggles between modes, shows inline error messages. Updated `frontend/src/App.jsx` — imports `useAuth`, shows spinner while token validates, shows `<AuthGate />` if no user, replaces all `fetch()` with `apiFetch()`, skips data fetch when not logged in, adds user email + Pro badge + Sign out button to header. Updated `frontend/src/main.jsx` — wraps with `<AuthProvider>` inside existing `<ThemeProvider>`. Build passed.
**Description:** Wire the existing JWT backend into the React frontend so unauthenticated visitors see a login/signup screen and all API calls include `Authorization: Bearer <token>`.

**Tasks:**
1. `frontend/src/auth.jsx` — `AuthProvider` context: JWT stored in localStorage, `user` state, `login(email, pw)` / `signup(email, pw)` / `logout()` functions, all calling `POST /api/auth/login` and `/api/auth/signup`
2. `frontend/src/components/AuthGate.jsx` — Login/signup form using existing CSS variables; toggle between login and signup mode
3. `frontend/src/App.jsx` — Wrap with `<AuthProvider>` (inside existing `<ThemeProvider>`). If `user === null`, render `<AuthGate />`. Replace all `fetch('/api/...')` calls with an `apiFetch(url, opts)` helper that injects `Authorization: Bearer ${token}` from context
4. Show a "Signed in as {email}" line in the sidebar + logout button

**Scope:** `frontend/src/auth.jsx` (new), `frontend/src/components/AuthGate.jsx` (new), `frontend/src/App.jsx` (auth wrap + apiFetch)
**Rationale:** Backend auth is fully built (`backend/auth.py`, JWT endpoints live, test users seeded). This sprint completes the user-facing half. Without it, any real user who hits the app gets raw data with no auth.

---

### PIPE-001 · Surface Roll Targets + Defense in Action Cards
**Status:** `done`
**Implementation notes:** Roll scenarios were already fetched/rendered in `TaxAwareActionCard` + `RollScenarioCard` (from prior work). This sprint completed the remaining spec items: (1) Early exercise risk badge now shows a one-line "why" explanation (dividend vs time value for CRITICAL, thin time premium for HIGH/MEDIUM) in the position detail stats. (2) "Roll to this" button added to each `RollScenarioCard` — clicking it opens the Add Position form pre-filled with the scenario's ticker, strike, expiry, contracts, and mid price; a blue "Roll — New Position" header and info banner indicate roll mode; `AddPosition` accepts a `prefill` prop. (3) For ITM positions (`intrinsic_value > 0`), the DEFENSIVE scenario is relabeled "Defend These Shares" with a blue accent and roll-up-and-out description, tying to Goal #6. Files changed: `frontend/src/components/Portfolios.jsx` (RollScenarioCard, TaxAwareActionCard, PositionRow, Portfolios — prop plumbing + UI), `frontend/src/components/AddPosition.jsx` (prefill prop + roll banner). Build passed.
**Description:** Wire the EXISTING roll/defense backend into the My Positions action cards so users can see and act on roll suggestions, 3-scenario roll targets, and early-exercise risk. This is surfacing work — the backend already computes everything; the UI just never calls it. (Approved from the 2026-05-31 `/whats-next` memo, recommendation #1 — highest North-Star-per-effort because the value is built but invisible.)

**Use the endpoints that already exist (do NOT build a new roll-suggest endpoint):**
- `GET /api/positions/roll-candidates` — detects 50%-profit close, ITM roll up-and-out, 21-DTE defensive roll
- `GET /api/roll-targets/{id}` — DEFENSIVE / BALANCED / INCOME scenarios with net credit, new strike, new expiry, break-even
- per-position `early_exercise_risk` (NONE→CRITICAL), already on the positions payload

**Tasks:**
1. On each position's action card (`frontend/src/components/Portfolios.jsx`), fetch and render the roll scenarios (net credit, new strike/expiry, break-even) in plain English per GLOSSARY.
2. Show the `early_exercise_risk` badge with a one-line "why."
3. Add a one-click "Roll to this" that PRE-FILLS the close+open trade (reuse the Add Position form / PIPE-REC-06 pattern). Pre-fill only — never auto-execute.
4. For ITM positions, label the roll-up-and-out scenario "Defend these shares" to tie it to Goal #6 (Position Defense).

**Scope:** `frontend/src/components/Portfolios.jsx` (action cards); read-only use of existing `/api/positions/roll-candidates` and `/api/roll-targets/{id}` — no new backend logic.
**Rationale:** Lowest-effort, highest-North-Star work available. Moves capture rate AND positions-defended at once, and delivers ~70% of Goal #6 (everything except finance-the-buyback, which is PIPE-036).

---

### PIPE-002 · Diagonal Restructure — LEAP roll engine (Position Defense)
**Status:** `done`
**Implementation notes:** Built the "roll far out & higher" engine that the 30–45d roll-targets endpoint structurally couldn't express (it caps at 60 DTE, fixes contract count, and ignores tax year). New `GET /api/diagonal-restructure/{position_id}` (Pro-only) scans the full LEAP horizon and ranks candidates on a **five-factor** composite — **upside kept** (strike OTM %), **tax deferral** (does the new expiry cross into a later tax year), **net credit** (normalized across candidates), **assignment safety** (1 − delta), and **duration** (short lock-up = better; full credit ≤120 DTE, 0 at ≥730 DTE) — with caller-tunable weights (`w_upside/w_tax/w_credit/w_safety/w_duration`). The duration factor deliberately opposes tax+credit (which both reward going longer) so the composite no longer always runs to the furthest LEAP; the frontend exposes all five as live re-ranking sliders (0–3, step 0.5) with a Reset. Returns: a **net-credit frontier** (highest strike still at a credit, per expiry → answers "how far out / how high"), top-8 ranked candidates with sub-scores, and a **coverage block** (total/covered/uncovered shares + free writable contracts) exposing the contract-count lever. Added `_diagonal_components()` helper next to `_roll_score`, and `DataFetcher.get_expiries_in_range()` (LEAP-aware, down-samples to ~one expiry per 21-day bucket past 90 DTE so a scan is a handful of chain fetches). Strike grid filtered to ≤ spot×1.30 and delta ≥ 0.12 to drop lottery-ticket strikes. Frontend: `DiagonalRestructurePanel` in `Portfolios.jsx`, lazy-loaded inside `TaxAwareActionCard` for ITM positions (`intrinsic_value > 0`), renders the frontier + top-3 candidate cards (with sub-score chips + "Defers tax to YYYY" flag) + coverage line; "Restructure to this" reuses the existing `handleRollTo` prefill flow. Validated against the live "Brokerage" SPY book (5,846 sh, 47 ITM contracts). Backend imports OK, frontend build passed, no test regressions (2 pre-existing `data_store.get_macro_coverage` failures unrelated).
**Description:** A covered-call holder with deep-ITM calls on a winning stock often can't lift the ceiling meaningfully with a 30–45d roll — to roll *up* at a net credit you must roll *out*, sometimes 6–18 months. This adds the LEAP-horizon roll/diagonal engine: how far out can you go, what strike can you reach at a credit, and how the contract-count (coverage-ratio) lever frees shares to keep running. Extends Goal #6 (Position Defense) item #1 beyond the near-dated roll.
**Scope:** `backend/main.py` (endpoint + `_diagonal_components`), `backend/data_fetcher.py` (`get_expiries_in_range`), `frontend/src/components/Portfolios.jsx` (`DiagonalRestructurePanel`).
**Rationale:** Directly serves the holder whose shares are deep ITM (the exact "keep the shares you want to keep" moment). The near-dated roll-targets endpoint cannot represent the long-horizon trade-off; this completes the "roll up / out / up-and-out" leg of the defense plan with a transparent, tunable score.

---

### PIPE-029 · Freemium Gate Enforcement + Upgrade UI (Phase 3)
**Status:** `done`
**Implementation notes:** Backend: added 3-position hard cap on `GET /api/positions` — free users see only the first 3 open positions (closed positions still visible for history). Added `_require_pro` gate to `GET /api/scorecard` and `GET /api/oi/chain/history`. Frontend: screener results limited to top 1 opportunity for free users with a locked teaser showing count of hidden results + upgrade CTA. Removed all stale "1 screener run per day" / `DAILY_LIMIT_REACHED` copy from `UpgradeModal.jsx`, `SignalTracker.jsx`, `AuthGate.jsx`, and `LockedFeature.jsx`. Components `UpgradeModal`, `LockedFeature`, `PositionLimitBanner` were already built and wired in prior work. Build passed (backend import + frontend `npm run build`).
**Description:** Enforce free tier limits in the backend, wire up blur/lock overlays in the frontend, and add the upgrade modal so a free user hitting a limit can convert to Pro.

**Gate model (updated 2026-05-31):** Free tier = **3-position hard cap** + **$1,000
cumulative-profit gate** (supplemental). **No screener run-limit** — free users get
unlimited screener runs; the only screener gate is results (free sees the top opportunity,
Pro sees all).

**Backend changes (`backend/main.py`):**
- `GET /api/positions` — slice to first 3 positions when `user.tier == "free"` (the hard cap; currently UI-only — enforce it here)
- **Profit gate — already live, do NOT remove.** `check_write_access` (PROFIT_GATE_THRESHOLD = $1,000) already returns `403 {"code": "PROFIT_GATE_REACHED"}` on all mutating endpoints once a free user's cumulative closed-position profit ≥ $1,000. This is the supplemental gate — leave it in place.
- **Do NOT add a screener daily-run limit.** Skip `UsageLog` / `DAILY_LIMIT_REACHED` entirely — the 1-run/day limit was removed from strategy 2026-05-31.
- `GET /api/scorecard`, `GET /api/oi/chain` — `require_pro` dependency (403 for free users); confirm/keep
- Add `require_pro` helper if missing: `if user.tier != "pro": raise HTTPException(403, {"code": "UPGRADE_REQUIRED"})`

**New frontend components:**
- `frontend/src/components/UpgradeModal.jsx` — full-screen modal, pricing table (free vs pro, annual/monthly toggle), "Upgrade" CTA (placeholder until Stripe is wired)
- `frontend/src/components/LockedFeature.jsx` — blur overlay + lock icon + upgrade CTA wrapping any child; used to gate screener results 2+
- `frontend/src/components/PositionLimitBanner.jsx` — amber banner shown above position list when `positions.length >= 3 && user.tier === "free"`

**Wiring:**
- `App.jsx`: `useUpgrade()` context so any component can trigger the modal with `triggerUpgrade("reason")`
- `Screener.jsx`: wrap results after index 0 with `<LockedFeature />` (results tease — keep)
- `Portfolios.jsx`: render `<PositionLimitBanner />` when at free limit
- **Remove** any "1 screener run per day" copy (e.g. `SignalTracker.jsx`) — that limit no longer exists
- Upgrade-modal reasons should reference the 3-position cap and the $1,000 profit gate, not screener runs

**Scope:** `backend/main.py`, `frontend/src/components/UpgradeModal.jsx` (new), `LockedFeature.jsx` (new), `PositionLimitBanner.jsx` (new), `App.jsx`, `Screener.jsx`, `Portfolios.jsx`
**Rationale:** Free tier limits are the core freemium mechanic. Without them, there's no upgrade pressure and no business. Must ship before any real users are invited.

---

### PIPE-030 · Marketing Site Deploy + QA Pass (Launch Readiness)
**Status:** `approved`
**Note:** Skipped by nightly agent (2026-06-26) — this is a deployment + manual QA task that requires human interaction (Vercel config, live endpoint testing). Needs to be run manually.
**Description:** Deploy the marketing site to Vercel, run a full QA pass on the end-to-end user flow, and validate the product is ready for real users.

**Deploy steps:**
1. Set `NEXT_PUBLIC_API_URL` env var in Vercel pointing to the self-hosted backend URL (local Mac app exposed via a tunnel, e.g. Cloudflare Tunnel)
2. Connect `marketing/` subdirectory to Vercel project (or use `vercel --cwd marketing/`)
3. Verify all 7 routes build cleanly (`npm run build` in `marketing/`)
4. Confirm calculator widget calls backend correctly from the live Vercel URL

**QA checklist:**
- Anonymous visitor: calculator works 3 times, email gate on use 4, email captured in `waitlist.json`
- Signup: `POST /api/auth/signup` → JWT returned → app renders with auth
- Free user: add 4 positions → banner shown at position 3 limit
- Free user: run screener twice → second run blocked with upgrade prompt
- Free user: navigate to Scorecard → 403 handled gracefully
- Pro user: all limits bypass, unlimited positions, all features visible
- Logout and login: JWT cleared, AuthGate shown, JWT restored on login

**Scope:** Vercel deployment config, no new code — this is an integration and validation sprint
**Rationale:** The `/qa` pass is the gate before any public link is shared. A broken auth flow or broken limit enforcement on the first real user's session destroys trust before it can be earned.

---

### PIPE-036 · Finance-the-Buyback + Runway Forecast (Goal #6 net-new)
**Status:** `done`
**Description:** For a deep-ITM tested position where a roll alone can't fund the close, generate the financing plan from STRATEGY.md "Position Defense / Repair": short-dated, low-delta income trades whose premium buys back the tested call, plus a runway forecast. Builds on PIPE-001 — depends on it, queue after. (Approved from the 2026-05-31 `/whats-next` memo.)
**Tasks:**
1. Define "deep ITM" explicitly (e.g. delta ≥ 0.70, or intrinsic ≥ X% of original premium) and flag qualifying positions.
2. Compute and persist cost-to-close per flagged position (today `close_cost_total` only exists inside roll-targets).
3. Income-trade scanner: from the user's owned shares / available capital, find short-dated, low-delta (≤ ~0.15) candidates with high probability of expiring worthless, ranked by premium-per-day toward the buyback.
4. Runway forecast: "at the current premium pace, ~N income cycles to neutralize this position." Surface beside the roll scenarios from PIPE-001.
5. Plain-English framing; respect Goal #5 (no jargon, show the "why").
**Scope:** `backend/main.py` (new endpoint(s) for deep-ITM detection + income-trade scan + runway), `frontend/src/components/Portfolios.jsx` (defense panel on the card).
**Rationale:** The net-new ~30% of Goal #6 and Harvest's clearest wedge — holder tools warn about assignment; none engineer the way out.
**Implementation notes:** Added `GET /api/finance-buyback/{position_id}` endpoint with deep-ITM detection (delta ≥ 0.70 or intrinsic ≥ 50% of option price), cost-to-close with roll-credit offset and shortfall calculation, income-trade scanner across all user holdings (7–28 DTE, delta ≤ 0.20, ranked by premium-per-day), runway forecast (cycles/months to neutralize), and plain-English summary via `_buyback_summary()`. Frontend: new `FinanceBuybackPanel` component lazy-loads the endpoint when expanded from the action card on ITM positions — shows cost breakdown, runway forecast, and top 5 income candidates. Files changed: `backend/main.py`, `frontend/src/components/Portfolios.jsx`, `frontend/dist/`.

---

### PIPE-037 · Stripe Billing (Checkout + Customer Portal + Webhook)
**Status:** `pending`
**Blocked on:** USER — needs a Stripe account + decided price IDs ($29/mo, $240/yr) before this can be built. Flip to `approved` once keys are in env.
**Description:** Replace the placeholder "Start Pro" button in `UpgradeModal.jsx` with a real Stripe Checkout flow, handle the webhook to flip `user.tier` to `pro`, and add a Customer Portal link for managing/cancelling. (From the 2026-05-31 `/whats-next` memo, recommendation #3.)
**Tasks:**
1. `POST /api/billing/checkout` — create a Stripe Checkout session for the selected plan; return the URL.
2. `POST /api/billing/webhook` — on `checkout.session.completed` / subscription events, set the user's tier to `pro`; on cancellation, revert to `free`.
3. `GET /api/billing/portal` — Stripe Customer Portal session for self-serve management.
4. Wire `UpgradeModal.jsx` "Start Pro" to call checkout; add a "Manage subscription" link for Pro users.
5. Sequence AFTER PIPE-029 (gates) — otherwise paying users get nothing free users don't.
**Scope:** `backend/main.py` (billing endpoints + Stripe SDK), `frontend/src/components/UpgradeModal.jsx`, subscription/tier persistence.
**Rationale:** No paid tier = no business. This is the revenue gate; everything else funds off it.

---

### PIPE-002 · Performance Dashboard
**Status:** `pending`
**Description:** New "Performance" sub-tab inside Portfolios (alongside All Portfolios). Shows: monthly income bar chart (premium collected by calendar month), win rate (% of closed positions that expired worthless or were closed at ≥50% profit), avg profit capture %, best/worst trade table, and cumulative P&L line chart. All computed from `positions.json` closed history — no new API calls.
**Scope:** `frontend/src/components/Portfolios.jsx` (new `PerformanceDashboard` component), no backend changes
**Rationale:** Users need to evaluate whether the strategy is working over time.

---

### PIPE-003 · Position Notes
**Status:** `done`
**Description:** Add a free-text notes field to each position card. Stored in `positions.json`. Displayed as a collapsible section below the stats row. Supports recording rationale at open time (e.g., "Opening because IVR=72, earnings buffer, rolling from March").
**Scope:** `backend/main.py` (add `notes` field to `PositionUpdate` + persist), `frontend/src/components/Portfolios.jsx` (notes UI on position card)
**Rationale:** Small feature, high value for tax/audit trail and strategy review.
**Implementation notes:** Added `notes: Optional[str] = None` to both `PositionIn` and `PositionUpdate` models; added `if update.notes is not None: pos["notes"] = update.notes` in `update_position()`. On the position card, added `notesOpen`/`notesDraft`/`notesSaving` state and a collapsible inline editor below the alerts row — shows saved note text with "Edit note" link when present, "+ Add note" when empty. Saves via `PUT /api/positions/{id}`. Build passed.

---

### PIPE-004 · CSV / PDF Export
**Status:** `pending`
**Description:** Add an Export button to the Portfolios header that downloads a CSV of all open and closed positions for the selected portfolio (or all portfolios). Fields: Portfolio, Ticker, Strike, Expiry, Contracts, Sell Price, Close Price, Premium Collected, Final P&L, Open Date, Close Date, Notes. A secondary "Export PDF Summary" option generates a one-page portfolio report with the stats grid and positions table.
**Scope:** `frontend/src/components/Portfolios.jsx` (CSV export is pure frontend; PDF via `window.print()` with a print stylesheet)
**Rationale:** Required for tax reporting and sharing with financial advisors.

---

### PIPE-005 · OI History Backfill Endpoint
**Status:** `done`
**Description:** Add a `POST /api/oi/snapshot` endpoint that manually triggers an OI snapshot for all open position strikes across all portfolios. Expose a "Capture OI Snapshot" button in Settings. This allows users to seed the history file on demand (e.g., daily after market close) rather than waiting for organic screener fetches to build history.
**Scope:** `backend/main.py` (new endpoint), `frontend/src/components/Settings.jsx` (button)
**Rationale:** OI change signals are currently blind on day 1. This gives users a way to accelerate history accumulation.
**Implementation notes:** Added `POST /api/oi/snapshot` endpoint — loads open positions, collects unique expiries, fetches chain via cached `fetcher.get_options_chain()`, calls `oi_tracker.record_batch()` per expiry, returns `{expiries_processed, strikes_recorded, errors, timestamp}`. Added `OISnapshotPanel` component in Settings.jsx with loading state, success confirmation, and inline error display. Build passed.

---

### PIPE-006 · Regime Change Email Alert
**Status:** `pending`
**Description:** Add a Settings field for an email address. When the signal regime changes (e.g., HOLD → SELL PREMIUM, or any regime → AVOID), send a plain-text email via SMTP (configurable host/port/user/pass in Settings, stored in a local `config.json`). Uses Python's built-in `smtplib`. Also alert when any position crosses a GAMMA_DANGER or STRIKE_BREACH threshold.
**Scope:** `backend/main.py` (background polling loop, SMTP send), `frontend/src/components/Settings.jsx` (email config UI)
**Rationale:** Users are not always watching the dashboard. Critical alerts should push, not pull.

---

### PIPE-007 · Multi-Ticker Screener Support
**Status:** `pending`
**Description:** Extend the screener to support QQQ and IWM in addition to SPY. Add a ticker selector chip group at the top of the Signal Tracker screener. Each ticker gets its own options chain fetch and composite score. Holdings and positions remain SPY-only for now; the screener extension is display-only.
**Scope:** `backend/main.py` (parameterize ticker in screener), `backend/data_fetcher.py` (generalize chain fetches), `frontend/src/components/SignalTracker.jsx` (ticker chips)
**Rationale:** Many covered call writers run the same strategy on QQQ and IWM for diversification.

---

### PIPE-008 · Calendar Heatmap View
**Status:** `pending`
**Description:** Add a "Calendar" view mode toggle on the All Portfolios page. Shows a 12-week forward calendar where each cell is a trading week; cells containing open positions are highlighted with contract count and aggregate delta. Expiry dates are marked with a badge. Clicking a cell shows the positions in that week.
**Scope:** `frontend/src/components/Portfolios.jsx` (new `CalendarView` component in AllPortfoliosView)
**Rationale:** Traders think in terms of time bucketing. The exposure grid is strike-first; the calendar view is time-first.

---

### PIPE-009 · Signal Snapshot on Transaction Open/Close
**Status:** `done`
**Description:** Capture a full signal snapshot whenever a position is opened or closed, and store it inside the position record in `positions.json`. This is the data foundation for the scorecard and true P&L features.
**Implementation notes:** Added `_capture_signal_snapshot()` helper in `main.py` — calls engine.analyze() via cached fetcher data (no extra API calls). Sets `open_signal` on `add_position()` and `close_signal` in the `close_price` branch of `update_position()`. Snapshot includes timestamp, regime, total_score, max_score, factor_scores, spy_price, vix. No frontend changes.

**On open** (`POST /api/positions`): call `engine.analyze(...)` with current market data and store result as `open_signal` on the position:
```python
open_signal = {
    "timestamp": datetime.now().isoformat(),
    "regime": signal.get("regime"),
    "total_score": signal.get("total_score"),
    "max_score": signal.get("max_score"),
    "factor_scores": signal.get("factor_scores", {}),
    "spy_price": spy_price,
    "vix": signal.get("vix"),
}
```
**On close** (`PATCH /api/positions/{id}` with `close_price`): same snapshot stored as `close_signal`.

**Scope:** `backend/main.py` only — add signal fetch in `add_position()` (line ~326) and in `update_position()` close branch (line ~366). No frontend changes. Reuse the existing `fetcher` and `engine` instances already in module scope.

**Rationale:** Without recording market conditions at trade time, there is no way to evaluate whether the user followed the signal, or to reconstruct hypothetical performance.

---

### PIPE-010 · True Realized P&L + Tax Summary
**Status:** `done`
**Implementation notes:** Added `GET /api/pnl-summary` endpoint in `main.py` — groups closed positions by tax year, computes realized/unrealized P&L, estimates tax at 35% default (overridable via `config.json`). Added `PnlSummary` component in `Dashboard.jsx` showing Realized P&L · Unrealized P&L · Est. Tax · Win Rate, inserted above positions table. Wired `pnlData` fetch in `App.jsx` `fetchAll()`. Build passed.
**Description:** Add a `GET /api/pnl-summary` endpoint that computes true realized and unrealized P&L from `positions.json`, with a per-tax-year breakdown and estimated tax liability. Expose this as a new "P&L" card on the Dashboard above the positions table.

**Backend — `backend/main.py`** (new endpoint):
```python
@app.get("/api/pnl-summary")
def get_pnl_summary(portfolio_id: Optional[str] = Query(None)):
    positions = load_positions()
    if portfolio_id:
        positions = [p for p in positions if p.get("portfolio_id") == portfolio_id]

    closed = [p for p in positions if p.get("status") == "closed" and p.get("final_pnl") is not None]
    open_  = [p for p in positions if p.get("status") == "open"]

    # Realized: group by tax year using close_date
    by_year = {}
    for p in closed:
        year = (p.get("close_date") or "")[:4] or "unknown"
        by_year.setdefault(year, {"realized_pnl": 0.0, "trades": 0, "wins": 0})
        by_year[year]["realized_pnl"] += p["final_pnl"]
        by_year[year]["trades"] += 1
        if p["final_pnl"] > 0:
            by_year[year]["wins"] += 1

    # Unrealized: (sell_price - current_price) * contracts * 100
    # current_price not stored on closed, but open positions have it from enrichment
    # Use premium_collected - (current_price * contracts * 100) as proxy
    total_realized   = sum(p["final_pnl"] for p in closed)
    total_unrealized = sum(
        round((p.get("sell_price", 0) - p.get("current_price", 0)) * p.get("contracts", 0) * 100, 2)
        for p in open_
    )

    # Tax estimate: covered call premiums are short-term capital gains
    # 60/40 rule does NOT apply to ETF options (SPY is not a Section 1256 contract)
    # Show at user-configurable rate; default 35% (stored in config.json if exists)
    config_file = Path(__file__).parent / "config.json"
    tax_rate = 0.35
    if config_file.exists():
        cfg = json.loads(config_file.read_text())
        tax_rate = cfg.get("marginal_tax_rate", 0.35)

    current_year = str(date.today().year)
    current_year_realized = by_year.get(current_year, {}).get("realized_pnl", 0.0)
    estimated_tax = round(max(0, current_year_realized) * tax_rate, 2)

    return {
        "total_realized": round(total_realized, 2),
        "total_unrealized": round(total_unrealized, 2),
        "total_pnl": round(total_realized + total_unrealized, 2),
        "estimated_tax_this_year": estimated_tax,
        "tax_rate_used": tax_rate,
        "by_year": by_year,
        "open_positions": len(open_),
        "closed_positions": len(closed),
        "win_rate": round(sum(1 for p in closed if p.get("final_pnl", 0) > 0) / len(closed) * 100, 1) if closed else 0,
    }
```

**Frontend — `frontend/src/components/Dashboard.jsx`**: Add a `PnlSummary` component fetched at startup alongside other data. Render as a 4-stat card row: **Realized P&L · Unrealized P&L · Est. Tax (current year) · Win Rate**. Insert above the positions table. Win rate colored green if ≥ 70%, amber if ≥ 50%, red otherwise.

**Also add to `frontend/src/App.jsx`**: fetch `/api/pnl-summary` in `fetchAll()`, pass as `pnlData` prop to Dashboard.

**Rationale:** The current `pnl` field on positions is mark-to-market (unrealized). Users need to know actual banked gains, tax exposure, and win rate to evaluate strategy performance.

---

### PIPE-011 · Full Chain OI Snapshot + OI Change Bar Chart
**Status:** `done`
**Implementation notes:** Extended `data_fetcher.get_options_chain()` to merge `put_oi` from puts chain by strike. Added `record_chain_snapshot()` and `get_chain_oi_change()` to `oi_tracker.py` with `oi_chain_history.json` persistence. Added `GET /api/oi/chain?expiry=` endpoint. Added `OIChart` component in SignalTracker.jsx — expiry chips, ComposedChart with put OI above / call OI below zero axis, SPY dashed reference line, put/call ratio footer. Build passed.
**Description:** Extend OI tracking to capture the full options chain (all strikes, both calls and puts) for each active expiry after every screener run. Add an OI Change chart to the Signal Tracker tab showing call vs. put OI bars by strike for a selected expiry — mirroring the style in the attached reference image.

**Backend — `backend/oi_tracker.py`** (new function):
```python
OI_CHAIN_FILE = _DATA_DIR / "oi_chain_history.json"

def record_chain_snapshot(expiry: str, chain_rows: list):
    """Store full call+put OI snapshot for an expiry. First-write-wins per date."""
    today = date.today().isoformat()
    with _lock:
        data = _load_chain()
        key = expiry
        data.setdefault(key, {})
        if today not in data[key]:
            data[key][today] = {
                row["strike"]: {
                    "call_oi": row.get("call_oi") or row.get("openInterest"),
                    "put_oi":  row.get("put_oi"),
                }
                for row in chain_rows if row.get("strike")
            }
            # Prune to 30 days
            for k in list(data[key]):
                if k < (date.today() - timedelta(days=30)).isoformat():
                    del data[key][k]
            _save_chain(data)

def get_chain_oi_change(expiry: str) -> list:
    """Return per-strike call and put OI for today and 1d change vs yesterday."""
    ...
```

**Backend — `backend/main.py`** (new endpoint):
```python
@app.get("/api/oi/chain")
def get_oi_chain(expiry: str = Query(...)):
    # Fetch current chain from yfinance (cached 60s)
    chain = fetcher.get_options_chain(expiry)   # already exists
    # Also fetch puts — extend data_fetcher.get_options_chain() to return put OI alongside calls
    # Record snapshot
    oi_tracker.record_chain_snapshot(expiry, chain)
    # Return change data
    return { "expiry": expiry, "strikes": oi_tracker.get_chain_oi_change(expiry), "spy_price": fetcher.get_spy_price() }
```

**Backend — `backend/data_fetcher.py`**: Extend `get_options_chain()` to also extract `put_oi` from `t.option_chain(expiry).puts["openInterest"]`, merging by strike into the chain rows returned.

**Frontend — `frontend/src/components/SignalTracker.jsx`**: Add an `OIChart` component below the screener table:
- Expiry selector (chips for each active expiry from screener results)
- Recharts `ComposedChart` with two `Bar` series:
  - Green bars **above** zero axis = Put OI (or 1d put OI change if history exists)
  - Red bars **below** zero axis = Call OI (negated, so they go downward)
  - `ReferenceLine` at current SPY price (vertical dashed)
  - X-axis: strike prices centered ±10% around spot (filter to relevant range)
  - Tooltip: strike, call OI, put OI, 1d changes
- Summary row: Total Call OI · Total Put OI

**Rationale:** OI distribution across strikes reveals where large positions are concentrated, pin risk, and institutional directional bias. 1d change shows whether those positions are being built or unwound.

---

### PIPE-012 · Recommendation Log
**Status:** `done`
**Implementation notes:** Created `backend/rec_logger.py` — appends screener runs to `recommendations_log.json` (rolling 500 entries), `mark_acted_on()` matches strike/expiry to most recent batch. Wired into screener endpoint (after sort, logs non-position candidates) and `add_position()` (calls `mark_acted_on` after save). Added `GET /api/recommendations/log?limit=100` endpoint. No frontend changes (consumed by PIPE-013). Build passed.
**Description:** Every time the screener runs and returns candidates, log the top recommendations with full context to `recommendations_log.json`. When a position is opened, match it to a prior recommendation and mark it as acted-on. This creates the audit trail needed for the scorecard.

**Backend — new file `backend/rec_logger.py`**:
```python
REC_LOG_FILE = _DATA_DIR / "recommendations_log.json"

def log_recommendations(candidates: list, signal: dict, spy_price: float):
    """Log top screener candidates with market context. Append-only."""
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "regime": signal.get("regime"),
        "total_score": signal.get("total_score"),
        "spy_price": spy_price,
        "recommendations": [
            {
                "strike": c["strike"], "expiry": c["expiry"],
                "score": c["score"], "recommendation": c["recommendation"],
                "delta": c.get("delta"), "mid": c.get("mid"),
                "contracts_suggested": c.get("contracts_suggested"),
                "dte": c.get("dte"),
            }
            for c in candidates[:10]  # top 10 per run
        ],
        "acted_on": []   # filled in when positions are opened
    }
    # Load, append, prune to 500 entries (rolling), save
    ...

def mark_acted_on(strike: float, expiry: str, position_id: str):
    """Find the most recent recommendation matching this strike/expiry and mark it acted_on."""
    ...

def get_log(limit: int = 100) -> list:
    ...
```

**Backend — `backend/main.py`**:
- Import `rec_logger`
- In screener endpoint (after building candidates): call `rec_logger.log_recommendations(candidates[:10], signal, spy_price)`
- In `add_position()`: call `rec_logger.mark_acted_on(pos.strike, pos.expiry, new_id)` after saving

**New endpoint**:
```python
@app.get("/api/recommendations/log")
def get_recommendation_log(limit: int = Query(100)):
    return rec_logger.get_log(limit)
```

**Rationale:** Without a persistent log of what the app recommended and when, there is no way to compute adherence rate or hypothetical P&L. This is the prerequisite for PIPE-013.

---

### PIPE-013 · Execution Scorecard
**Status:** `done`
**Implementation notes:** Added `GET /api/scorecard` endpoint — computes adherence rate, avg signal at open, actual realized P&L, hypothetical missed P&L, behavioral feedback rules, and last-20 recommendation log. Added `ScorecardView` component in `Portfolios.jsx` with stats row, feedback cards, and recommendation log table. Added "Scorecard" sidebar tab (blue highlight, `__scorecard__` sentinel ID). Build passed.
**Description:** New "Scorecard" sub-tab inside the Portfolios page. Shows how well the user is executing the app's recommendations, compares actual P&L to hypothetical P&L (if all OPEN NOW signals had been followed), and provides recursive behavioral feedback.

**Backend — `backend/main.py`** (new endpoint):
```python
@app.get("/api/scorecard")
def get_scorecard(portfolio_id: Optional[str] = Query(None)):
    positions   = load_positions()
    rec_log     = rec_logger.get_log(500)
    if portfolio_id:
        positions = [p for p in positions if p.get("portfolio_id") == portfolio_id]

    # 1. Adherence rate
    open_now_recs = [
        r for batch in rec_log for r in batch["recommendations"]
        if r.get("recommendation") in ("OPEN NOW", "OPEN")
    ]
    acted_count = sum(1 for b in rec_log if b.get("acted_on"))
    adherence_rate = acted_count / len(open_now_recs) * 100 if open_now_recs else 0

    # 2. Signal quality at open — average signal score when user actually opened
    open_positions = [p for p in positions if p.get("open_signal")]
    avg_signal_at_open = (
        sum(p["open_signal"]["total_score"] for p in open_positions) / len(open_positions)
        if open_positions else 0
    )

    # 3. Hypothetical P&L: for each OPEN NOW rec that was NOT acted on,
    #    simulate: opened at mid price, held to expiry (full premium), or 50% profit close
    #    Hypothetical profit = mid * contracts_suggested * 100 * 0.50  (50% target close)
    missed_recs = [
        r for batch in rec_log
        if not batch.get("acted_on")
        for r in batch["recommendations"]
        if r.get("recommendation") == "OPEN NOW" and r.get("mid") and r.get("contracts_suggested", 0) > 0
    ]
    hypothetical_missed_pnl = sum(
        r["mid"] * r["contracts_suggested"] * 100 * 0.50
        for r in missed_recs
    )

    # 4. Actual realized P&L (from closed positions with final_pnl)
    actual_realized = sum(p.get("final_pnl", 0) for p in positions if p.get("status") == "closed")

    # 5. Behavioral feedback rules
    feedback = []
    if avg_signal_at_open < 6:
        feedback.append("You tend to open positions when the signal score is below 6/14 — consider waiting for SELL PREMIUM regime.")
    if adherence_rate < 50:
        feedback.append(f"You acted on {adherence_rate:.0f}% of OPEN NOW signals. Missed opportunities represent ~${hypothetical_missed_pnl:,.0f} in potential premium.")
    high_delta_opens = [p for p in open_positions if p.get("open_signal") and p["open_signal"].get("spy_price") and p.get("strike")]
    # ... additional behavioral rules

    return {
        "adherence_rate": round(adherence_rate, 1),
        "avg_signal_score_at_open": round(avg_signal_at_open, 1),
        "actual_realized_pnl": round(actual_realized, 2),
        "hypothetical_missed_pnl": round(hypothetical_missed_pnl, 2),
        "total_open_now_recommendations": len(open_now_recs),
        "total_acted_on": acted_count,
        "feedback": feedback,
        "positions_with_signal_data": len(open_positions),
    }
```

**Frontend — `frontend/src/components/Portfolios.jsx`**: New `ScorecardView` component, added as a sub-tab alongside "All Portfolios" and individual portfolio tabs:
- **Header stats row**: Adherence Rate · Avg Signal at Open · Actual Realized P&L · Hypothetical Missed P&L
- **Hypothetical vs Actual bar**: side-by-side comparison of what was banked vs what was left on the table
- **Behavioral Feedback cards**: one card per feedback item, amber/red badge by severity
- **Recommendation log table**: date, regime, strike, expiry, score, acted-on status (✓ or ✗)
- Note: scorecard data accumulates over time — a "Data collecting since [date]" notice shown until >10 recommendations are logged.

**Rationale:** The scorecard closes the feedback loop between the signal engine and the user's actual behavior. It answers: "Is this tool making you a better options trader?" and "What would have happened if you followed every signal perfectly?"

---

### PIPE-014 · App Rename — "Harvest"
**Status:** `done`
**Description:** Rename the app from "Covered Call Generator" to **Harvest** throughout the entire codebase. Update the document `<title>`, the header logo/wordmark, the localStorage theme key (`ccg-theme` → `harvest-theme`), and all copy that references the old name. Remove SPY-specific assumptions from UI labels where possible (e.g., "Covered Call Positions" → "Open Positions") to lay groundwork for multi-ticker expansion. Update the page favicon text if applicable.
**Scope:** `frontend/src/App.jsx`, `frontend/src/index.css`, `frontend/index.html`, any string "Covered Call Generator" or "CCG" across all `.jsx` files
**Rationale:** The app is expanding beyond SPY covered calls. The new name is approachable, memorable, and metaphorically accurate — users are harvesting the premium that options buyers overpay. This is also a prerequisite for multi-ticker architecture.
**Implementation notes:** Updated `frontend/index.html` title to "Harvest". Changed header wordmark from "Covered Call Generator" to "Harvest" in `App.jsx`. Migrated localStorage key from `ccg-theme` to `harvest-theme` in `theme.jsx`. Replaced all UI-facing "covered call" labels: "Covered Call Positions" → "Open Positions" (Dashboard.jsx), "Open Covered Calls" → "Open Positions" (Portfolios.jsx), "Add Covered Call Position" → "Add Position" (Portfolios.jsx), "Covered Call Screener" → "Options Screener" (SignalTracker.jsx), "covered calls" description in regime text (Dashboard.jsx), "Record a new covered call" → "Record a new position" (Settings.jsx), "What They Mean for Covered Calls" → "What They Mean for Your Positions" (ScoreGuide.jsx). Also generalized SPY-specific labels: removed "SPY shares" from holdings empty state, updated ALERT_DEFS text in Portfolios.jsx. Academic citations in ScoreGuide preserved verbatim as accurate financial references. Build passed.

---

### PIPE-015 · Design System Foundations
**Status:** `done`
**Description:** Establish a refined design token system and apply it universally. Changes:
- **Border radius**: Add `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px` to `:root` and apply `border-radius: var(--radius-md)` to all cards, panels, badges, and buttons
- **Color refinement**: Replace neon green `#00ff88` with `#10b981` (emerald — warm and confident, not terminal-green). Add `--orange: #f97316` as a proper token (currently hardcoded in 2 places). Update light-mode green to match
- **Elevation**: Add `--shadow-sm` and `--shadow-md` shadow tokens; apply `--shadow-sm` to cards in light mode for depth
- **Spacing**: Increase base card padding from `p-4`/`p-5` to `p-5`/`p-6` for more breathing room
- **Numbers**: Key metric values (income, P&L, score) bumped to `text-3xl font-bold` — big and readable at a glance
- **Badges**: All status badges get `border-radius: var(--radius-sm)` and slightly larger padding
**Scope:** `frontend/src/index.css` (token additions), `frontend/src/components/Dashboard.jsx`, `Portfolios.jsx`, `SignalTracker.jsx`, `Screener.jsx`, `Settings.jsx`, `ScoreGuide.jsx`
**Rationale:** The current aesthetic is "Bloomberg Terminal for traders." The target is "personal finance app for smart people." Rounded corners, warmer greens, and larger numbers make the app feel friendly and readable without sacrificing data density.
**Implementation notes:** Added `--radius-sm/md/lg`, `--orange`, `--shadow-sm/md` tokens to `:root` and `html.light` in `index.css`. Added `.th-card` utility class with radius + light-mode shadow. Replaced `#00ff88` with `#10b981` in both dark and light root; replaced every hardcoded `rgba(0,255,136,...)` with `rgba(16,185,129,...)` and every `#f97316` with `var(--orange)` across all components. Applied `borderRadius: 'var(--radius-md)'` to all card/panel containers and `borderRadius: 'var(--radius-sm)'` to all badges and buttons. Bumped stat card values from `text-2xl font-semibold` to `text-3xl font-bold` in Dashboard, Portfolios, and Scorecard. Increased stat card padding from `p-4` to `p-5`. Build passed.

---

### PIPE-016 · Plain English Labels + Central Glossary
**Status:** `done`
**Description:** Replace all financial jargon with plain-English labels throughout the app. Build a central `GLOSSARY` object and a reusable `<Term>` component that wraps any label with a (?) tooltip.

**Jargon replacements:**
| Old | New |
|-----|-----|
| GAMMA_DANGER | Expiring Soon — Act Now |
| BREACH_RISK | Strike Price at Risk |
| ROLL_WARNING | Time to Renew |
| TAKE_PROFIT | Lock In Profits |
| RECOVERY_MODE | Market Recovery — Review Calls |
| SELL PREMIUM | Good Time to Open |
| HOLD | Hold — Pause New Positions |
| CAUTION | Be Careful |
| AVOID | Not a Good Time |
| DTE | Days Until Expiry |
| Delta | Assignment Risk |
| IV Rank | Option Price Level |
| VVIX | Volatility Stability |
| Premium Collected | Income Earned |
| Profit Capture % | % of Max Income Collected |
| Contracts | Positions (N × 100 shares) |

**New files:** `frontend/src/glossary.js` (central definitions), `frontend/src/components/Tooltip.jsx` update (ensure it supports click-to-reveal for mobile, not just hover).
**Scope:** All `.jsx` files — `ALERT_DEFS`, `RISK_BADGE`, `REGIME_EXPLAIN`, `FACTOR_DEFS`, all hardcoded label strings
**Rationale:** The app's primary user is not a financial analyst. Every piece of jargon is a barrier between the user and a confident decision. Plain English at point-of-use (not just in a separate guide tab) removes that barrier.
**Implementation notes:** Created `frontend/src/glossary.js` with `GLOSSARY` object (15 term definitions) and `glossaryLabel()` helper. Updated `frontend/src/components/Tooltip.jsx` — rewrote to support click-to-toggle on mobile (outside-click dismiss via useRef/useEffect), changed indicator from ⓘ to (?), styled with CSS variables. Added exported `<Term>` component for inline glossary tooltips. Applied plain-English replacements across all `.jsx` files: `RISK_BADGE` labels (Dashboard.jsx) — e.g. "Expiring Soon — Act Now", "Lock In Profits", "Strike Price at Risk", "Time to Renew"; `ALERT_DEFS` (Portfolios.jsx) — all 6 alert types rewritten; `getAction()` action card labels — e.g. "Expiring Soon — Act Now", "Strike Price at Risk", "High Assignment Risk — Close", "Lock In Profits", "Time to Renew"; regime config labels in Portfolio Intelligence panel; `FACTOR_DEFS` names in SignalTracker.jsx — e.g. "Option Price Level", "Volatility Stability", "Market Trend", "Economic Stress Signal"; `REGIME_EXPLAIN` text and new `REGIME_SHORT_LABEL` map for the regime card heading; screener column headers (DTE → Days Left, Delta → Assignment Risk, Rec → Action); rec filter chip labels; stat card labels across all views (Premium Collected → Income Earned, Avg Profit Capture → % of Max Income Collected, Total Contracts → Total Positions ×100); ScoreGuide section headings and score row labels; Settings strategy quick reference. Used `Term` component with `GLOSSARY` in Dashboard.jsx for "Assignment Risk" and "Positions" column headers with (?) tooltips. Build passed.

---

### PIPE-017 · Sidebar + Alert-Aware Navigation
**Status:** `done`
**Description:** Replace the top tab bar with a left sidebar (desktop) and a slide-in drawer triggered by a hamburger button (mobile — layout overhaul deferred to PIPE-024, but the nav mechanism must work on narrow screens).

**Sidebar structure:**
```
🌾 Harvest          [wordmark]
─────────────────
📋  Overview
💼  My Positions    [🔴 badge if any urgent alerts]
🔍  Find Opportunities
📡  Market Conditions
📖  How It Works
⚙️   Settings
```

- Desktop: 220px fixed sidebar, collapsible to 56px icon-only mode via a toggle
- Mobile/narrow: hamburger `☰` in header → full-width slide-in drawer overlay
- Alert badge: red dot on "My Positions" when any open position has urgency = URGENT or HIGH (computed in `App.jsx`, passed as `alertCount` prop to sidebar)
- Active state: filled background pill on the active item
- Remove the top tab bar from `App.jsx` header entirely; keep header slim (wordmark + last-updated + refresh button)
**Scope:** `frontend/src/App.jsx` (layout restructure), new `frontend/src/components/Sidebar.jsx`, `frontend/src/index.css` (sidebar layout utilities)
**Rationale:** A sidebar gives each section a persistent, visible home. Alert badges mean you never have to navigate blind — you can see at a glance whether something needs attention before clicking in.
**Implementation notes:** Created `frontend/src/components/Sidebar.jsx` — exports default `Sidebar` (desktop sticky sidebar + mobile drawer overlay) and named `MobileMenuButton` (hamburger, coordinates with Sidebar via a module-level setter). Desktop sidebar is 220px wide, collapses to 56px icon-only via a `‹`/`›` toggle. Mobile drawer is 260px slide-in panel triggered by `☰` in the header, dismissed by outside-click or `✕` button. Red dot badge on "My Positions" when `alertCount > 0`. Active item gets green filled-pill background. Removed `useTheme` import and top tab-bar `<nav>` from `App.jsx`; replaced with `flex` layout (`Sidebar` + right column). `computeAlertCount()` in `App.jsx` flags positions with `dte <= 7` (GAMMA_DANGER) or `distance_to_strike_pct <= 1.5` (STRIKE_BREACH). Build passed.

---

### PIPE-018 · Overview Page Redesign
**Status:** `done`
**Description:** Redesign the Dashboard as the "Overview" — the answer to "how are my positions doing right now?" The new structure:

1. **Greeting + status hero** (plain English): *"Good morning. Everything looks good."* or *"1 position needs your attention today."* — colored by urgency, takes up the top of the page
2. **Urgent action strip**: If any positions have urgency = URGENT or HIGH, their action cards appear directly on the Overview (not hidden in My Positions). This is the primary "what do I do right now" answer
3. **Market signal**: One plain-English sentence + large colored badge (e.g., *"Market conditions: Hold — not the best time to open new positions"*)
4. **Income summary row**: This month's income earned · daily rate · annualized % · days until next expiry
5. **Theta income chart** (keep as-is, it's useful)
6. **Quick stats** (Premium collected, Unrealized P&L, Avg profit capture, Win rate)
7. **SPY price bar** (keep)
8. **News feed** (move to bottom — it's context, not action)

Remove the full positions table from Overview — that lives in My Positions. The Overview is "how am I doing" not "show me all the data."
**Scope:** `frontend/src/components/Dashboard.jsx` (substantial restructure)
**Rationale:** The user's first job when opening the app is "is everything okay and what do I need to do?" The current Dashboard answers that question across 7 different sections. The new Overview answers it in the first two sections and lets the user stop scrolling if nothing is urgent.
**Implementation notes:** Removed the positions table and the old `Headline` component entirely. Added `GreetingHero` — time-of-day greeting + one bold status sentence colored green/amber/red by urgency count, with a "View all →" link when everything is fine. Added `UrgentActionStrip` — surfaces URGENT and HIGH action cards (mirrors `getAction()` logic from Portfolios.jsx) directly on the Overview with a "Go to position →" link; hidden when no urgent items. Added `MarketSignalCard` — one plain-English sentence + large pill badge for the current regime. Added `IncomeSummaryRow` — 4-cell grid: this month's income, daily rate, annualized return %, and days until next expiry. Kept `ThetaIncomeChart`, stat cards (Income Earned / Unrealized P&L / % of Max Income / Market Signal), SPY price bar, `PnlSummary`, and `NewsFeed` (reordered to bottom). Removed unused `Term`, `GLOSSARY`, and `riskLevel` imports. Build passed.

---

### PIPE-019 · Tax & P&L Aware Action Cards
**Status:** `done`
**Implementation notes:** Added three computed fields to the `GET /api/positions` enrichment pipeline in `main.py`: `close_pnl_impact` (= current unrealized P&L — dollars gained/lost if closing now), `tax_event_on_close` (always `true` for short calls), `roll_pnl_impact` (always `$0` — rolling defers realization), `break_even_price` (= strike — SPY must stay below this for holding to win), and `loss_as_pct_of_premium` (% of original premium now consumed by the buy-back cost). Added `TaxAwareActionCard` component in `Portfolios.jsx` — collapsible card with three option panels: "Close now" (shows P&L realized, cost to buy back, tax impact, when to choose), "Wait and see" (SPY break-even price, assignment risk), "Roll to next month" ($0 realized, no taxable event, estimated new income). Applied rule softening in `getAction()` — when `loss_as_pct_of_premium > 40%` the urgency is downgraded from URGENT → HIGH and the headline changes to "Watch Carefully — Closing Costs More Than Holding". Updated `Dashboard.jsx` `getAction()` with the same rule softening and enhanced the UrgentActionStrip cards to show P&L-if-closed and SPY break-even price inline. Build passed.
**Description:** Restructure every action card in Portfolios (and the urgent cards surfaced on Overview) to show the financial reality of following — or not following — the recommendation.

**New action card structure:**
```
[Icon] [Plain English Title]            [Urgency: Watch / Act / Urgent]
[Plain English explanation of why]
[Confidence bar: ████████░░ 80% — based on 4 of 5 signals]

Your options:
┌─ Close now ──────────────────────────────────┐
│ P&L realized:  −$320 (loss locked in)        │
│ Tax impact:    Taxable event this year        │
│ When to choose this: if you expect SPY to     │
│ keep rising above your strike               │
└──────────────────────────────────────────────┘
┌─ Wait and see ───────────────────────────────┐
│ What you're waiting for: SPY to pull back    │
│ Risk if wrong: assignment (shares called away)│
│ When to choose this: if you expect SPY to    │
│ stay below $540 through expiry              │
└──────────────────────────────────────────────┘
┌─ Roll to next month ─────────────────────────┐
│ P&L realized:  $0 (no loss locked in)        │
│ Tax impact:    No new taxable event          │
│ New income potential: ~$X at current prices  │
│ [View roll options →]                        │
└──────────────────────────────────────────────┘

[💬 This doesn't make sense to me]
```

**Rule softening logic:** If closing would realize a loss greater than 40% of the original premium collected, downgrade urgency from URGENT → HIGH and change the headline from "Act Now" to "Watch Carefully — closing costs more than holding." Add explicit P&L break-even analysis: "SPY needs to stay below $X for holding to be the better financial choice."

**Backend additions:** New computed fields on each position — `close_pnl_impact`, `roll_pnl_impact`, `tax_event_on_close` — added to the enrichment pipeline in `backend/main.py`.
**Scope:** `frontend/src/components/Portfolios.jsx` (action card redesign), `backend/main.py` (enrichment fields)
**Rationale:** The app currently recommends actions as if money is free and tax doesn't exist. The user's actual financial outcome depends on which option they choose. Showing the P&L and tax impact of each path turns "a recommendation" into "an informed decision."

---

### PIPE-020 · Confidence Scoring on Recommendations
**Status:** `done`
**Description:** Every action card and screener recommendation displays a confidence percentage and a plain-English breakdown of what factors support it.

**Confidence calculation:**
- For action cards: score 0–100 based on how many risk triggers are active, how far from thresholds the position is, and whether the macro signal aligns
- For screener candidates: already have a composite score (0–100) — expose this as confidence
- Confidence tiers: ≥80 = High (green), 60–79 = Moderate (amber), <60 = Low (muted)

**Display:** A narrow progress bar labeled *"Confidence: 75%"* with one line below: *"Based on: 5 days to expiry · Delta rising · No macro events this week."*

**Behavior change:** When confidence < 60%, the primary action button changes from *"Close position"* to *"Review your options"* — softer language, no implied urgency.

**Scope:** `frontend/src/components/Portfolios.jsx` (action cards), `frontend/src/components/Screener.jsx` (candidate cards), `backend/main.py` (confidence field on action items)
**Rationale:** "Act now" with no qualification is anxiety-inducing and sometimes wrong. Showing how confident the recommendation is — and what it's based on — lets the user calibrate their response to the actual strength of the signal.
**Implementation notes:** Added `confidence` (0–100 int) and `confidence_factors` (list of plain-English strings) to the `GET /api/positions` enrichment pipeline in `main.py`. Confidence starts at 100 and takes penalties based on DTE proximity (−10 to −20 for 8–21 DTE), strike distance (−15 for approaching but not breached), delta level (−10 for rising toward 0.30), profit capture (−10 for 40–50% range), OI signal (−10 for UNWINDING), and closing costliness (−15 when loss > 40% of premium). Added `ConfidenceBar` component in `Portfolios.jsx` — narrow progress bar with color-coded tier label (High/Moderate/Low) and a "Based on: …" factor summary line. Rendered inside `TaxAwareActionCard` header below the instruction text. When `confidence < 60`, the expanded "Close now" panel heading changes to "Review your options". In `SignalTracker.jsx` screener table, the Score column now shows a confidence tier label (High/Moderate/Low confidence) below the score bar — the composite_score already maps 1:1 to confidence. Updated footer legend to include confidence tier callouts. Build passed.

---

### PIPE-021 · Macro-Aware Rule Engine
**Status:** `done`
**Description:** Extend the recommendation engine to be aware of upcoming macro events and soften or contextualize timing rules accordingly.

**Event sources:**
1. **Hardcoded schedule**: Fed meeting dates for the current year (FOMC meets 8 times/year — dates published annually). Stored in `backend/macro_calendar.py`
2. **User-defined events**: Settings panel — "Add upcoming event" with date + description (e.g., "Tariff announcement April 15", "Earnings season starts"). Stored in `config.json`
3. **News keyword detection**: Scan AlphaVantage news feed for macro keywords (Fed, tariff, war, recession, inflation, rate decision). Flag articles from the last 48 hours

**Rule modification:**
- If a major event is within 5 calendar days: add context to action card — *"Fed decision in 3 days. Waiting until after the announcement reduces your timing risk."* Downgrade urgency one level (URGENT → HIGH, HIGH → WATCH)
- If market is in elevated macro uncertainty (>2 keyword flags in 48h news): add a system-level banner on Overview: *"Elevated macro uncertainty this week. Consider waiting before acting on roll or close recommendations."*
- Recovery Phase signal already handles post-crash scenarios; this adds pre-event awareness

**New backend file:** `backend/macro_calendar.py`
**New Settings UI:** "Upcoming Events" panel — add/remove dated events
**Scope:** `backend/macro_calendar.py` (new), `backend/signals.py` (macro modifier), `backend/main.py` (pass macro context to enrichment), `frontend/src/components/Settings.jsx` (events panel), `frontend/src/components/Portfolios.jsx` (macro context in action cards)
**Rationale:** A covered call at 21 DTE two days before a Fed rate decision is a fundamentally different risk than the same position in a quiet week. The rule engine should know the difference. This directly addresses the user's feedback that recommendations don't account for real-world macro context.
**Implementation notes:** Created `backend/macro_calendar.py` with FOMC_DATES_2025/2026 schedules, `get_upcoming_events()` (merges FOMC + user events, filters to within N days), `detect_news_uncertainty()` (scans AlphaVantage feed for 21 macro keywords in 48h window, flags when >2 articles match), and `add_user_event()`/`remove_user_event()` (persist to `config.json`). Added `import macro_calendar` to `main.py`; in `GET /api/positions` enrichment, compute `upcoming_events` and `news_uncertainty` once per request and attach `macro_event` (nearest event ≤5 days away) and `macro_uncertainty` (bool) to each open position. Added `GET /api/macro`, `POST /api/macro/events`, and `DELETE /api/macro/events` endpoints. In `Portfolios.jsx` `getAction()`, added `macroDowngrade()` helper that shifts URGENT→HIGH and HIGH→WATCH when `pos.macro_event` is set; added an amber inline notice inside each `TaxAwareActionCard` showing the event name and days away. In `Dashboard.jsx`, derived `macroUncertain` from `open.some(p => p.macro_uncertainty)` and rendered a dismissable amber banner below the MarketSignalCard. In `Settings.jsx`, added `UpcomingEventsPanel` component with date+description add form, event list with remove buttons, and a note that FOMC dates are built-in. Added `useEffect` import. Build passed.

---

### PIPE-022 · Feedback Mechanism + Notification Delivery
**Status:** `done`
**Description:** Add a "This doesn't make sense to me" button to every action card. Tapping it opens a simple inline form. Feedback is stored locally and optionally sent via email or SMS.
**Implementation notes:** Created `backend/feedback_log.py` — appends entries to `feedback_log.json` (rolling 1000), fires SMTP email and/or SMS webhook in a background thread when configured. Added `POST /api/feedback` (stores entry, returns it), `GET /api/feedback` (log), `GET /api/feedback/config` (safe view — omits smtp_pass), and `PUT /api/feedback/config` (merged write to config.json) endpoints in `main.py`; added `FeedbackIn` and `FeedbackConfigIn` Pydantic models. In `Portfolios.jsx`, added `FEEDBACK_OPTIONS` constant, `FeedbackForm` component (radio options + conditional free-text textarea, submits to `/api/feedback`), and wired `feedbackOpen`/`setFeedbackOpen` state into `TaxAwareActionCard` — the "💬 This doesn't make sense to me" link appears at the bottom of every action card, toggling inline to the form. In `Settings.jsx`, added `FeedbackNotificationsPanel` — loads config on mount, provides fields for email, SMTP host/port/user/pass, phone number, SMS webhook URL, and delivery timing radio (immediate vs. daily digest placeholder), saves via `PUT /api/feedback/config`. Build passed.

**Feedback form options:**
- I disagree with this recommendation
- I don't understand the reasoning
- The numbers seem wrong
- The timing doesn't feel right
- Other: [free text, max 280 chars]

**Storage:** `backend/feedback_log.json` — each entry includes timestamp, position context (ticker, strike, expiry, action type), option chosen, free text.

**Delivery:** Settings panel — "Feedback Notifications" section:
- Email address field (reuses SMTP config from PIPE-006 if configured)
- Phone number field + SMS webhook URL (Twilio or similar; user provides their own webhook)
- Toggle: send immediately vs. daily digest

**Backend:** `POST /api/feedback` endpoint — stores entry and fires notification if configured.
**Scope:** `backend/main.py` (new endpoint + `feedback_log.json`), `frontend/src/components/Portfolios.jsx` (feedback button + form on action cards), `frontend/src/components/Settings.jsx` (notification config panel)
**Rationale:** When a recommendation doesn't match the user's intuition or situation, there's currently no way to express that. The feedback mechanism closes the loop — and over time, patterns in feedback will surface which recommendations are poorly calibrated.

---

### PIPE-030 · Supabase Migration + Auth Hardening (Security Sprint)
**Status:** `pending`
**Description:** Replace the JSON file data layer with Supabase (Postgres + RLS) for proper multi-tenant data isolation. Auth stays JWT + bcrypt — no Supabase Auth. All four sub-tasks ship together.

**Sub-task A — Supabase schema + RLS:**
- Create tables: `users`, `portfolios`, `positions`, `holdings`, `usage_logs`, `snaptrade_credentials`
- Every table has a `user_id uuid` FK referencing `users.id`
- RLS policies on every table: `USING (user_id = current_setting('app.current_user_id')::uuid)`
- Backend sets the session variable via `SET LOCAL app.current_user_id = '{user_id}'` inside a transaction on every request
- Migration script: reads existing `positions.json` / `portfolios.json` / `holdings.json` and inserts into Supabase (one-time, idempotent)
- New env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (backend only — service role key bypasses RLS for the SET LOCAL pattern; never expose to frontend)

**Sub-task B — Backend data layer rewrite:**
- Replace all `load_positions()` / `save_positions()` JSON helpers with Supabase queries using `supabase-py`
- Replace `auth.py` SQLite User/Subscription/UsageLog tables with Supabase equivalents
- All endpoints already have `Depends(get_current_user)` — wire `user_id` into every query's RLS context
- `pip install supabase` → add to `requirements.txt`

**Sub-task C — Frontend apiFetch sweep:**
- Replace all remaining raw `fetch()` calls in components with `apiFetch` from `useAuth()`: `Portfolios.jsx` (20+ calls), `AddPosition.jsx`, `AddHolding.jsx`, `SignalTracker.jsx`, `Settings.jsx`

**Sub-task D — Test suite (minimum viable):**
- Setup: `backend/tests/conftest.py` with Supabase test project (or local Supabase CLI)
- `test_auth.py`: signup, login, me, invalid token
- `test_isolation.py`: User A adds position, User B `GET /positions` returns empty ← **CRITICAL regression**
- `test_tiers.py`: free user gets 3 positions max; screener returns 403 on 2nd call same day
- `test_score.py`: `_composite_score()` deterministic output test

**Sub-task E — Code quality (bundle in same PR):**
- Extract `_composite_score()` helper (removes 40-line copy-paste in screener)
- Fix `_portfolio_stats()` to accept `holdings` param (removes N disk reads)

**Scope:** `backend/main.py`, `backend/auth.py`, `backend/db.py` (new Supabase client), `backend/tests/` (new), `frontend/src/components/Portfolios.jsx`, `AddPosition.jsx`, `AddHolding.jsx`, `SignalTracker.jsx`, `Settings.jsx`
**Rationale:** JSON files have no data isolation, no concurrent write safety, and no query capability. Supabase Postgres + RLS enforces isolation at the database layer — stronger than application-level file routing and production-ready. Must ship before the r/dividends post goes up.

---

### PIPE-034 · SnapTrade Brokerage Import
**Status:** `done`
**Description:** Full SnapTrade integration — register user with SnapTrade, open connection portal in modal, account selection step, holdings import pipeline with dedup (upsert by `snaptrade_account_id`), category mapping (long_stock/covered_call/CSP/protective_put/long_call/crypto/fixed_income), `avg_cost` populated from `average_purchase_price`, `shares` from fractional_units. Brokerage connection discoverable via Settings panel (always-visible + Connect Brokerage button). "Done" button in portal broadened to catch all SnapTrade postMessage variants (SUCCESS/CLOSE/DONE/COMPLETE/CONNECTED) with manual Continue fallback.
**Implementation notes:** `backend/snaptrade.py` — `_unwrap_symbol()` helper navigates SnapTrade's nested symbol structure (`raw["symbol"]["symbol"]["symbol"]` for equities); rewrote `_extract_ticker()`, `categorize_position()`, `map_to_harvest()` to use correct nesting. `backend/db.py` — `upsert_holding()` deduplicates by `(snaptrade_id, snaptrade_account_id)`. `backend/main.py` — `GET /api/snaptrade/accounts`, `POST /api/snaptrade/import` with per-account error handling and `parse_errors` list. `frontend/src/components/ConnectBrokerage.jsx` — 6-phase modal (prompt→portal→accounts→importing→success|conflict|error), `syncOnly` prop skips portal. `frontend/src/components/Settings.jsx` — `BrokerageConnectionsPanel` always visible at top of Settings.

---

### PIPE-035 · Brokerage Portfolio Folders
**Status:** `done`
**Description:** Auto-creates one Harvest portfolio per SnapTrade account on every sync, grouped under collapsible brokerage folders in the Portfolios sidebar. Starred portfolios float to top of the list. All portfolios (including brokerage sub-portfolios) are renameable inline. Dedup enforced by unique index on `(user_id, snaptrade_account_id)`.
**Implementation notes:** `backend/migrations/002_brokerage_portfolios.sql` — adds `starred`, `brokerage_connection_id`, `snaptrade_account_id`, `brokerage_name` columns + unique index to `portfolios` table. `backend/db.py` — `ensure_brokerage_portfolio()` find-or-create by `snaptrade_account_id`; `star_portfolio()`. `backend/main.py` — import pipeline calls `ensure_brokerage_portfolio()` per account using `brokerage_authorization` and `institution_name` fields (correct SnapTrade field names); `PUT /api/portfolios/{id}/star`. `frontend/src/components/Portfolios.jsx` — sidebar has three sections: ★ Starred (gold, floats to top), My Portfolios (custom), Brokerages (collapsible folder per `brokerage_name`, account sub-portfolios indented); `PortfolioTab` component handles star toggle, inline rename, archive, delete on hover.

---

### PIPE-REC-01 · Strategy definitions — rules, scoring, templates
**Status:** `pending`
**Description:** Define the full logic for all five strategies in the backend so PIPE-REC-02 can use them as its rule engine. This is not just a config endpoint — each strategy governs how the recommendation engine filters, scores, generates action strings, and selects thesis templates.

**What each strategy defines:**

- **Filter thresholds:** `maxDelta`, `minIvr`, `minYield` — already drafted in the frontend `STRATEGIES` const. These gate which strikes are eligible.
- **Target DTE window:** each strategy has a preferred DTE range. Wheel → 21–45 DTE; Income → 14–35 DTE; Safe → 30–60 DTE; Watch → 21–45 DTE; Custom → 7–60 DTE. The endpoint should select the best expiry within this window, not just "nearest month."
- **Scoring weight vectors:** the existing screener composite score is `Signal 25 + Yield 30 + Delta 20 + DTE 25`. Strategies shift these weights. Define as explicit weight dicts per strategy:
  | Strategy | w_signal | w_yield | w_delta | w_dte |
  |---|---|---|---|---|
  | wheel   | 25 | 30 | 20 | 25 |
  | income  | 15 | 40 | 15 | 30 |
  | safe    | 30 | 20 | 30 | 20 |
  | watch   | 25 | 25 | 20 | 30 |
  | custom  | 25 | 30 | 20 | 25 |
- **Conviction mapping:** Score 0–100 maps to conviction label: ≥ 80 = High, 60–79 = Med, < 60 = Low. The conviction filter in the frontend is client-side but conviction labels are computed on the backend. The scoring formula for each component is:
  ```
  s_signal = max(0.0, market_signal_score) / 12 * w_signal
  s_yield  = min(annYield / (strategy.minYield * 2.0), 1.0) * w_yield
             # full marks at 2× the strategy's minimum yield threshold
             # (replaces the hardcoded 0.70% raw yield cap in the screener)
  s_delta  = (1 - delta / strategy.maxDelta) * w_delta
  s_dte    = dte_score(dte, strategy.dte_window) * w_dte
             # peaks at midpoint of strategy.dte_window, tapers to 0 at edges
  composite_score = round(s_signal + s_yield + s_delta + s_dte)  # 0–100
  ```
- **Action string template:** e.g. `"Sell {contracts}× {expiry_short} ${strike} Call"` where `expiry_short` = "Jun 20", `strike` = formatted with no decimal if whole number.
- **Thesis template:** 2–3 sentence fill-in-the-blank, plain English, no jargon. Include: current IV context (high/moderate/low relative to strategy threshold), strike distance from spot as %, DTE, expected income. Template example for Wheel: `"{ticker} IV is {iv_context} at {iv_pct}%. The ${strike} strike is {distance_pct}% above the current price with {dte} days until expiry, giving you time to collect ${premium_per_contract}/contract."` Define one template per strategy as a string with `.format(**metrics)` substitution.
- **Tag derivation rules:** Tags are derived from computed metrics, not hardcoded. Define as a helper `_derive_tags(ticker_metrics, strategy)`:
  - `HIGH IV` — current IV > 60% (or > strategy.minIvr × 1.5)
  - `EARNINGS BUFFER` — next earnings date is after the expiry date (requires earnings date from yfinance `ticker.calendar`)
  - `NEAR RESISTANCE` — strike is within 3% of 52-week high (requires `ticker.info['fiftyTwoWeekHigh']`)
  - `STRONG TREND` — spot price is above its 50-day moving average
  - `PEAK DECAY WINDOW` — DTE is 14–28 (theta accelerates fastest here)
  - `POST-EARNINGS` — earnings were within the last 10 trading days

**Conviction scoring is the prerequisite for everything downstream.** The Recommendations tab conviction filter chip only works if the backend sends a `conviction` field on each rec. That field is derived entirely from `composite_score` using the formula above.

**Backend output:** `STRATEGY_PRESETS` dict + `GET /api/strategies` endpoint (trivial — returns the dict). The scoring formula, weight vectors, templates, and tag rules are the actual deliverable. The endpoint is just exposure.

**Decision required before build — IV proxy for individual stocks:** The `minIvr` filter references "IV rank" — but the existing `fetcher.get_vix_history()` returns SPY/VIX IV rank only. Individual stocks each have their own IV history. For v1, use the **current at-the-money implied volatility from the options chain as the IV proxy** — no historical rank, just raw current IV%. The strategy `minIvr` thresholds should be re-calibrated against raw IV% ranges (e.g., minIvr: 20 means "current IV ≥ 20%"). This is a simplification but it works fine for v1. Document this decision in the implementation notes.

**Scope:** `backend/main.py` — `STRATEGY_PRESETS` dict, `_build_thesis(ticker, strategy_id, metrics)` helper, `_derive_tags(ticker, strategy_id, metrics)` helper, `GET /api/strategies` endpoint. `frontend/src/components/Recommendations.jsx` — replace `STRATEGIES` const with an API fetch.
**Depends on:** nothing — this is the prerequisite for PIPE-REC-02.

---

### PIPE-REC-02 · Recommendations engine — backend endpoint + frontend wiring
**Status:** `pending`
**Description:** Build the `GET /api/recommendations` endpoint that powers the Recommendations tab. This is the core product promise: given a user's holdings and a strategy, return ranked covered call opportunities across all their tickers. Currently the tab shows mock data.

**What already exists (do not reinvent):**
- `fetcher.get_options_chain_for(ticker, expiry)` — fetches full call chain for any ticker. Already used in the screener.
- `fetcher.get_price_for(ticker)` — spot price for any ticker.
- `fetcher.get_screener_expiries_for(ticker, max_dte)` — returns available expiry dates within a DTE range.
- `db.get_holdings(user_id, portfolio_id=None)` — passing `None` returns all holdings across all portfolios.
- The composite score formula — `Signal 25 + Yield 30 + Delta 20 + DTE 25` — already in the screener endpoint. Reuse it with strategy-specific weight vectors from PIPE-REC-01.

**Critical constraint — share ownership gate (covered calls require 100 shares per contract):**

You cannot sell a covered call without owning the underlying shares. The recommendations engine must gate on this before any scoring:

```python
# For each unique ticker in the portfolio:
ticker_holdings = [
    h for h in all_holdings
    if h.get("ticker", "").upper() == ticker
    and h.get("category") in (None, "long_stock", "long", "equity")
]
total_shares = sum(h.get("shares", 0) for h in ticker_holdings)
total_contracts = int(total_shares // 100)   # 150 shares = 1 contract, not 1.5

# Subtract already-written covered call contracts for this ticker
open_calls = [
    p for p in open_positions
    if p.get("ticker", "").upper() == ticker
    and p.get("status") == "open"
    and p.get("category") in (None, "covered_call")
]
written_contracts = sum(int(p.get("contracts", 0)) for p in open_calls)
free_contracts = max(0, total_contracts - written_contracts)

# Skip entirely if user can't write even one contract
if free_contracts == 0:
    continue   # ticker appears in dot plot as ineligible dot, not in recs
```

This also means: if a user holds 80 shares of GOOGL, GOOGL will appear on the dot plot (so they can see the opportunity) but its dot will be ineligible and it will not appear in the ranked cards. The dot label should include a sub-label: "(80 shares — need 100)". This is a design decision to flag in the UI.

**New work — the recommendation loop:**
```
1. Load holdings: db.get_holdings(user_id, portfolio_id or None)
2. Load open positions: db.get_open_positions(user_id) — for written-contract deduction
3. Deduplicate holdings by ticker, sum shares across portfolios if portfolio_id=all
4. For each unique ticker:
   a. Apply share ownership gate (above) — skip if free_contracts == 0
   b. Fetch spot price via fetcher.get_price_for(ticker)
   c. Get available expiries via fetcher.get_screener_expiries_for(ticker, strategy.max_dte)
   d. Select target expiry: nearest expiry within strategy.dte_window (21–45 for wheel etc.)
   e. Fetch call chain via fetcher.get_options_chain_for(ticker, target_expiry)
   f. Find "best strike": call closest to strategy.maxDelta without exceeding it
   g. If no valid strike: add as ineligible dot, skip rec
   h. Compute metrics:
      mid = (bid + ask) / 2
      annYield = (mid / spot) * (365 / dte) * 100
      current_iv = row.get("impliedVolatility", 0) * 100   # as a %
      pop = round((1 - delta) * 100)   # approximation; see P.O.P. note below
      premium_total = mid * free_contracts * 100
   i. Compute eligibility: delta ≤ maxDelta AND current_iv ≥ minIvr AND annYield ≥ minYield
   j. Build dot: { id, sym, x=mid/spot*100, y=annYield, delta, ivr=current_iv, eligible }
   k. If eligible: compute composite score (PIPE-REC-01 formula), build rec
5. Sort recs by score descending
6. Return { meta: { updatedAt, eligibleCount }, dots, recs }
```

**P.O.P. — Probability of Profit:**

P.O.P. for a short covered call = probability the call expires worthless = probability the stock stays below the strike at expiry. This is what lets you keep 100% of the premium.

**Mathematical definition:** P.O.P. = N(−d₂) from Black-Scholes, where:
```
d₂ = (ln(S/K) + (r − q − σ²/2) × T) / (σ × √T)
P.O.P. = N(−d₂) = 1 − N(d₂)
```
`d₂` is already computed inside `_bs_greeks()` in `data_fetcher.py` (as local variable `d2`). `nd2 = _ncdf(d2)` is also already computed. The backend just doesn't expose these.

**For v1:** Use the close approximation `P.O.P. ≈ round((1 − delta) * 100)`. This is `N(−d₁)` not `N(−d₂)`, but d₂ is only slightly less than d₁ (differs by σ√T, typically 2–5% for 30-day options). The approximation error is 1–3 percentage points — acceptable for display.

**For v2 (exact):** Add a new helper in `data_fetcher.py`:
```python
def _bs_pop(S, K, T, sigma, r=0.043, q=0.012) -> Optional[float]:
    """Exact P.O.P. = N(-d2) for a short call."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    d1 = (math.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return round(_ncdf(-d2) * 100, 1)
```
This does not change `_bs_greeks` signature (no callers affected) and gives exact N(−d₂) values.

**Conviction mapping:** High = score ≥ 80, Med = score 60–79, Low = score < 60. Applied on the backend so the conviction filter in the frontend is a true client-side filter against a pre-labeled field.

**Portfolio scoping:** `portfolio_id=all` (or absent) → `db.get_holdings(user_id, portfolio_id=None)`. `portfolio_id=<id>` → `db.get_holdings(user_id, portfolio_id=id)`. No new infrastructure needed.

**Performance:** This endpoint calls `get_options_chain_for()` for each unique ticker. On a 10-ticker portfolio that is 10 chain fetches. The fetcher already caches at 60s TTL so repeat calls within a minute are free. Add `@lru_cache` or the existing TTL cache on `get_screener_expiries_for` if not already cached.

**Frontend wiring after backend ships:**
- Remove the mock data fallback in `Recommendations.jsx` (the `catch` block that sets `MOCK_*`).
- In `App.jsx`, add a `/api/recommendations?portfolio=all&strategy=wheel` call to `fetchAll()` and set `recCount = data.recs.length`. This drives the sidebar badge.

**Scope:** `backend/main.py` (new `GET /api/recommendations` endpoint, reuse screener helpers), `frontend/src/components/Recommendations.jsx` (remove mock fallback), `frontend/src/App.jsx` (add to `fetchAll`, wire `recCount`).
**Depends on:** PIPE-REC-01 (strategy rules + templates must be defined first).

---

### PIPE-REC-03 · Portfolio dropdown scoping — connect to real endpoint
**Status:** `pending`
**Description:** The portfolio dropdown is already built with grouped sections (All portfolios / My Portfolios / Brokerages) — this was implemented when the Recommendations tab was built. What remains is connecting the dropdown selection to the real recommendations endpoint once PIPE-REC-02 ships, and verifying the `portfolio_id=all` logic works end-to-end.

**What the frontend already does (implemented):**
- Dropdown renders "All portfolios" at top, then "My Portfolios" section (custom portfolios, no `brokerage_name`), then "Brokerages" section (portfolios with `brokerage_name` from SnapTrade import).
- Each entry shows holding count derived from the `holdings` prop.
- Selecting a portfolio stores the ID in `localStorage('harvest.recs')` and passes it to the API call.

**What still needs to happen in PIPE-REC-03:**
- In `backend/main.py`: handle `portfolio_id=all` in the recommendations endpoint — when this value is received, call `db.get_holdings(user_id, portfolio_id=None)` (no filter). All other values filter to that specific portfolio.
- Verify that switching portfolios updates the dot count and card count simultaneously (QA checklist item).
- The `sub` text on each entry shows holding counts from the prop — verify these counts accurately reflect what the backend will return for that portfolio scope.

**What is NOT in this pipe:** The watchlist (`watch`) scope. That belongs in PIPE-REC-07 and is blocked on the Watchlist feature.

**Scope:** `backend/main.py` (handle `portfolio_id=all` → `None` mapping), QA verification of portfolio switching.
**Depends on:** PIPE-REC-02.

---

### PIPE-REC-04 · "Custom" strategy — Tune drawer with sliders
**Status:** `pending`
**Description:** The Custom strategy preset currently passes through with no filters (maxDelta=0.50, minIvr=0, minYield=0), making it a "show everything" dump. It needs a "Tune" button that opens a slide-in drawer with three sliders so users can define their own thresholds.

**What it entails:**
- A "Tune ›" link appears next to the strategy dropdown only when `strategy === 'custom'`.
- Clicking it opens a right-side drawer (overlay, not a modal) with three range inputs:
  - Max delta: 0.10–0.50, step 0.01, default 0.30. Display format: `0.{nn}` delta.
  - Min IV: 0–80, step 5. Display format: `{n}%` current IV.
  - Min yield: 0–40%, step 1. Display format: `{n}% ann. yield`.
- Sliders update the filter in real-time (debounced 400ms before triggering a refetch).
- Custom thresholds are saved to `localStorage` under `harvest.recs.customFilt` and restored on mount.
- The strategy dropdown trigger shows the user's custom thresholds as the subtitle: e.g. "δ ≤ 0.28 · IV ≥ 30 · Yield ≥ 15%".

**Scope:** `frontend/src/components/Recommendations.jsx` — `CustomTuneDrawer` component, `customFilt` state, pass overridden thresholds to the strategy object before sending to the API.
**Depends on:** PIPE-REC-02 (needs the endpoint to test live filter changes).

---

### PIPE-REC-05 · "Details" button — deep-link to position card in My Positions
**Status:** `pending`
**Description:** The "Details" button on each recommendation card should navigate to My Positions and highlight the open position for that ticker. Currently it just navigates to the Portfolios tab root with no scroll or highlight.

**What this requires on the Portfolios side:** The `navigate('Portfolios', { sym: 'AAPL' })` call already exists in App.jsx's `navigate()` function (it handles `params`), but `Portfolios.jsx` doesn't read the `sym` param. The fix is to accept a `highlightSym` prop in Portfolios.jsx and, on mount or when it changes, scroll the matching position card into view and apply a highlight ring to it. Use a ref map on position cards (same pattern as the dot-plot → card scroll in Recommendations).

**Specifically:**
- `App.jsx` — pass `highlightSym` to `<Portfolios />` from the `screenerTicker`-style state.
- `Portfolios.jsx` — read `highlightSym` prop, apply a `border-color: var(--acid)` highlight ring to that card, scroll it into view on mount.
- `Recommendations.jsx` — update "Details" onClick to `onNavigate('Portfolios', { sym: rec.sym })`.

**Scope:** `frontend/src/App.jsx` (add `highlightSym` state, pass to Portfolios), `frontend/src/components/Portfolios.jsx` (read prop, scroll + highlight), `frontend/src/components/Recommendations.jsx` (update onClick).
**Depends on:** nothing blocking — pure frontend.

---

### PIPE-REC-06 · "Trade →" button — pre-fill Add Position form
**Status:** `pending`
**Description:** The "Trade →" button on each recommendation card should open the Add Position form pre-filled with the ticker, strike, expiry, and contract count from that recommendation. Currently it navigates to the Screener with just the ticker — the user still has to fill in everything manually.

**What this entails:** No new component is needed. The existing `AddPosition.jsx` modal already takes form fields. The path is:
- `Recommendations.jsx` calls `onNavigate('Portfolios', { openAddPosition: { sym, strike, expiry, contracts } })`.
- `App.jsx` passes this as a `prefillPosition` prop to Portfolios.
- `Portfolios.jsx` detects `prefillPosition` on mount and opens the Add Position modal with those fields pre-populated.

**Note on "broker routing":** Harvest does not execute trades — it records positions you've already placed. "Trade →" means "I'm about to do this trade, help me record it." The button label could be updated to "Record trade →" for clarity.

**Scope:** `frontend/src/App.jsx` (route param for `prefillPosition`), `frontend/src/components/Portfolios.jsx` (accept `prefillPosition` prop, open modal with fields filled), `frontend/src/components/Recommendations.jsx` (update Trade → onClick to pass full rec data).
**Rationale:** "Trade →" is the highest-intent action on the tab. If it drops the user at a blank form, the recommendation data is wasted. Pre-filling removes friction at the exact moment the user has decided to act.

---

### PIPE-REC-07 · Watchlist scope in Recommendations (blocked)
**Status:** `pending`
**Description:** The handoff spec includes a `watch` portfolio scope — symbols from the user's watchlist that they do not own, shown as ideas-only mode (dot appears, but "Trade →" is disabled and stat row shows "No position — ideas only"). This is entirely blocked on the Watchlist feature not yet existing.

**What needs to exist first:** A way to save and retrieve a list of tickers the user is watching but doesn't own. Once Watchlist ships (currently a PlaceholderScreen), the path is:
- Backend: `GET /api/recommendations?portfolio=watch` → load tickers from watchlist table instead of holdings. `contracts = 0` for all of them. `premium = null`. The dot plot renders them with open circles + dashed border to distinguish from owned holdings.
- Frontend: Add `watch` entry to `portfolioList` in `Recommendations.jsx`. Cards for watchlist tickers render without the stat row and Trade button; show "Add to positions first to trade" instead.

**Do not start this until Watchlist is built.** No blocking work can be done here.

---

### PIPE-REC-08 · Sort-by dropdown on ranked cards (low priority)
**Status:** `pending`
**Description:** The ranked cards section header currently shows "Sorted by score" as static text. This should be a small dropdown: Score / Ann. yield / P.O.P. / Premium $. Client-side sort only — no refetch required.

**What it entails:** Add `sortBy` state (`'score' | 'yield' | 'pop' | 'premium'`), a small dropdown trigger on the "Sorted by score" text (ghost button, same chevron pattern as the other dropdowns), and a `sortFn` that sorts `filteredRecs` before rendering. Each sort key maps to a rec field: score → `rec.score`, yield → `rec.annYield`, pop → `rec.pop`, premium → `rec.premium ?? 0`.

**Scope:** `frontend/src/components/Recommendations.jsx` only.
**Rationale:** Pure frontend, low complexity. Useful for yield-focused users who want to see highest-income ideas first rather than highest-composite-score. Low priority — ship after PIPE-REC-02 is live and the tab has real data to sort.

---

### PIPE-REC-09 · Strategy backtesting — historical success rates
**Status:** `pending`
**Description:** Run each of the five strategy presets against historical price data to measure real success rates: how often does each strategy's recommended strike expire worthless, what the typical annualized yield was in practice, and where each strategy breaks down. Results feed into the conviction scoring model (PIPE-REC-01) and give users evidence that the strategies work before they commit real money.

**What "success" means for a covered call:**
- **Max profit** — stock closed below the strike at expiry. User keeps 100% of the premium.
- **Near miss** — stock barely closed above strike (within 2%). Realistic scenario where a trader closes early at ~50% profit rather than risk assignment.
- **Assignment** — stock closed above strike. Shares are called away at the strike price. Not a loss — user sold shares at a pre-agreed price and kept the premium — but upside was capped.
- **Loss** — stock spiked far enough through the strike that the buy-back cost exceeded the premium collected. Rare for OTM covered calls at 0.25–0.32 delta but possible in earnings spikes.

**What data is available:**
yfinance `ticker.history(period="2y")` gives 2 years of daily OHLCV for any ticker. This is free and already in the fetcher infrastructure. **Historical IV chains are not freely available** — the backtest uses rolling 30-day realized volatility as an IV proxy. This means estimated premiums are conservative lower bounds (realized vol < implied vol on average, due to the volatility risk premium). Document this clearly in the UI.

**The simulation loop — per ticker, per strategy:**
```python
for entry_date in history.index[::5]:   # every 5 trading days (weekly entry)
    spot = history.loc[entry_date, "Close"]
    rv = rolling_30d_vol(history, entry_date)    # realized vol as IV proxy
    if rv * 100 < strategy.minIvr: continue      # skip if IV below strategy threshold

    target_dte = midpoint(strategy.dte_window)   # e.g. 33 days for wheel (21-45)
    expiry_date = nearest_friday(entry_date + timedelta(days=target_dte))

    strike = find_strike_at_delta(spot, rv, target_dte/365, strategy.maxDelta)
    mid = bs_call_price(spot, strike, target_dte/365, rv)
    ann_yield = (mid / spot) * (365 / target_dte) * 100

    if ann_yield < strategy.minYield: continue   # skip if yield below threshold
    if expiry_date not in history.index: continue

    expiry_price = history.loc[expiry_date, "Close"]
    if expiry_price <= strike:
        outcome, pnl = "max_profit", mid * 100
    elif expiry_price <= strike * 1.02:
        outcome, pnl = "near_miss", mid * 100 * 0.50
    else:
        # Assignment: sold shares at strike, kept premium, missed upside above strike
        outcome, pnl = "assignment", (strike - spot + mid) * 100

    results.append({ ticker, strategy_id, entry_date, expiry_date, strike,
                     spot, mid, ann_yield, rv, outcome, pnl })
```

**Helper functions needed in `backend/backtest.py`:**

```python
def rolling_30d_vol(prices: pd.Series, as_of: date, window: int = 30) -> float:
    """Annualized realized vol from 30-day daily log returns ending on as_of."""
    subset = prices.loc[:as_of].tail(window + 1)
    log_ret = np.log(subset / subset.shift(1)).dropna()
    return float(log_ret.std() * np.sqrt(252))

def find_strike_at_delta(spot, sigma, T, target_delta, r=0.043, q=0.012) -> float:
    """Binary search for the OTM call strike that produces target_delta."""
    lo, hi = spot, spot * 1.50
    for _ in range(40):
        k = (lo + hi) / 2
        d, *_ = _bs_greeks(spot, k, T, sigma, r, q)
        if d is None: break
        if d > target_delta: lo = k
        else: hi = k
    return round((lo + hi) / 2, 2)

def bs_call_price(S, K, T, sigma, r=0.043, q=0.012) -> float:
    """Black-Scholes theoretical call price (no bid/ask spread modeled)."""
    if T <= 0 or sigma <= 0: return 0.0
    d1 = (math.log(S/K) + (r - q + 0.5*sigma**2)*T) / (sigma*math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return round(S*math.exp(-q*T)*_ncdf(d1) - K*math.exp(-r*T)*_ncdf(d2), 2)
```
`_bs_greeks` and `_ncdf` are already in `data_fetcher.py` — import them rather than duplicating.

**Metrics to compute per strategy (aggregated across all tickers and time):**
- **Max profit rate** — % of trades where option expired worthless (actual realized P.O.P.)
- **Assignment rate** — % of trades where stock closed above strike
- **Average realized annualized yield** — actual premiums collected, annualized
- **Average net P&L per trade** — weighted across all outcomes
- **Worst rolling 3-month period** — window with lowest max-profit rate (shows regime sensitivity)
- **Win rate above/below VIX 20** — split outcomes by VIX level on entry date to validate whether the signal engine's regime filter actually improves outcomes when followed

**Endpoint:** `GET /api/backtest?strategy=wheel&lookback=365`
- Runs the simulation across all of the requesting user's holdings tickers (or a supplied `tickers=AAPL,MSFT` param).
- Results cached per `(strategy_id, ticker_set_hash, lookback_days)` with 24-hour TTL — each run makes multiple yfinance history calls.
- Returns: `{ strategy_id, tickers, lookback_days, trades_simulated, max_profit_rate, assignment_rate, avg_ann_yield, avg_pnl_per_trade, worst_3m_period, by_vix_regime, monthly_outcomes[] }`

**Frontend — StrategyPerformance section in Recommendations.jsx:**
- Collapsed panel below the ranked cards, toggle with "See how this strategy has performed →".
- Shows a compact stats row: `{max_profit_rate}% max profit · {avg_ann_yield}% avg yield · {assignment_rate}% assignment · {n} simulated trades`.
- Expands to a monthly bar chart (green = max profit, amber = near-miss, red = assignment) over the lookback window.
- Disclaimer at the bottom: *"Estimated using Black-Scholes with realized volatility. Actual premiums are typically higher (implied > realized). Assignment is not a loss — it means your shares sold at the price you agreed to. Past simulation results do not predict future performance."*

**Important limitations to document:**
1. Realized vol understates actual IV — backtest premiums are conservative lower bounds.
2. No bid/ask spread modeled — real yield is 5–15% lower per trade due to slippage.
3. Weekly entries don't reflect the signal engine's timing filter — the actual app recommends entries only when regime is SELL PREMIUM. The backtest's "win rate above/below VIX 20" metric approximates this.
4. Assignment outcomes depend heavily on what the user does with their shares — some users are happy to sell, others aren't. Show assignment rate prominently but don't label it "loss."

**Scope:** `backend/backtest.py` (new), `backend/data_fetcher.py` (add `get_historical_prices(ticker, period)`), `backend/main.py` (`GET /api/backtest` endpoint), `frontend/src/components/Recommendations.jsx` (StrategyPerformance collapsible section).
**Depends on:** PIPE-REC-01 (strategy definitions must include `dte_window`). Does **not** depend on PIPE-REC-02 — the backtest runs independently of the live recommendations engine.
**Rationale:** Users are being asked to trust five strategy presets with real money. Showing "Wheel strategy: 76% max profit rate across 104 simulated AAPL trades over 2 years" makes the conviction scores credible and gives new users a reason to trust the app before they've logged a single real trade.

---

### PIPE-REC-10 · "My Available Shares" strategy — portfolio-scoped inventory view
**Status:** `pending`
**Description:** A new strategy preset — "My Available Shares" — that shows every covered call a user can write today against their selected portfolio, with no yield or IV floor. It is the default strategy when the Recommendations tab loads. Cards are ranked by composite score (same formula as all other strategies) and carry the standard High/Med/Low conviction labels. Its unique role is removing the eligibility gates so every writable position appears, letting the score tell the user how good each opportunity actually is.

**Frontend (already done):** "My Available Shares" is already in the `STRATEGIES` const in `Recommendations.jsx` with `id: 'available'`, first in the list and the default selected strategy. The `filt` object has `maxDelta: 0.40, minIvr: 0, minYield: 0`. The strategy dropdown shows "Everything you can write today" as the subtitle.

**What the backend must do differently for `strategy_id = 'available'`:**

1. **Ticker universe is strictly the selected portfolio's holdings.** For `available`, the universe is exactly and only the tickers in `db.get_holdings(user_id, portfolio_id)` where `category` is `long_stock` (or equivalent) and `floor(shares / 100) >= 1`. No additional tickers are added regardless of portfolio scope. Other strategies may in future draw from a broader universe (e.g. watchlist for the `watch` strategy).

2. **Skip the `minIvr` and `minYield` gates entirely.** Every holding with ≥1 free contract gets a dot on the plot and a card in the results, even if current IV is low or the yield is modest. The user should see AAPL even if IV is only 18% — they own the shares and can write a call regardless of whether conditions are ideal. Dots are still marked eligible/ineligible on the plot, but "ineligible" for `available` only means `free_contracts == 0` (all contracts already written), not that yield or IV is below a threshold.

3. **Rank cards by composite score, descending — same as all other strategies.** The score tells the user how good each opportunity is right now. A Low-conviction AAPL card still shows up; the conviction label explains why conditions aren't ideal. Conviction thresholds are standard: High ≥ 80, Med 60–79, Low < 60.

4. **Show "available contracts" prominently in the action string.** The action string should be: `"Sell {free_contracts}× {expiry} ${strike} Call"`. The thesis should mention how many contracts are free vs total: *"You have {total_contracts} contracts available ({free_contracts} unwritten). Current IV is {iv_context} at {iv_pct}%..."*. If all contracts are already written, the card does not appear — only the ineligible dot on the plot.

**The "already fully written" case:**
If a user owns 200 shares of MSFT (2 contracts) and already has 2 open covered calls on MSFT, MSFT appears on the dot plot with an ineligible dot labeled "2/2 written" and does not appear in the ranked cards. This is the single most important piece of information the `available` strategy communicates — users can see at a glance what they've already covered vs what still has room.

**Example of what a ranked card looks like under `available`:**
```
AAPL                          Med   score 64          +$620 total
Sell 2× Jun 20 $205 Call
Ann. yield 24%   P.O.P. 75%   Δ 0.25
You have 5 contracts total, 3 already written. Current IV is moderate at 38%.
These 2 remaining contracts could earn $620 before Jun 20 — conditions are decent
but not peak. Consider waiting if IV rises before the next expiry cycle.
[MODERATE IV]  [3 ALREADY WRITTEN]       Details    Write calls →
```

**Dot plot behavior under `available`:**
- Holdings with ≥1 free contract → filled dot (eligible), regardless of yield/IV
- Holdings with 0 free contracts (all written) → outlined dot, labeled "written" in muted type
- Holdings with < 100 shares → outlined dot, labeled "< 100 shares"
- The eligible zone shading still renders for reference, but it is informational only — it does not gate which dots are filled

**Scope:**
- `frontend/src/components/Recommendations.jsx` — strategy already added to `STRATEGIES` const. The `available` strategy's unique dot-plot eligibility logic (ineligible = 0 free contracts, not below yield threshold) needs to be communicated via the API response `eligible` flag once PIPE-REC-02 ships.
- `backend/main.py` — `GET /api/recommendations` must detect `strategy_id == 'available'` and: skip minIvr/minYield gates; set `eligible = (free_contracts > 0)` on dots; include "already written" tickers as ineligible dots with a `reason: "all_written"` field; rank by composite score.
- `backend/main.py` (PIPE-REC-01 addition) — Add `available` to `STRATEGY_PRESETS` with `dte_window: [21, 45]`, `maxDelta: 0.40`, `minIvr: 0`, `minYield: 0`, scoring weights same as wheel, and `portfolio_scoped_only: true`.

**Depends on:** PIPE-REC-02 (the recommendations endpoint must exist before the special `available` logic can be implemented server-side). The frontend dropdown entry is already live.
**Rationale:** New users opening the Recommendations tab for the first time don't know which strategy to pick. Landing on "My Available Shares" gives them an immediate, concrete answer: here are your holdings, here is what you can write today, here is how good each opportunity is right now. The conviction label does the work of telling them whether to act — they don't need to understand IV thresholds to read a High vs Low badge.

---

### PIPE-031 · SnapTrade Credentials + snaptrade_raw Table (Supabase follow-on)
**Status:** `done`
**Description:** After PIPE-030 ships, add the SnapTrade-specific Supabase tables required by PIPE-034.
- `snaptrade_credentials` table: `user_id`, `snaptrade_user_id`, `user_secret` (encrypted at rest via Supabase Vault)
- `snaptrade_connections` table: `user_id`, `connection_id`, `brokerage_name`, `status`, `last_synced`
- `snaptrade_raw_imports` table: `user_id`, `account_id`, `fetched_at`, `raw_json` (jsonb)
- RLS on all three tables (same `app.current_user_id` pattern)
**Depends on:** PIPE-030
**Rationale:** Keeps SnapTrade state in Supabase alongside all other user data. Replaces the `backend/users/{user_id}/snaptrade.json` interim approach described in PIPE-034.

---

### PIPE-032 · Security Hardening (Pre-Paid-User)
**Status:** `pending`
**Description:** Three security items to address before first paying user:
1. **JWT startup validation:** `raise RuntimeError` if `JWT_SECRET_KEY` env var is missing — prevents silent fallback to dev key in production
2. **JWT revocation / short expiry:** Either a token denylist table in SQLite, or reduce expiry to 1h + add `POST /api/auth/refresh` endpoint
3. **CORS lockdown:** Change `allow_origins=["*"]` to specific origin list once production URLs are stable
**Depends on:** Stable production URLs (Vercel marketing + self-hosted backend tunnel)
**Rationale:** Currently deferred for MVP speed. Must be addressed before charging money.

---

### PIPE-033 · Marketing Deploy + Keepalive
**Status:** `pending`
**Description:** Deploy `marketing/` to Vercel and add a keepalive ping.
1. Deploy: `cd marketing && vercel --prod` with `NEXT_PUBLIC_API_URL=<self-hosted-backend-url>`
2. Keepalive: Add a `useEffect` on the marketing site's index page that calls `/api/health` (GET, no auth) on mount to confirm the self-hosted backend is reachable through the tunnel. (The old cloud cold-start concern no longer applies — the local backend stays warm.)
3. **Gate on PIPE-030 QA:** Do not deploy until multi-tenancy is confirmed working.
**Rationale:** Marketing site is built and vercel.json exists. Blocked only on PIPE-030 passing QA.

---

### PIPE-023 · Alert Persistence + Nav Badges
**Status:** `done`
**Implementation notes:** `computeAlertCount()` in `App.jsx` counts positions with DTE ≤7 or distance_to_strike_pct ≤1.5. Passed as prop to `Sidebar.jsx` which shows a red badge on "My Positions". `prevAlertCountRef` auto-un-dismisses the header strip when count rises. Strip renders when alertCount > 0 and user is not on Portfolios tab, with sessionStorage-backed dismiss.
**Description:** Compute the total count of positions needing urgent attention at the `App.jsx` level and propagate it to the sidebar as a persistent badge.

**Alert count logic:** Count positions where `getAction(pos)` returns urgency = `URGENT` or `HIGH`. Also count if any signal regime has just changed (detect via comparing previous regime in localStorage to current).

**Sidebar badge:** Red filled circle with count number on the "My Positions" nav item. Visible from any tab.

**Header indicator:** If `alertCount > 0` and user is on a tab other than My Positions, show a subtle pulse indicator in the header — *"⚠ 1 position needs attention"* — as a non-blocking strip below the header, dismissable.

**Badge clears** when user navigates to My Positions and all urgent positions have been reviewed (mark-as-seen logic via sessionStorage — resets each session).

**Scope:** `frontend/src/App.jsx` (alert count computation), `frontend/src/components/Sidebar.jsx` (badge display), `frontend/src/index.css` (badge styles)
**Rationale:** Currently a position can hit GAMMA_DANGER while the user is on the Overview tab and there's no visible indicator. The badge makes urgency impossible to miss without being intrusive.

---

### PIPE-024 · Mobile Layout (Full Responsive Redesign)
**Status:** `done`
**Description:** Full mobile-optimized layout. Previously deferred for lack of a mobile access path; activated 2026-06-13 by user request. Plan + four-perspective rationale captured in `RESPONSIVE_PLAN.md`.
**Note:** The PIPE-017 sidebar drawer had regressed in a later refactor (App.jsx rendered the sidebar as a fixed 240px grid column; `MobileMenuButton` was orphaned). This item restores and completes the drawer behavior.
**Implementation notes:** Frontend-only, no backend/data change, no new deps; every layout switch is gated behind a `≤768px` breakpoint so the desktop layout above 768px is unchanged.
- **New** `frontend/src/hooks/useMediaQuery.js` — `useMediaQuery`, `useIsMobile()` (≤768px), `useIsNarrow()` (≤480px); `matchMedia` + change listener, SSR-safe.
- **`index.html`** — `viewport-fit=cover` for iOS safe areas.
- **`App.jsx`** — root grid `1fr` on mobile (was `240px 1fr`); `navOpen` drawer state + tap-scrim backdrop; `navigate()` closes drawer; `main` padding `16px` on mobile.
- **`Sidebar.jsx`** — `Sidebar` is a fixed off-canvas drawer on mobile (`translateX`, `min(280px,84vw)`, `100dvh`, close ✕); `TopBar` gets a hamburger, hides ⌘K search / Alerts button / version footer and the timestamp sub-line on mobile, tighter padding.
- **`index.css`** — `@media (max-width:768px)` block: `.h-display` 36px, 40px tap targets, 16px inputs (stops iOS focus-zoom), tighter table cells, safe-area padding; new `.h-scroll-x` table-scroll utility.
- **`Dashboard.jsx`** — hero stat grid → 2-up (hero number spans full width); holdings 8-col table → horizontal scroll track (`minWidth 720`); CC drawer `1fr 1.8fr` → stacked; open-call card 5-col → 2-up.
- **`Portfolios.jsx`** — holdings 9-col grid wrapped in `.h-scroll-x` (`minWidth 760`); open/closed position tables already had `overflow-x-auto`; stat rows already `grid-cols-2 md:grid-cols-4`.
- **`Recommendations.jsx`** — `minmax(480px,1fr)` → `minmax(min(480px,100%),1fr)` (removes phone overflow).
- **Modals** — `AuthGate` outer `p-4`; `ConnectBrokerage` outer `padding:16` so cards inset from screen edges (UpgradeModal already padded).
- **Already responsive (verified, untouched):** Screener results table (`overflow-x-auto`), Pinning panel (`flex flex-wrap`), SignalTracker/ScoreGuide stat grids (`md:grid-cols-*`), charts (`@visx/responsive ParentSize`).
- **Out of scope (documented in RESPONSIVE_PLAN.md):** server `0.0.0.0` bind for LAN access (backend/deploy follow-up), table card-ification, bottom-tab nav, PWA.
- Build passed (`npm run build`). Visual QA at 375×812 pending (Playwright screenshots blocked on this Mac per project CLAUDE.md — user to confirm).

**Follow-up (2026-06-14) — user dogfooded via Cloudflare tunnel, two real bugs fixed:**
- **Collapsible desktop sidebar.** PIPE-017's collapse toggle had been lost in a refactor; restored. `App.jsx` holds a persisted `collapsed` state (`localStorage harvest.sidebarCollapsed`); root grid is `60px 1fr` collapsed / `240px 1fr` expanded / `1fr` mobile. `Sidebar.jsx` renders an icon rail when collapsed (labels/section-headers/account-text hidden, icons centered with hover tooltips + alert dots, account avatar taps to sign out) and a « / » toggle in the logo row. Mobile drawer is unaffected (`collapsed={!isMobile && collapsed}`).
- **Card text overflow.** A parallel read-only audit (workflow `card-overflow-audit`, 11 agents) found 22 vectors where long $-values/tickers bled past card borders on narrow viewports — root cause overwhelmingly flex/grid children with default `min-width:auto`. Fixed across Dashboard, Portfolios, SignalTracker, Markets, Recommendations, StrategyPerformance, Settings, ConnectBrokerage, ui/primitives (add `minWidth:0`+`overflowWrap:'break-word'` to value spans; cap StatCell/PnlBar sizes via `useIsMobile()`; ellipsis on the brokerage meta line). Added a global backstop: `.h-card`/`.h-elev { overflow-wrap: anywhere }`. All gated so desktop >768px is unchanged. Build passed.
- **Note:** "Cloudflare tunnel cannot be reached" (Error 1033) the user also hit is an INFRA issue, not this item — the Mac sleeps (`pmset sleep 1`) and drops the tunnel; fix is `sudo pmset -c disablesleep 1` (per `deploy/README.md` §5), tracked separately.

**Follow-up 2 (2026-06-14) — Portfolios tab mobile pass (user: "still looks really bad on mobile"):** root cause was the tab's OWN `w-60` portfolio sidebar (`flex` row) stealing 240px on a phone, squeezing the content column so cards overflowed and the page scrolled sideways. Fixes in `Portfolios.jsx`: (1) outer layout `flex` → `flex flex-col md:flex-row` so it stacks on mobile; (2) the portfolio sidebar is `hidden md:block` and replaced on mobile by a native `<select>` dropdown (All Portfolios / Scorecard / Starred / My Portfolios / per-brokerage optgroups / Archived) + a "+ New" affordance; (3) `HoldingRow` renders a full-width stacked **card** on mobile (ticker header + 2-col label/value grid + coverage bar) instead of the 9-col grid, and the holdings column-header + `minWidth:760` scroll track are suppressed on mobile. Desktop >768px unchanged. Build passed. **Still open:** the Open/Closed **Positions** tables (`PositionRow`, a `<table>`) still scroll horizontally on mobile — card-ifying that stateful component (close/edit/roll forms) is a larger change, deferred pending user confirmation it's wanted.

---

### PIPE-025 · Contextual Tooltips Throughout
**Status:** `done`
**Description:** Add (?) tooltip icons to every piece of financial terminology across all tabs, pulling definitions from the central `GLOSSARY` built in PIPE-016.

**Tooltip behavior:**
- Desktop: hover to reveal (250ms delay, auto-dismiss on mouse-out)
- Mobile/touch: tap to reveal, tap away to dismiss — never requires hover
- Style: small popover with dark background, max-width 280px, border-radius var(--radius-md)

**Terms to cover:** Delta, DTE (Days Until Expiry), IV Rank, VVIX, Premium, Strike, Expiry, Theta, Gamma, Composite Score, Signal Score, Profit Capture %, Assignment Risk, Roll, Covered Call, Put/Call Ratio, Open Interest — and every regime label (SELL PREMIUM/HOLD/CAUTION/AVOID) wherever they appear.

**Implementation:** Update `frontend/src/components/Tooltip.jsx` to handle both hover and tap. Wrap terms in `<Term id="delta">Assignment Risk</Term>` which auto-fetches the definition from `GLOSSARY`.
**Scope:** `frontend/src/components/Tooltip.jsx` (update), `frontend/src/glossary.js` (full definitions, from PIPE-016), all component files (wrap jargon terms)
**Rationale:** The Score Guide tab exists because the scoring system is opaque. Bringing explanations to the point of use means the user never has to navigate away to understand what they're looking at.
**Implementation notes:** Expanded `glossary.js` with 11 new entries: Theta, Gamma, Premium, Strike, Expiry, Roll, CoveredCall, PutCallRatio, OpenInterest, CompositeScore, SignalScore. Updated `Tooltip.jsx` — desktop now uses 250ms `setTimeout` on `mouseEnter` (cleared on `mouseLeave`) before revealing; tap/click toggles visibility; max-width 280px; popover uses `var(--radius-md)`. Rewrote `Term` to import `GLOSSARY` directly (no prop required) — usage is `<Term id="Delta">Assignment Risk</Term>` or `<Term id="DTE" />`. Applied `<Term>` throughout: Dashboard.jsx — "Income Earned", "% of Max Income Collected", "Market Signal", "VIX" in SPY bar; Portfolios.jsx — position card stat labels (DTE, Contracts, Current Price, Profit Capture, Delta, Strike distance, Open Interest), portfolio intelligence health metrics (Avg DTE, Avg Delta, Signal score), All Portfolios summary stats (Income Earned, Total Positions), top opportunities mini-grid (Score, Δ Risk, DTE); SignalTracker.jsx — screener table column headers (Strike, Expiry/Days Left, Mid, Δ Assign. Risk, Γ Gamma, θ/day, IV%, OI, Total/Signal score), regime card Score label, factor card names (IV Rank → IVRank term, VVIX → VVIX term), OI chart footer (Total Call OI, Total Put OI, Put/Call ratio), recommended strikes DTE. Build passed.

---

### PIPE-026 · Score Guide Refresh + Inline Explanations
**Status:** `done`
**Description:** Rename the "Score Guide" tab to **"How It Works"** and redesign it for a non-trader audience. Also add contextual "Learn more" inline panels inside Screener and Market Conditions tabs.

**New "How It Works" structure:**
1. **What is Harvest?** — plain English overview of the strategy and why it works
2. **The market signal** — what each regime means in plain English, when to act
3. **How we score opportunities** — the 4-component formula explained visually
4. **Understanding your alerts** — every alert type with plain English + example scenario
5. **Common questions** — FAQ format: "What happens if my shares get called away?", "Should I always follow the recommendation?", "What do I do in a market crash?"

**Inline panels:** In the Market Conditions tab, each factor card gets a collapsible "How is this calculated?" section. In the Screener, each score component gets a "Why does this matter?" line — without navigating to How It Works.
**Scope:** `frontend/src/components/ScoreGuide.jsx` (full rewrite), `frontend/src/components/SignalTracker.jsx` (inline expand sections), `frontend/src/components/Screener.jsx` (inline score explanations)
**Rationale:** The current Score Guide reads like a technical document. The target user wants to understand "should I trust this?" and "what does this number mean for me?" — not read academic-style factor definitions.
**Implementation notes:** Rewrote `ScoreGuide.jsx` from scratch as a 5-section "How It Works" page for non-traders: (1) What is Harvest — plain English covered call explanation + "why does this work" academic basis; (2) The Market Signal — each of the 4 regimes (Good Time/Hold/Be Careful/Not a Good Time) in a color-coded card with "what to do" guidance, plus a plain-English breakdown of all 6 underlying factors; (3) How We Score Opportunities — 4-component visual formula bar, individual cards for Signal/Income/Risk/Timing with "Why it matters" callouts, score-to-recommendation table; (4) Understanding Your Alerts — all 5 alert types (Expiring Soon, Strike at Risk, Time to Renew, Lock In Profits, Market Recovery) with example scenarios and urgency badges; (5) Common Questions — 7 collapsible FAQ items covering assignment, following recommendations, crashes, rolling, and tax. Added `calc` field to every entry in `FACTOR_DEFS` in `SignalTracker.jsx`; added collapsible "How is this calculated?" toggle inside each `FactorCard` (shows scoring formula and data source). Added `scoreGuideOpen` state and a "How scoring works" expand button in the ScreenerPanel header; collapsed panel shows 4 score-component cards each with a "Why does this matter?" paragraph. Added plain-English subtitles to expanded Score column headers (Signal → "market conditions", Yield → "income potential", Risk → "assignment safety", Days → "timing sweet spot"). Updated screener footer legend to include score component breakdown row. Build passed.

---

### PIPE-027 · Empty State Redesign
**Status:** `done`
**Description:** Replace all passive empty states with helpful, action-oriented prompts.

**Empty states to redesign:**
- No open positions (Dashboard + My Positions): *"You don't have any open positions yet. Check the Market Conditions tab to see if now is a good time to start."* + button → Market Conditions
- No portfolios: Onboarding prompt — *"Let's set up your first portfolio. You'll need: your SPY share count and the options you've already sold (if any)."* + [Create portfolio →]
- Screener finds no candidates: *"No strong candidates right now."* + plain-English reason why (e.g., "The market signal is HOLD — conditions aren't ideal for new positions.") + "Check back after [next market session]"
- News feed empty: *"No recent SPY news available."* — don't show the section header if content is empty
- Feedback log empty: *"No feedback recorded yet. Use the 'This doesn't make sense' button on any recommendation to start logging."*

**Scope:** `frontend/src/components/Dashboard.jsx`, `Portfolios.jsx`, `SignalTracker.jsx`, `Settings.jsx`
**Rationale:** Empty states are the highest-anxiety moments in any app — the user doesn't know what to do next. Action-oriented prompts with clear next steps remove that anxiety.
**Implementation notes:** In `Dashboard.jsx`, updated `GreetingHero` — when no open positions, shows "You don't have any open positions yet. Check the Market Conditions tab to see if now is a good time to start." with a "View Market Conditions →" button (navigates to SignalTracker); `NewsFeed` already returned null for the whole component (including section header) when feed is empty — confirmed correct per spec. In `Portfolios.jsx`: updated the `!selected` (no portfolio) state from a passive one-liner to a full onboarding card — 🌾 icon, "Let's set up your first portfolio", guidance text, and "Create portfolio →" button that opens the new portfolio form; updated "Open Positions" empty state to "You don't have any open positions yet..." with an "+ Add your first position →" button; updated "Stock Holdings" empty state to explain the benefit of adding holdings and include an "+ Add Holding →" button; updated Portfolio Intelligence "Top Opportunities" AVOID-regime empty state to "No strong candidates right now. The market signal is Not a Good Time... Check back after the next market session." and the zero-results state to match; updated AllPortfoliosView exposure grid empty state with a two-line explanation and next-step instruction; updated `ScorecardView` recommendation log empty state to the spec text "No feedback recorded yet. Use the 'This doesn't make sense' button on any recommendation to start logging." with a secondary note about the screener. In `SignalTracker.jsx`, both empty screener states ("no holdings" and "no candidates") now show "No strong candidates right now." as the headline, with regime-aware plain-English reasons (AVOID → signal is Not a Good Time; CAUTION → Be Careful with suggestion to widen filters; default → try different range) and "Check back after the next market session." footer in all cases. Build passed.

---

### PIPE-042 · Hide placeholder nav items for launch
**Status:** `pending`
**Description:** Four sidebar entries — Watchlist, Trade Journal, Academy, and Alerts — render a generic "Coming soon" placeholder screen (`PlaceholderScreen` in `App.jsx`). A first user clicking any of these sees an unfinished app, which undermines the polished, trustworthy first impression required for the one-shot r/dividends + Seeking Alpha launch channel. Hide these four items from the sidebar until they have real backends. Leave the components in the tree (dormant) so they can be re-enabled later.
**Tasks:**
1. Remove the four placeholder entries (Watchlist, Journal, Academy, Alerts) from the sidebar navigation component.
2. Remove or guard any deep links or cross-references that point to these screens.
3. Verify no other nav items route to `PlaceholderScreen`.
4. Rebuild frontend and confirm the sidebar renders cleanly with the remaining items.
**Scope:** `frontend/src/App.jsx`, sidebar/navigation component only. No backend changes.
**Rationale:** Trust is the product (Strategy goal #5). Every "Coming soon" screen signals "not ready" to a first user evaluating whether to trust their portfolio data to this tool. Hiding is a 15-minute fix with outsized polish impact on first impressions.

---

### PIPE-043 · Guard Recommendations against mock-data exposure
**Status:** `pending`
**Description:** `frontend/src/components/Recommendations.jsx` contains hardcoded mock data (`MOCK_META`, `MOCK_DOTS`, `MOCK_RECS`) that renders fabricated trade recommendations (NVDA, META, AAPL, AMD) when the backend endpoint fails or returns unexpected data. A holder who catches the tool showing invented numbers will never trust it again — and on a one-shot acquisition channel, that's fatal. This was the #2 scored item in the 2026-06-09 `/whats-next` memo. Two options: **(A)** hide Recommendations from nav until fully backed (fastest, recommended for launch), or **(B)** remove mock fallbacks and wire exclusively to the live backend endpoint (if `GET /api/recommendations` is confirmed working). If (A), the component stays in the tree, dormant.
**Tasks:**
1. Decision gate: confirm whether `GET /api/recommendations` returns real data. If yes → option B; if no → option A.
2. If (A): remove Recommendations from sidebar nav; leave component dormant.
3. If (B): delete all `MOCK_*` constants and the fallback path in `fetchRecs`; show a clean empty state if the endpoint errors.
4. Grep the frontend for any other `mock`/`placeholder`/`fabricated` data fallbacks that render financial numbers; list findings in implementation notes.
**Scope:** `frontend/src/components/Recommendations.jsx`, sidebar/nav component. Optionally `backend/main.py` if wiring.
**Rationale:** Trust is the product. No user-facing surface may render invented numbers. Cheapest insurance on the first-impression channel. (Aligns with WHATS_NEXT.md item #2, score 24.)

---

### PIPE-044 · Backend enforcement of 3-position hard cap
**Status:** `pending`
**Description:** The 3-position free-tier hard cap is currently enforced only in the frontend UI (`PositionLimitBanner`). A user who calls the API directly (e.g. `POST /api/positions`) can bypass the limit. STRATEGY.md locks the cap at 3 positions, and PIPE-029's notes explicitly flag "backend enforcement queued." Add server-side enforcement: before creating a new position, count the user's active (non-closed) positions; if ≥ 3 and the user is not Pro, return 403 with a clear message. This closes a freemium bypass that could surface on day one if a technically savvy user inspects network requests.
**Tasks:**
1. In the `POST /api/positions` endpoint, count the user's active positions (where `closed_at IS NULL`).
2. If count ≥ 3 and `user.subscription_tier != 'pro'`, return 403 with `{"detail": "Free tier limited to 3 positions. Upgrade to Pro for unlimited."}`.
3. Add a test (or inline verification) confirming the gate blocks position #4 for a free user and allows it for a Pro user.
4. Confirm the existing `$1,000 profit gate` (`check_write_access`) still runs independently — both gates must pass.
**Scope:** `backend/main.py` (position creation endpoint only). No frontend changes.
**Rationale:** Freemium enforcement must be server-side to be real. A frontend-only gate is a suggestion, not a limit. Pre-launch hardening aligned with Strategy's locked "3 positions" decision and the existing PIPE-029 TODO.

---

### PIPE-045 · Fix broken backtest tests (dev health)
**Status:** `pending`
**Description:** Two tests in `backend/tests/test_backtest.py` — `test_dual_track_invariant` (line 290) and `test_cache_roundtrip` (line 307) — call `data_store.get_macro_coverage()`, which was removed from the `data_store` module. The test suite runs 55/57 green; these 2 fail with `AttributeError: module 'data_store' has no attribute 'get_macro_coverage'`. Because the nightly upgrade agent pushes directly to `main` with no PR gate, a red test suite means regressions can ship unnoticed. Also affects `backend/scripts/backfill_macro.py` (line 67) which calls the same function.
**Tasks:**
1. Determine what replaced `get_macro_coverage()` in `data_store.py` (likely removed during the Supabase migration).
2. Rewrite the 2 tests to use the current API — or delete them if the feature they tested no longer exists.
3. Update `backfill_macro.py` to remove or fix the stale call.
4. Run the full test suite and confirm 57/57 green.
**Scope:** `backend/tests/test_backtest.py`, `backend/scripts/backfill_macro.py`. No production code changes.
**Rationale:** A green test suite is the nightly agent's only safety net. Two red tests desensitize to failures and mask real regressions. XS effort (~30 min), high dev-health impact. Flagged in the 2026-06-09 `/whats-next` memo as a shipping risk.

---

### PIPE-046 · Per-ticker dividend data for multi-stock portfolios
**Status:** `pending`
**Description:** `data_fetcher.get_spy_dividends()` is hardcoded to `yf.Ticker("SPY")`. When a user holds AAPL, MSFT, or any non-SPY stock, every position's ex-dividend date, dividend amount, and early-assignment risk warning reflects SPY's dividend schedule — not the actual stock's. For the r/dividends target audience, who track dividends obsessively, showing the wrong ex-div date on their AAPL position is a trust-breaker on first use. Generalize to `get_dividends(ticker: str)` with per-ticker caching (24h TTL, same pattern as existing cache). Update `GET /api/positions` to enrich each position with its own ticker's dividend data instead of broadcasting SPY's data to all positions.
**Tasks:**
1. Refactor `get_spy_dividends()` → `get_dividends(ticker: str)` with per-ticker cache dict (key = ticker, value = `{data, ts}`). Keep `get_spy_dividends()` as a thin wrapper calling `get_dividends("SPY")` for backward compat.
2. In `GET /api/positions` enrichment loop, call `fetcher.get_dividends(pos["ticker"])` per position instead of using the global `div_data` for all.
3. Update the screener enrichment (`_screener_candidates`) if it also hardcodes SPY dividend data for non-SPY tickers.
4. Frontend: no changes needed — it already reads `pos.next_ex_div_date` / `pos.days_until_ex_div` generically.
**Scope:** `backend/data_fetcher.py` (refactor + new cache), `backend/main.py` (per-ticker enrichment in positions and screener endpoints).
**Rationale:** Target audience #1 is r/dividends investors. Showing SPY's ex-div date on their AAPL position breaks trust at the exact moment the product is supposed to prove it understands their portfolio. The fix is a mechanical refactor of existing, working code — no new data source, no new dependency.

---

### PIPE-047 · "Uncovered Income" opportunity banner on Overview
**Status:** `pending`
**Description:** For holdings that don't have an active covered call, estimate the monthly premium they could generate and surface it as a banner on the Overview page and All Portfolios view. The r/dividends first-acquisition message is "Here's what you're leaving on the table on the same stocks" — this banner makes it a literal, personalized number: "3 of your holdings have no active covered call. Estimated missed income: ~$420/month." Tapping it links to the screener filtered to uncovered tickers. Uses the existing screener scoring engine and options chain data — no new data source.
**Tasks:**
1. Backend: `GET /api/uncovered-income` — for each holding without a matching open covered-call position, fetch the nearest ATM call (~0.30 delta, 30-45 DTE), compute estimated monthly premium (mid price × 100 × contracts possible from shares held ÷ DTE × 30). Return: `{uncovered_count, estimated_monthly, tickers: [{sym, shares, est_premium}]}`.
2. Frontend (Overview/Dashboard): render a banner card when `uncovered_count > 0` — icon + "N holdings have no active covered call — est. ~$X/month in uncollected premium" + "Find opportunities →" link to screener.
3. Frontend (All Portfolios): show the same stat in the summary stats row alongside "Income Earned" and "Total Positions".
4. Respect freemium: free users see the banner (the dollar amount is the upgrade hook) but only the top ticker's detail; Pro sees all.
**Scope:** `backend/main.py` (new endpoint), `frontend/src/components/Dashboard.jsx` (banner), `frontend/src/components/Portfolios.jsx` (All Portfolios stat).
**Rationale:** The conversion message that resonates with r/dividends is "you track your dividends; here's what you're leaving on the table." Making that number visible and personal — computed from their actual holdings — converts the tagline into a product feature. It's also a natural freemium hook: show the dollar amount to everyone, gate the details behind Pro.

---

### PIPE-048 · Startup health gate + offline banner (self-hosted UX)
**Status:** `pending`
**Description:** Harvest is a self-hosted local Mac app — the backend (`uvicorn` on `127.0.0.1:8000`) may not be running when the user opens the frontend. Today, if the backend is down, every `apiFetch` call fails silently: auth clears, data never loads, and the user sees an empty app with no explanation. A first user who just installed Harvest.app and opens the dashboard before `harvestctl.sh start` runs sees... nothing. Add a startup health probe and an offline banner so the app explains itself when the backend is unreachable.
**Tasks:**
1. Frontend: on app mount (before auth check), `fetch('/api/version')` — if it fails or times out (2s), render a full-screen "Backend not running" gate with instructions ("Run `harvestctl start` or open Harvest.app") instead of the auth/dashboard flow.
2. Frontend: add a periodic heartbeat (every 30s) that pings `/api/version`. If it fails after previously succeeding, show a non-blocking banner: "Backend connection lost — reconnecting..." with auto-dismiss on recovery.
3. Frontend: when `apiFetch` gets a network error (not a 401/403, but a `TypeError: Failed to fetch`), surface a toast "Cannot reach backend" instead of silently failing.
4. No backend changes — `/api/version` already exists and is unauthenticated.
**Scope:** `frontend/src/auth.jsx` (health gate + heartbeat), `frontend/src/App.jsx` (offline banner). No backend changes.
**Rationale:** Every other web app has a server that's always running. This one doesn't — and the self-hosted model is a locked decision. The first-run experience must handle the "backend not started" case explicitly, or the first impression is a blank screen. This is cheap insurance (S effort) against the most likely first-user confusion scenario for a local app.

---

### PIPE-049 · Session expiration toast + auto-redirect
**Status:** `pending`
**Description:** When a JWT expires mid-session, `apiFetch` in `auth.jsx` receives a 401, silently calls `clearAuth()`, and returns the failed response. The calling component must check `r.ok` to handle it — most don't, so the user sees stale or empty data with no explanation. For a self-hosted app that stays open in a browser tab for hours/days, token expiry is the normal case, not an edge case. Add a user-visible "Session expired — please log in again" toast when `apiFetch` detects a 401, and redirect to the login screen automatically.
**Tasks:**
1. In `apiFetch` (auth.jsx), when a 401 is received: show a toast notification "Session expired — please log in again" before calling `clearAuth()`.
2. After `clearAuth()`, trigger a state change that causes `AuthGate` to re-render the login screen (this may already happen — verify).
3. Ensure the toast doesn't fire repeatedly if multiple parallel requests all get 401 (debounce: only show once per expiration event, e.g. a flag that resets on next successful login).
4. Optional: show the remaining session time in Settings or a subtle indicator, so power users know when to expect re-auth.
**Scope:** `frontend/src/auth.jsx` (apiFetch 401 handler), toast component (new or existing).
**Rationale:** A self-hosted app lives in a persistent browser tab. JWT expiry is inevitable and frequent. Silent auth clearing with no feedback is the most confusing UX failure for a non-technical user — they don't know why things stopped working. A clear toast + redirect turns a confusing break into a normal flow. XS effort, high polish impact.

---

### PIPE-050 · Graceful market-data degradation banner
**Status:** `pending`
**Description:** Harvest depends on `yfinance` (options chains, prices) and `AlphaVantage` (25 calls/day free tier). When either source is down, rate-limited, or returns stale data, the frontend receives either empty results or cached data with no staleness indicator. A dividend investor who checks their positions and sees yesterday's prices with no "as of" timestamp may act on stale data — or worse, assume the app is broken. Add staleness indicators and a degradation banner so the user always knows when data is fresh vs. cached.
**Tasks:**
1. Backend: on each data-fetching endpoint (`GET /api/positions`, `GET /api/screener`, `GET /api/signal`), include a `data_as_of` ISO timestamp (the cache timestamp or live fetch time) and a `data_source_status` field (`live` | `cached` | `unavailable`) in the response envelope.
2. Frontend (Dashboard / Positions / Screener): if `data_source_status` is `cached`, show a subtle banner: "Market data as of [time] — live data temporarily unavailable." If `unavailable`, show: "Market data source is down — showing last known data."
3. Backend: when `yfinance` raises an exception or returns empty, catch gracefully and return the last cached result with `status: cached` instead of a 500.
4. Frontend: show the `data_as_of` timestamp in a small footer on any card displaying market prices (positions, screener results).
**Scope:** `backend/main.py` (response envelope), `backend/data_fetcher.py` (error handling + cache status), `frontend/src/components/Dashboard.jsx`, `Portfolios.jsx`, `SignalTracker.jsx` (staleness banners).
**Rationale:** Target audience #1 (r/dividends) makes decisions based on data accuracy. A tool that silently shows stale prices without disclosure loses trust the moment the user cross-checks with their broker. This is table-stakes data hygiene for any financial tool — especially one asking for $29/month. Moderate effort (M), high trust impact.

---

## Completed

*(Items move here when status = done)*

| ID | Feature | Completed | Notes |
|----|---------|-----------|-------|
| — | Signal Engine (6-factor) | prior session | IV Rank, VIX, VVIX, Trend, Rates, Curve |
| — | Composite Screener Score | prior session | Signal 25 + Yield 30 + Delta 20 + DTE 25 |
| — | Portfolio Management | prior session | Multi-portfolio, archive, holdings tracking |
| — | Portfolio Intelligence Panel | this session | Regime banner, health metrics, action items, top opportunities |
| — | All Portfolios Aggregate View | this session | Exposure grid with concentration warnings |
| — | OI Tracker | this session | Daily snapshots, 1d/7d change signals, action items |
| — | Concentration fix (shares/100 base) | this session | Denominator = available contracts, not written |
