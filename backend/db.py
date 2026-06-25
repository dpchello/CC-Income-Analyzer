"""
Supabase data layer for Harvest.

All queries use the service role key and include explicit user_id filters on
every operation. RLS policies in 001_schema.sql provide defense-in-depth.
"""

import logging
import os
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions

logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).parent / ".env")

_SUPABASE_URL = os.getenv("SUPABASE_URL", "")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if not _SUPABASE_URL or not _SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env. "
        "Create a project at supabase.com and copy the service role key."
    )

def _build_client() -> Client:
    """Construct the service-role Supabase client.

    - postgrest_client_timeout=10: a wedged/stale connection fails in 10s instead
      of hanging up to the 120s httpx default. That 2-minute hang on a stale pool
      was the freeze — every authed request blocked, taking the SPA and the
      AppleScript control app down with it.
    - auto_refresh_token / persist_session disabled: we authenticate with the
      service key, so there's no user session to refresh. Leaving refresh on would
      spawn a background thread on every client build — and we rebuild on recycle.
    """
    return create_client(
        _SUPABASE_URL,
        _SUPABASE_KEY,
        options=SyncClientOptions(
            postgrest_client_timeout=10,
            auto_refresh_token=False,
            persist_session=False,
        ),
    )


sb: Client = _build_client()


def _recreate_client() -> None:
    """Rebuild the client with a fresh connection pool — the in-process equivalent
    of `harvestctl.sh reload`. Stale keep-alive sockets (which throw [Errno 35]
    after long uptime) are discarded along with the old pool, so a wedged backend
    self-heals instead of staying broken until the next restart."""
    global sb
    try:
        sb = _build_client()
        logger.warning("Recreated Supabase client (fresh connection pool)")
    except Exception as exc:  # construction is offline + cheap; failure is unexpected
        logger.error("Failed to recreate Supabase client: %s", exc)


def _is_transient(exc: Exception) -> bool:
    """True for connection-level blips worth retrying: a stale-pool EAGAIN, a
    dropped keep-alive socket, or the 10s timeout firing on a wedged connection."""
    err = str(exc).lower()
    return (
        "resource temporarily unavailable" in err
        or "errno 35" in err
        or "read error" in err
        or "connection reset" in err
        or "connect timeout" in err
        or "read timeout" in err
        or "pool timeout" in err
        or "timed out" in err
        or "server disconnected" in err
        or "connection refused" in err
        or "remote protocol" in err
    )


def _with_retry(fn, retries=3, backoff=0.5):
    """Retry a Supabase read on transient connection errors. After the second
    failure the pool is likely wedged for good, so rebuild the client before the
    remaining attempts rather than retrying against the same dead sockets."""
    last_exc = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as exc:
            if not _is_transient(exc):
                raise
            last_exc = exc
            wait = backoff * (2 ** attempt)
            logger.warning("Supabase transient error (attempt %d/%d), retrying in %.1fs: %s",
                           attempt + 1, retries, wait, exc)
            time.sleep(wait)
            if attempt >= 1:
                _recreate_client()
    raise last_exc


def warm_connection():
    """Fire a cheap query to warm the Supabase HTTP pool on startup."""
    try:
        sb.table("users").select("id").limit(1).execute()
    except Exception:
        pass  # best-effort; the retry wrapper handles real failures


# ── Users ─────────────────────────────────────────────────────────────────────

def get_user_by_id(user_id: str) -> Optional[dict]:
    r = _with_retry(lambda: sb.table("users").select("*").eq("id", user_id).limit(1).execute())
    return r.data[0] if r.data else None

def get_user_by_email(email: str) -> Optional[dict]:
    r = _with_retry(lambda: sb.table("users").select("*").eq("email", email).limit(1).execute())
    return r.data[0] if r.data else None

def create_user(email: str, hashed_password: str) -> dict:
    r = sb.table("users").insert({
        "email": email,
        "hashed_password": hashed_password,
        "tier": "free",
        "is_active": True,
    }).execute()
    return r.data[0]

def update_user(user_id: str, updates: dict) -> dict:
    r = sb.table("users").update(updates).eq("id", user_id).execute()
    return r.data[0]


# ── Usage logs (screener gate) ─────────────────────────────────────────────────

