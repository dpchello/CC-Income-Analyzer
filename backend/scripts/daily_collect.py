"""
Daily options chain collector — run once per trading day after market close.

Fetches the current full options chain for every tracked ticker via yfinance
and writes a dated snapshot into the DuckDB database. Over time this builds
a historical options dataset for all tickers beyond the lambdaclass SPY/IWM/QQQ baseline.

Usage:
    cd backend
    python -m scripts.daily_collect                      # collect all tracked tickers
    python -m scripts.daily_collect --symbols AAPL MSFT  # specific symbols
    python -m scripts.daily_collect --dry-run            # show what would be collected
    python -m scripts.daily_collect --add-ticker NVDA    # add a new ticker to the watchlist

Cron (run at 5 PM ET on weekdays):
    0 17 * * 1-5 cd /path/to/backend && python -m scripts.daily_collect
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).parent.parent))
import data_store

# Watchlist file — tickers to collect daily beyond the lambdaclass baseline
WATCHLIST_PATH = Path(__file__).parent.parent / "data" / "watchlist.json"

# Default tickers always collected (lambdaclass baseline + common liquid names)
DEFAULT_TICKERS = [
    "SPY", "QQQ", "IWM",           # already have history; keep current
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA",
    "AMD", "INTC", "NFLX", "JPM", "GS", "BAC", "XLF",
    "GLD", "SLV", "TLT", "HYG",
]


def load_watchlist() -> list[str]:
    if WATCHLIST_PATH.exists():
        with open(WATCHLIST_PATH) as f:
            data = json.load(f)
        return list(dict.fromkeys(data.get("tickers", []) + DEFAULT_TICKERS))
    return DEFAULT_TICKERS[:]


def save_watchlist(tickers: list[str]) -> None:
    WATCHLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(WATCHLIST_PATH, "w") as f:
        json.dump({"tickers": sorted(set(tickers))}, f, indent=2)


def is_trading_day(d: date | None = None) -> bool:
    d = d or date.today()
    if d.weekday() >= 5:
        return False
    # US market holidays (approximate — major ones only)
    holidays = {
        date(d.year, 1, 1),   # New Year's
        date(d.year, 7, 4),   # Independence Day
        date(d.year, 12, 25), # Christmas
    }
    return d not in holidays


def fetch_options_snapshot(symbol: str, as_of: date) -> pd.DataFrame:
    """Fetch all calls + puts for all available expiries from yfinance."""
    ticker = yf.Ticker(symbol)
    rows = []

    try:
        expiries = ticker.options
    except Exception as e:
        print(f"    [{symbol}] could not fetch expiry list: {e}")
        return pd.DataFrame()

    for exp in expiries:
        try:
            chain = ticker.option_chain(exp)
            for df_leg, opt_type in [(chain.calls, "C"), (chain.puts, "P")]:
                if df_leg.empty:
                    continue
                df_leg = df_leg.copy()
                df_leg["option_type"] = opt_type
                df_leg["symbol"] = symbol.upper()
                df_leg["quote_date"] = as_of
                df_leg["expiration"] = pd.to_datetime(exp).date()
                rows.append(df_leg)
        except Exception as e:
            print(f"    [{symbol}] expiry {exp} failed: {e}")
            continue

    if not rows:
        return pd.DataFrame()

    raw = pd.concat(rows, ignore_index=True)

    # Map yfinance column names → our schema
    col_map = {
        "lastPrice":         "last_price",
        "openInterest":      "open_interest",
        "impliedVolatility": "implied_volatility",
    }
    raw = raw.rename(columns=col_map)

    keep = [
        "quote_date", "symbol", "option_type", "expiration", "strike",
        "bid", "ask", "last_price", "volume", "open_interest",
        "implied_volatility", "delta", "theta",
    ]
    # Add missing optional columns
    for col in ["gamma", "vega", "last_price"]:
        if col not in raw.columns:
            raw[col] = None
    keep_full = keep + [c for c in ["gamma", "vega"] if c not in keep]

    df = raw[[c for c in keep_full if c in raw.columns]].copy()

    # Clean NaN
    float_cols = ["bid", "ask", "last_price", "implied_volatility",
                  "delta", "gamma", "theta", "vega"]
    for col in float_cols:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: None if (isinstance(x, float) and np.isnan(x)) else x
            )

    # Drop rows with no bid/ask at all
    df = df[~(df.get("bid", pd.Series([None])).isna() &
              df.get("ask", pd.Series([None])).isna())]

    return df


def collect_ticker(symbol: str, as_of: date, dry_run: bool = False) -> int:
    last = data_store.get_last_collected(symbol)
    if last == as_of:
        print(f"  [{symbol}] already collected for {as_of} — skipping")
        return 0

    print(f"  [{symbol}] fetching options chain ...", end=" ", flush=True)
    df = fetch_options_snapshot(symbol, as_of)

    if df.empty:
        print("no data returned")
        return 0

    print(f"{len(df):,} rows", end="")

    if dry_run:
        print(" (dry-run, not saved)")
        return len(df)

    added = data_store.insert_options_rows(df, source="yfinance")
    data_store.upsert_collection_log(symbol, as_of, added)
    print(f" → {added:,} new rows inserted")
    return added


def collect_underlying(symbol: str, as_of: date, dry_run: bool = False) -> int:
    """Also capture today's closing price for the underlying."""
    try:
        hist = yf.Ticker(symbol).history(period="2d", interval="1d")
        if hist.empty:
            return 0
        hist = hist.reset_index()
        hist["date"] = pd.to_datetime(hist["Date"]).dt.date
        hist = hist[hist["date"] <= as_of].copy()
        hist["symbol"] = symbol.upper()
        hist = hist.rename(columns={
            "Open": "open", "High": "high", "Low": "low",
            "Close": "close", "Volume": "volume",
        })
        hist["adj_close"] = hist.get("close", None)

        keep = ["date", "symbol", "open", "high", "low", "close", "adj_close", "volume"]
        df = hist[[c for c in keep if c in hist.columns]]

        if dry_run:
            return len(df)
        return data_store.insert_underlying_rows(df, source="yfinance")
    except Exception as e:
        print(f"    [{symbol}] underlying price error: {e}")
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Daily options chain collector")
    parser.add_argument("--symbols", nargs="+", help="Override watchlist with specific symbols")
    parser.add_argument("--date", help="Collect for a specific date (YYYY-MM-DD), default: today")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch but do not write to the database")
    parser.add_argument("--add-ticker", nargs="+", metavar="TICKER",
                        help="Add ticker(s) to the watchlist and collect immediately")
    parser.add_argument("--list", action="store_true", help="Print watchlist and exit")
    args = parser.parse_args()

    # Handle --add-ticker
    if args.add_ticker:
        watchlist = load_watchlist()
        new = [t.upper() for t in args.add_ticker]
        watchlist = list(dict.fromkeys(watchlist + new))
        save_watchlist(watchlist)
        print(f"Added to watchlist: {', '.join(new)}")
        if not args.symbols:
            args.symbols = new  # collect the new ones immediately

    if args.list:
        print("Current watchlist:")
        for t in sorted(load_watchlist()):
            last = data_store.get_last_collected(t)
            print(f"  {t:<8} last collected: {last or 'never'}")
        return

    as_of = date.fromisoformat(args.date) if args.date else date.today()

    if not is_trading_day(as_of) and not args.date:
        print(f"{as_of} is not a trading day — nothing to collect.")
        return

    symbols = [s.upper() for s in args.symbols] if args.symbols else load_watchlist()

    print(f"Collecting {len(symbols)} symbols for {as_of}"
          + (" [DRY RUN]" if args.dry_run else ""))

    data_store.init_schema()
    total_added = 0

    for sym in symbols:
        added = collect_ticker(sym, as_of, dry_run=args.dry_run)
        collect_underlying(sym, as_of, dry_run=args.dry_run)
        total_added += added

    print(f"\nDone. Total new option rows: {total_added:,}")

    if not args.dry_run:
        print("\nCoverage summary:")
        summary = data_store.get_coverage_summary()
        if not summary.empty:
            print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
