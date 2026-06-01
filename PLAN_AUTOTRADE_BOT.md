# Auto-Trade Simulation Bot

> **Status:** draft — awaiting approval
> **Purpose:** test the recommendation algorithm + custom-backtest exit strategy
> end-to-end against the 5 seeded test users (see [TEST_USERS.md](TEST_USERS.md)).
> **Not a real-money execution bot.** Writes simulated trades to the Supabase
> `positions` table only. No broker integration, no order routing.

---

## STRATEGY.md alignment

Harvest's positioning is "track and recommend" for buy-and-hold investors —
not auto-execute. This bot is a **testing harness**, not a user-facing feature,
so it does not conflict with the locked product positioning. It will not be
exposed in the UI or marketed.

If at some later date we want this to become a user-facing product
(auto-managed CC accounts), that is a STRATEGY.md change conversation, not
this plan.

---

## Two responsibilities, one bot

| Phase | Trigger | Logic source |
|---|---|---|
| **Open** | New holding has free contracts (shares ÷ 100 − open contracts > 0) | Production recommendation algorithm (`/api/recommendations`) |
| **Manage** | Daily scan of open positions | CUSTOM strategy from backtest (`backend/backtest.py`) |

The user's explicit ask: entries follow the *current production algorithm* so
we can test what real users see; exits follow the *custom backtest strategy*
because that's the rule set we're trying to validate in production.

---

## Entry rules (replicates production algorithm)

For each test user → each holding → per-ticker `/api/recommendations` call
that already powers the Recommendations tab:

1. **Coverage:** open `free_contracts` worth of CCs (capped — see Open Questions).
2. **Strike/expiry:** take the top-ranked recommendation from the API
   (composite score: signal + yield + delta + DTE).
3. **Regime gate:** only open when `signals.analyze().regime == "SELL PREMIUM"`.
   This matches the backtest's "regime-gated" track which beat unconditional.
4. **Fill price:** use the recommended option's `mid` as `sell_price`. Stamp
   `open_signal` with the regime + factor scores at open time
   (`PIPE-009 Signal Snapshot on Open` already exists for this).

**Result:** one or more `positions` rows with `status="open"`, `type="short_call"`,
`portfolio_id` linked to the holding's portfolio.

---

## Manage rules (CUSTOM strategy from backtest)

Daily tick — for each open simulated position, check in this order:

