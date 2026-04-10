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

### PIPE-001 · Roll Recommendation Engine
**Status:** `pending`
**Description:** When the Portfolio Intelligence Panel shows a ROLL or GAMMA_DANGER action item, surface a specific roll target — the best-scoring screener candidate at the same or higher strike with 30–45 DTE — directly in the action card. Include a one-click "Roll to this" button that closes the current position at market and opens the suggested one.
**Scope:** `backend/main.py` (new `/api/positions/{id}/roll-suggest` endpoint), `frontend/src/components/Portfolios.jsx` (action card enhancement)
**Rationale:** Users currently see "Roll Soon" with no guidance on where to roll. This completes the loop.

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
**Status:** `pending`
**Description:** Full mobile-optimized layout. Deferred — user does not yet have a mobile access path to the app. To be prioritized after mobile deployment is set up.
**Note:** The sidebar navigation installed in PIPE-017 will include a working hamburger → drawer on narrow screens as a foundation.

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
