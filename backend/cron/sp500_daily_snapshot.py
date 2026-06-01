"""
PIPE-MARKETS-01 daily CRON — snapshot EOD price + volume + shares outstanding
for current S&P 500 members + SPY/QQQ, recompute market caps for today.

Run after US market close. Pareto composite is computed by a separate cron
(sp500_composite_compute) that runs after this one.

Usage:
    python -m cron.sp500_daily_snapshot
    or as cron:
    0 22 * * 1-5  cd /path/to/backend && python -m cron.sp500_daily_snapshot >> /var/log/sp500_daily.log 2>&1
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db
import markets_ingest as mi


def run():
    today = date.today()
    # Pull a 7-day window so a missed cron day catches up automatically.
    start = today - timedelta(days=7)
    print(f"[sp500-daily] snapshot {start} → {today}")

    tickers = db.get_current_sp500_tickers()
    if not tickers:
        print("[sp500-daily] no current S&P 500 members in DB — run sp500_membership_sync first")
        return

    mi.sync_daily(start=start, end=today, tickers=tickers, include_etfs=True)
    mi.sync_shares_outstanding(tickers=tickers, start=start, end=today)
    n = db.recompute_market_caps(start=start, end=today)
    print(f"[sp500-daily] market_cap recomputed on {n} rows")


if __name__ == "__main__":
    run()
