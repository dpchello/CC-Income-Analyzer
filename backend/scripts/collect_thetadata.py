"""
ThetaData historical EOD options chain collector.

Fetches full EOD options chains (all strikes, all expirations) for any US equity
using the ThetaData v3 REST API and writes them into the local DuckDB database.

Free tier gives ~1 year of EOD history; paid plans go back to 2016.
NOTE: EOD bid/ask fields are unreliable before 2023-12-01 on all tiers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETUP (one-time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Create a free account at https://thetadata.us
2. Download ThetaTerminalv3.jar from your account dashboard
3. Start the Terminal in a separate window:
       java -jar ThetaTerminalv3.jar your@email.com yourpassword
   The Terminal must be running before any collector call.
4. Set credentials in backend/.env (or export as env vars):
       THETADATA_EMAIL=your@email.com
       THETADATA_PASSWORD=yourpassword

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    cd backend

    # Backfill last 365 days for a ticker (calls only — for covered call strategy)
    python -m scripts.collect_thetadata --symbols AAPL MSFT NVDA --days 365

    # Specific date range
    python -m scripts.collect_thetadata --symbols AAPL --start 2024-01-01 --end 2024-12-31

    # Include puts as well (doubles request count)
    python -m scripts.collect_thetadata --symbols AAPL --days 90 --rights C P

    # Daily update (collect yesterday's close — run after 8 PM ET)
    python -m scripts.collect_thetadata --symbols AAPL --days 1

    # Preview without writing to DB
    python -m scripts.collect_thetadata --symbols AAPL --days 5 --dry-run

    # Show what has already been collected
    python -m scripts.collect_thetadata --status
"""

import argparse
import io
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
import data_store

load_dotenv(Path(__file__).parent.parent / ".env")

# ── Terminal config ────────────────────────────────────────────────────────────
TERMINAL_V3  = "http://127.0.0.1:25503/v3"
TERMINAL_V2  = "http://127.0.0.1:25510/v2"   # fallback

# Free tier: ~20 requests/minute → 3 s minimum between calls
FREE_TIER_DELAY = 3.1  # seconds


# ── Connectivity ───────────────────────────────────────────────────────────────

def check_terminal(timeout: int = 5) -> tuple[bool, str]:
    """Return (ok, base_url) for the first responsive terminal version."""
    for url, label in [(TERMINAL_V3, "v3"), (TERMINAL_V2, "v2")]:
        try:
            r = requests.get(f"{url}/system/status", timeout=timeout)
            if r.status_code < 500:
                return True, url
        except requests.exceptions.ConnectionError:
            pass
        # v2 has no /system/status — a 404 on a known path still proves it's up
        try:
            r = requests.get(f"{url}/list/roots/option", timeout=timeout,
                             params={"product": "test"})
            if r.status_code < 500:
                return True, url
        except requests.exceptions.ConnectionError:
            pass
    return False, ""


# ── Fetching ───────────────────────────────────────────────────────────────────

def _fetch_v3_greeks_eod(
    base_url: str,
    symbol: str,
    right: str,
    target_date: date,
    session: requests.Session,
) -> pd.DataFrame:
    """
    Fetch EOD greeks chain (all strikes, all expirations) for one symbol/right/day
    using v3 wildcard endpoint.
    Returns a DataFrame with our schema columns, or empty DataFrame on error.
    """
    date_str = target_date.isoformat()
    params = {
        "symbol":     symbol.upper(),
        "right":      right.upper(),
        "strike":     "*",
        "expiration": "*",
        "start_date": date_str,
        "end_date":   date_str,
        "format":     "csv",
    }
    try:
        r = session.get(f"{base_url}/option/history/greeks/eod", params=params, timeout=30)
        if r.status_code == 404:
            return pd.DataFrame()   # no data for this symbol/date
        r.raise_for_status()
        if not r.text.strip():
            return pd.DataFrame()
        df = pd.read_csv(io.StringIO(r.text))
    except Exception as e:
        print(f"      v3 greeks/eod error for {symbol} {right} {target_date}: {e}")
        return pd.DataFrame()

    if df.empty:
        return df

    return _normalise_v3(df, symbol, right, target_date)


