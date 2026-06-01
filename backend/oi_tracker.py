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

# Sentinel written once per day after a successful capture. Both the cron and
# the in-app snapshot guard read/write this so they don't double-fetch.
SNAPSHOT_SENTINEL = _DATA_DIR / "oi_snapshot_sentinel.txt"
_SNAPSHOT_MAX_DTE = 60          # capture every expiry inside this DTE window
_snapshot_job_lock = threading.Lock()
_snapshot_in_progress = False


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


def _compute_mid(bid, ask, last=None):
    """Mid from bid/ask, falling back to last trade. None if nothing usable."""
    b = bid or 0
    a = ask or 0
    if b > 0 and a > 0:
        return round((b + a) / 2, 2)
    if b > 0 or a > 0:
        return round(b or a, 2)
    if last and last > 0:
        return round(float(last), 2)
    return None


def _snapshot_row(row: dict) -> dict:
    """One strike's stored fields: OI + mid price for calls and puts.

    yfinance supplies call quotes plus open interest for both sides, but no put
    quotes — so put_mid is None and put dollar-values can't be derived from this
    source. Stored anyway so the shape is forward-compatible if a richer feed
    starts providing put quotes.
    """
    return {
        "call_oi":  int(row["openInterest"]) if row.get("openInterest") is not None else None,
        "put_oi":   int(row["put_oi"]) if row.get("put_oi") is not None else None,
        "call_mid": _compute_mid(row.get("bid"), row.get("ask"), row.get("lastPrice")),
        "put_mid":  _compute_mid(row.get("put_bid"), row.get("put_ask"), row.get("put_last")),
    }


def _total_oi(strikes: dict) -> int:
    """Sum of call + put OI across a stored snapshot's strikes."""
    return sum((v.get("call_oi") or 0) + (v.get("put_oi") or 0) for v in strikes.values())


def record_chain_snapshot(expiry: str, chain_rows: list, force: bool = False):
    """Store a full call+put OI + mid snapshot for an expiry.

    First-write-wins per date so the cron's pre-market reading stays canonical —
    EXCEPT we overwrite when the stored snapshot has zero total OI but the fresh
    chain has real OI. yfinance reports openInterest as an end-of-day settlement
    figure, so an early fetch can land 0 across every strike; without this self-
    heal that empty reading would lock in for the whole day and the chart would
    render nothing. force=True always overwrites (the manual 'capture today'
    button)."""
    today_str = date.today().isoformat()
    cutoff = (date.today() - timedelta(days=_MAX_DAYS)).isoformat()
    with _lock:
        data = _load_chain()
        data.setdefault(expiry, {})
        new_rows = {
            str(round(float(row["strike"]), 2)): _snapshot_row(row)
            for row in chain_rows if row.get("strike") is not None
        }
        existing = data[expiry].get(today_str)
        should_write = (
            existing is None
            or force
            or (_total_oi(existing) == 0 and _total_oi(new_rows) > 0)
        )
        if should_write:
            data[expiry][today_str] = new_rows
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


def get_capture_dates(expiry: str) -> list:
    """All snapshot dates for an expiry, oldest → newest. Drives the date scrubber."""
    data = _load_chain()
    return sorted(data.get(expiry, {}).keys())


def get_chain_at(expiry: str, capture_date: str = None) -> dict:
    """Per-strike OI + mids for one capture date (default: latest), with the
    1-day OI change vs the prior captured date.

    Returns {capture_date, prior_date, strikes:[{strike, call_oi, put_oi,
    call_mid, put_mid, call_change_1d, put_change_1d}]}. Empty strikes if the
    expiry has no history yet.
    """
    data = _load_chain()
    expiry_data = data.get(expiry, {})
    dates = sorted(expiry_data.keys())
    if not dates:
        return {"capture_date": None, "prior_date": None, "strikes": []}

    # Resolve requested date; fall back to latest if missing/unspecified.
    if capture_date not in expiry_data:
        capture_date = dates[-1]
    idx = dates.index(capture_date)
    prior_date = dates[idx - 1] if idx > 0 else None

    current = expiry_data[capture_date]
    prior = expiry_data.get(prior_date, {}) if prior_date else {}

    strikes = []
    for strike_str, vals in current.items():
        call_oi = vals.get("call_oi")
        put_oi  = vals.get("put_oi")
        prev = prior.get(strike_str, {})
        prev_call = prev.get("call_oi")
        prev_put  = prev.get("put_oi")
        strikes.append({
            "strike":         float(strike_str),
            "call_oi":        call_oi,
            "put_oi":         put_oi,
            "call_mid":       vals.get("call_mid"),
            "put_mid":        vals.get("put_mid"),
            "call_change_1d": (call_oi - prev_call) if (call_oi is not None and prev_call is not None) else None,
            "put_change_1d":  (put_oi  - prev_put)  if (put_oi  is not None and prev_put  is not None) else None,
        })
    strikes.sort(key=lambda s: s["strike"])
    return {"capture_date": capture_date, "prior_date": prior_date, "strikes": strikes}


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


# ── Daily snapshot guard ──────────────────────────────────────────────────────

def _sentinel_is_today() -> bool:
    try:
        return SNAPSHOT_SENTINEL.read_text().strip() == date.today().isoformat()
    except OSError:
        return False


def maybe_run_daily_snapshot():
    """Self-healing capture. No-op once today's snapshot is recorded (sentinel).

    The first request of a new day spawns a background thread to capture the
    OI/mid snapshot in case the OS-level cron didn't fire. Cheap to call on every
    request: a same-day sentinel short-circuits before any work, and the in-
    progress guard prevents overlapping jobs. First-write-wins makes a redundant
    cron+guard run harmless.
    """
    global _snapshot_in_progress
    if _sentinel_is_today():
        return
    with _snapshot_job_lock:
        if _snapshot_in_progress:
            return
        _snapshot_in_progress = True
    threading.Thread(target=_run_snapshot_job, daemon=True).start()


def _run_snapshot_job():
    global _snapshot_in_progress
    try:
        # Lazy import: avoids an import cycle (data_fetcher ↔ oi_tracker) at load.
        from data_fetcher import DataFetcher
        fetcher = DataFetcher()
        expiries = fetcher.get_screener_expiries(max_dte=_SNAPSHOT_MAX_DTE) or []
        ok = 0
        for exp in expiries:
            try:
                chain = fetcher.get_options_chain(exp)
                if chain:
                    record_chain_snapshot(exp, chain)
                    ok += 1
            except Exception as exc:
                print(f"[snapshot-job] {exp} failed: {exc}")
        if ok > 0:
            try:
                SNAPSHOT_SENTINEL.write_text(date.today().isoformat())
            except OSError as exc:
                print(f"[snapshot-job] sentinel write failed: {exc}")
        print(f"[snapshot-job] {date.today().isoformat()} — captured {ok}/{len(expiries)} expiries")
    except Exception as exc:
        print(f"[snapshot-job] aborted: {exc}")
    finally:
        _snapshot_in_progress = False
