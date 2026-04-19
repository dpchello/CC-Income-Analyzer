"""
OI Tracker — persists daily open-interest snapshots per expiry/strike key.

yfinance openInterest is an end-of-day settlement figure updated once per
trading day. We record the first reading per calendar date (first-write-wins),
giving clean daily granularity. Intraday re-fetches don't clobber the record.

Signal thresholds (1-day change):
  MAJOR_UNWIND : ≤ -35%  — large position close-out; pin effect weakens
  UNWINDING    : ≤ -20%  — de-risking at strike; monitor
  BUILDING     : ≥ +25%  — new positions opening; improved liquidity / directional signal
  NEUTRAL      :  otherwise
"""

import json
import os
import threading
from datetime import date, timedelta
from pathlib import Path

_DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
OI_HISTORY_FILE = _DATA_DIR / "oi_history.json"
OI_CHAIN_FILE   = _DATA_DIR / "oi_chain_history.json"
_lock = threading.Lock()
_MAX_DAYS = 30  # rolling window kept per key


# ── Persistence ───────────────────────────────────────────────────────────────

def _load() -> dict:
    if OI_HISTORY_FILE.exists():
        try:
            with open(OI_HISTORY_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save(data: dict):
    with open(OI_HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Public API ────────────────────────────────────────────────────────────────

def record_batch(records: list):
    """
    Persist today's OI for a list of {expiry, strike, oi} dicts.
    First write per calendar day wins — safe to call on every chain fetch.
    """
    today_str = date.today().isoformat()
    with _lock:
        data = _load()
        changed = False
        for r in records:
            oi = r.get("oi", 0)
            if not oi or oi <= 0:
                continue
            key = f"{r['expiry']}|{r['strike']}"
            if key not in data:
                data[key] = {}
            if today_str not in data[key]:
                data[key][today_str] = int(oi)
                changed = True
                # Prune entries older than _MAX_DAYS
                all_dates = sorted(data[key].keys())
                if len(all_dates) > _MAX_DAYS:
                    for old in all_dates[:-_MAX_DAYS]:
                        del data[key][old]
        if changed:
            _save(data)


def _load_chain() -> dict:
    if OI_CHAIN_FILE.exists():
        try:
            with open(OI_CHAIN_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_chain(data: dict):
    with open(OI_CHAIN_FILE, "w") as f:
        json.dump(data, f, indent=2)


def record_chain_snapshot(expiry: str, chain_rows: list):
    """Store full call+put OI snapshot for an expiry. First-write-wins per date."""
    today_str = date.today().isoformat()
    cutoff = (date.today() - timedelta(days=_MAX_DAYS)).isoformat()
    with _lock:
        data = _load_chain()
        data.setdefault(expiry, {})
        if today_str not in data[expiry]:
            data[expiry][today_str] = {
                str(round(float(row["strike"]), 2)): {
                    "call_oi": int(row["openInterest"]) if row.get("openInterest") is not None else None,
                    "put_oi":  int(row["put_oi"]) if row.get("put_oi") is not None else None,
                }
                for row in chain_rows if row.get("strike") is not None
            }
            # Prune old dates
            for d in [k for k in data[expiry] if k < cutoff]:
                del data[expiry][d]
            _save_chain(data)


def get_chain_oi_change(expiry: str) -> list:
    """Return per-strike call and put OI with 1d change vs yesterday."""
    data = _load_chain()
    expiry_data = data.get(expiry, {})
    if not expiry_data:
        return []

    today = date.today()
    sorted_dates = sorted(expiry_data.keys(), reverse=True)
    if not sorted_dates:
        return []

    latest_date = sorted_dates[0]
    latest = expiry_data[latest_date]

    # Previous day: most recent entry at least 1 day before latest
    prev_date = None
    for d in sorted_dates[1:]:
        if (date.fromisoformat(latest_date) - date.fromisoformat(d)).days >= 1:
            prev_date = d
            break
    prev = expiry_data.get(prev_date, {}) if prev_date else {}

    result = []
    for strike_str, vals in latest.items():
        call_oi = vals.get("call_oi")
        put_oi  = vals.get("put_oi")
        prev_vals = prev.get(strike_str, {})
        prev_call = prev_vals.get("call_oi")
        prev_put  = prev_vals.get("put_oi")

        call_change_1d = (call_oi - prev_call) if (call_oi is not None and prev_call is not None) else None
        put_change_1d  = (put_oi  - prev_put)  if (put_oi  is not None and prev_put  is not None) else None

        result.append({
            "strike":        float(strike_str),
            "call_oi":       call_oi,
            "put_oi":        put_oi,
            "call_change_1d": call_change_1d,
            "put_change_1d":  put_change_1d,
        })

    result.sort(key=lambda r: r["strike"])
    return result


def get_changes_batch(keys: list) -> dict:
    """
    Return OI change data for a list of {expiry, strike} dicts.
    Result is keyed by "expiry|strike" strings.

    Each value:
    {
        current_oi, prev_oi_1d, change_1d, change_1d_pct,
        prev_oi_7d, change_7d, change_7d_pct,
        signal, signal_label
    }
    """
    data = _load()
    today = date.today()
    result = {}
    for item in keys:
        k = f"{item['expiry']}|{item['strike']}"
        result[k] = _compute_change(data.get(k, {}), today)
    return result


# ── Internal ──────────────────────────────────────────────────────────────────

def _compute_change(key_data: dict, today: date) -> dict:
    if not key_data:
        return {"current_oi": None, "signal": "NO_DATA", "signal_label": "No history yet"}

    sorted_dates = sorted(key_data.keys(), reverse=True)
    current_oi = key_data[sorted_dates[0]]

    # Most recent reading from ≥1 day ago
    prev_1d = None
    for d_str in sorted_dates[1:]:
        if (today - date.fromisoformat(d_str)).days >= 1:
            prev_1d = key_data[d_str]
            break

    # Most recent reading from ≥7 days ago
    prev_7d = None
    for d_str in sorted_dates:
        if (today - date.fromisoformat(d_str)).days >= 7:
            prev_7d = key_data[d_str]
            break

    change_1d     = (current_oi - prev_1d) if prev_1d is not None else None
    change_1d_pct = round(change_1d / prev_1d * 100, 1) if (prev_1d and prev_1d > 0) else None
    change_7d     = (current_oi - prev_7d) if prev_7d is not None else None
    change_7d_pct = round(change_7d / prev_7d * 100, 1) if (prev_7d and prev_7d > 0) else None

    # Use 1d pct as primary; fall back to 7d if no prior day exists
    pct = change_1d_pct if change_1d_pct is not None else change_7d_pct

    if pct is None:
        signal, label = "NEUTRAL", "Insufficient history"
    elif pct <= -35:
        signal, label = "MAJOR_UNWIND", f"OI down {abs(pct):.0f}% — major unwind at this strike"
    elif pct <= -20:
        signal, label = "UNWINDING", f"OI down {abs(pct):.0f}% — positions being closed"
    elif pct >= 25:
        signal, label = "BUILDING", f"OI up {pct:.0f}% — increased activity at this strike"
    else:
        signal, label = "NEUTRAL", "OI stable"

    return {
        "current_oi":    current_oi,
        "prev_oi_1d":    prev_1d,
        "change_1d":     change_1d,
        "change_1d_pct": change_1d_pct,
        "prev_oi_7d":    prev_7d,
        "change_7d":     change_7d,
        "change_7d_pct": change_7d_pct,
        "signal":        signal,
        "signal_label":  label,
    }
