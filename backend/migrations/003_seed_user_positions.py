"""
One-time script: seed positions.json into Supabase for leslie.c.george@gmail.com.

Run from the backend/ directory:
    cd backend && python migrations/003_seed_user_positions.py

Safe to re-run — uses upsert.
"""

import json
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TARGET_EMAIL = "leslie.c.george@gmail.com"

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
BASE = Path(__file__).parent.parent


def main():
    # 1. Find user
    r = sb.table("users").select("id,email,tier").eq("email", TARGET_EMAIL).limit(1).execute()
    if not r.data:
        print(f"ERROR: User {TARGET_EMAIL} not found in Supabase.")
        return
    user = r.data[0]
    user_id = user["id"]
    print(f"Found user: {user['email']} ({user_id}) tier={user['tier']}")

    # 2. Ensure "default" portfolio exists for this user
    r = (sb.table("portfolios")
           .select("id,name")
           .eq("user_id", user_id)
           .eq("name", "Default")
           .limit(1)
           .execute())
    if r.data:
        default_port_id = r.data[0]["id"]
        print(f"Found existing Default portfolio: {default_port_id}")
    else:
        r2 = sb.table("portfolios").insert({
            "user_id": user_id,
            "name": "Default",
            "archived": False,
        }).execute()
        default_port_id = r2.data[0]["id"]
        print(f"Created Default portfolio: {default_port_id}")

    # 3. Ensure the named brokerage folder portfolio exists (fc7841be-...)
    named_port_id = "fc7841be-0aaa-4279-96af-2cb0558a844a"
    r = (sb.table("portfolios")
           .select("id,name")
           .eq("id", named_port_id)
           .limit(1)
           .execute())
    if r.data:
        print(f"Found existing portfolio {named_port_id}: {r.data[0]['name']}")
    else:
        sb.table("portfolios").upsert({
            "id": named_port_id,
            "user_id": user_id,
            "name": "Brokerage",
            "archived": False,
        }).execute()
        print(f"Created Brokerage portfolio: {named_port_id}")

    # 4. Load and upsert positions
    positions_file = BASE / "positions.json"
    positions = json.loads(positions_file.read_text())

    migrated = 0
    for p in positions:
        raw_id = p.get("id", "")
        # Generate a stable UUID for legacy integer IDs ("1", "2")
        try:
            uuid.UUID(raw_id)
            pos_id = raw_id
        except (ValueError, AttributeError):
            # Deterministic UUID from the legacy ID so re-runs are idempotent
            pos_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"harvest-legacy-{raw_id}"))

        old_port = p.get("portfolio_id", "default")
        if old_port == "default":
            port_id = default_port_id
        else:
            try:
                uuid.UUID(old_port)
                port_id = old_port
            except ValueError:
                port_id = default_port_id

        row = {
            "id": pos_id,
            "user_id": user_id,
            "portfolio_id": port_id,
            "ticker": p.get("ticker", "SPY"),
            "type": p.get("type", "short_call"),
            "strike": p.get("strike"),
            "expiry": p.get("expiry"),
            "contracts": p.get("contracts"),
            "sell_price": p.get("sell_price"),
            "premium_collected": p.get("premium_collected"),
            "open_date": p.get("open_date"),
            "close_date": p.get("close_date"),
            "close_price": p.get("close_price"),
            "status": p.get("status", "open"),
            "notes": p.get("notes"),
            "final_pnl": p.get("final_pnl"),
            "open_signal": p.get("open_signal"),
            "close_signal": p.get("close_signal"),
            "harvest_category": "covered_call" if p.get("type") == "short_call" else None,
        }
        sb.table("positions").upsert(row).execute()
        migrated += 1
        status_str = p.get("status", "open")
        print(f"  Upserted {pos_id[:8]}... SPY {p.get('strike')} {p.get('expiry')} [{status_str}]")

    print(f"\nDone. {migrated} positions upserted for {TARGET_EMAIL}.")


if __name__ == "__main__":
    main()
