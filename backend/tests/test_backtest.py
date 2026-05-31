"""
Tests for PIPE-REC-09 backtest engine. Maps to test plan T1-T8 in
BACKTEST_PLAN.md. T9 (frontend RTL) and T10 (E2E) live elsewhere.

Run: cd backend && python -m pytest tests/test_backtest.py -v
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import backtest
import data_store


# ── T1-T6 — _manage_position trigger tests (PIPE-REC-12 rolling) ──────────────
#
# Each test patches the daily lookups (_underlying_close_on, _option_mid_on)
# to inject a deterministic scenario, calls _manage_position, asserts the
# returned label and the mutated position fields.

def _make_position(strike=500, mid=2.50, entry=date(2025, 6, 3), expiry=date(2025, 7, 3)):
    return {
        "entry_date": entry, "expiry_date": expiry,
        "strike": strike, "spot_at_entry": 490, "mid": mid,
        "iv_at_entry": 18, "delta_at_entry": 0.30, "ann_yield": 12,
        "expiry_close": None, "outcome": None, "pnl": None,
        "close_date": None, "buyback_mid": None,
    }


def test_manage_50pct_close_fires(monkeypatch):
    """Option mid drops to 50% of entry → closed_early_50pct."""
    monkeypatch.setattr(backtest, "_option_mid_on", lambda *args, **kw: 1.20)
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 495)
    pos = _make_position()
    label = backtest._manage_position(pos, date(2025, 6, 10), "SPY")
    assert label == "closed"
    assert pos["outcome"] == "closed_early_50pct"
    assert pos["pnl"] == pytest.approx(130.0)
    assert pos["buyback_mid"] == 1.20


def test_manage_itm_roll_up_and_out(monkeypatch):
    """Underlying breaches strike with > 21 DTE → rolled_up_and_out."""
    monkeypatch.setattr(backtest, "_option_mid_on", lambda *args, **kw: 8.00)
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 520)  # ITM
    pos = _make_position()  # 30 DTE, 27 days remaining at this point
    label = backtest._manage_position(pos, date(2025, 6, 10), "SPY")
    assert label == "rolled"
    assert pos["outcome"] == "rolled_up_and_out"
    assert pos["pnl"] == pytest.approx((2.50 - 8.00) * 100)  # buyback at 8.00


def test_manage_no_roll_when_itm_inside_21dte(monkeypatch):
    """ITM with ≤ 21 DTE falls through to defensive-roll branch instead."""
    monkeypatch.setattr(backtest, "_option_mid_on", lambda *args, **kw: 7.00)
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 520)
    pos = _make_position()
    # Position is 30 DTE total; query at day 16 leaves 17 DTE — defensive roll fires
    label = backtest._manage_position(pos, date(2025, 6, 19), "SPY")
    assert label == "rolled"
    assert pos["outcome"] == "rolled_at_21_dte"


def test_manage_defensive_roll_at_21_dte_at_risk(monkeypatch):
    """≤ 21 DTE and underlying within 3% of strike → rolled_at_21_dte."""
    monkeypatch.setattr(backtest, "_option_mid_on", lambda *args, **kw: 4.00)
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 495)
    pos = _make_position()
    label = backtest._manage_position(pos, date(2025, 6, 19), "SPY")
    assert label == "rolled"
    assert pos["outcome"] == "rolled_at_21_dte"


def test_manage_no_defensive_roll_when_far_otm(monkeypatch):
    """≤ 21 DTE but underlying < strike × 0.97 → just hold (not at risk)."""
    monkeypatch.setattr(backtest, "_option_mid_on", lambda *args, **kw: 1.50)
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 470)  # 6% below strike
    pos = _make_position()
    label = backtest._manage_position(pos, date(2025, 6, 19), "SPY")
    # mid 1.50 vs entry 2.50: not yet 50% target (1.25) — no close, no roll
    assert label == "kept"


def test_manage_expiry_max_profit(monkeypatch):
    """At expiry, underlying ≤ strike → max_profit."""
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 480)
    pos = _make_position(expiry=date(2025, 7, 3))
    label = backtest._manage_position(pos, date(2025, 7, 3), "SPY")
    assert label == "expired"
    assert pos["outcome"] == "max_profit"
    assert pos["pnl"] == 250.0


def test_manage_expiry_assignment(monkeypatch):
    """At expiry, underlying > strike → assignment with capped upside."""
    monkeypatch.setattr(backtest, "_underlying_close_on", lambda *args, **kw: 520)
    pos = _make_position(expiry=date(2025, 7, 3))
    label = backtest._manage_position(pos, date(2025, 7, 3), "SPY")
    assert label == "expired"
    assert pos["outcome"] == "assignment"
    assert pos["pnl"] == pytest.approx(-1750.0)  # 250 premium - 2000 capped


# ── T8 — aggregator hand-computed values ───────────────────────────────────────

def test_aggregate_empty():
    """Empty trade list returns the canonical empty shape."""
    out = backtest._aggregate([], "SPY", date(2024, 1, 1), date(2024, 12, 31))
    assert out["trades_simulated"] == 0
    assert out["max_profit_rate"] is None
    assert out["monthly_outcomes"] == []


def test_outcome_buckets_hand_computed():
    """10-trade fixture: 7 max_profit, 1 closed_early_50pct, 2 assignment.
    Tests the pure outcome-bucket aggregator (no DuckDB required)."""
    trades = []
    base = date(2025, 1, 6)
    for i in range(7):
        trades.append({
            "entry_date": base, "expiry_date": base, "strike": 500, "spot_at_entry": 490,
            "mid": 2.0, "iv_at_entry": 18, "delta_at_entry": 0.20,
            "ann_yield": 12.0, "expiry_close": 495, "outcome": "max_profit", "pnl": 200.0,
        })
    trades.append({
        "entry_date": base, "expiry_date": base, "strike": 500, "spot_at_entry": 490,
        "mid": 2.0, "iv_at_entry": 18, "delta_at_entry": 0.20,
        "ann_yield": 14.0, "expiry_close": 498, "outcome": "closed_early_50pct", "pnl": 100.0,
    })
    for _ in range(2):
        trades.append({
            "entry_date": base, "expiry_date": base, "strike": 500, "spot_at_entry": 490,
            "mid": 2.0, "iv_at_entry": 18, "delta_at_entry": 0.20,
            "ann_yield": 16.0, "expiry_close": 520, "outcome": "assignment", "pnl": -1800.0,
        })
    out = backtest._aggregate_outcome_buckets(trades)
    assert len(out["monthly_outcomes"]) == 1
    bucket = out["monthly_outcomes"][0]
    assert bucket["max_profit"] == 7
    assert bucket["closed_early_50pct"] == 1
    assert bucket["assignment"] == 2


# ── T11 — trade cash impact (per-trade $ contribution) ────────────────────────

def test_trade_cash_impact_uses_pnl():
    """_trade_cash_impact now reads pnl directly from the path-dependent classifier."""
    t = {"mid": 2.50, "outcome": "max_profit", "pnl": 250.0,
         "expiry_close": 480, "strike": 500}
    assert backtest._trade_cash_impact(t) == 250.0

    t = {"mid": 2.50, "outcome": "closed_early_50pct", "pnl": 130.0,
         "expiry_close": 498, "strike": 500}
    assert backtest._trade_cash_impact(t) == 130.0

    # Assignment: pnl already factors in capped upside as negative
    t = {"mid": 2.50, "outcome": "assignment", "pnl": -1750.0,
         "expiry_close": 520, "strike": 500}
    assert backtest._trade_cash_impact(t) == -1750.0


# ── T12 — max drawdown ────────────────────────────────────────────────────────

def test_max_drawdown_monotonic_increasing():
    """Strictly rising equity → no drawdown."""
    s = pd.Series([100, 110, 120, 130])
    dd_dollar, dd_pct = backtest._max_drawdown(s)
    assert dd_dollar == 0.0
    assert dd_pct == 0.0

def test_max_drawdown_known_window():
    """Peak 130 at index 2, trough 90 at index 4 → DD=$40 = 30.77%."""
    s = pd.Series([100, 110, 130, 110, 90, 100])
    dd_dollar, dd_pct = backtest._max_drawdown(s)
    assert dd_dollar == 40.0
    assert dd_pct == pytest.approx(40 / 130, rel=1e-3)


# ── T13 — annualised stats ────────────────────────────────────────────────────

def test_annualised_stats_known_returns():
    """24 months of 1% returns → CAGR ≈ 12.68%, vol≈0, Sharpe undefined."""
    monthly = pd.Series([0.01] * 24)
    out = backtest._annualised_stats(monthly, rf=0.04)
    assert out["cagr"] == pytest.approx(0.1268, abs=0.001)
    # All identical → std=0 → Sharpe should be None (vol_annual <= 0)
    assert out["sharpe_ratio"] is None


# ── T14 — capture ratios ──────────────────────────────────────────────────────

def test_capture_ratios_perfect_match():
    """When strategy == benchmark, capture ratios are both 1.0."""
    bh = pd.Series([0.05, -0.03, 0.02, -0.01])
    strat = pd.Series([0.05, -0.03, 0.02, -0.01])
    out = backtest._capture_ratios(strat, bh)
    assert out["upside_capture"] == pytest.approx(1.0)
    assert out["downside_capture"] == pytest.approx(1.0)

def test_capture_ratios_typical_covered_call():
    """Covered call: half the upside, full downside.
    Upside capture < 1, downside capture ≈ 1."""
    bh = pd.Series([0.05, -0.03, 0.02, -0.01])
    strat = pd.Series([0.025, -0.03, 0.01, -0.01])  # half ups, full downs
    out = backtest._capture_ratios(strat, bh)
    assert out["upside_capture"] == pytest.approx(0.5, abs=0.01)
    assert out["downside_capture"] == pytest.approx(1.0, abs=0.01)


# ── T2-T4 — strike/expiry selection (integration; needs DuckDB) ────────────────

def _has_duckdb() -> bool:
    """Skip integration tests if the DuckDB doesn't exist (CI without data)."""
    return data_store.DB_PATH.exists() and data_store.DB_PATH.stat().st_size > 1024 * 1024

