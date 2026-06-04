# What's Next — Harvest  ·  2026-05-31

## TL;DR
The single most valuable thing to build next is **surfacing the roll & defense
logic you've already built** — the backend computes roll candidates, 3-scenario
roll targets, and early-exercise risk today, but the UI never shows them, so users
can't act on it. That one batch moves *both* leading indicators (capture rate **and**
positions-defended) and delivers ~70% of your new Goal #6 for almost free.
**Queue order: (0) Deploy backend → live, (1) Surface roll/defense in the UI,
(2) Enforce freemium gates, (3) Stripe billing, (4) QA the free-user flow.**

## The bet
Last batch made Harvest *real* (auth, SnapTrade import, scorecard). This batch makes
it *visible and monetizable*: get it off localhost, expose the decision-support that
already exists in `main.py` but never reaches the screen, and close the
free→pro loop so the North Star (income captured per active user) can be non-zero for
the first time. The unlock: you are sitting on built-but-buried product value. The
cheapest path to "world-class" right now is *shipping what you already coded*, not
coding more.

## Ranked recommendations

### 0. Finalize local self-hosted backend (Harvest.app)  ·  score 30  ·  PRECONDITION
- **Serves goal:** all of them — there are currently **zero** possible active users.
- **Why now:** the cloud deploy artifacts (`railway.json`, `Procfile`, `Dockerfile`) were
  removed — Harvest now self-hosts as a local Mac app (`Harvest.app` / `harvestctl.sh`,
  uvicorn on 127.0.0.1:8000). The launcher scripts exist but aren't finalized/committed yet.
  This is an **ops push, not a build** — it doesn't fit the cron executor; it's a
  you-with-the-Mac task.
- **Expected impact on North Star:** flips it from undefined to measurable. Nothing
  else in this memo matters without it.
- **Effort:** S (~1 day) — *but* see "Decisions needed": deploy ordering depends on the
  unverified Supabase migration state and the pending security sprint (PIPE-032).
- **Ready to queue?** No — manual deploy, not a cron item. Do this yourself first.

### 1. Surface roll & defense logic in the UI  ·  score 29  ·  THE INSIGHT
- **Serves goal:** #2 (keep the shares), #4 (manage without grinding), **#6 (repair
  tested positions)** — all at once.
- **Why now:** The backend already exposes `GET /api/positions/roll-candidates`
  (detects 50%-profit close, ITM roll up-and-out, 21-DTE defensive roll) and
  `GET /api/roll-targets/{id}` (DEFENSIVE / BALANCED / INCOME scenarios with net
  credit, new strike/expiry, break-even), plus per-position `early_exercise_risk`.
  **None of it is wired into the action cards** (PIPE-019 cards exist; they just don't
  call these endpoints). This is the lowest-effort, highest-North-Star work available:
  surfacing value you've already paid to build.
- **Expected impact on North Star:** directly drives *capture rate* (users act on
  roll/close prompts instead of letting premium decay unmanaged) and *positions
  defended* (the ITM roll-up-and-out + early-exercise surfacing is exactly your Goal #6,
  minus the financing piece).
- **Effort:** M (~2–3 days) — frontend wiring + one-click "Roll to this," no new backend.
- **Ready to queue?** Yes — paste-ready item below.

### 2. Enforce freemium gates in the backend  ·  score 26  ·  CANON DRIFT
- **Serves goal:** #5 (trust) + monetization integrity.
- **Why now:** STRATEGY.md claims the 3-position / 1-screener-per-day gates are *Done*,
  but the subagent found the **backend does not enforce them** — `GET /api/positions`
  returns all positions, `GET /api/screener` has no usage check, and `db.py`'s
  `UsageLog` / `increment_usage()` are never called. Instead an **undocumented $1,000
  cumulative-profit write gate** (`check_write_access`, `PROFIT_GATE_THRESHOLD`) is what
  actually fires. The 3-position limit is a **Locked Decision** in STRATEGY.md, so the
  code must conform — not the doc. Without this, Stripe converts nobody (free = everything).
