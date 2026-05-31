# PLAN — Markets Tab (S&P 500 Volume Composite + Indicators)

> **Status:** Draft for review. Mark up inline; I'll revise before writing code.

---

## 1. Summary

A new **Markets** tab in the Research section of the sidebar. Pro-gated. Charts daily
volume for the S&P 500 + SPY + QQQ, with a market-cap-weighted composite line built from
the **historical Pareto 80% subset** (the tickers that made up ~80% of S&P 500 market cap
*on each given date*). Filters: ticker (single) or Top N (10/50/100/500). Time range picker
(1M / 3M / 6M / 1Y / 2Y / 5Y / Max). Three indicator overlays: RSI, MACD, Bollinger Bands —
applied to whatever the chart is currently showing.

---

## 2. Decisions locked from prior conversation

| # | Decision | Source |
|---|---|---|
| Placement | New "Markets" tab in Research section, Pro-gated (Option 2) | User turn 2 |
| Pareto basis | (B) Historical 80% per date — not a fixed today-set | User turn 4 |
| Backfill depth | 5 years | User turn 4 |
| Pareto threshold | Hard-coded 80% in v1, no UI toggle | User turn 4 |
| Indicators | Apply to whatever the chart shows: composite for "Top N", ticker for single-ticker filter | User turn 4 |
| Chart library | Visx (per STRATEGY.md locked decision) | STRATEGY.md |
| Database | Postgres (Supabase) + RLS — though sp500 tables are public/global, no user_id | arch_database.md |

---

## 3. The hard part: historical 80% per date

This is the highest-risk piece of scope. To compute "the 80% Pareto set as of 2021-06-15"
you need three things on every historical day:

1. **S&P 500 membership on that date** (the index changes ~20 names/yr)
2. **Market cap on that date** = close price × shares outstanding on that date
3. **Daily close + volume** for every member

### Source plan