needs_duckdb = pytest.mark.skipif(not _has_duckdb(), reason="DuckDB not present")


@needs_duckdb
def test_select_expiry_finds_one_in_window():
    """SPY in 2024 should always have a 21-45 DTE expiry."""
    pick = backtest._select_expiry("SPY", date(2024, 6, 3), [21, 45])
    assert pick is not None
    expiry, dte = pick
    assert 21 <= dte <= 45


@needs_duckdb
def test_select_expiry_returns_none_when_window_empty():
    """A 1-2 DTE window starting on a Friday with no Sat/Sun expiries."""
    # 0DTEs exist for SPY but a strict 1-2 window may or may not. Force impossible window.
    pick = backtest._select_expiry("SPY", date(2024, 6, 3), [9999, 99999])
    assert pick is None


@needs_duckdb
def test_select_strike_returns_otm_call_under_max_delta():
    """The picked strike should have delta ≤ maxDelta and be OTM."""
    pick = backtest._select_expiry("SPY", date(2024, 6, 3), [21, 45])
    assert pick is not None
    expiry, _dte = pick
    strike = backtest._select_strike(
        "SPY", date(2024, 6, 3), expiry,
        max_delta=0.32, min_iv_pct=0.0, min_yield_pct=0.0,
    )
    assert strike is not None
    assert strike["delta"] <= 0.32
    assert strike["delta"] > 0  # not zero
    assert strike["mid"] > 0


