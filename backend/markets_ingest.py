"""
Markets ingestion (PIPE-MARKETS-01).

Three responsibilities, each idempotent:
  1. sync_membership()  — pull S&P 500 historical constituents from fja05680/sp500
                          and upsert into sp500_membership.
  2. sync_daily(...)    — pull EOD price + volume for current S&P 500 members
                          plus SPY/QQQ via yfinance batch, step-fill shares
                          outstanding from quarterly filings, compute market
                          cap, and upsert into sp500_daily / etf_daily.
  3. compute_composite(date)
                        — for a given trading day, sort in-index members by
                          market cap descending, take the smallest set that
                          accounts for ≥ 80% of total cap, and write the
                          weighted-volume composite to sp500_composite_daily.

Design notes
------------
* yfinance batch (`yf.download(tickers, ...)`) is the workhorse. We chunk
  tickers to ~50 per call to stay under Yahoo's URL length and rate limits.
* `auto_adjust=True` returns split-adjusted close + volume — what we want for
  a stable historical comparison.
* Shares outstanding history is the trickiest piece. yfinance
  `Ticker.get_shares_full(start, end)` returns a per-day-ish series sourced
  from quarterly 10-Q/10-K filings. We forward-fill across daily dates.
  Tickers with no shares data get market_cap=NULL and are excluded from the
  composite (logged as a warning).
* All DB writes use upsert on the primary key — safe to re-run.
"""

from __future__ import annotations

import csv
import io
import time
from datetime import date, datetime, timedelta
from typing import Iterable, List, Optional, Tuple

import requests
import yfinance as yf
import pandas as pd

import db


# ── Constants ────────────────────────────────────────────────────────────────

FJA05680_URL = (
    "https://raw.githubusercontent.com/fja05680/sp500/master/"
    "sp500_ticker_start_end.csv"
)
FJA05680_NAMES_URL = (
    "https://raw.githubusercontent.com/fja05680/sp500/master/sp500.csv"
)

ETF_TICKERS = ["SPY", "QQQ"]

# yfinance batch chunk size — too large and the request URL bloats
BATCH_SIZE = 50

# Throttle between batch calls (seconds). Yahoo rate-limits aggressively.
BATCH_THROTTLE = 0.5


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize_ticker_for_yf(ticker: str) -> str:
    """yfinance uses '-' instead of '.' for class shares (e.g. BRK.B → BRK-B)."""
    return ticker.replace(".", "-")


def _denormalize_ticker(yf_ticker: str) -> str:
    """Reverse — convert yfinance-style back to canonical."""
    # We keep the canonical form (with '.') in our DB to match fja05680.
    # yfinance accepts both BRK-B and BRK.B in some contexts, but the dataframe
    # comes back with whatever we asked for. Asymmetric mapping kept simple.
    return yf_ticker.replace("-", ".") if "-" in yf_ticker else yf_ticker


