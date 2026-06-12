"""
Last-known option marks + greeks, persisted per (expiry|strike|type).

Why this exists: the live data provider (yfinance) returns bid=ask=0 and iv=0 for
SPY options before the market opens and during provider hiccups. The option mid
then computes to 0 and the Black-Scholes greeks come back None, so every position
metric on the Portfolios tab (P&L, theta, delta, time premium) blanks out in the
morning. The only existing price cache is in-memory TTL, lost on restart and happy
to cache the 0 — there was nothing to fall back to.

This module is that fallback: whenever a position is priced with GOOD live data we
record the mark here; when the live fetch comes back empty we serve the last good
mark instead, flagged stale + dated so the UI can say "as of <date>" rather than
showing a blank or a fabricated $0 (which read as "100% profit, take it").

Marks are market data, not user data, so the store is keyed globally by
expiry|strike|type and shared across users. JSON-backed, survives restarts.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import date, datetime, timezone
from pathlib import Path

_DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
MARKS_FILE = _DATA_DIR / "position_marks.json"
_lock = threading.Lock()


def _key(expiry: str, strike, option_type: str) -> str:
    return f"{expiry}|{float(strike)}|{option_type}"


def _load() -> dict:
    if MARKS_FILE.exists():
        try:
            with open(MARKS_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save(data: dict) -> None:
    with open(MARKS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def record(expiry: str, strike, option_type: str, price, delta, theta) -> None:
    """Persist a mark, but ONLY when the live data is actually usable: a positive
    price and both greeks present. A partial/empty pull must never overwrite a good
    stored mark — that's the whole point of the fallback."""
    if not (price and price > 0 and delta is not None and theta is not None):
        return
    rec = {
        "price": round(float(price), 2),
        "delta": round(float(delta), 4),
        "theta": round(float(theta), 4),
        "as_of": date.today().isoformat(),
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with _lock:
        data = _load()
        data[_key(expiry, strike, option_type)] = rec
        _save(data)


def get(expiry: str, strike, option_type: str) -> dict | None:
    """Last known good mark for this contract, or None if we've never stored one."""
    with _lock:
        return _load().get(_key(expiry, strike, option_type))


def merge(current, delta, theta, last_known):
    """Fill missing live values (price falsy / greeks None) from `last_known`.

    Pure + side-effect-free so the fallback contract is unit-testable. Returns
    (price, delta, theta, stale, as_of). `stale` is True if ANY field was filled
    from the store; `as_of` is the date of the mark we drew from.
    """
    stale = False
    as_of = None
    if last_known:
        if not current and last_known.get("price"):
            current = last_known["price"]
            stale = True
            as_of = last_known.get("as_of")
        if delta is None and last_known.get("delta") is not None:
            delta = last_known["delta"]
            stale = True
            as_of = last_known.get("as_of")
        if theta is None and last_known.get("theta") is not None:
            theta = last_known["theta"]
            stale = True
            as_of = last_known.get("as_of")
    return current, delta, theta, stale, as_of
