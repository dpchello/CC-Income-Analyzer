"""
Regression test for the OI chart's missing left side (strikes below spot).

Bug (reported 2026-06-11): on a big gap-down day the "Open Interest by Strike"
chart showed only strikes >= the live spot. SPY was at 725.43, down 11.62 on the
day, so the prior close was 737.05. The x-axis band was computed ±Nσ around the
PRIOR CLOSE (737.05) -> band = [725.99, 748.11], while the dashed spot line was
drawn at the LIVE spot (725.43). The whole band sat above the live spot, so every
strike below it was filtered out and the trader saw a one-sided chart.

Fix: center the band on the live underlying (the same price the spot line marks),
so the window is symmetric around where SPY is now. `_strike_band` is the extracted
pure helper that owns the centring contract.

Run: cd backend && python -m pytest tests/test_oi_strike_band.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import _strike_band


# The exact numbers from the 2026-06-11 report.
LIVE_SPOT = 725.43
PREV_CLOSE = 737.05
IV = 0.0625
DTE = 0  # 0DTE tab


def test_band_is_symmetric_around_center():
    low, high = _strike_band(LIVE_SPOT, IV, DTE)
    assert low is not None and high is not None
    midpoint = (low + high) / 2
    assert abs(midpoint - LIVE_SPOT) < 0.01, f"band not centered on spot: {low}..{high}"


def test_band_centered_on_live_spot_includes_strikes_below_spot():
    """The fix: centering on the live spot must leave room below it."""
    low, high = _strike_band(LIVE_SPOT, IV, DTE)
    assert low < LIVE_SPOT < high, f"live spot {LIVE_SPOT} not inside band {low}..{high}"
    # There must be real room below spot (the part that was missing in the bug).
    assert LIVE_SPOT - low > 5, "no meaningful strike range below spot"


def test_centering_on_prev_close_reproduces_the_bug():
    """Guard: centering on the prior close on a gap day pushes the live spot to
    the edge / outside the band — exactly the one-sided chart that was reported.
    This documents WHY we must center on the live spot, not the prior close.

    Pinned to sigmas=4.0 — the window width in effect when the bug was reported.
    (A wider window can mask the centring bug by happening to reach back over the
    live spot; the defect is the centring, which this asserts independent of width.)"""
    low, high = _strike_band(PREV_CLOSE, IV, DTE, sigmas=4.0)
    # On this -11.62pt day the live spot falls at or below the band floor: the
    # chart would have nothing to draw to the left of it.
    assert LIVE_SPOT <= low, (
        f"expected live spot {LIVE_SPOT} at/below prev-close band floor {low} "
        "(the bug); if this fails the scenario no longer reproduces"
    )


def test_half_width_floored_for_0dte():
    """A 0DTE tab with tiny σ must not collapse to a razor-thin band: the
    half-width is floored at 1.5% of center."""
    low, high = _strike_band(LIVE_SPOT, IV, DTE)
    half = (high - low) / 2
    assert half >= LIVE_SPOT * 0.015 - 0.01


def test_sigma_widens_the_band_for_far_dated():
    near_low, near_high = _strike_band(LIVE_SPOT, IV, 0)
    far_low, far_high = _strike_band(LIVE_SPOT, IV, 30)
    assert (far_high - far_low) > (near_high - near_low)


def test_bad_inputs_return_none():
    assert _strike_band(0, IV, DTE) == (None, None)
    assert _strike_band(LIVE_SPOT, 0, DTE) == (None, None)
    assert _strike_band(-1, IV, DTE) == (None, None)
    assert _strike_band(LIVE_SPOT, None, DTE) == (None, None)