def _chunked(items: List[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


# ── 1. Membership sync ───────────────────────────────────────────────────────

def sync_membership() -> dict:
    """Fetch the fja05680 ticker_start_end CSV and upsert into sp500_membership.

    The CSV has columns: ticker, start_date, end_date. Empty end_date means the
    ticker is currently in the index. A ticker can appear multiple times if it
    has been added/removed multiple times.
    """
    print(f"[membership] fetching {FJA05680_URL}")
    r = requests.get(FJA05680_URL, timeout=30)
    r.raise_for_status()

    rows = list(csv.DictReader(io.StringIO(r.text)))
    print(f"[membership] {len(rows)} rows in source CSV")

    # Optional: pull current names from sp500.csv for the current cohort
    names_by_ticker: dict = {}
    try:
        nr = requests.get(FJA05680_NAMES_URL, timeout=30)
        nr.raise_for_status()
        for row in csv.DictReader(io.StringIO(nr.text)):
            names_by_ticker[row["Symbol"].strip()] = row.get("Security", "").strip()
    except Exception as e:
        print(f"[membership] could not fetch names CSV: {e}")

    inserted = updated = skipped = 0
    for row in rows:
        ticker = (row.get("ticker") or "").strip().upper()
        start = (row.get("start_date") or "").strip()
        end = (row.get("end_date") or "").strip() or None
        if not ticker or not start:
            skipped += 1
            continue
        record = {
            "ticker": ticker,
            "added_at": start,
            "removed_at": end,
            "name": names_by_ticker.get(ticker),
        }
        try:
            db.upsert_sp500_membership(record)
            inserted += 1
        except Exception as e:
            print(f"[membership] {ticker} {start} → FAILED: {e}")
            skipped += 1

    print(f"[membership] done — upserted={inserted} skipped={skipped}")
    return {"upserted": inserted, "skipped": skipped, "total": len(rows)}


# ── 2. Daily price/volume sync ───────────────────────────────────────────────

def _yf_batch_history(
    tickers: List[str],
    start: date,
    end: date,
) -> pd.DataFrame:
    """Batch-download daily OHLCV for `tickers` between [start, end].

    Returns a long-format DataFrame: columns = [ticker, date, close, volume].
    Empty if Yahoo returns nothing.
    """
    yf_syms = [_normalize_ticker_for_yf(t) for t in tickers]
    df = yf.download(
        tickers=yf_syms,
        start=start.isoformat(),
        end=(end + timedelta(days=1)).isoformat(),  # yfinance end is exclusive
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="ticker",
        threads=True,
    )
    if df is None or df.empty:
        return pd.DataFrame(columns=["ticker", "date", "close", "volume"])

    out_rows: list = []
    if len(yf_syms) == 1:
        # Single ticker → flat columns, no MultiIndex
        for idx, row in df.iterrows():
            out_rows.append({
                "ticker": _denormalize_ticker(yf_syms[0]),
                "date": idx.date(),
                "close": float(row["Close"]) if pd.notna(row.get("Close")) else None,
                "volume": int(row["Volume"]) if pd.notna(row.get("Volume")) else None,
            })
    else:
        for sym in yf_syms:
            if sym not in df.columns.get_level_values(0):
                continue
            sub = df[sym]
            for idx, row in sub.iterrows():
                if pd.isna(row.get("Close")) and pd.isna(row.get("Volume")):
                    continue
                out_rows.append({
                    "ticker": _denormalize_ticker(sym),
                    "date": idx.date(),
                    "close": float(row["Close"]) if pd.notna(row.get("Close")) else None,
                    "volume": int(row["Volume"]) if pd.notna(row.get("Volume")) else None,
                })
    return pd.DataFrame(out_rows)


def sync_daily(
    start: date,
    end: date,
    tickers: Optional[List[str]] = None,
    include_etfs: bool = True,
) -> dict:
    """Pull EOD price + volume for `tickers` (or all current S&P members) over
    [start, end] and upsert into sp500_daily. ETFs go to etf_daily.

    `in_index` is set per (ticker, date) based on sp500_membership.
    """
    if tickers is None:
        tickers = db.get_current_sp500_tickers()
    print(f"[daily] {len(tickers)} S&P tickers + {len(ETF_TICKERS) if include_etfs else 0} ETFs, "
          f"{start} → {end}")

    # ── S&P members
    membership_intervals = db.get_membership_intervals()  # ticker → [(start, end), ...]

    sp_rows = 0
    for batch_idx, batch in enumerate(_chunked(tickers, BATCH_SIZE), 1):
        print(f"  [daily] batch {batch_idx} / "
              f"{(len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE} ({len(batch)} tickers)")
        try:
            df = _yf_batch_history(batch, start, end)
        except Exception as e:
            print(f"    batch failed: {e}")
            time.sleep(BATCH_THROTTLE * 2)
            continue
        if df.empty:
            time.sleep(BATCH_THROTTLE)
            continue
        records = []
        for r in df.to_dict("records"):
            ticker = r["ticker"]
            d = r["date"]
            in_idx = _is_in_index(ticker, d, membership_intervals)
            records.append({
                "ticker":     ticker,
                "date":       d.isoformat(),
                "close":      r["close"],
                "volume":     r["volume"],
                "shares_out": None,        # filled by sync_shares_outstanding
                "market_cap": None,        # ditto
                "in_index":   in_idx,
            })
        if records:
            db.bulk_upsert_sp500_daily(records)
            sp_rows += len(records)
        time.sleep(BATCH_THROTTLE)

    # ── ETFs
    etf_rows = 0
    if include_etfs:
        try:
            df = _yf_batch_history(ETF_TICKERS, start, end)
            records = [{
                "ticker": r["ticker"],
                "date":   r["date"].isoformat(),
                "close":  r["close"],
                "volume": r["volume"],
            } for r in df.to_dict("records")]
            if records:
                db.bulk_upsert_etf_daily(records)
                etf_rows = len(records)
        except Exception as e:
            print(f"[daily] ETF batch failed: {e}")

    print(f"[daily] done — sp500_daily rows={sp_rows} etf_daily rows={etf_rows}")
    return {"sp500_rows": sp_rows, "etf_rows": etf_rows}


def _is_in_index(
    ticker: str,
    d: date,
    intervals: dict,
) -> bool:
    """Was `ticker` an S&P 500 member on `d`?"""
    for (start, end) in intervals.get(ticker, []):
        if d >= start and (end is None or d <= end):
            return True
    return False


# ── 3. Shares outstanding step-fill ──────────────────────────────────────────

def sync_shares_outstanding(
    tickers: List[str],
    start: date,
    end: date,
) -> dict:
    """For each ticker, pull historical shares outstanding via yfinance
    `get_shares_full`, forward-fill across daily dates in [start, end], and
    update sp500_daily.shares_out + market_cap (= close * shares_out).

    Tickers without shares data are logged and skipped — they'll have NULL
    market_cap and be excluded from the Pareto composite.
    """
    print(f"[shares] {len(tickers)} tickers, {start} → {end}")
    ok = empty = failed = 0
    total_rows = 0

    for i, ticker in enumerate(tickers, 1):
        yf_sym = _normalize_ticker_for_yf(ticker)
        try:
            t = yf.Ticker(yf_sym)
            ser = t.get_shares_full(start=start.isoformat(), end=end.isoformat())
            if ser is None or len(ser) == 0:
                empty += 1
                continue
            # ser is a Series indexed by Timestamp with shares as values, only
            # on filing dates. yfinance returns tz-aware timestamps; strip the
            # timezone so we can align with our tz-naive daily date range.
            if getattr(ser.index, "tz", None) is not None:
                ser.index = ser.index.tz_localize(None)
            # Normalize to date boundaries and dedupe (filings on the same day
            # become duplicates after normalization).
            ser.index = ser.index.normalize()
            ser = ser[~ser.index.duplicated(keep="last")].sort_index()
            # Reindex to all calendar dates in [start, end] and forward-fill.
            all_days = pd.date_range(start, end, freq="D")
            combined_index = ser.index.union(all_days).unique()
            ser = ser.reindex(combined_index).sort_index().ffill()
            ser = ser.loc[ser.index >= pd.Timestamp(start)]
            ser = ser.loc[ser.index <= pd.Timestamp(end)]
            # Map (ticker, date) → shares for DB update
            updates = []
            for ts, shares in ser.dropna().items():
                if shares is None or pd.isna(shares):
                    continue
                updates.append({
                    "ticker": ticker,
                    "date": ts.date().isoformat(),
                    "shares_out": int(shares),
                })
            if updates:
                db.bulk_update_sp500_shares(updates)
                ok += 1
                total_rows += len(updates)
        except Exception as e:
            failed += 1
            print(f"  [{i}/{len(tickers)}] {ticker} → FAILED: {e}")
            continue
        if i % 25 == 0:
            print(f"  [{i}/{len(tickers)}] processed (ok={ok} empty={empty} failed={failed})")
        time.sleep(0.1)  # gentle throttle for per-ticker calls

    print(f"[shares] done — ok={ok} empty={empty} failed={failed} rows={total_rows}")
    return {"ok": ok, "empty": empty, "failed": failed, "rows": total_rows}


# ── 4. Pareto-80 composite ───────────────────────────────────────────────────

PARETO_THRESHOLD = 0.80


def compute_composite(d: date) -> Optional[dict]:
    """Compute the Pareto-80 weighted-volume composite for trading day `d`.

    Returns the row that was written, or None if no data was available.
    """
    rows = db.get_sp500_daily_for_date(d, only_in_index=True)
    rows = [r for r in rows if r.get("market_cap") and r.get("volume") is not None]
    if not rows:
        return None

    rows.sort(key=lambda r: r["market_cap"], reverse=True)
    total_cap = sum(r["market_cap"] for r in rows)
    total_vol = sum(r["volume"] or 0 for r in rows)
    if total_cap <= 0:
        return None

    cumulative = 0.0
    pareto: list = []
    for r in rows:
        cumulative += r["market_cap"]
        pareto.append(r)
        if cumulative / total_cap >= PARETO_THRESHOLD:
            break

    pareto_cap = sum(r["market_cap"] for r in pareto)
    if pareto_cap <= 0:
        return None
    weighted_volume = sum(
        (r["volume"] or 0) * r["market_cap"] / pareto_cap
        for r in pareto
    )

    record = {
        "date":              d.isoformat(),
        "pareto_tickers":    [r["ticker"] for r in pareto],
        "ticker_count":      len(pareto),
        "total_market_cap":  float(total_cap),
        "pareto_market_cap": float(pareto_cap),
        "weighted_volume":   float(weighted_volume),
        "total_volume":      int(total_vol),
    }
    db.upsert_sp500_composite(record)
    return record


def compute_composite_range(start: date, end: date) -> dict:
    """Compute composite for every trading day in [start, end] that has data."""
    dates = db.get_sp500_daily_dates(start, end)
    print(f"[composite] {len(dates)} trading days, {start} → {end}")
    written = skipped = 0
    for d in dates:
        result = compute_composite(d)
        if result:
            written += 1
        else:
            skipped += 1
    print(f"[composite] done — written={written} skipped={skipped}")
    return {"written": written, "skipped": skipped}
