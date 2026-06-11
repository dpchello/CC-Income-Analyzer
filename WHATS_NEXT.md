# What's Next — Harvest  ·  2026-06-09

## TL;DR
The single highest-leverage move is **unblocking Stripe (PIPE-037)** — it's the
revenue gate and the only thing standing between a launch-ready product and a
business — but it's blocked on *you*, not on a build: it needs a Stripe account
+ price IDs before anyone can write a line of code. The highest-value thing
buildable today is **launch-hardening**: deploy + QA the end-to-end flow
(PIPE-030) and kill the fabricated recommendation data a first user could see.
Queue order: **unblock Stripe → kill mock-rec data → PIPE-030 QA → PIPE-036
finance-the-buyback.**

## The bet
Since the last memo (2026-05-31), the built-but-buried value shipped: roll/defense
is now surfaced in action cards (PIPE-001 done), freemium gates are backend-enforced
(PIPE-029 done), and the app self-hosts as a local Mac app. Harvest is now
feature-complete for a first user — auth, portfolios, signals, roll targets, and
SnapTrade import all compute from real data and are live. It is NOT yet a business:
there's no way to take money, the launch flow has never been validated end-to-end,
and at least one surface still renders mock data. The last batch made the product
*good*; this batch makes it *safe to put in front of a stranger and charge them.*
The first acquisition channel (r/dividends + Seeking Alpha) is a one-shot first
impression — every item below protects or monetizes that shot.

## Ranked recommendations

### 1. Unblock + build Stripe Billing (PIPE-037)  ·  score 28
- **Serves goal:** business viability (funds goals #1–#6); ties to STRATEGY freemium model
- **Why now:** The product already gates Pro features (scorecard, OI chain, unlimited
  positions, full screener) — but the "Start Pro" button only collects a waitlist email.
  Every other item funds off this. It's the highest North-Star-per-effort work available
  **except** it's blocked on a ~30-min user task: create the Stripe account, set the
  $29/mo + $240/yr price IDs, drop keys in env. **This is the ask: do that, and PIPE-037
  flips `pending` → `approved` and gets built next.**
- **Expected impact on North Star:** Converts $0 → first dollar. Without it, capture rate
  is irrelevant — there's no paid tier to capture into.
- **Effort:** M (~2–3 days once unblocked) — but **0 dev-days until you create the account.**
- **Ready to queue?** No — needs your decision: stand up Stripe + keys, then flip PIPE-037 to approved.

### 2. Kill the fabricated recommendation data  ·  score 24
- **Serves goal:** #5 (Trust, zero jargon) + #1 (Capture)
- **Why now:** `frontend/src/components/Recommendations.jsx` falls through to hardcoded
  mock data ("endpoint doesn't exist yet" — PIPE-REC-01..10 TODOs); there is no
  `GET /recommendations` backend. The live Screener is real, so this is a *latent*
  landmine — but if this surface is reachable by a first user, they see invented trades,
  and a holder who catches the tool fabricating numbers never trusts it again. One bad
  first impression on a single-shot channel is fatal.
- **Expected impact on North Star:** Pure downside protection. Trust is the product; a
  fabricated-data surface is the fastest way to lose it.
- **Effort:** S (~1 day) — wire to the real screener engine, OR hide the surface from nav
  until it's backed. Either kills the risk.
- **Ready to queue?** Needs a 1-line decision: wire it, or hide it. Recommend **hide it**
  for launch (fastest), wire later. Paste-ready item below.

### 3. PIPE-030 — Marketing Deploy + End-to-End QA Pass  ·  score 25
- **Serves goal:** #5 (Trust) — launch gate
- **Why now:** Already `approved`. The full free-user flow (signup → 3-position cap →
  profit gate → 403 on Pro features → logout/login) has never been validated end-to-end
  against the deployed marketing site, and the self-hosted backend needs a tunnel (e.g.
  Cloudflare Tunnel) for the Vercel calculator widget to reach it. This is the gate before
  any public link ships.
- **Expected impact on North Star:** A broken auth or gate on the first session destroys
  trust before it's earned. Converts "should work" → "verified works."
- **Effort:** M (~2 days, mostly tunnel config + the QA checklist already written in PIPE-030).
- **Ready to queue?** Yes — already approved. Sequence after #2 so QA doesn't trip over the mock surface.

### 4. PIPE-036 — Finance-the-Buyback + Runway Forecast (Goal #6 wedge)  ·  score 23
- **Serves goal:** #6 (Repair tested positions) + #2 (Keep your shares)
- **Why now:** Already `approved`; its dependency (PIPE-001 roll targets in action cards)
  is `done`. This is Harvest's clearest *differentiation* — holder tools warn about
  assignment; none engineer the way out. Roll-up-and-out is already live; this adds the
  net-new ~30%: short-dated low-delta income trades to finance the buyback + a "N cycles
  to neutralize" runway forecast.
- **Expected impact on North Star:** Drives the *positions-defended* leading indicator —
  tested positions neutralized without a forced assignment. Highest-impact net-new feature,
  but it matters most *after* users are on board and holding tested calls, so it sequences
  behind launch hardening.
- **Effort:** M–L (~4–5 days: deep-ITM detection, income-trade scanner, runway math, defense panel UI).
- **Ready to queue?** Yes — already approved. Build after the launch-critical trio.

## Scoring table
| Candidate | Goal | Impact ×3 | Reach ×2 | Effort ×1 | Total |
|---|---|---|---|---|---|
| Stripe billing (PIPE-037) | business | 5 | 5 | 3 | **28** |
| PIPE-030 deploy + QA | #5 | 4 | 5 | 3 | **25** |
| Kill mock-rec data | #5/#1 | 4 | 4 | 4 | **24** |
| PIPE-036 finance-the-buyback | #6/#2 | 5 | 3 | 2 | **23** |
| PIPE-006 regime email alerts | #4 | 3 | 4 | 3 | 20 |
| PIPE-002 performance dashboard | #4 | 2 | 4 | 4 | 18 |
| PIPE-007 multi-ticker screener | #1 | 3 | 3 | 2 | 17 |
| Fix broken backtest suite (P0) | dev health | 3 | 2 | 4 | 16* |

\*scored low on the user rubric (no direct North-Star move) but see Strategy conflicts — the nightly agent pushes to main, so a red suite is a real shipping risk.

## Considered but deferred
- **PIPE-007 multi-ticker screener** — real reach (QQQ/IWM diversification) but the first
  audience is dividend/SPY holders, and it doesn't move trust or revenue. After launch.
- **PIPE-002 performance dashboard / PIPE-006 email alerts** — both serve goal #4 (manage
  without grinding). Useful retention features, but retention is a post-first-paying-user
  problem; don't build it before there's a paying user. Note PIPE-006's Settings SMTP/Twilio
  UI is currently wired to nothing — defer the whole alert path together.
