# PIPE-040 · Assignment Tracking (shares assigned by a position)

**Status:** building (2026-06-18)
**Strategy fit:** Extends the core "Track" promise (tagline: *Find, Track, and Capture*). A
covered-call writer's positions don't only get *bought back* — they get *assigned*, and the
shares move. Today Harvest can't tell those apart and never reflects the share movement. This
closes that gap and produces a tax-ready record of every assigned lot.

## Problem

- `positions` has `status` (open/closed), `close_price`, `final_pnl` — but **no `close_reason`**,
  so "bought back" / "assigned" / "expired" / "rolled" are indistinguishable.
- `holdings` (shares) are **never auto-adjusted** when an option closes. After a call is assigned,
  the user still shows shares they no longer own.
- No record of the share movement, its cost basis, proceeds, realized gain, or holding-period term
  — the things you actually need at tax time.

## Scope (confirmed with user)

- **Both** covered calls (short call → shares *called away*) and cash-secured puts
  (short put → shares *put to you*).
- **Auto-adjust holdings** on assignment, with **tax-correct cost basis**.

## Tax treatment (IRS, equity options)

**Covered call called away** — you *sell* shares at the strike.
- The app's existing P&L semantics treat option premium as banked income on every close. Keep that:
  the assigned option books `final_pnl = full premium kept` (`close_price = 0`). Flows into
  `pnl-summary` and the profit gate exactly like any other close.
- The **stock leg** is recorded separately in `assignment_events` at the **pure strike** (premium is
  already counted on the option leg, so it is *not* double-counted here):
  - `proceeds_total = strike × shares`
  - `cost_basis_total = avg_cost × shares` (relieved FIFO across matching holdings)
  - `realized_gain = (strike − avg_cost) × shares`
  - `term` from each relieved lot's `purchase_date` → `short` / `long` / `mixed`
- For the **tax view**, the row also carries `premium_total`; the UI shows the 1099-B-style figure:
  *tax proceeds = strike×shares + premium*. App-internal split (premium→option leg, gain→stock leg)
  sums to the same economic total, with no double count.
- Holdings: relieve `shares` FIFO across `(ticker, portfolio)` lots, oldest first; delete a lot when
  it hits 0.

**Cash-secured put assigned** — you *buy* shares at the strike.
- Premium **reduces basis** (not booked as income): new lot `avg_cost = strike − premium_per_share`,
  `purchase_date = assignment_date`. The assigned put books `final_pnl = 0`
  (`close_price = sell_price`) so the premium isn't also counted as income.
- `assignment_events`: `cost_basis_per_share = strike − premium_per_share`, `proceeds_total = NULL`,
  `realized_gain = NULL` (gain is realized later when the shares are sold), `term = NULL`.
- Holdings: blend into an existing `(ticker, portfolio)` lot, else create one.

**No matching holding for a call** (user tracked the call, not the stock): record the event with
`basis_known = false`, proceeds still computed, holdings untouched, and flag it in the UI.

## Data model — migration `006_assignments.sql`

- `ALTER TABLE positions ADD COLUMN close_reason TEXT` (`bought_back|assigned|expired|rolled`).
- New `assignment_events` table (RLS owner policy + indexes), columns: position/portfolio/holding
  refs, `ticker`, `direction` (`called_away|put_to_user`), `contracts`, `shares`, `strike`,
  `premium_per_share`, `premium_total`, `cost_basis_per_share`, `cost_basis_total`,
  `proceeds_total`, `realized_gain`, `acquired_date`, `assignment_date`, `term`, `basis_known`,
  `notes`.

> Applied manually in the Supabase SQL editor (same convention as `001_schema.sql`).

## Backend

- `db.py`: `create_assignment_event`, `get_assignment_events`.
- `main.py`:
  - `AssignIn { contracts?, assignment_date?, note? }` (defaults to all contracts, today).
  - `POST /api/positions/{id}/assign` — infers call/put from `type`/`harvest_category`, computes the
    tax-aware figures above, mutates holdings, writes the event, closes (or partial-closes, reusing
    the split logic) the position with `close_reason='assigned'`. Behind `check_write_access`.
  - `GET /api/assignments?portfolio_id=` — list events, newest first.
  - Helpers: `_is_put_position`, `_relieve_holdings_fifo`, `_term_for`.

## Frontend (`Portfolios.jsx`)

- Close drawer: a **"How did this close?"** toggle — *Bought back* (existing buy-back price flow) vs
  *Assigned* (no price; calls `/assign`). Assigned shows a one-line preview of the share movement.
- Closed Positions table: a `close_reason` badge ("Assigned" / "Bought back").
- New **Assigned Shares** section: per-event ticker, direction, shares, strike, cost basis,
  proceeds, realized gain (color-coded), term badge, date; a tax note explaining the premium
  fold-in; `basis_known=false` rows flagged.

## Out of scope (logged, not built)

- Per-tax-lot (specific-ID) selection — we use FIFO. Wash-sale detection. CSV/8949 export
  (a Pro-tier follow-up once Stripe lands).
