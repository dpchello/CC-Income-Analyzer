"""
Daily autobot tick CRON.

Runs the management loop (50%-close, ITM roll, 21-DTE roll, expiry handling)
across all @harvest.test users.

Scheduled at 15:50 ET on weekdays (10 min before close).

Usage:
    python -m cron.autobot_tick

    crontab line:
    50 15 * * 1-5  cd /Users/leslie/CC-Income-Analyzer/backend && /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3 -m cron.autobot_tick >> /tmp/harvest_autobot_tick.log 2>&1
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import autobot
import db

TEST_DOMAIN = "@harvest.test"


def main() -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] autobot tick start")
    r = db.sb.table("users").select("id,email").execute()
    users = [u for u in (r.data or []) if (u["email"] or "").endswith(TEST_DOMAIN)]
    for u in users:
        try:
            result = autobot.tick_user(u["id"])
        except Exception as e:
            print(f"  [ERROR] {u['email']}: {e}", file=sys.stderr)
            continue
        n_close = len(result["closed"])
        n_roll  = len(result["rolled"])
        n_exp   = len(result["expired_max"])
        n_asg   = len(result["assigned"])
        n_keep  = len(result["kept"])
        print(
            f"  {u['email']:30s} closed={n_close} rolled={n_roll} "
            f"expired={n_exp} assigned={n_asg} kept={n_keep}"
        )
    print(f"[{datetime.now().isoformat(timespec='seconds')}] autobot tick done")


if __name__ == "__main__":
    main()