- **Settings email-config wiring** — the SMTP/Resend/Loops UI saves nowhere. Cosmetic debt;
  bundle into PIPE-006 rather than fixing standalone.

## Strategy conflicts / decisions needed
- **None against Locked Decisions.** Pricing, freemium caps, self-hosted hosting, and auth
  stack are all respected.
- **Decision #1 (the real blocker):** Will you stand up the Stripe account + price IDs?
  Until you do, the revenue gate can't be built and "ready for first user" is capped at
  unpaid waitlist signups.
- **Decision #2:** For the mock-rec surface — wire it to the real screener engine, or hide
  it from nav for launch? Recommend hide-now, wire-later.
- **Heads-up (not a strategy conflict):** the backtest suite is red
  (`data_store.get_macro_coverage` removed but tests reference it). The nightly upgrade
  agent pushes directly to `main` with no PR gate — a red suite means a regression can ship
  unnoticed. Worth a 1-hour fix before the next autonomous cycle.

## Paste-ready pipeline items (top 1–2 only)

### PIPE-038 · Remove (or back) the mock-data Recommendations surface
**Status:** `pending`
**Description:** `frontend/src/components/Recommendations.jsx` falls through to hardcoded
mock recommendations because no `GET /recommendations` backend exists (PIPE-REC-01..10
TODOs). A first real user reaching this surface sees fabricated trades — a fatal trust
break on a one-shot acquisition channel. Decision: (A) hide the surface from navigation
until it's backed by the real screener engine, or (B) wire it to the existing live
screener/roll endpoints. Recommended: (A) for launch — fastest path to zero fabricated
data — then schedule (B) post-launch.
**Tasks:**
1. If (A): remove the Recommendations entry from the sidebar/nav and any deep links; leave the component in the tree, dormant.
2. If (B): build `GET /recommendations` off the existing screener candidate pipeline; delete the mock fallback and the PIPE-REC TODOs.
3. Grep for any other `mock`/placeholder fallbacks that render financial numbers to a user; list them in the implementation notes.
**Scope:** `frontend/src/components/Recommendations.jsx`, sidebar/nav, (optionally) `backend/main.py`.
**Rationale:** Trust is the product. No user-facing surface may render invented numbers. Cheapest insurance on the first-impression channel.

---

### PIPE-037 · Stripe Billing — UNBLOCK (set status to `approved` once keys are in env)
**Status:** `pending`  (blocked on USER: create Stripe account + $29/mo + $240/yr price IDs)
**Action required from you:** Create the Stripe account, define the two prices, drop
`STRIPE_SECRET_KEY` + price IDs in env, then flip this item to `approved`. Build spec
already written in the existing PIPE-037 block (checkout / webhook / customer portal +
wire UpgradeModal "Start Pro").
**Rationale:** No paid tier = no business. This is the revenue gate; it's the #1 move the
moment it's unblocked.

---
*Advisory only — this memo edits no code, PIPELINE.md, or STRATEGY.md. Flip items to `approved` in PIPELINE.md to queue them.*