1. **50%-profit close** ([backtest.py:175](backend/backtest.py#L175)):
   `current_mid ≤ 0.50 × entry_mid` → close at current mid. Done.
2. **ITM roll up-and-out** ([backtest.py:177](backend/backtest.py#L177)):
   `underlying > strike × 1.005` AND `DTE > 21` → close current, open new
   contract at next expiry, ~30-delta strike. Bypasses regime gate (rolls always allowed).
3. **21-DTE defensive roll** ([backtest.py:178](backend/backtest.py#L178)):
   `DTE ≤ 21` AND `underlying ≥ strike × 0.97` → roll up-and-out same as #2.
4. **Expiry handling:**
   - `underlying ≤ strike` at expiry → close worthless, max profit ([backtest.py:285](backend/backtest.py#L285)).
   - `underlying > strike` at expiry → assigned: close position, decrement holding shares
     by `contracts × 100` (or mark holding for assignment — see Open Questions).
5. **Otherwise:** do nothing.

Each close stamps `close_signal` so we can audit which rule fired.

**Roll = close + open**, two `positions` rows. The chain link is a new
optional `roll_of_position_id` column (see Schema Changes).

---

## Files to touch

| File | Change |
|---|---|
| [backend/migrations/004_autobot.sql](backend/migrations/) (new) | `roll_of_position_id` UUID FK on `positions`; optional `simulated` boolean on `positions` |
| [backend/autobot.py](backend/) (new) | Core: `open_for_user(user_id)`, `tick_user(user_id)`. Pure functions, no FastAPI routes. |
| [backend/scripts/autobot_run.py](backend/scripts/) (new) | CLI: `python scripts/autobot_run.py --action open --users test` and `--action tick --users test`. |
| [backend/cron/autobot_daily.py](backend/cron/) (new, optional) | Wraps the script for crontab. Off by default. |
| [TEST_USERS.md](TEST_USERS.md) | Add a "Bot operations" section with run commands. |

No frontend changes. No new API endpoints in `main.py` (keeps it out of the
production surface area).

---

## Build order

1. **Schema migration** — add `roll_of_position_id` column. ~10 lines SQL.
2. **`autobot.py` — open path** — wrap `/api/recommendations` logic, write
   positions for one user. Test: run against `test-spy@harvest.test`,
   verify a position appears in Supabase with the right strike/expiry/contracts.
3. **`autobot.py` — manage path** — daily tick for one user. Test: hand-craft
   an open position, advance market data, verify the tick fires the right
   rule and writes a close (and maybe a follow-up open for rolls).
4. **CLI runner** — `scripts/autobot_run.py` with `--action {open,tick}` and
   `--users {test,all,<email>}`. Default `--users test` (only `@harvest.test`).
5. **Run end-to-end** — open all 5 test users, then run a tick. Eyeball the
   resulting positions in the UI by logging in as each test user.
6. **(Optional) cron** — only after the manual flow has been validated for a
   few days.

---

## Safety scoping

- Default user filter: `email LIKE '%@harvest.test'`. The CLI requires
  `--users all` to operate beyond that, and that flag prints a confirmation prompt.
- The bot never touches `holdings` rows except on assignment (and that
  behavior is gated by Open Question #3).
- All bot-written positions get a tag in their `notes` field (e.g.,
  `[autobot v1]`) so they're easy to identify and bulk-delete if needed.

---

## Open questions for you

1. ~~**Cap on contracts opened per tick?**~~ **Decided:** open **90%** of available
   free contracts; hold **10%** in reserve. SPY × 30 contracts → open 27, reserve 3.
   Reserve = `ceil(total_contracts × 0.10)` (round up — err on more reserve for
   small holdings). Reserve is deployed only on rolls (see Reserve usage below).

2. ~~**Single expiry vs. laddered?**~~ **Decided:** 3-rung ladder, equal split,
   ~30-delta strike on each rung, expiry buckets:
   - **near** (28–32 DTE)
   - **mid** (33–37 DTE)
   - **far** (38–42 DTE)

   Allocation example: SPY × 30 contracts → 3 reserved, 27 deployed → 9/9/9
   across rungs. Remainder biases to near rung. If a rung's bucket has no
   viable candidate (thin chain), the bot consolidates: skip the empty rung,
   redistribute to populated ones.

3. ~~**Assignment behavior on expiry ITM?**~~ **Decided:** auto-decrement
   holding `shares` by `contracts × 100`; close the position with cash
   proceeds at strike (realistic). Required to validate the strategy honestly.

4. ~~**Regime block logging?**~~ **Decided:** when regime is not SELL PREMIUM,
   log a "would-have-opened" entry to `recommendations_log` and do not open.
   Lets us compare regime-gated vs. unconditional tracks later without polluting
   the live positions table.

5. ~~**Cron cadence?**~~ **Decided:** daily tick at 15:50 ET (10 min before close).

6. ~~**Run on real account?**~~ **Decided:** no — `@harvest.test` users only.
   Revisit after we see results from the test users.

### Reserve usage (new)

10% reserve is held back at initial open. It exists to give the bot defensive
capacity on rolls — specifically, when an ITM roll-up would otherwise be a
net debit, the bot can sell additional contracts at the new strike to keep
the roll cash-positive.

**Proposed deployment rule:**

When rule #2 or #3 fires (ITM roll up-and-out, or 21-DTE defensive roll), the
bot computes the roll P&L:

```
roll_credit = (new_call_mid - buy_back_mid) × contracts × 100
```

If `roll_credit < 0` (net debit roll), the bot deploys reserve contracts:
- Sell additional contracts at the **new** strike/expiry (same rung the roll lands in)
- Up to whatever it takes to make `roll_credit ≥ 0`, capped at the
  user's remaining reserve
- Reserve never goes below zero (never over-write capacity)

**If reserve is exhausted and the roll is still a net debit:** the bot
takes the debit roll anyway (rule from backtest is unconditional once
trigger fires). Stamps a `[reserve exhausted]` note on the close.

**Reserve refill:** when a position is closed (50%-profit close, expiry,
assignment), the freed contracts go back into the user's "available"
pool, and reserve is recomputed at the start of the next tick.

### Still open

- **Reserve deployment trigger — confirm or override.** Default above:
  deploy reserve only on debit rolls, sized to bring credit to ≥ 0.
  Alternative interpretations of your "additional liquidity" comment:
  (a) deploy reserve on *any* roll, not just debit rolls (more aggressive);
  (b) deploy reserve when a holding's *available* contracts drop below some
      threshold (proactive top-up).
  My read: (a) was your intent — confirm.

---

## Out of scope (for now)

- Real-money execution / broker integration
- Frontend UI for bot status
- Per-user bot toggle / settings
- Backtest replay against historical recommendation snapshots (we have
  `recommendations_log` but it's recent-only)
- Slippage / commissions modeling beyond what the existing backtest already does
