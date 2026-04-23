"""
One-time migration: JSON files + SQLite harvest.db → Supabase.

Run from the backend/ directory after setting env vars:
    SUPABASE_URL=https://xxx.supabase.co
    SUPABASE_SERVICE_KEY=service_role_key_here

    cd backend && python migrations/002_migrate.py

Safe to re-run — uses upsert for all records.
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

BASE = Path(__file__).parent.parent


def _load_json(name: str) -> list:
    f = BASE / name
    if f.exists():
        return json.loads(f.read_text())
    return []


def migrate_users():
    """Migrate users from SQLite harvest.db to Supabase users table."""
    db_path = BASE / "harvest.db"
    if not db_path.exists():
        print("  harvest.db not found — skipping user migration")
        return {}

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM user").fetchall()
    conn.close()

    id_map = {}  # old str id → new uuid str
    for row in rows:
        old_id = row["id"]
        # Keep the same UUID if it's valid, otherwise generate a new one
        try:
            uuid.UUID(old_id)
            new_id = old_id
        except ValueError:
            new_id = str(uuid.uuid4())
        id_map[old_id] = new_id

        sb.table("users").upsert({
            "id": new_id,
            "email": row["email"],
            "hashed_password": row["hashed_password"],
            "tier": row["tier"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
        }).execute()

    print(f"  Migrated {len(rows)} users")
    return id_map


def migrate_portfolios(user_id_map: dict) -> dict:
    """
    Migrate portfolios.json → Supabase.
    Since the old data had no user_id concept, we assign all portfolios to the
    first (and likely only) user in the DB. For multi-user setups this script
    would need modification.
    """
    portfolios = _load_json("portfolios.json")
    if not portfolios:
        print("  portfolios.json empty — skipping")
        return {}

    # Use first user as owner of migrated data
    first_user = list(user_id_map.values())[0] if user_id_map else None
    if not first_user:
        print("  No users found — skipping portfolio migration")
        return {}

    port_id_map = {}  # old id → new UUID
    for p in portfolios:
        old_id = p["id"]
        try:
            uuid.UUID(old_id)
            new_id = old_id
        except ValueError:
            new_id = str(uuid.uuid4())
        port_id_map[old_id] = new_id

        sb.table("portfolios").upsert({
            "id": new_id,
            "user_id": first_user,
            "name": p["name"],
            "created_date": p.get("created_date", datetime.now().date().isoformat()),
            "archived": p.get("archived", False),
        }).execute()

    print(f"  Migrated {len(portfolios)} portfolios")
    return port_id_map


def migrate_positions(user_id_map: dict, port_id_map: dict):
    positions = _load_json("positions.json")
    if not positions:
        print("  positions.json empty — skipping")
        return

    first_user = list(user_id_map.values())[0] if user_id_map else None
    if not first_user:
        print("  No users found — skipping position migration")
        return

    migrated = 0
    for p in positions:
        old_id = p.get("id", str(uuid.uuid4()))
        try:
            uuid.UUID(old_id)
            new_id = old_id
        except ValueError:
            new_id = str(uuid.uuid4())

        old_port = p.get("portfolio_id", "default")
        new_port = port_id_map.get(old_port)

        row = {
            "id": new_id,
            "user_id": first_user,
            "portfolio_id": new_port,
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

    print(f"  Migrated {migrated} positions")


def migrate_holdings(user_id_map: dict, port_id_map: dict):
    holdings = _load_json("holdings.json")
    if not holdings:
        print("  holdings.json empty — skipping")
        return

    first_user = list(user_id_map.values())[0] if user_id_map else None
    if not first_user:
        return

    migrated = 0
    for h in holdings:
        old_id = h.get("id", str(uuid.uuid4()))
        try:
            uuid.UUID(old_id)
            new_id = old_id
        except ValueError:
            new_id = str(uuid.uuid4())

        old_port = h.get("portfolio_id", "default")
        new_port = port_id_map.get(old_port)

        row = {
            "id": new_id,
            "user_id": first_user,
            "portfolio_id": new_port,
            "ticker": h.get("ticker", "SPY"),
            "shares": h.get("shares", 0),
            "avg_cost": h.get("avg_cost"),
            "purchase_date": h.get("purchase_date"),
            "harvest_category": "long_stock",
        }
        sb.table("holdings").upsert(row).execute()
        migrated += 1

    print(f"  Migrated {migrated} holdings")


def migrate_usage_logs(user_id_map: dict):
    db_path = BASE / "harvest.db"
    if not db_path.exists():
        return

    first_user = list(user_id_map.values())[0] if user_id_map else None
    if not first_user:
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM usagelog").fetchall()
    except sqlite3.OperationalError:
        rows = []
    conn.close()

    for row in rows:
        sb.table("usage_logs").upsert({
            "user_id": user_id_map.get(row["user_id"], first_user),
            "action": row["action"],
            "log_date": row["log_date"],
            "count": row["count"],
        }).execute()

    print(f"  Migrated {len(rows)} usage log entries")


if __name__ == "__main__":
    print("Starting Harvest → Supabase migration...")

    print("Migrating users...")
    user_id_map = migrate_users()

    print("Migrating portfolios...")
    port_id_map = migrate_portfolios(user_id_map)

    print("Migrating positions...")
    migrate_positions(user_id_map, port_id_map)

    print("Migrating holdings...")
    migrate_holdings(user_id_map, port_id_map)

    print("Migrating usage logs...")
    migrate_usage_logs(user_id_map)

    print("\nMigration complete.")
    print("Verify data in Supabase dashboard, then remove the JSON files and harvest.db.")
