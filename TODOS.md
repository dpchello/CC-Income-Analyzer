# TODOS

Tracked work for Harvest, grouped by component, then priority (P0 highest → P4 lowest).
Completed items move to the bottom.

## Backend — Backtest / data_store

### Fix pre-existing backtest test failures (missing `data_store.get_macro_coverage`)
**Priority:** P0
`backend/tests/test_backtest.py::test_cache_roundtrip` and `::test_dual_track_invariant`
fail with `AttributeError: module 'data_store' has no attribute 'get_macro_coverage'`.
The tests call `data_store.get_macro_coverage()`, but that method does not exist in
`backend/data_store.py` — it was renamed, removed, or never added. Decide whether to
restore the `data_store` API or update the tests, then make the backtest suite green again.

- Noticed on branch `feat/oi-put-quotes` during `/ship` (2026-06-01); failures are
  pre-existing and unrelated to that branch's OI put-quote change.
- Repro: `cd backend && python3 -m pytest tests/test_backtest.py::test_cache_roundtrip tests/test_backtest.py::test_dual_track_invariant -q`

## Completed