def _fetch_v2_bulk_eod(
    base_url: str,
    symbol: str,
    right: str,
    target_date: date,
    session: requests.Session,
) -> pd.DataFrame:
    """
    Fallback: v2 bulk EOD. Gets OHLCV + bid/ask for all strikes of one expiry.
    We enumerate expirations first, then fetch each one.
    Returns merged DataFrame, or empty on error.
    """
    date_str = target_date.strftime("%Y%m%d")

    # Get expiration list
    try:
        r = session.get(f"{base_url}/list/options/expirations",
                        params={"root": symbol.upper()}, timeout=15)
        r.raise_for_status()
        expirations = r.json().get("response", [])
    except Exception as e:
        print(f"      v2 expiry list error for {symbol}: {e}")
        return pd.DataFrame()

    frames = []
    for exp in expirations:
        try:
            r = session.get(
                f"{base_url}/bulk_hist/option/eod",
                params={
                    "root":       symbol.upper(),
                    "exp":        str(exp),
                    "right":      right.upper(),
                    "start_date": date_str,
                    "end_date":   date_str,
                },
                timeout=30,
            )
            if r.status_code == 404:
                continue
            r.raise_for_status()
            if r.text.strip():
                df = pd.read_csv(io.StringIO(r.text))
                if not df.empty:
                    df["expiration_raw"] = exp
                    frames.append(df)
            time.sleep(FREE_TIER_DELAY)
        except Exception as e:
            print(f"      v2 bulk_eod error {symbol} exp={exp}: {e}")
            continue

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    return _normalise_v2(combined, symbol, right, target_date)


# ── Column normalisation ───────────────────────────────────────────────────────