def get_usage(user_id: str, action: str, log_date: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("usage_logs")
           .select("*")
           .eq("user_id", user_id)
           .eq("action", action)
           .eq("log_date", log_date)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def increment_usage(user_id: str, action: str, log_date: str) -> dict:
    existing = get_usage(user_id, action, log_date)
    if existing:
        r = (sb.table("usage_logs")
               .update({"count": existing["count"] + 1})
               .eq("id", existing["id"])
               .execute())
    else:
        r = sb.table("usage_logs").insert({
            "user_id": user_id,
            "action": action,
            "log_date": log_date,
            "count": 1,
        }).execute()
    return r.data[0]


# ── Portfolios ────────────────────────────────────────────────────────────────

def get_portfolios(user_id: str) -> list:
    r = _with_retry(lambda: (
        sb.table("portfolios")
          .select("*")
          .eq("user_id", user_id)
          .order("created_date")
          .execute()
    ))
    return r.data or []

def get_portfolio(user_id: str, portfolio_id: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("portfolios")
           .select("*")
           .eq("user_id", user_id)
           .eq("id", portfolio_id)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def create_portfolio(user_id: str, name: str) -> dict:
    r = sb.table("portfolios").insert({
        "user_id": user_id,
        "name": name,
        "created_date": date.today().isoformat(),
        "archived": False,
    }).execute()
    return r.data[0]

def update_portfolio(user_id: str, portfolio_id: str, updates: dict) -> dict:
    r = (sb.table("portfolios")
           .update(updates)
           .eq("user_id", user_id)
           .eq("id", portfolio_id)
           .execute())
    if not r.data:
        return None
    return r.data[0]

def delete_portfolio(user_id: str, portfolio_id: str) -> None:
    sb.table("portfolios").delete().eq("user_id", user_id).eq("id", portfolio_id).execute()

def ensure_default_portfolio(user_id: str) -> dict:
    portfolios = get_portfolios(user_id)
    default = next((p for p in portfolios if p["name"] == "Default"), None)
    if not default:
        default = create_portfolio(user_id, "Default")
    return default

def ensure_brokerage_portfolio(
    user_id: str,
    connection_id: str,
    brokerage_name: str,
    account_id: str,
    account_name: str,
) -> dict:
    """Find or create a portfolio scoped to a specific SnapTrade account."""
    r = (sb.table("portfolios")
           .select("*")
           .eq("user_id", user_id)
           .eq("snaptrade_account_id", account_id)
           .limit(1)
           .execute())
    if r.data:
        return r.data[0]
    name = account_name.strip() if account_name and account_name.strip() else account_id[:12]
    r = sb.table("portfolios").insert({
        "user_id":                  user_id,
        "name":                     name,
        "created_date":             date.today().isoformat(),
        "archived":                 False,
        "brokerage_connection_id":  connection_id,
        "snaptrade_account_id":     account_id,
        "brokerage_name":           brokerage_name,
    }).execute()
    return r.data[0]

def star_portfolio(user_id: str, portfolio_id: str, starred: bool) -> Optional[dict]:
    r = (sb.table("portfolios")
           .update({"starred": starred})
           .eq("user_id", user_id)
           .eq("id", portfolio_id)
           .execute())
    return r.data[0] if r.data else None


# ── Positions ─────────────────────────────────────────────────────────────────

def get_positions(user_id: str, portfolio_id: Optional[str] = None) -> list:
    def _query():
        q = sb.table("positions").select("*").eq("user_id", user_id)
        if portfolio_id:
            q = q.eq("portfolio_id", portfolio_id)
        return q.order("created_at").execute()
    r = _with_retry(_query)
    return r.data or []

def get_position(user_id: str, position_id: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("positions")
           .select("*")
           .eq("user_id", user_id)
           .eq("id", position_id)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def create_position(user_id: str, position: dict) -> dict:
    position["user_id"] = user_id
    position.setdefault("id", str(uuid.uuid4()))
    r = sb.table("positions").insert(position).execute()
    return r.data[0]

def update_position(user_id: str, position_id: str, updates: dict) -> Optional[dict]:
    r = (sb.table("positions")
           .update(updates)
           .eq("user_id", user_id)
           .eq("id", position_id)
           .execute())
    if not r.data:
        return None
    return r.data[0]

def delete_position(user_id: str, position_id: str) -> None:
    sb.table("positions").delete().eq("user_id", user_id).eq("id", position_id).execute()

def get_open_positions(user_id: str) -> list:
    r = _with_retry(lambda: (sb.table("positions")
           .select("*")
           .eq("user_id", user_id)
           .eq("status", "open")
           .execute()))
    return r.data or []


# ── Holdings ──────────────────────────────────────────────────────────────────

def get_holdings(user_id: str, portfolio_id: Optional[str] = None) -> list:
    def _query():
        q = sb.table("holdings").select("*").eq("user_id", user_id)
        if portfolio_id:
            q = q.eq("portfolio_id", portfolio_id)
        return q.order("created_at").execute()
    r = _with_retry(_query)
    return r.data or []

def get_holding(user_id: str, holding_id: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("holdings")
           .select("*")
           .eq("user_id", user_id)
           .eq("id", holding_id)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def create_holding(user_id: str, holding: dict) -> dict:
    holding["user_id"] = user_id
    holding.setdefault("id", str(uuid.uuid4()))
    r = sb.table("holdings").insert(holding).execute()
    return r.data[0]

def update_holding(user_id: str, holding_id: str, updates: dict) -> Optional[dict]:
    r = (sb.table("holdings")
           .update(updates)
           .eq("user_id", user_id)
           .eq("id", holding_id)
           .execute())
    if not r.data:
        return None
    return r.data[0]

def delete_holding(user_id: str, holding_id: str) -> None:
    sb.table("holdings").delete().eq("user_id", user_id).eq("id", holding_id).execute()

def get_holding_by_snaptrade(user_id: str, snaptrade_id: str, snaptrade_account_id: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("holdings")
           .select("*")
           .eq("user_id", user_id)
           .eq("snaptrade_id", snaptrade_id)
           .eq("snaptrade_account_id", snaptrade_account_id)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def upsert_holding(user_id: str, holding: dict) -> tuple:
    """Insert or update a holding by (snaptrade_id, snaptrade_account_id). Returns (record, created)."""
    snaptrade_id  = holding.get("snaptrade_id")
    account_id    = holding.get("snaptrade_account_id")
    existing = get_holding_by_snaptrade(user_id, snaptrade_id, account_id) if snaptrade_id and account_id else None
    if existing:
        updates = {k: v for k, v in holding.items() if k not in ("id", "user_id", "created_at")}
        r = sb.table("holdings").update(updates).eq("id", existing["id"]).execute()
        return r.data[0], False
    holding["user_id"] = user_id
    r = sb.table("holdings").insert(holding).execute()
    return r.data[0], True


# ── Assignment events ─────────────────────────────────────────────────────────

def get_assignment_events(user_id: str, portfolio_id: Optional[str] = None) -> list:
    def _query():
        q = sb.table("assignment_events").select("*").eq("user_id", user_id)
        if portfolio_id:
            q = q.eq("portfolio_id", portfolio_id)
        return q.order("assignment_date", desc=True).execute()
    r = _with_retry(_query)
    return r.data or []

def create_assignment_event(user_id: str, event: dict) -> dict:
    event["user_id"] = user_id
    event.setdefault("id", str(uuid.uuid4()))
    r = sb.table("assignment_events").insert(event).execute()
    return r.data[0]


# ── SnapTrade credentials ─────────────────────────────────────────────────────

def get_snaptrade_credentials(user_id: str) -> Optional[dict]:
    r = _with_retry(lambda: (sb.table("snaptrade_credentials")
           .select("*")
           .eq("user_id", user_id)
           .limit(1)
           .execute()))
    return r.data[0] if r.data else None

def upsert_snaptrade_credentials(user_id: str, snaptrade_user_id: str, user_secret: str) -> dict:
    existing = get_snaptrade_credentials(user_id)
    if existing:
        r = (sb.table("snaptrade_credentials")
               .update({"snaptrade_user_id": snaptrade_user_id, "user_secret": user_secret})
               .eq("user_id", user_id)
               .execute())
    else:
        r = sb.table("snaptrade_credentials").insert({
            "user_id": user_id,
            "snaptrade_user_id": snaptrade_user_id,
            "user_secret": user_secret,
        }).execute()
    return r.data[0]


# ── SnapTrade connections ─────────────────────────────────────────────────────

def get_snaptrade_connections(user_id: str) -> list:
    r = _with_retry(lambda: (sb.table("snaptrade_connections")
           .select("*")
           .eq("user_id", user_id)
           .order("created_at")
           .execute()))
    return r.data or []

def upsert_snaptrade_connection(user_id: str, connection: dict) -> dict:
    connection["user_id"] = user_id
    r = (sb.table("snaptrade_connections")
           .upsert(connection, on_conflict="user_id,connection_id")
           .execute())
    return r.data[0]

def delete_snaptrade_connection(user_id: str, connection_id: str) -> None:
    (sb.table("snaptrade_connections")
       .delete()
       .eq("user_id", user_id)
       .eq("connection_id", connection_id)
       .execute())


# ── SnapTrade raw imports ─────────────────────────────────────────────────────

def save_raw_import(user_id: str, account_id: str, raw_json: dict) -> dict:
    from datetime import datetime
    r = sb.table("snaptrade_raw_imports").insert({
        "user_id": user_id,
        "account_id": account_id,
        "fetched_at": datetime.utcnow().isoformat(),
        "raw_json": raw_json,
    }).execute()
    return r.data[0]

def get_raw_imports(user_id: str) -> list:
    r = _with_retry(lambda: (sb.table("snaptrade_raw_imports")
           .select("account_id, fetched_at")
           .eq("user_id", user_id)
           .order("fetched_at", desc=True)
           .execute()))
    return r.data or []
