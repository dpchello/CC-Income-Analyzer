"""
PIPE-MARKETS-01 — One-time 5-year backfill for the Markets tab.

Steps (all idempotent — safe to re-run):
  1. Sync S&P 500 historical membership from fja05680/sp500.
  2. Determine the union of tickers that were ever in the index across the
     5y backfill window.
  3. yfinance-batch-download EOD price + volume for those tickers + SPY/QQQ.
  4. Pull historical shares outstanding for current S&P members and forward-fill
     across daily dates. (Skipping former-members for v1 — they typically have
     small market cap by the time they're removed and don't drive the Pareto-80.)
  5. Recompute market_cap = close * shares_out for all rows.
  6. Compute the Pareto-80 composite for every trading day in the window.

Estimated runtime: 30–90 minutes depending on yfinance throttling.

Usage:
    cd backend
    python -m scripts.backfill_markets [--years 5] [--skip-membership] [--skip-daily]

Run only after the 005_markets.sql migration has been applied to Supabase.
"""

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db
import markets_ingest as mi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5, help="Years of history to backfill (default 5)")
    ap.add_argument("--skip-membership", action="store_true")
    ap.add_argument("--skip-daily", action="store_true")
    ap.add_argument("--skip-shares", action="store_true")
    ap.add_argument("--skip-composite", action="store_true")
    args = ap.parse_args()

    end = date.today()
    start = end - timedelta(days=365 * args.years)
    print(f"\n=== Markets backfill: {start} → {end} ({args.years}y) ===\n")
    t0 = time.time()

    # Step 1: membership
    if not args.skip_membership:
        print("\n--- Step 1: sync S&P 500 historical membership ---")
        mi.sync_membership()
    else:
        print("\n--- Step 1: SKIPPED ---")

    # Step 2: pick tickers
    tickers = db.get_unique_tickers_in_range(start, end)
    print(f"\nTickers ever in S&P 500 across window: {len(tickers)}")

    # Step 3: daily price/volume
    if not args.skip_daily:
        print("\n--- Step 3: daily price/volume sync ---")
        mi.sync_daily(start=start, end=end, tickers=tickers, include_etfs=True)
    else:
        print("\n--- Step 3: SKIPPED ---")

    # Step 4: shares outstanding (current members only — see module docstring)
    if not args.skip_shares:
        print("\n--- Step 4: shares outstanding step-fill (current members) ---")
        current = db.get_current_sp500_tickers()
        mi.sync_shares_outstanding(tickers=current, start=start, end=end)
    else:
        print("\n--- Step 4: SKIPPED ---")

    # Step 5: recompute market caps
    print("\n--- Step 5: recompute market_cap = close * shares_out ---")
    n = db.recompute_market_caps(start=start, end=end)
    print(f"  updated {n} rows")

    # Step 6: composite
    if not args.skip_composite:
        print("\n--- Step 6: compute Pareto-80 composite per trading day ---")
        mi.compute_composite_range(start=start, end=end)
    else:
        print("\n--- Step 6: SKIPPED ---")

    elapsed = time.time() - t0
    print(f"\n=== Backfill complete in {elapsed/60:.1f} min ===")


if __name__ == "__main__":
    main()