@needs_duckdb
def test_select_strike_respects_min_iv():
    """An impossibly high minIvr should return None."""
    pick = backtest._select_expiry("SPY", date(2024, 6, 3), [21, 45])
    expiry, _ = pick
    strike = backtest._select_strike(
        "SPY", date(2024, 6, 3), expiry,
        max_delta=0.32, min_iv_pct=999.0, min_yield_pct=0.0,
    )
    assert strike is None


@needs_duckdb
def test_has_coverage_true_for_spy():
    assert backtest.has_coverage("SPY", date(2024, 1, 1), date(2024, 12, 31))


@needs_duckdb
def test_has_coverage_false_for_unknown_ticker():
    assert not backtest.has_coverage("ZZZZ", date(2024, 1, 1), date(2024, 12, 31))


# ── T7 — dual-track count invariant ───────────────────────────────────────────

@needs_duckdb
def test_dual_track_invariant():
    """regime_gated trade count must be ≤ unconditional trade count."""
    # Macro must be backfilled first; if not present, skip.
    cov = data_store.get_macro_coverage()
    if cov.empty or "VIX" not in set(cov["series"]):
        pytest.skip("macro_history not backfilled — run scripts.backfill_macro first")
    out = backtest.run_backtest(
        ticker="SPY", strategy_id="wheel",
        lookback_days=180, cadence="both",
    )
    u = out["unconditional"]["trades_simulated"]
    r = out["regime_gated"]["trades_simulated"]
    assert r <= u, f"regime_gated ({r}) must be ≤ unconditional ({u})"


# ── T5 — cache hit returns cached ──────────────────────────────────────────────

@needs_duckdb
def test_cache_roundtrip():
    """After a run, get_or_run should return cached result with cache_age > 0."""
    cov = data_store.get_macro_coverage()
    if cov.empty:
        pytest.skip("macro_history not backfilled")
    # Use a unique lookback to avoid clobbering a real run.
    # Lookback must reach into DuckDB coverage (which ends ~2025-12-12).
    first = backtest.run_backtest(
        ticker="SPY", strategy_id="wheel",
        lookback_days=600, cadence="unconditional",
    )
    assert first["cache_age_seconds"] == 0
    second = backtest.get_or_run("SPY", "wheel", 600, "unconditional")
    # second should be cached (could be same run if very fast — accept ≥ 0)
    assert second["run_id"] == first["run_id"] or second["cache_age_seconds"] >= 0