**Membership history.** Use the [`fja05680/sp500`](https://github.com/fja05680/sp500)
GitHub dataset — a maintained CSV of historical S&P 500 constituents going back to 1996,
with add/remove dates per ticker. Free, MIT-licensed, refreshed regularly. We'll vendor a
snapshot into the repo and refresh it weekly via the constituent-sync cron.

**Shares outstanding history.** This is the data-quality risk.
- yfinance `Ticker.get_shares_full(start, end)` returns historical shares outstanding
  for most large-cap US tickers, sourced from quarterly filings. Coverage is good for
  current S&P names; thin or missing for tickers that left the index years ago.
- Fallback: SEC EDGAR XBRL facts (`CommonStockSharesOutstanding`) for any gaps.
- Acceptable approximation: shares outstanding changes slowly (buybacks, splits, issuance);
  we step-fill quarterly values across daily dates. A ±2% market cap error is fine for
  ranking-into-Pareto purposes.

**Daily close + volume.** `yfinance.download()` batch — pulls 100+ tickers in one call.
For 5 years × ~600 unique tickers (current 500 + tickers that have left in last 5y) =
~750k rows. Manageable.

### Edge cases I'll handle
- Ticker changes (FB → META, GOOGL split): map to a canonical id
- Index adds/removes mid-window: only count a ticker on dates it was a member
- Tickers delisted: backfill what's available, mark date ranges where data ends
- Splits: yfinance returns split-adjusted volume by default — we'll use `auto_adjust=True`

### Acceptance bar
A spot-check: for 2024-12-31, our computed Pareto-80 set should match within ±5 tickers
of the known top-by-weight S&P holdings on that date (cross-reference SlickCharts archive).

---

## 4. Database schema

New migration: `backend/migrations/005_markets.sql`

```sql
-- S&P 500 historical membership
CREATE TABLE sp500_membership (
  ticker        text NOT NULL,
  added_at      date NOT NULL,
  removed_at    date,                    -- NULL = currently in index
  name          text,
  PRIMARY KEY (ticker, added_at)
);
CREATE INDEX idx_sp500_membership_active ON sp500_membership(ticker) WHERE removed_at IS NULL;

-- Daily per-ticker snapshot (price, volume, shares outstanding, market cap)
CREATE TABLE sp500_daily (
  ticker        text NOT NULL,
  date          date NOT NULL,
  close         numeric(14,4),
  volume        bigint,
  shares_out    bigint,                  -- step-filled from quarterly filings
  market_cap    numeric(20,2),           -- close * shares_out
  in_index      boolean NOT NULL,        -- was the ticker in S&P 500 on this date
  PRIMARY KEY (ticker, date)
);
CREATE INDEX idx_sp500_daily_date ON sp500_daily(date);
CREATE INDEX idx_sp500_daily_inindex_date ON sp500_daily(date, in_index) WHERE in_index;

-- Pre-computed Pareto-80 composite (one row per trading day)
CREATE TABLE sp500_composite_daily (
  date              date PRIMARY KEY,
  pareto_tickers    text[] NOT NULL,     -- the tickers in the 80% set on this date
  ticker_count      int NOT NULL,
  total_market_cap  numeric(20,2) NOT NULL,
  pareto_market_cap numeric(20,2) NOT NULL,
  weighted_volume   numeric(20,2) NOT NULL,  -- Σ (volume_i × weight_i) within pareto set
  total_volume      bigint NOT NULL          -- raw sum across all 500 (for context)
);

-- ETF reference series (SPY, QQQ) so they can plot alongside
CREATE TABLE etf_daily (
  ticker        text NOT NULL,
  date          date NOT NULL,
  close         numeric(14,4),
  volume        bigint,
  PRIMARY KEY (ticker, date)
);
```

**RLS:** these are global market data, not user-scoped. RLS off (or `CREATE POLICY`
allowing all reads). Writes restricted to service role.

---

## 5. Backend ingestion

Three new modules + three crons.

### `backend/markets_ingest.py` (new)
- `sync_membership()` — pulls fja05680 CSV, upserts `sp500_membership`. Weekly.
- `sync_daily(date)` — pulls EOD price/volume for current members + ETFs via `yf.download`,
  pulls/step-fills shares outstanding, writes `sp500_daily` and `etf_daily`. Daily, post-close.
- `compute_composite(date)` — for the given date: load all in-index daily rows, sort by
  market_cap desc, cumulative-sum until ≥ 80% of total, write the result to
  `sp500_composite_daily`. Daily, after `sync_daily`.
- `backfill(start_date, end_date)` — one-time historical pull. Idempotent (uses `INSERT ... ON CONFLICT`).

### Crons
- `backend/cron/sp500_membership_sync.py` — weekly Sunday 02:00 UTC
- `backend/cron/sp500_daily_snapshot.py` — daily 22:00 UTC (post US close)
- `backend/cron/sp500_composite_compute.py` — daily 22:30 UTC (after snapshot)

### One-time backfill
`backend/scripts/backfill_markets.py` — pulls 5y of history for all unique tickers ever in
S&P 500 over that window. Estimated runtime: 30–60 min, ~750k rows. Rate-limited to ~10
tickers/sec to stay under yfinance throttle.

---

## 6. API endpoints

`backend/main.py` additions, all Pro-gated via existing subscription middleware:

```
GET /api/markets/composite?start=YYYY-MM-DD&end=YYYY-MM-DD
  → { dates: [...], weighted_volume: [...], total_volume: [...], ticker_count: [...] }

GET /api/markets/ticker/{ticker}?start=...&end=...
  → { ticker, dates, close, volume }
  Allowed tickers: any current/former S&P 500 member, plus SPY, QQQ.

GET /api/markets/top-n?n=10|50|100|500&start=...&end=...
  → { dates, weighted_volume, members: [tickers] }
  Top N by current market cap (or per-date if we extend later).

GET /api/markets/etfs?start=...&end=...
  → { SPY: {dates, close, volume}, QQQ: {...} }
```

All four endpoints share a single response shape so the frontend can render uniformly.

---

## 7. Frontend

### Sidebar
Add `{ id: 'Markets', label: 'Markets', Icon: BarChart3 }` to the **Research** section
in `Sidebar.jsx`, immediately before "Performance".

### Pro gate
Wrap the entire `Markets.jsx` component in the existing `<LockedFeature>` pattern (same as
Scorecard / OI Chain). Free users see the upgrade modal.

### `frontend/src/components/Markets.jsx` (new)
Layout:
```
┌─ Filter row ─────────────────────────────────────────────────┐
│  [Ticker ▼ or Top N ▼]   [Range: 1M 3M 6M 1Y 2Y 5Y Max]      │
│  [☑ SPY]  [☑ QQQ]  [☑ RSI]  [☑ MACD]  [☑ Bollinger]          │
└──────────────────────────────────────────────────────────────┘
┌─ Main pane: volume + price ──────────────────────────────────┐
│  (Visx LinePath: composite or ticker volume)                 │
│  (Optional Bollinger Bands overlay)                          │
└──────────────────────────────────────────────────────────────┘
┌─ RSI pane (toggleable) ──────────────────────────────────────┐
│  0–100 with 30/70 reference lines                            │
└──────────────────────────────────────────────────────────────┘
┌─ MACD pane (toggleable) ─────────────────────────────────────┐
│  MACD line + signal + histogram                              │
└──────────────────────────────────────────────────────────────┘
```

Three vertically stacked Visx charts sharing the same x-scale. Hover crosshair syncs across
panes.

### `frontend/src/lib/indicators.js` (new)
Pure JS implementations (no library dep):
- `rsi(values, period=14)` — Wilder's smoothing
- `macd(values, fast=12, slow=26, signal=9)` — returns `{macd, signal, hist}`
- `bollinger(values, period=20, stddev=2)` — returns `{upper, middle, lower}`

Indicators are computed on the **frontend** from the series the API returns. Simpler than
caching them server-side, and recomputing 1300 daily values is sub-millisecond.

---

## 8. Build sequence

| Step | Deliverable | Est |
|---|---|---|
| 1 | Migration `005_markets.sql` + apply to local Postgres | 0.5d |
| 2 | `markets_ingest.py` — membership sync (fja05680) | 0.5d |
| 3 | `markets_ingest.py` — daily sync (yfinance batch) | 0.5d |
| 4 | `markets_ingest.py` — shares-outstanding step-fill + market cap calc | 1.0d |
| 5 | `markets_ingest.py` — composite computation | 0.5d |
| 6 | One-time 5y backfill script + run | 0.5d (incl. wait time) |
| 7 | API endpoints + Pro gate | 0.5d |
| 8 | Cron wiring (3 jobs) | 0.25d |
| 9 | Sidebar entry + `Markets.jsx` shell + filter UI | 0.5d |
| 10 | Visx multi-pane chart | 1.0d |
| 11 | `indicators.js` + overlay rendering | 0.5d |
| 12 | Polish, edge cases, empty states, loading | 0.5d |
| **Total** | | **~6.25 days** |

---

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| yfinance shares-outstanding history has gaps for delisted tickers | Med | SEC EDGAR fallback; if still missing, use most recent known + flag |
| yfinance rate-limits during 5y backfill | Med | Throttle to 10 tickers/sec; resumable script via `ON CONFLICT` |
| fja05680 dataset gets stale or moves | Low | Vendor snapshot; weekly refresh tolerates short outages |
| Visx 3-pane chart with synced crosshair is fiddly | Med | Build single pane first, ship incrementally |
| 80% Pareto math doesn't match user intuition | Low | Show selected ticker count + total cap covered in chart legend |
| Strategy drift — Markets tab pulls product toward trader-tool | Med | Pro-gated, hidden from free users; "Research" section, not main flow |

---

## 10. Out of scope for v1 (note for future)

- Intraday volume (would require 1m/5m yfinance pulls + bigger storage)
- Sector breakdowns
- Pareto threshold UI toggle (50/70/80/90%)
- Volume z-score / unusual volume alerts
- Cross-pane drag-to-zoom
- Export-to-CSV from Markets

---

## 11. Open questions for you

1. **Ticker filter UX:** typeahead search across all S&P 500 + SPY + QQQ, or pre-populated dropdown? I'd lean typeahead.
2. **Default chart state on first load:** Composite (Top 500 weighted) at 1Y range, indicators off? Or all on?
3. **Show SPY/QQQ overlay by default?** They're useful context for a composite view.
4. **Cron host:** the existing crons live in `backend/cron/` — are these run via Railway cron, or a system cron on your machine? Affects how I wire the new jobs.

Once you green-light, I'll start at Step 1.
