"""
Regression test for the OI chart's missing put-side speculative dollars.

Bug: get_options_chain() pulled only `openInterest` from yfinance's puts frame,
discarding bid/ask/lastPrice. So put_mid was always None and put time value
(speculative $) rendered as zero. yfinance DOES supply put quotes — the fetcher
just dropped them.

These tests mock the yfinance chain (no network) and assert that put_bid/put_ask/
put_last/put_oi are attached per strike, and that missing quotes degrade to None.

Run: cd backend && python -m pytest tests/test_oi_put_quotes.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_fetcher


def _fake_chain():
    calls = pd.DataFrame([
        {"strike": 700.0, "bid": 12.0, "ask": 12.4, "lastPrice": 12.2,
         "volume": 5, "openInterest": 100, "impliedVolatility": 0.2},
        {"strike": 710.0, "bid": 6.0, "ask": 6.4, "lastPrice": 6.1,
         "volume": 3, "openInterest": 200, "impliedVolatility": 0.2},
    ])
    puts = pd.DataFrame([
        # In-the-money-ish put with real bid/ask quotes.
        {"strike": 700.0, "bid": 4.0, "ask": 4.4, "lastPrice": 4.2, "openInterest": 250},
        # Put with no quotes at all (NaN) but with OI — must degrade to None mid.
        {"strike": 710.0, "bid": np.nan, "ask": np.nan, "lastPrice": np.nan, "openInterest": 50},
    ])
    return SimpleNamespace(calls=calls, puts=puts)


@pytest.fixture
def patched_fetcher(monkeypatch):
    """A DataFetcher whose chain + spot come from fakes, not the network."""
    monkeypatch.setattr(data_fetcher, "_ticker",
                        lambda symbol: SimpleNamespace(option_chain=lambda expiry: _fake_chain()))
    monkeypatch.setattr(data_fetcher._cache, "get", lambda key: None)
    monkeypatch.setattr(data_fetcher._cache, "set", lambda key, data: None)
    f = data_fetcher.DataFetcher()
    monkeypatch.setattr(f, "get_spy_price", lambda: {"price": 705.0})
    return f


def _by_strike(chain, strike):
    return next(r for r in chain if round(float(r["strike"]), 2) == strike)


def test_put_quotes_are_attached(patched_fetcher):
    """The fix: bid/ask/lastPrice flow from the puts frame onto each row."""
    chain = patched_fetcher.get_options_chain("2099-01-01")
    row = _by_strike(chain, 700.0)
    assert row["put_oi"] == 250
    assert row["put_bid"] == 4.0
    assert row["put_ask"] == 4.4
    assert row["put_last"] == 4.2


def test_missing_put_quotes_degrade_to_none(patched_fetcher):
    """A put with NaN quotes keeps its OI but exposes None for price fields."""
    chain = patched_fetcher.get_options_chain("2099-01-01")
    row = _by_strike(chain, 710.0)
    assert row["put_oi"] == 50
    assert row["put_bid"] is None
    assert row["put_ask"] is None
    assert row["put_last"] is None


def test_put_mid_is_real_when_quoted(patched_fetcher):
    """End-to-end: a quoted put yields a non-None put_mid in the stored snapshot."""
    import oi_tracker
    chain = patched_fetcher.get_options_chain("2099-01-01")
    snap = oi_tracker._snapshot_row(_by_strike(chain, 700.0))
    assert snap["put_mid"] == 4.2  # (4.0 + 4.4) / 2
    # The unquoted strike must still collapse to None (no fabricated value).
    snap_none = oi_tracker._snapshot_row(_by_strike(chain, 710.0))
    assert snap_none["put_mid"] is None


# ── Self-heal: a snapshot captured put-less (the regression) must backfill ────

_FRESH_ROWS = [{"strike": 700.0, "openInterest": 100, "bid": 12.0, "ask": 12.4,
                "lastPrice": 12.2, "put_oi": 250, "put_bid": 4.0, "put_ask": 4.4,
                "put_last": 4.2}]


def test_self_heal_backfills_putless_snapshot(monkeypatch):
    """Today's stored snapshot has put_mid=None everywhere; a fresh chain with
    put quotes must overwrite it even without force (first-write-wins is bypassed
    for the put-less case)."""
    import oi_tracker
    from datetime import date
    today = date.today().isoformat()
    exp = "2099-01-01"
    stale = {"700.0": {"call_oi": 100, "put_oi": 250, "call_mid": 12.2, "put_mid": None}}
    store = {exp: {today: stale}}
    saved = {}
    monkeypatch.setattr(oi_tracker, "_load_chain", lambda: store)
    monkeypatch.setattr(oi_tracker, "_save_chain", lambda data: saved.update(data))

    oi_tracker.record_chain_snapshot(exp, _FRESH_ROWS)  # no force

    assert saved, "expected a heal-write to occur"
    assert saved[exp][today]["700.0"]["put_mid"] == 4.2


def test_no_overwrite_when_put_mids_already_present(monkeypatch):
    """A snapshot that already has put mids must NOT be clobbered (heal is one-shot)."""
    import oi_tracker
    from datetime import date
    today = date.today().isoformat()
    exp = "2099-01-02"
    good = {"700.0": {"call_oi": 100, "put_oi": 250, "call_mid": 12.2, "put_mid": 4.2}}
    store = {exp: {today: good}}
    saved = {}
    monkeypatch.setattr(oi_tracker, "_load_chain", lambda: store)
    monkeypatch.setattr(oi_tracker, "_save_chain", lambda data: saved.update(data))

    oi_tracker.record_chain_snapshot(exp, _FRESH_ROWS)  # no force

    assert not saved, "must not overwrite a snapshot that already has put mids"
