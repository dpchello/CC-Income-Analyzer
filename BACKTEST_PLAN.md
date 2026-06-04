# PIPE-REC-09 · Strategy Backtesting — SPY v1

> **Status:** plan — awaiting approval
> **Source spec:** PIPELINE.md:1040-1139 (PIPE-REC-09)
> **This plan supersedes the spec where they conflict**, because the spec was written before the DuckDB historical chains landed (commit 20a1842).
> **Scope:** SPY only for v1. QQQ + IWM ride along in v1.1 (same code, just `?ticker=` parameterized — coverage already exists).
> **Depends on:** PIPE-REC-01 (done — `STRATEGY_PRESETS` in main.py:82-149), DuckDB data layer (done — backend/data_store.py).
> **Does NOT depend on:** PIPE-REC-02 (already done; backtest runs independently of live recommendations).

---

## What changed from the spec

The spec assumed yfinance + 2 years of underlying-only data, so it specified Black-Scholes synthetic premiums with realized-vol-as-IV-proxy. The repo now has 17 years × 24.7M rows of real SPY chains (bid/ask/IV/Greeks per strike per quote date) in `backend/data/options.duckdb`. That makes synthetic premiums obsolete for SPY/QQQ/IWM.

| Decision | Spec said | This plan says | Why |
|---|---|---|---|
| Premium source | Black-Scholes from realized vol | Real chain `(bid+ask)/2` | 17 years of real data already loaded |
| Strike selection | Binary search on delta via BS | SQL `WHERE delta <= maxDelta ORDER BY delta DESC LIMIT 1` | Real per-strike delta in DuckDB |
| IV filter | Realized vol vs strategy.minIvr | Real `implied_volatility` column vs strategy.minIvr | Matches what the live engine does |
| Entry cadence | Every 5 days, unconditional | **Dual-track**: unconditional + regime-gated | Proves the signal engine adds value |
| Result storage | In-memory cache | DuckDB results tables | Survives backend restarts |
| Slippage | Not modeled (caveat in disclaimer) | `(bid+ask)/2` mid-fill, with disclaimer noting half-spread optimism | Industry-comparable; user explicitly chose mid over bid |
| File scope | `data_fetcher.py` adds `get_historical_prices` | Not needed — `data_store.get_underlying_prices` already exists | Reuse |

---

## Locked decisions (from this review)

