"""
Regression test for blank Portfolios-tab metrics in the morning.

Bug (reported 2026-06-12): before the market opens, the live options provider
returns bid=ask=0 and iv=0, so the option mid is 0 and the Black-Scholes greeks
come back None. Every position metric (P&L, theta, delta, time premium) blanked
out, and the 0 mark could even read as "100% profit, take it." There was no
persisted last-known price to fall back on (the only cache was in-memory TTL).

Fix: position_marks records the last GOOD mark per contract and serves it (flagged
stale + dated) when the live pull is empty.

Run: cd backend && python -m pytest tests/test_position_marks.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import position_marks


@pytest.fixture(autouse=True)
def _isolate_store(tmp_path, monkeypatch):
    """Point the store at a temp file so tests never touch the real marks."""
    monkeypatch.setattr(position_marks, "MARKS_FILE", tmp_path / "marks.json")


def test_record_and_get_roundtrip():
    position_marks.record("2026-06-19", 740.0, "call", 1.50, 0.55, -0.70)
    got = position_marks.get("2026-06-19", 740.0, "call")
    assert got is not None
    assert got["price"] == 1.50 and got["delta"] == 0.55 and got["theta"] == -0.70
    assert got["as_of"]  # dated


def test_record_skips_empty_pull_so_it_never_clobbers_a_good_mark():
    position_marks.record("2026-06-19", 740.0, "call", 1.50, 0.55, -0.70)  # good
    position_marks.record("2026-06-19", 740.0, "call", 0.0, None, None)    # empty morning pull
    got = position_marks.get("2026-06-19", 740.0, "call")
    assert got["price"] == 1.50, "empty pull must not overwrite the last good mark"


def test_merge_fills_blank_morning_pull_from_last_known():
    last = {"price": 1.50, "delta": 0.55, "theta": -0.70, "as_of": "2026-06-11"}
    # Morning: live pull is empty (0 price, no greeks).
    price, delta, theta, stale, as_of = position_marks.merge(0.0, None, None, last)
    assert price == 1.50 and delta == 0.55 and theta == -0.70
    assert stale is True and as_of == "2026-06-11"


def test_merge_prefers_live_when_present():
    last = {"price": 1.50, "delta": 0.55, "theta": -0.70, "as_of": "2026-06-11"}
    price, delta, theta, stale, as_of = position_marks.merge(2.10, 0.61, -0.80, last)
    assert price == 2.10 and delta == 0.61 and theta == -0.80
    assert stale is False and as_of is None


def test_merge_no_history_leaves_blanks():
    price, delta, theta, stale, as_of = position_marks.merge(0.0, None, None, None)
    assert price == 0.0 and delta is None and theta is None
    assert stale is False


def test_merge_partial_live_fills_only_missing():
    last = {"price": 1.50, "delta": 0.55, "theta": -0.70, "as_of": "2026-06-11"}
    # Live mark present but greeks missing (iv was 0 this pull).
    price, delta, theta, stale, as_of = position_marks.merge(2.10, None, None, last)
    assert price == 2.10, "keep the live mark"
    assert delta == 0.55 and theta == -0.70, "fill only the missing greeks"
    assert stale is True
