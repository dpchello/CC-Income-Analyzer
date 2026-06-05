"""
Unit tests for oi_tracker.compute_pin_analysis — the gamma-pin / max-pain locator.

No network: feeds hand-built strike rows and asserts the magnets + strength.

Run: cd backend && python -m pytest tests/test_pin_analysis.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import oi_tracker


def test_empty_or_no_oi_returns_none():
    assert oi_tracker.compute_pin_analysis([], 100) is None
    assert oi_tracker.compute_pin_analysis(
        [{"strike": 100, "call_oi": 0, "put_oi": 0}], 100
    ) is None


def test_max_pain_minimizes_writer_payout():
    # Calls stacked at 100, puts stacked at 110. Settlement that pays writers the
    # least sits between them; with these weights the min lands at a listed strike.
    strikes = [
        {"strike": 100, "call_oi": 5000, "put_oi": 0},
        {"strike": 105, "call_oi": 100,  "put_oi": 100},
        {"strike": 110, "call_oi": 0,    "put_oi": 5000},
    ]
    out = oi_tracker.compute_pin_analysis(strikes, 105)
    assert out["max_pain"] == 105.0          # between the call and put stacks
    assert out["call_wall"] == 100.0
    assert out["put_wall"] == 110.0


def test_gamma_method_picks_highest_gamma_oi_not_biggest_oi():
    # Far-OTM strike has monster OI but ~zero gamma → must NOT be the pin.
    strikes = [
        {"strike": 750, "call_oi": 1000,  "put_oi": 3000, "gamma": 0.02},
        {"strike": 755, "call_oi": 2000,  "put_oi": 2000, "gamma": 0.05},   # ATM, top gamma×OI
        {"strike": 760, "call_oi": 8000,  "put_oi": 500,  "gamma": 0.01},
        {"strike": 900, "call_oi": 50000, "put_oi": 0,    "gamma": 0.0001},  # huge OI, ~0 gamma
    ]
    out = oi_tracker.compute_pin_analysis(strikes, 755)
    assert out["method"] == "gamma"
    assert out["pin_strike"] == 755.0
    assert out["pin_label"] in {"strong", "dominant"}
    assert out["pin_gex"] is not None and out["pin_gex"] > 0


def test_oi_fallback_weights_toward_spot():
    # No gamma stored → OI method. A far strike with the most OI should lose to a
    # near-spot strike once the at-the-money gamma bell is applied.
    strikes = [
        {"strike": 755, "call_oi": 4000, "put_oi": 4000},   # ATM, 8000 OI
        {"strike": 820, "call_oi": 9000, "put_oi": 1000},   # far OTM, 10000 OI
    ]
    out = oi_tracker.compute_pin_analysis(strikes, 755)
    assert out["method"] == "oi"
    assert out["pin_strike"] == 755.0          # near-spot wins despite less raw OI
    assert out["pin_gex"] is None              # no gamma → no GEX dollars


def test_strength_buckets_and_spot_vs_pain():
    # One strike holds ~all the near-spot OI → dominant.
    strikes = [
        {"strike": 500, "call_oi": 20000, "put_oi": 20000, "gamma": 0.05},
        {"strike": 505, "call_oi": 100,   "put_oi": 100,   "gamma": 0.05},
    ]
    out = oi_tracker.compute_pin_analysis(strikes, 500)
    assert out["pin_strike"] == 500.0
    assert out["pin_strength"] > 0.35 and out["pin_label"] == "dominant"
    # spot == max_pain here → ~0% offset
    assert out["spot_vs_pain_pct"] == 0.0
    # top pins list is ranked and capped at 3
    assert out["pins"][0]["strike"] == 500.0
    assert len(out["pins"]) <= 3


def test_nan_spot_produces_json_safe_output():
    """yfinance can hand back a NaN spot without raising. The analysis must never
    emit NaN/Infinity — those serialize as bare tokens the browser's JSON.parse
    rejects, which is what blanked the chart ("Could not load OI data")."""
    strikes = [
        {"strike": 750, "call_oi": 1000, "put_oi": 3000, "gamma": 0.02},
        {"strike": 755, "call_oi": 2000, "put_oi": 2000, "gamma": 0.05},
    ]
    out = oi_tracker.compute_pin_analysis(strikes, float("nan"))
    assert out is not None
    json.dumps(out, allow_nan=False)          # raises if any NaN/Inf slipped through
    # No-gamma + NaN spot exercises the OI fallback with a zeroed band.
    out2 = oi_tracker.compute_pin_analysis(
        [{"strike": 755, "call_oi": 8000, "put_oi": 8000}], float("nan"))
    json.dumps(out2, allow_nan=False)


def test_finite_helper():
    assert oi_tracker._finite(757.09) == 757.09
    assert oi_tracker._finite(float("nan")) is None
    assert oi_tracker._finite(float("inf")) is None
    assert oi_tracker._finite(None) is None
    assert oi_tracker._finite("oops") is None
    assert oi_tracker._finite(float("nan"), 0) == 0      # the `NaN or 0` trap, fixed
