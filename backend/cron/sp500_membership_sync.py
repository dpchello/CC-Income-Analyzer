"""
PIPE-MARKETS-01 weekly CRON — sync S&P 500 historical membership from
fja05680/sp500. Index changes are rare (~20 add/remove events per year), so
weekly is plenty.

Usage:
    python -m cron.sp500_membership_sync
    or as cron:
    0 2 * * 0  cd /path/to/backend && python -m cron.sp500_membership_sync >> /var/log/sp500_membership.log 2>&1
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import markets_ingest as mi


def run():
    print("[sp500-membership-sync] starting")
    result = mi.sync_membership()
    print(f"[sp500-membership-sync] {result}")


if __name__ == "__main__":
    run()
