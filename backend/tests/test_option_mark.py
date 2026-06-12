"""Regression: option mark must fall back to lastPrice when bid/ask are 0.

yfinance routinely returns bid=ask=0 for SPY option strikes (pre/post-market and
intraday). Before the fix, get_option_price used the bid/ask midpoint only, so the
mark collapsed to 0 — every open position in the Positions tab read as
"current_price=0 → 100% profit" and the live price never updated.
"""
import math
import numpy as np

from data_fetcher import _mark_from_quote


def test_falls_back_to_last_when_bid_ask_zero():
    # The exact shape yfinance returned for SPY 695C/700C pre-open.
    assert _mark_from_quote(0.0, 0.0, 48.62) == 48.62
    assert _mark_from_quote(0.0, 0.0, 43.99) == 43.99


def test_prefers_bid_ask_midpoint_when_quotes_live():
    # During RTH both quotes are populated — mid wins over last.
    assert _mark_from_quote(43.0, 45.0, 48.0) == 44.0


def test_handles_nan_and_none():
    nan = float("nan")
    assert _mark_from_quote(nan, nan, 12.5) == 12.5      # NaN bid/ask → last
    assert _mark_from_quote(None, None, 12.5) == 12.5    # missing → last
    assert _mark_from_quote(np.nan, np.nan, np.nan) == 0.0  # nothing usable → 0


def test_zero_when_no_quote_at_all():
    assert _mark_from_quote(0.0, 0.0, 0.0) == 0.0


def test_one_sided_quote_falls_back_to_last():
    # Only a bid (ask=0) is not a usable midpoint → use last.
    assert _mark_from_quote(5.0, 0.0, 6.25) == 6.25
