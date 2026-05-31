"""
CLI for the auto-trade simulation bot.

Usage (run from backend/):
    python3 scripts/autobot_run.py --action open --users test
    python3 scripts/autobot_run.py --action tick --users test
    python3 scripts/autobot_run.py --action open --users user@example.com
    python3 scripts/autobot_run.py --action tick --users all   # asks confirmation

Default --users is 'test', which scopes to @harvest.test emails only.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Make backend/ importable when invoked from anywhere
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import db   # noqa: E402
import autobot  # noqa: E402


TEST_DOMAIN = "@harvest.test"


def _resolve_users(scope: str) -> list:
    r = db.sb.table("users").select("id,email,tier").execute()
    rows = r.data or []
    if scope == "test":
        return [u for u in rows if (u["email"] or "").endswith(TEST_DOMAIN)]
    if scope == "all":
        return rows
    # Treat scope as a literal email
    return [u for u in rows if (u["email"] or "").lower() == scope.lower()]


def _check_schema() -> None:
    """Make sure 004_autobot.sql has been applied. Bail with a clear message
    if the new columns don't exist."""
    try:
        db.sb.table("positions").select("id,roll_of_position_id,simulated").limit(1).execute()
    except Exception as e:
        msg = str(e)
        if "roll_of_position_id" in msg or "simulated" in msg or "column" in msg.lower():
            print(
                "[FATAL] schema migration not applied. "
                "Run backend/migrations/004_autobot.sql in the Supabase SQL editor first.",
                file=sys.stderr,
            )
            sys.exit(2)
        raise


def _print_open_result(result: dict) -> None:
    user = result["user_id"]
    print(f"\nUSER {user}  regime={result.get('regime')}")
    if not result["opened"] and not result["skipped"]:
        print("  (no holdings)")
        return
    for o in result["opened"]:
        print(
            f"  OPEN  {o['ticker']:5s} rung={o['rung']:4s} "
            f"{o['contracts']}x ${o['strike']} {o['expiry']} "
            f"@${o['mid']}  d={o['delta']:.2f}  iv={o['iv_pct']:.1f}%"
        )
    for s in result["skipped"]:
        print(f"  SKIP  {s.get('ticker','?'):5s} {s.get('reason')}")


def _print_tick_result(result: dict) -> None:
    user = result["user_id"]
    print(f"\nUSER {user}")
    for c in result["closed"]:
        print(f"  CLOSE 50%   {c['ticker']:5s} buyback=${c['buyback']}")
    for r in result["rolled"]:
        rsv = f" reserve+{r['reserve_used']}" if r.get("reserve_used") else ""
        print(
            f"  ROLL  {r['reason']}  {r['ticker']:5s} "
            f"-> ${r.get('new_strike')} {r.get('new_expiry')}{rsv}"
        )
    for x in result["expired_max"]:
        print(f"  EXP   max-profit  {x['ticker']:5s} underlying=${x['underlying']:.2f}")
    for a in result["assigned"]:
        print(f"  ASSIGN {a['ticker']:5s} -{a['shares_called']} sh @${a['underlying']:.2f}")
    if not any([result["closed"], result["rolled"], result["expired_max"], result["assigned"]]):
        print(f"  (no triggers fired across {len(result['kept'])} open positions)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", choices=["open", "tick"], required=True)
    ap.add_argument(
        "--users",
        default="test",
        help="'test' (@harvest.test only), 'all', or a literal email",
    )
    ap.add_argument(
        "--yes", action="store_true",
        help="skip the confirmation prompt for --users all",
    )
    args = ap.parse_args()

    _check_schema()

    users = _resolve_users(args.users)
    if not users:
        print(f"[INFO] no users matched scope '{args.users}'")
        return

    if args.users == "all" and not args.yes:
        emails = ", ".join(u["email"] for u in users[:10])
        more = f" +{len(users)-10} more" if len(users) > 10 else ""
        print(f"[CONFIRM] --users all matches {len(users)} users: {emails}{more}")
        ans = input("Proceed? type 'YES' to confirm: ").strip()
        if ans != "YES":
            print("aborted.")
            return

    print(f"[INFO] action={args.action} scope={args.users} users={len(users)}")

    if args.action == "open":
        for u in users:
            try:
                _print_open_result(autobot.open_for_user(u["id"]))
            except Exception as e:
                print(f"  [ERROR] {u['email']}: {e}")
    elif args.action == "tick":
        for u in users:
            try:
                _print_tick_result(autobot.tick_user(u["id"]))
            except Exception as e:
                print(f"  [ERROR] {u['email']}: {e}")


if __name__ == "__main__":
    main()
