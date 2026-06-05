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
import math
import os
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

_DATA_DIR = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
OI_HISTORY_FILE = _DATA_DIR / "oi_history.json"
OI_CHAIN_FILE   = _DATA_DIR / "oi_chain_history.json"
# Sidecar: per "expiry|date" capture metadata — {at: ISO timestamp, spot: price
# at capture}. Lets the chart show a real date+time AND freeze the underlying's
# price to the morning pull (so time-value/$ views don't drift intraday). Kept
# separate from OI_CHAIN_FILE so its shape (a flat dict of strikes per date)
# stays untouched for every existing reader.
OI_CAPTURE_META_FILE = _DATA_DIR / "oi_capture_meta.json"
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


def _load_capture_meta() -> dict:
    if OI_CAPTURE_META_FILE.exists():
        try:
            with open(OI_CAPTURE_META_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_capture_meta(data: dict):
    try:
        with open(OI_CAPTURE_META_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except OSError:
        pass  # best-effort — missing meta just falls back to date-only / live spot


def _finite(x, default=None):
    """Coerce x to a finite float, else `default`.

    Guards against NaN / Infinity — which json.dumps emits as bare NaN/Infinity
    tokens that the browser's JSON.parse rejects (a single one poisons the whole
    response) — and against the `NaN or 0 == NaN` trap (NaN is truthy in Python).
    yfinance can hand back a NaN price without raising, so spot must pass through
    here before it reaches a snapshot or the chart payload.
    """
    try:
        f = float(x)
    except (TypeError, ValueError):
        return default
    return f if math.isfinite(f) else default


def _capture_meta_for(meta: dict, expiry: str, capture_date: str) -> dict:
    """Normalize a meta entry to {at, spot}, tolerating the legacy plain-string
    (timestamp-only) format from before spot was stored."""
    raw = meta.get(f"{expiry}|{capture_date}")
    if isinstance(raw, dict):
        return {"at": raw.get("at"), "spot": _finite(raw.get("spot"))}
    if isinstance(raw, str):          # legacy: value was just the ISO timestamp
        return {"at": raw, "spot": None}
    return {"at": None, "spot": None}


def _record_capture_meta(expiry: str, capture_date: str, spot=None):
    """Record when this expiry/date snapshot was written (local time, ISO) and
    the underlying's spot at that moment. Call only while holding _lock (it does
    its own read-modify-write of the sidecar). Re-records on overwrite so the
    metadata tracks the data actually shown."""
    meta = _load_capture_meta()
    sp = _finite(spot)
    meta[f"{expiry}|{capture_date}"] = {
        "at":   datetime.now().astimezone().isoformat(timespec="seconds"),
        "spot": round(sp, 2) if sp else None,
    }
    _save_capture_meta(meta)


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
    """One strike's stored fields: OI + mid price for calls and puts, plus gamma.

    Both sides carry OI and a mid price. The chain fetcher pulls bid/ask/lastPrice
    from yfinance's puts frame (not just calls), so put_mid is real whenever the
    source quotes the put. put_mid stays None only when that strike's put has no
    usable quote, in which case put dollar-values fall back to 0.

    gamma is the Black-Scholes gamma the fetcher computes per strike — identical
    for the call and put at a given strike — so one value covers both sides. It
    feeds the gamma-pin analysis; None on legacy rows or when IV was unavailable.
    """
    gamma = _finite(row.get("gamma"))
    return {
        "call_oi":  int(row["openInterest"]) if row.get("openInterest") is not None else None,
        "put_oi":   int(row["put_oi"]) if row.get("put_oi") is not None else None,
        "call_mid": _compute_mid(row.get("bid"), row.get("ask"), row.get("lastPrice")),
        "put_mid":  _compute_mid(row.get("put_bid"), row.get("put_ask"), row.get("put_last")),
        "gamma":    round(gamma, 6) if gamma is not None else None,
    }


def _total_oi(strikes: dict) -> int:
    """Sum of call + put OI across a stored snapshot's strikes."""
    return sum((v.get("call_oi") or 0) + (v.get("put_oi") or 0) for v in strikes.values())


def _has_put_mids(strikes: dict) -> bool:
    """True if any strike carries a usable put mid (so put dollar-values exist)."""
    return any(v.get("put_mid") is not None for v in strikes.values() if isinstance(v, dict))


def record_chain_snapshot(expiry: str, chain_rows: list, force: bool = False, spot=None):
    """Store a full call+put OI + mid snapshot for an expiry.

    First-write-wins per date so the cron's pre-market reading stays canonical —
    EXCEPT we overwrite in two self-heal cases:
      1. Stored snapshot has zero total OI but the fresh chain has real OI.
         yfinance reports openInterest as an end-of-day settlement figure, so an
         early fetch can land 0 across every strike; without this the empty
         reading would lock in for the whole day and the chart would render
         nothing.
      2. Stored snapshot has no put mids but the fresh chain does. Snapshots
         captured while the fetcher dropped put bid/ask (see data_fetcher) have
         put_mid=None for every strike, so the put side renders no speculative
         dollars; healing backfills them on the next load.
    force=True always overwrites (the manual 'capture today' button)."""
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
            or (not _has_put_mids(existing) and _has_put_mids(new_rows))
        )
        if should_write:
            data[expiry][today_str] = new_rows
            # Prune old dates
            for d in [k for k in data[expiry] if k < cutoff]:
                del data[expiry][d]
            _save_chain(data)
            _record_capture_meta(expiry, today_str, spot)


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


def get_chain_history(expiry: str) -> list:
    """Every non-empty snapshot for an expiry, oldest → newest, in one payload so
    the chart can scrub/play client-side with no per-frame network round-trip.
    Each frame carries its capture time and the spot at capture, so the chart can
    render a frozen morning snapshot (OI, mids, and spot all as-of the pull).

    Snapshots whose total OI is zero are skipped. Open interest is a once-daily
    figure (OCC settles a session's trades overnight and publishes it the next
    morning), so an early or failed capture can land 0 across every strike before
    the feed refreshes; first-write-wins then freezes that empty reading for the
    day (it can't self-heal once the date is in the past). Those frozen-empty
    dates carry no information and would render a blank chart, so we drop them
    from the scrubber entirely. The 1-day OI change is chained against the prior
    *non-empty* snapshot so it stays meaningful across any gaps.
    """
    data = _load_chain()
    expiry_data = data.get(expiry, {})
    meta = _load_capture_meta()
    snapshots = []
    prev_strikes = {}
    for d in sorted(expiry_data.keys()):
        strikes_map = expiry_data[d]
        if _total_oi(strikes_map) <= 0:
            continue
        rows = []
        for strike_str, vals in strikes_map.items():
            call_oi = vals.get("call_oi")
            put_oi  = vals.get("put_oi")
            prev = prev_strikes.get(strike_str, {})
            prev_call = prev.get("call_oi")
            prev_put  = prev.get("put_oi")
            rows.append({
                "strike":         float(strike_str),
                "call_oi":        call_oi,
                "put_oi":         put_oi,
                "call_mid":       vals.get("call_mid"),
                "put_mid":        vals.get("put_mid"),
                "gamma":          vals.get("gamma"),
                "call_change_1d": (call_oi - prev_call) if (call_oi is not None and prev_call is not None) else None,
                "put_change_1d":  (put_oi  - prev_put)  if (put_oi  is not None and prev_put  is not None) else None,
            })
        rows.sort(key=lambda r: r["strike"])
        m = _capture_meta_for(meta, expiry, d)
        snapshots.append({
            "capture_date": d,
            "captured_at":  m["at"],
            "spot":         m["spot"],
            "strikes":      rows,
        })
        prev_strikes = strikes_map
    return snapshots


def compute_pin_analysis(strikes: list, spot) -> dict:
    """Locate price 'pins' (magnet strikes) and score their strength from one
    frame's per-strike open interest (and gamma, when stored).

    Returns None if there's no usable OI. Otherwise:
      max_pain      — the listed strike that minimizes total option-writer payout
                      if the underlying settled there (pure OI; the classic pin).
      pin_strike    — the strongest gamma wall: the strike with the most dealer
                      gamma to hedge, weight = gamma x (call_oi + put_oi). When no
                      gamma is stored (older snapshots) it falls back to OI weighted
                      toward spot — gamma is an at-the-money-peaked bell — and sets
                      method='oi' so the UI can label it an estimate.
      pin_strength  — the pin's share of total weight across the near-spot window
                      (0-1), bucketed weak / moderate / strong / dominant.
      pin_gex       — dealer gamma notional at the pin per 1% move ($), gamma only.
      call_wall /   — largest call / put OI strike near spot (overhead resistance /
      put_wall        downside support).
      pins          — top 3 magnets [{strike, total_oi, strength}] for chart markers.
    """
    rows = []
    for r in strikes or []:
        if r.get("strike") is None:
            continue
        coi = r.get("call_oi") or 0
        poi = r.get("put_oi") or 0
        rows.append({
            "strike":   float(r["strike"]),
            "call_oi":  coi,
            "put_oi":   poi,
            "total_oi": coi + poi,
            "gamma":    r.get("gamma"),
        })
    if not rows:
        return None
    rows.sort(key=lambda r: r["strike"])
    if sum(r["total_oi"] for r in rows) <= 0:
        return None

    spot = _finite(spot) or 0.0

    # Max pain — settlement strike minimizing total writer payout (over all strikes).
    def _payout(settle):
        total = 0.0
        for r in rows:
            total += r["call_oi"] * max(0.0, settle - r["strike"])
            total += r["put_oi"]  * max(0.0, r["strike"] - settle)
        return total
    max_pain = min((r["strike"] for r in rows), key=_payout)

    # Keep walls + the pin search near spot so the magnets stay actionable.
    if spot > 0:
        lo, hi = spot * 0.90, spot * 1.10
        window = [r for r in rows if lo <= r["strike"] <= hi] or rows
    else:
        window = rows

    call_wall = max(window, key=lambda r: r["call_oi"])["strike"] if any(r["call_oi"] > 0 for r in window) else None
    put_wall  = max(window, key=lambda r: r["put_oi"])["strike"]  if any(r["put_oi"]  > 0 for r in window) else None

    # Pin = strongest gamma concentration. True gamma when stored; otherwise OI
    # shaped by an at-the-money gamma bell (so far-OTM size doesn't masquerade as a pin).
    has_gamma = any(r["gamma"] for r in window)
    if has_gamma:
        for r in window:
            r["weight"] = (r["gamma"] or 0.0) * r["total_oi"]
        method = "gamma"
    else:
        band = spot * 0.04 if spot > 0 else 0.0
        for r in window:
            if band > 0:
                z = (r["strike"] - spot) / band
                r["weight"] = r["total_oi"] * math.exp(-0.5 * z * z)
            else:
                r["weight"] = float(r["total_oi"])
        method = "oi"

    total_weight = sum(r["weight"] for r in window) or 1.0
    ranked = sorted(window, key=lambda r: r["weight"], reverse=True)
    pin = ranked[0]
    strength = pin["weight"] / total_weight
    label = ("dominant" if strength >= 0.35 else
             "strong"   if strength >= 0.20 else
             "moderate" if strength >= 0.10 else "weak")

    pin_gex = None
    if method == "gamma" and spot > 0:
        # gamma x OI x 100 (multiplier) x spot^2 x 0.01  → $ dealer gamma per 1% move
        pin_gex = round((pin["gamma"] or 0.0) * pin["total_oi"] * 100 * spot * spot * 0.01, 0)

    return {
        "max_pain":         round(max_pain, 2),
        "call_wall":        round(call_wall, 2) if call_wall is not None else None,
        "put_wall":         round(put_wall, 2)  if put_wall  is not None else None,
        "pin_strike":       round(pin["strike"], 2),
        "pin_total_oi":     pin["total_oi"],
        "pin_strength":     round(strength, 4),
        "pin_label":        label,
        "pin_gex":          pin_gex,
        "method":           method,
        "spot_vs_pain_pct": round((spot - max_pain) / max_pain * 100, 2) if (spot > 0 and max_pain) else None,
        "pins": [
            {"strike": round(r["strike"], 2), "total_oi": r["total_oi"], "strength": round(r["weight"] / total_weight, 4)}
            for r in ranked[:3]
        ],
    }


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
        # Spot at capture time — stored per snapshot so the chart can freeze the
        # underlying's price to this morning pull instead of drifting intraday.
        try:
            spot = fetcher.get_spy_price().get("price", 0) or 0
        except Exception:
            spot = 0
        # Union of the screener window and the OI-chart expiries so the chart
        # always has a fresh morning frame (chart expiries are normally a subset,
        # but a far-dated chart weekly could fall outside the screener window).
        screener = fetcher.get_screener_expiries(max_dte=_SNAPSHOT_MAX_DTE) or []
        chart    = fetcher.get_oi_chart_expiries() or []
        expiries = list(dict.fromkeys(list(screener) + list(chart)))
        ok = 0
        for exp in expiries:
            try:
                chain = fetcher.get_options_chain(exp)
                if chain:
                    record_chain_snapshot(exp, chain, spot=spot)
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