- **D1** — Use real DuckDB chains for SPY/QQQ/IWM. BS+RV path is **not** built in v1 (defer until a non-coverage ticker is requested, which doesn't happen until v2 generalizes to user portfolios).
- **D2** — Dual-track results: simulate every Mon (unconditional) AND only on historical SELL PREMIUM days (regime-gated). Frontend headline = regime-gated; secondary stat = unconditional + delta callout.
- **D3** — Persist runs in DuckDB tables `backtest_runs` + `backtest_trades` (new in `data_store.py`'s `init_schema()`).
- **D4** — Fill price = `(bid+ask)/2`. Disclaimer must say "yields shown use mid-price; real fills typically half-spread lower."

---

## Architecture

### Data flow

```
HTTP GET /api/backtest?strategy=wheel&ticker=SPY&lookback=730&cadence=both
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │ main.py: GET /api/backtest handler   │
        │  • validate strategy ∈ STRATEGY_PRESETS │
        │  • validate ticker has DuckDB coverage  │
        │  • cache check via data_store          │
        └──────────────────────────────────────┘
                              │
                       cache hit? ──── yes ──► return cached_run summary_json
                              │ no
                              ▼
        ┌──────────────────────────────────────┐
        │ backtest.py: run_backtest()           │
        │  • load underlying_prices for window  │
        │  • derive entry_dates (every 5 td)    │
        │  • for each entry: simulate(uncond)   │
        │  • for each entry: simulate(regime)   │
        │     └─► historical_signal(date) gate  │
        │  • aggregate metrics                  │
        │  • persist run + trades               │
        └──────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────┐
        │ simulate_one_trade(entry, strategy):  │
        │  ┌─ pick expiry IN strategy.dte_window │
        │  ├─ pick strike (delta ≤ strategy.maxDelta) │
        │  ├─ if iv < strategy.minIvr → skip    │
        │  ├─ if annYield < strategy.minYield → skip │
        │  ├─ premium = (bid+ask)/2             │
        │  ├─ expiry_close = underlying_prices  │
        │  └─ classify outcome + compute pnl    │
        └──────────────────────────────────────┘
```

### File touch list

| File | Change |
|---|---|
| `backend/backtest.py` | NEW. ~250 lines. All simulation logic |
| `backend/data_store.py` | EXTEND. Add `backtest_runs` and `backtest_trades` tables to `init_schema()`; add `get_cached_run()`, `insert_backtest_run()`. ~60 lines |
| `backend/main.py` | EXTEND. Add `GET /api/backtest` handler. ~40 lines |
| `frontend/src/components/Recommendations.jsx` | EXTEND. Add `<StrategyPerformance>` collapsible. ~120 lines |
| `frontend/src/components/StrategyPerformance.jsx` | NEW (extracted, not inline in Recommendations.jsx for testability). ~150 lines |
| `backend/tests/test_backtest.py` | NEW. ~200 lines covering T1-T8 |

Total: 6 files, ~820 lines added. Below the 8-file complexity threshold.

### DuckDB schema additions

```sql
-- Add to data_store.init_schema()
CREATE TABLE IF NOT EXISTS backtest_runs (
    run_id          VARCHAR PRIMARY KEY,           -- "SPY:wheel:730:both:2026-04-25"
    ticker          VARCHAR NOT NULL,
    strategy_id     VARCHAR NOT NULL,
    lookback_days   INTEGER NOT NULL,
    cadence         VARCHAR NOT NULL,              -- 'unconditional' | 'regime_gated' | 'both'
    started_at      TIMESTAMP NOT NULL,
    completed_at    TIMESTAMP,
    n_trades_uncond INTEGER,
    n_trades_regime INTEGER,
    summary_json    VARCHAR                        -- pre-rendered response body
);
CREATE INDEX IF NOT EXISTS ix_backtest_runs_lookup
    ON backtest_runs (ticker, strategy_id, lookback_days, cadence, started_at DESC);

CREATE TABLE IF NOT EXISTS backtest_trades (
    run_id          VARCHAR NOT NULL,
    cadence         VARCHAR NOT NULL,
    entry_date      DATE NOT NULL,
    expiry_date     DATE NOT NULL,
    strike          DOUBLE NOT NULL,
    spot_at_entry   DOUBLE NOT NULL,
    mid             DOUBLE NOT NULL,
    iv_at_entry     DOUBLE NOT NULL,
    delta_at_entry  DOUBLE NOT NULL,
    ann_yield       DOUBLE NOT NULL,
    expiry_close    DOUBLE,
    outcome         VARCHAR NOT NULL,              -- 'max_profit' | 'near_miss' | 'assignment'
    pnl             DOUBLE NOT NULL,
    regime_at_entry VARCHAR                         -- 'SELL PREMIUM' | 'NEUTRAL' | 'AVOID'
);
CREATE INDEX IF NOT EXISTS ix_backtest_trades_run
    ON backtest_trades (run_id, cadence);
```

### Endpoint contract

```
GET /api/backtest?strategy=wheel&ticker=SPY&lookback=730

Response 200:
{
  "ticker": "SPY",
  "strategy_id": "wheel",
  "lookback_days": 730,
  "data_window": {"start": "2024-04-25", "end": "2026-04-25"},
  "unconditional": {
    "trades_simulated": 104,
    "max_profit_rate": 0.76,
    "near_miss_rate":  0.10,
    "assignment_rate": 0.14,
    "avg_ann_yield":   12.4,
    "avg_pnl_per_trade": 142.30,
    "worst_3m_period": {"start": "2025-08-01", "end": "2025-10-31",
                        "max_profit_rate": 0.40},
    "monthly_outcomes": [
      {"month": "2024-05", "max_profit": 3, "near_miss": 0, "assignment": 1},
      ...
    ]
  },
  "regime_gated": {
    "trades_simulated": 67,
    "max_profit_rate": 0.81,
    ...
  },
  "engine_edge": {                                  // regime_gated - unconditional
    "max_profit_rate_delta": 0.05,
    "ann_yield_delta": 1.8
  },
  "data_source": "duckdb",                          // 'duckdb' | 'bs_rv_fallback' (v2)
  "fill_model": "mid",
  "cache_age_seconds": 0
}
```

---

## Implementation steps

### Phase 1 — Backend simulation core (sequential)

1. **`data_store.py` schema** — Add `backtest_runs` + `backtest_trades` to `init_schema()`. Add `get_cached_run`, `insert_backtest_run`, `get_run_trades`. Test: re-running `init_schema()` on existing options.duckdb is a no-op (idempotent).

2. **`backtest.py` — strike & expiry selection** — Implement `_select_expiry(ticker, entry_date, dte_window)` and `_select_strike(ticker, entry_date, expiry, max_delta, min_iv, min_yield)` as DuckDB-backed pure functions. Both return `None` for "no eligible row." Tests T2, T3, T4.

3. **`backtest.py` — outcome classifier** — Implement `_classify_outcome(strike, mid, expiry_close)` returning `(outcome, pnl)` tuple. Test T1: parametrized over {below, equal, +1%, +2%, +3%, +5%, +20%}.

4. **`backtest.py` — historical regime backfill** — Implement `_was_sell_premium(entry_date)` by reading historical VIX/VVIX/SPY-MA from existing `data_store.get_underlying_prices` and re-running the `signals.py` scoring against historical inputs. **Open question to validate during build:** does `signals.py` need refactoring to accept historical inputs as args, or does it already? Read it carefully before implementing — if it does live HTTP calls inside, this step grows.

5. **`backtest.py` — orchestrator** — `run_backtest(ticker, strategy_id, lookback_days, cadence)` glues steps 2-4. Returns the response dict + persists via `data_store.insert_backtest_run`. Test T8 with a 10-trade synthetic fixture.

### Phase 2 — Endpoint + caching

6. **`main.py` GET /api/backtest** — Auth required (Pro tier? — see open question below). Validate `strategy ∈ STRATEGY_PRESETS`. Validate `ticker` has DuckDB coverage via `get_coverage_summary`. Cache check via `data_store.get_cached_run`. If fresh (≤24h), return `summary_json` directly. Else call `run_backtest`. Tests T5, T6.

### Phase 3 — Frontend (parallel to phase 2)

7. **`StrategyPerformance.jsx` (new)** — Collapsible component, accepts `{ ticker, strategyId }` props. Fetches `/api/backtest`. Renders stats row + monthly bar chart (use existing Visx setup from STRATEGY.md). Empty/loading/error states. Tests T9.

8. **`Recommendations.jsx`** — Mount `<StrategyPerformance>` below the ranked cards. Toggle text per spec line 1126.

### Parallelization

| Lane | Steps | Modules |
|---|---|---|
| A (sequential within) | 1 → 2 → 3 → 4 → 5 | `backend/` |
| B (sequential within) | 7 → 8 | `frontend/` |
| Merge gate | 6 (depends on lane A complete; lane B mocks the response shape until then) | `backend/main.py` |

**Lane A and B can run in parallel after step 1** — frontend can mock the response from this doc's contract until step 6 ships.

---

## NOT in scope (deferred)

| Item | Reason |
|---|---|
| QQQ + IWM | v1.1, same code, behind `?ticker=` validation — coverage already in DuckDB, ~30 min add |
| User-portfolio tickers (AAPL, MSFT, etc.) | v2 — requires BS+RV fallback path. The spec's BS+RV code becomes the v2 fallback. Document the design but don't build |
| Roll vs hold modeling | v2 — current outcomes assume hold-to-expiry only |
| Tax-aware net P&L | v2 — would require user's tax rate (only stored for Pro users) |
| Comparative chart across all 5 strategies | v1.1 polish — single-strategy view first |
| Hourly intraday backtest | never — daily close is the institutional standard |
| Greeks-trajectory display | never — outside product scope |
| Backfill pre-2008 | never — VIX has structure breaks pre-2008, options market microstructure differs |

## What already exists (per skill requirement)

| Component | Location | Status |
|---|---|---|
| Strategy presets w/ dte_window, weights | `backend/main.py:82-149` | done — reuse directly |
| `_dte_score` | `backend/main.py:160` | done — import |
| `_bs_greeks`, `_ncdf` | `backend/data_fetcher.py:12-53` | done — only needed for v2 BS+RV fallback |
| DuckDB connection + chain access | `backend/data_store.py:67-100` | done — extend, don't replace |
| Historical underlying prices | `backend/data_store.get_underlying_prices` | done — use for expiry-close lookup and regime backfill |
| Signal regime engine | `backend/signals.py:107` | done — needs validation in step 4 that it accepts historical inputs |
| Visx chart components | (per STRATEGY.md, charts library locked) | available — use for monthly bar chart |
| Auth gate + Pro tier checks | `backend/auth.py`, `LockedFeature.jsx` | done — wrap endpoint and frontend section |

## Failure modes (per skill requirement)

| Code path | Realistic prod failure | Test? | Error handler? | User sees? |
|---|---|---|---|---|
| `_select_expiry` | Holiday week — no Friday expiry in window | T3 | Returns None → trade skipped | Trade count slightly lower; no error |
| `_select_strike` | Strategy.minIvr=80 + low-vol regime → zero eligible strikes | T4 | Returns None → trade skipped | Same |
| `run_backtest` for ticker w/o coverage | User passes `?ticker=AAPL` (no DuckDB rows) | T4 | 422 with "no historical coverage for AAPL" | Clear error message |
| `_was_sell_premium` | Missing VVIX data on a single day | NEW | Treat day as 'NEUTRAL' (conservative) | Slight under-count of regime-gated trades |
| `data_store.insert_backtest_run` | DuckDB write blocked by daily IV cron | NEW | Retry once with 100ms backoff; if still blocked, return result without persisting (cache miss next call) | Slight cold-start hit on next user |
| Endpoint timeout | Lookback=3650 (10y), cold cache | NEW | Hard cap lookback at 1825 (5y) in validation | "Max lookback is 5 years" message |

**Critical gap flagged:** the missing-VVIX failure mode has *no test* and *no error handler* in the spec. Adding a test (T7 already covers count invariant) plus an explicit `regime_at_entry='UNKNOWN'` path that excludes the day from regime-gated stats. Logged below.

---

## Test plan

(See Section 3 of the eng review above.)

T1 outcome classifier (unit) · T2 strike selection (integration, real DuckDB) · T3 holiday-week expiry (unit) · T4 missing-coverage handling (unit) · T5 cache-hit path (integration) · T6 cache-miss-after-24h (integration) · T7 dual-track count invariant (property test) · T8 hand-computed aggregate match (unit) · T9 frontend empty/loading/error states (RTL) · T10 E2E **manual QA** because Playwright is blocked on this Mac.

---

## Open questions (require build-time investigation, not blocking this plan)

1. **Auth tier for `/api/backtest`** — Pro-only (consistent with scorecard + OI chain locks) or free-tier-with-rate-limit? STRATEGY.md says `/api/backtest` isn't currently in the Pro lock list. **Recommended:** Pro-only — the conviction-credibility narrative is a Pro hook.
2. **Does `signals.py` accept historical inputs?** If `_compute_regime` calls live HTTP inside, step 4 grows. Read `signals.py` end-to-end before starting step 4.
3. **What does `monthly_outcomes` cover for 730-day lookback?** ~24 months of bars. Is the chart readable at that width? Eyeball the design before locking the visx config.

## TODOs proposed (defer outside this PR)

- **TODO-BT-1** · BS+RV fallback path for non-coverage tickers · v2 prerequisite for portfolio-wide backtests
- **TODO-BT-2** · Roll vs hold-to-expiry modeling · adds ~30% complexity, defer until users ask
- **TODO-BT-3** · 5-strategy comparison view ("which strategy fits SPY best") · v1.1 polish

## Lake score

3 of 4 decisions chose the more-complete option (D1, D2, D3). D4 chose the industry-default mid over the more-honest bid per user preference. Lake score: 3/4.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 decisions made, 1 critical gap fixed (VVIX-missing path), 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | recommended for StrategyPerformance |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a (internal endpoint) |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement after user signs off on this doc.
