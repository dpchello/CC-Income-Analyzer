"""
PIPE-MARKETS-01 daily CRON — compute the Pareto-80 cap-weighted composite for
recent trading days. Runs after sp500_daily_snapshot.

Usage:
    python -m cron.sp500_composite_compute
    or as cron:
    30 22 * * 1-5  cd /path/to/backend && python -m cron.sp500_composite_compute >> /var/log/sp500_composite.log 2>&1
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import markets_ingest as mi


def run():
    today = date.today()
    start = today - timedelta(days=7)  # match the snapshot's catch-up window
    print(f"[sp500-composite] compute {start} → {today}")
    result = mi.compute_composite_range(start=start, end=today)
    print(f"[sp500-composite] {result}")


if __name__ == "__main__":
    run()
