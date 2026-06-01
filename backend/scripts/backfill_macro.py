"""
One-time fetch of historical macro series for the regime-gated backtest.

Pulls daily closes for VIX, VVIX, TNX, FVX, TLT from yfinance and writes
them to the macro_history table in DuckDB. Idempotent — running twice is safe.

Run from backend/:
    python -m scripts.backfill_macro
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

# Allow running from either backend/ or repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import yfinance as yf

import data_store


SERIES_MAP = {
    "VIX":  "^VIX",
    "VVIX": "^VVIX",
    "TNX":  "^TNX",
    "FVX":  "^FVX",
    "TLT":  "TLT",
}

START = "2007-01-01"  # 1y buffer pre-2008 chains for IV-rank window


def fetch_one(yf_symbol: str) -> pd.DataFrame:
    df = yf.download(yf_symbol, start=START, progress=False, auto_adjust=False)
    if df is None or df.empty:
        return pd.DataFrame(columns=["date", "value"])
    # yfinance can return MultiIndex columns when given a single ticker (varies
    # by version) — flatten if needed
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    out = pd.DataFrame({
        "date": [d.date() if hasattr(d, "date") else d for d in df.index],
        "value": df["Close"].astype(float).values,
    })
    out = out.dropna(subset=["value"])
    return out


def main() -> int:
    data_store.init_schema()
    total = 0
    for series, yf_sym in SERIES_MAP.items():
        print(f"Fetching {series} ({yf_sym})...", flush=True)
        df = fetch_one(yf_sym)
        if df.empty:
            print(f"  WARN: no data returned for {yf_sym}")
            continue
        added = data_store.insert_macro_rows(series, df)
        total += added
        print(f"  + {added} new rows ({len(df)} fetched, {df['date'].min()}..{df['date'].max()})")
    print()
    print("Coverage summary:")
    print(data_store.get_macro_coverage())
    print(f"\nTotal new rows: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