- **Expected impact on North Star:** protects the revenue engine that funds everything;
  removes a claim-vs-reality gap that erodes trust if a user notices.
- **Effort:** S–M (~1–2 days) — `UsageLog` plumbing already exists; wire it into endpoints.
- **Ready to queue?** Already `approved` as PIPE-029 — the cron will pick this up next.
  Validate the scope covers backend enforcement (not just the UI it already shipped).

### 3. Stripe billing (Checkout + Customer Portal + webhook)  ·  score 24  ·  REVENUE
- **Serves goal:** revenue (enables everything else).
- **Why now:** The "Start Pro" button in `UpgradeModal.jsx` is a placeholder with no
  `onClick`, no backend, no Stripe SDK (subagent: 0% built). You cannot convert a single
  user until this exists.
- **Expected impact on North Star:** indirect but gating — no paid tier = no business.
- **Effort:** L (~3–5 days) — Checkout session, webhook → subscription/tier update,
  Customer Portal. Sequence *after* gates (#2), or paying users get nothing free users don't.
- **Ready to queue?** Partial — needs a Stripe account + price IDs decided first. Then queue.

### 4. QA the full free-user flow end-to-end  ·  score 23  ·  TRUST
- **Serves goal:** #5 (trust).
- **Why now:** Before the first r/dividends user, walk signup → add position → screener →
  hit a gate → upgrade prompt. Cheap insurance against a launch-day faceplant.
- **Expected impact on North Star:** protects first-user activation (the top of the funnel).
- **Effort:** S–M (~1–2 days, `/qa` skill). Run right before launch, after #1–#3 land.
- **Ready to queue?** Yes — but run it as `/qa`, not a cron build item.

## Scoring table
| Candidate | Goal | Impact ×3 | Reach ×2 | Effort ×1 | Total |
|---|---|---|---|---|---|
| Finalize local self-host (Harvest.app) | all (precondition) | 15 | 10 | 5 | **30** |
| Surface roll/defense in UI | #2 #4 #6 | 15 | 10 | 4 | **29** |
| Enforce freemium gates (backend) | #5 + revenue | 12 | 10 | 4 | **26** |
| Stripe billing | revenue | 12 | 10 | 2 | **24** |
| Finance-the-buyback + runway (Goal #6 net-new) | #6 | 15 | 6 | 2 | 23 |
| QA full free-user flow | #5 | 9 | 10 | 4 | 23 |
| Recommendations engine (PIPE-REC-01/02) | #1 #4 | 12 | 10 | 1 | 23 |
| Marketing deploy + keepalive (PIPE-033) | reach | 6 | 8 | 4 | 18 |
| Clean up experimental files + migrations | trust/risk | 6 | 2 | 4 | 12 |

## Considered but deferred
- **Finance-the-buyback + runway forecast (your new Goal #6, net-new) — 23.** This is the
  marquee differentiator and it *competed well*, but it correctly sits behind getting
  live, surfacing the roll logic you already built (#1 ships the other ~70% of Goal #6),
  and monetization. Reach is also narrower (only users with a deep-ITM tested position).
  **Right move: queue it immediately after recommendation #1** — paste-ready block below.
- **Recommendations engine epic (PIPE-REC-01/02) — 23.** High value but heavy (effort 1)
  and overlaps recommendation #1. Finish surfacing the *built* roll logic before building
  a new recommendation framework on top.
- **Marketing deploy + keepalive (PIPE-033) — 18.** Marketing site is already on Vercel;
  keepalive is a nice-to-have, not a blocker.
- **Cleanup of experimental files — 12.** Real hygiene need (see risks) but low reach.

## Strategy conflicts / decisions needed
1. **Canon drift (must fix):** STRATEGY.md marks freemium gates "Done"; backend doesn't
   enforce them. Recommendation #2 fixes the code to match canon (gates are a Locked
   Decision). **Do not** relax the doc.
2. **Undocumented $1,000 profit write-gate:** `check_write_access` enforces a gate that
   isn't in STRATEGY.md and conflicts with the documented 3-position / 1-screener gates.
   **Decision:** is this intentional (keep + document) or legacy (remove)? It can't quietly
   coexist with the Locked Decisions.
3. **Deploy ordering:** migrations `003/004/005` are untracked and may not be applied to
   Supabase; PIPE-032 (security hardening, pre-paid-user) is still `pending`. **Decision:**
   deploy now to a private beta, or finish the security sprint + verify migrations first?
4. **Pipeline hygiene:** there are **two PIPE-030 items** (Marketing Deploy *and* Supabase
   Migration) — duplicate ID. The cron picks by file order; renumber one to avoid confusion.
5. **Experimental untracked code:** `autobot.py`, `backtest.py`, `markets_ingest.py`,
   `autobot_report.py` aren't wired into the app. **Decision:** are these a real roadmap
   (auto-trading bot) or should they be gitignored/parked so they don't read as shipped?

## Paste-ready pipeline items

### PIPE-001b · Surface Roll Targets + Defense in Action Cards
**Status:** `approved`
**Description:** Wire the existing roll/defense backend into the My Positions action
cards so users can see and act on roll candidates, 3-scenario roll targets, and
early-exercise risk. No new backend logic — surface what `main.py` already computes.

**Tasks:**
1. On each position action card, call `GET /api/positions/roll-candidates` and
   `GET /api/roll-targets/{id}`; render the DEFENSIVE / BALANCED / INCOME scenarios with
   net credit, new strike, new expiry, and break-even (plain-English, per GLOSSARY).
2. Show the position's `early_exercise_risk` badge (NONE→CRITICAL) with a one-line "why."
3. Add a one-click **"Roll to this"** that pre-fills the close+open trade (reuse the
   Add Position form / PIPE-REC-06 pattern). Pre-fill only — do not auto-execute.
4. For ITM positions, label the roll-up-and-out scenario as "Defend these shares" to tie
   it to Goal #6 language.

**Scope:** `frontend/src/components/*` (action cards), read-only use of existing
`/api/positions/roll-candidates` and `/api/roll-targets/{id}`.
**Rationale:** Highest North-Star-per-effort work available — the backend is built; the
value is invisible. Moves capture rate and positions-defended simultaneously.

---

### PIPE-036 · Finance-the-Buyback + Runway Forecast (Goal #6 net-new)
**Status:** `approved`
**Description:** For a deep-ITM tested position where a roll alone can't fund the close,
generate the financing plan described in STRATEGY.md "Position Defense / Repair":
short-dated, low-delta income trades whose premium buys back the tested call, plus a
runway forecast.

**Tasks:**
1. Define "deep ITM" explicitly (e.g. delta ≥ 0.70 or intrinsic ≥ X% of original premium)
   and flag qualifying positions.
2. Compute **cost-to-close** (persisted, not just inside roll-targets) for each flagged
   position.
3. **Income-trade scanner:** from the user's owned shares / available capital, find
   short-dated, low-delta (≤ ~0.15) call/put candidates with high probability of expiring
   worthless, ranked by premium-per-day toward the buyback.
4. **Runway forecast:** "at the current premium pace, ~N income cycles to neutralize this
   position." Surface alongside the roll scenarios from PIPE-001b.
5. Plain-English framing; respect Goal #5 (no jargon, show the "why").

**Scope:** new backend endpoint(s) + frontend panel on the defense card. Builds on
PIPE-001b — queue this *after* it.
**Rationale:** The net-new ~30% of Goal #6 and Harvest's clearest wedge: holder-focused
tools warn about assignment; none engineer the way out.
