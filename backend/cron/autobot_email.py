"""
Daily autobot summary email CRON.

Builds a consolidated daily summary across all @harvest.test users and sends
it via Resend to the configured recipient.

Scheduled at 16:05 ET on weekdays (15 min after the autobot_tick cron runs).

Env vars:
    RESEND_API_KEY     required to actually deliver mail
    AUTOBOT_EMAIL_TO   recipient — required to send (set in backend/.env). No
                       default; if unset the cron builds the summary and skips
                       sending (keeps PII out of the repo).
    RESEND_FROM        from-address (default: 'Harvest Autobot <onboarding@resend.dev>')

Usage:
    python -m cron.autobot_email                     # send
    python -m cron.autobot_email --dry-run           # print to stdout, do not send

    crontab line:
    5 16 * * 1-5  cd /Users/leslie/CC-Income-Analyzer/backend && /Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3 -m cron.autobot_email >> /tmp/harvest_autobot_email.log 2>&1
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import autobot_report
import notifier  # noqa: E402 — its import loads backend/.env (AUTOBOT_EMAIL_TO, RESEND_*)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the email instead of sending")
    args = ap.parse_args()

    print(f"[{datetime.now().isoformat(timespec='seconds')}] building autobot daily summary")
    summary = autobot_report.build_daily_summary()
    counts  = summary["counts"]
    print(
        f"  users={counts['users']}  opens={counts['opens']}  "
        f"rolls={counts['rolls']}  closes={counts['closes']}"
    )

    if args.dry_run:
        print("\n=== DRY RUN — text body ===\n")
        print(summary["text"])
        return

    to = os.getenv("AUTOBOT_EMAIL_TO", "").strip()
    if not to:
        print("  [skip] AUTOBOT_EMAIL_TO not set — summary built but no recipient configured.", file=sys.stderr)
        return
    resp = notifier.send_email(
        subject = summary["subject"],
        to      = to,
        text    = summary["text"],
        html    = summary["html"],
    )
    if resp.get("error"):
        print(f"  [ERROR] {resp['error']}", file=sys.stderr)
    else:
        msg_id = resp.get("id", "?")
        print(f"  sent to {to}  id={msg_id}")


if __name__ == "__main__":
    main()
