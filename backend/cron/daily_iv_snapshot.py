"""
PIPE-036 nightly CRON — snapshot ATM IV for every ticker in iv_universe.

Run after US market close (e.g. 4:30pm ET) on weekdays. Rate-limited to ~2 req/sec
so yfinance doesn't throttle. Failures are logged and skipped (don't fail the batch).

Usage:
    python -m cron.daily_iv_snapshot
    or add a cron entry:
    30 16 * * 1-5  cd /path/to/backend && python -m cron.daily_iv_snapshot >> /var/log/iv_snapshot.log 2>&1
"""

import sys
import time
from datetime import date
from pathlib import Path

# Allow running as `python cron/daily_iv_snapshot.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db
from data_fetcher import DataFetcher

THROTTLE_SECONDS = 0.5  # 2 req/sec ceiling


def run():
    fetcher = DataFetcher()
    tickers = db.get_universe_tickers()
    if not tickers:
        print("iv_universe is empty — seed it via POST /api/admin/iv-universe/seed first.")
        return
    today = date.today()
    ok = skipped = failed = 0
    print(f"[iv-snapshot] {today.isoformat()} — {len(tickers)} tickers to snapshot")
    for i, sym in enumerate(tickers, 1):
        try:
            iv = fetcher.get_atm_iv(sym)
            if iv is None:
                skipped += 1
                print(f"  [{i}/{len(tickers)}] {sym} → skipped (no ATM IV)")
            else:
                db.record_iv_snapshot(sym, today, iv)
                ok += 1
                if i % 25 == 0:
                    print(f"  [{i}/{len(tickers)}] {sym} iv={iv}")
        except Exception as exc:
            failed += 1
            print(f"  [{i}/{len(tickers)}] {sym} → FAILED: {exc}")
        time.sleep(THROTTLE_SECONDS)
    print(f"[iv-snapshot] done — ok={ok} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    run()
