"""
Daily pre-market CRON — snapshot OI + mid prices for SPY chain expiries.

Runs at 5:30 AM ET daily (every day, including weekends — weekend runs just
re-record the prior Friday's settlement figures, which is harmless thanks to
oi_tracker's first-write-wins semantics).

Captures:
  - openInterest at each strike (yfinance settlement figure from prior session)
  - mid price at each strike (pre-market quote, or last trade as fallback)

This builds the history that powers value-over-time charts on the OI chart.
First-write-wins per date in oi_tracker, so the cron's pre-market reading
becomes the canonical record for the day.

Usage:
    python -m cron.daily_oi_snapshot
    crontab line (installed 2026-04-29):
    30 5 * * *  cd /path/to/backend && /usr/bin/python3 -m cron.daily_oi_snapshot >> /tmp/harvest_oi_snapshot.log 2>&1
"""

import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import oi_tracker
from data_fetcher import DataFetcher

THROTTLE_SECONDS = 0.5  # ~2 req/sec ceiling
MAX_DTE = 60            # capture every expiry inside 60 DTE


def run():
    fetcher = DataFetcher()
    expiries = fetcher.get_screener_expiries(max_dte=MAX_DTE)
    if not expiries:
        print(f"[oi-snapshot] {date.today().isoformat()} — no expiries returned, aborting.")
        return
    print(f"[oi-snapshot] {date.today().isoformat()} — {len(expiries)} expiries (≤{MAX_DTE} DTE)")
    ok = empty = failed = 0
    for i, exp in enumerate(expiries, 1):
        try:
            chain = fetcher.get_options_chain(exp)
            if not chain:
                empty += 1
                print(f"  [{i}/{len(expiries)}] {exp} → empty chain")
            else:
                oi_tracker.record_chain_snapshot(exp, chain)
                ok += 1
                print(f"  [{i}/{len(expiries)}] {exp} → recorded {len(chain)} strikes")
        except Exception as exc:
            failed += 1
            print(f"  [{i}/{len(expiries)}] {exp} → FAILED: {exc}")
        time.sleep(THROTTLE_SECONDS)
    print(f"[oi-snapshot] done — ok={ok} empty={empty} failed={failed}")
    # Mark the sentinel so the snapshot-guard middleware skips today.
    if ok > 0:
        try:
            oi_tracker.SNAPSHOT_SENTINEL.write_text(date.today().isoformat())
        except OSError as exc:
            print(f"[oi-snapshot] sentinel write failed: {exc}")


if __name__ == "__main__":
    run()