def _normalise_v3(df: pd.DataFrame, symbol: str, right: str, q_date: date) -> pd.DataFrame:
    """Map v3 greeks/eod response columns → our schema."""
    col_map = {
        "implied_vol":    "implied_volatility",
        "impliedvol":     "implied_volatility",
        "iv":             "implied_volatility",
        "close":          "last_price",
        "last":           "last_price",
        "open_interest":  "open_interest",
        "openinterest":   "open_interest",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # ThetaData scales vega and rho by 100
    for col in ("vega", "rho"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce") / 100.0

    df["quote_date"]   = q_date
    df["symbol"]       = symbol.upper()
    df["option_type"]  = right.upper()

    if "expiration" in df.columns:
        df["expiration"] = pd.to_datetime(df["expiration"], errors="coerce").dt.date
    if "strike" not in df.columns and "strike_price" in df.columns:
        df = df.rename(columns={"strike_price": "strike"})

    return _to_schema(df)


def _normalise_v2(df: pd.DataFrame, symbol: str, right: str, q_date: date) -> pd.DataFrame:
    """Map v2 bulk_eod response columns → our schema."""
    col_map = {
        "implied_vol":   "implied_volatility",
        "close":         "last_price",
        "count":         "volume",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # v2 strikes are in 1/10th-cent units → convert to dollars
    if "strike" in df.columns:
        df["strike"] = pd.to_numeric(df["strike"], errors="coerce") / 1000.0

    # Parse expiration from the raw column (YYYYMMDD int or string)
    if "expiration_raw" in df.columns:
        df["expiration"] = pd.to_datetime(
            df["expiration_raw"].astype(str), format="%Y%m%d", errors="coerce"
        ).dt.date
    elif "expiration" in df.columns:
        df["expiration"] = pd.to_datetime(df["expiration"], errors="coerce").dt.date

    df["quote_date"]   = q_date
    df["symbol"]       = symbol.upper()
    df["option_type"]  = right.upper()

    return _to_schema(df)


def _to_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only our schema columns, filling missing ones with None."""
    schema = [
        "quote_date", "symbol", "option_type", "expiration", "strike",
        "bid", "ask", "last_price", "volume", "open_interest",
        "implied_volatility", "delta", "gamma", "theta", "vega",
    ]
    for col in schema:
        if col not in df.columns:
            df[col] = None

    df = df[schema].copy()
    df = df.dropna(subset=["expiration", "strike"])
    df["strike"] = pd.to_numeric(df["strike"], errors="coerce")
    df = df.dropna(subset=["strike"])

    for col in ("bid", "ask", "last_price", "implied_volatility",
                "delta", "gamma", "theta", "vega"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ("volume", "open_interest"):
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    return df


# ── Trading calendar ───────────────────────────────────────────────────────────

def trading_days(start: date, end: date) -> list[date]:
    """Return weekdays between start and end, inclusive (no holiday filter — simple)."""
    days = []
    d = start
    while d <= end:
        if d.weekday() < 5:
            days.append(d)
        d += timedelta(days=1)
    return days


# ── Main collection logic ──────────────────────────────────────────────────────

def collect_symbol_date(
    base_url: str,
    symbol: str,
    rights: list[str],
    target_date: date,
    session: requests.Session,
    dry_run: bool = False,
) -> int:
    """Collect one (symbol, date) pair. Returns rows inserted."""
    total = 0
    is_v3 = "25503" in base_url

    for right in rights:
        if is_v3:
            df = _fetch_v3_greeks_eod(base_url, symbol, right, target_date, session)
        else:
            df = _fetch_v2_bulk_eod(base_url, symbol, right, target_date, session)

        if df.empty:
            continue

        if dry_run:
            print(f"        [dry-run] {symbol} {right} {target_date}: {len(df)} rows")
            total += len(df)
        else:
            added = data_store.insert_options_rows(df, source="thetadata")
            total += added

        time.sleep(FREE_TIER_DELAY)

    return total


def run_collection(
    symbols:   list[str],
    start:     date,
    end:       date,
    rights:    list[str],
    dry_run:   bool = False,
) -> None:
    data_store.init_schema()

    ok, base_url = check_terminal()
    if not ok:
        print(
            "\nERROR: ThetaData Terminal is not running.\n"
            "Start it with:\n"
            "  java -jar ThetaTerminalv3.jar your@email.com yourpassword\n"
            "Then re-run this script."
        )
        sys.exit(1)

    version = "v3" if "25503" in base_url else "v2"
    print(f"Terminal connected ({version}) at {base_url}")
    print(f"Collecting {len(symbols)} symbol(s) × {len(rights)} right(s)"
          f" from {start} to {end}"
          + (" [DRY RUN]" if dry_run else ""))

    session = requests.Session()
    session.headers.update({"User-Agent": "cc-income-analyzer/1.0"})

    days = trading_days(start, end)
    grand_total = 0

    for sym in symbols:
        sym_total = 0
        print(f"\n  {sym} ({len(days)} trading days) ...")

        # Build set of already-collected (date, right) pairs to skip
        try:
            with data_store.get_connection(read_only=True) as conn:
                done = set(
                    conn.execute(
                        "SELECT DISTINCT quote_date, option_type "
                        "FROM options_chains WHERE symbol = ? "
                        "AND data_source = 'thetadata'"
                        "AND quote_date BETWEEN ? AND ?",
                        [sym.upper(), start, end],
                    ).fetchall()
                )
        except Exception:
            done = set()

        for d in days:
            # Determine which rights still need collection on this date
            needed = [r for r in rights if (d, r) not in done]
            if not needed:
                continue

            added = collect_symbol_date(base_url, sym, needed, d, session, dry_run)
            sym_total += added
            if added:
                print(f"    {d}  +{added:,} rows")

        if not dry_run and sym_total:
            data_store.upsert_collection_log(sym.upper(), end, sym_total)

        grand_total += sym_total
        print(f"  {sym} done — {sym_total:,} rows added")

    print(f"\nFinished. Total rows added: {grand_total:,}")

    if not dry_run:
        print("\nCoverage summary:")
        summary = data_store.get_coverage_summary()
        if not summary.empty:
            print(summary.to_string(index=False))


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Collect historical EOD options chains from ThetaData",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--symbols", nargs="+", metavar="TICKER",
                        help="Tickers to collect (e.g. AAPL MSFT NVDA)")
    parser.add_argument("--days", type=int, default=365,
                        help="Number of calendar days back from today (default: 365)")
    parser.add_argument("--start", metavar="YYYY-MM-DD",
                        help="Start date (overrides --days)")
    parser.add_argument("--end", metavar="YYYY-MM-DD",
                        help="End date (default: yesterday)")
    parser.add_argument("--rights", nargs="+", choices=["C", "P"], default=["C"],
                        help="Option rights to collect (default: C only — for covered calls)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch but do not write to DB")
    parser.add_argument("--status", action="store_true",
                        help="Show collection coverage summary and exit")
    args = parser.parse_args()

    if args.status:
        data_store.init_schema()
        summary = data_store.get_coverage_summary()
        if summary.empty:
            print("No data collected yet.")
        else:
            print(summary.to_string(index=False))
        return

    if not args.symbols:
        parser.error("--symbols is required (e.g. --symbols AAPL MSFT)")

    today     = date.today()
    yesterday = today - timedelta(days=1)

    end   = date.fromisoformat(args.end)   if args.end   else yesterday
    start = date.fromisoformat(args.start) if args.start else end - timedelta(days=args.days)

    if start > end:
        parser.error(f"--start {start} is after --end {end}")

    # Remind user about free-tier data depth
    cutoff = today - timedelta(days=365)
    if start < cutoff:
        print(
            f"WARNING: Free tier covers ~1 year of history.\n"
            f"  Requested start {start} is before the ~{cutoff} cutoff.\n"
            f"  Data before {cutoff} may return empty. "
            "Upgrade to a paid plan for deeper history.\n"
        )

    run_collection(
        symbols=[s.upper() for s in args.symbols],
        start=start,
        end=end,
        rights=[r.upper() for r in args.rights],
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
