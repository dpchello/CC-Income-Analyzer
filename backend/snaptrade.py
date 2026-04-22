"""
SnapTrade SDK wrapper for Harvest.

Wraps snaptrade-python-sdk (snaptrade_client) into simple functions that
main.py calls as `st.*`. All responses are normalized to plain dicts/lists
so callers never touch SDK objects directly.

Phase 2 trading stubs are included but raise NotImplementedError until wired.
"""

import os
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

_CLIENT_ID    = os.getenv("SNAPTRADE_CLIENT_ID", "")
_CONSUMER_KEY = os.getenv("SNAPTRADE_CONSUMER_KEY", "")

if not _CLIENT_ID or not _CONSUMER_KEY:
    import warnings
    warnings.warn(
        "SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY not set — "
        "SnapTrade endpoints will fail at runtime."
    )


def _client():
    from snaptrade_client import SnapTrade
    return SnapTrade(client_id=_CLIENT_ID, consumer_key=_CONSUMER_KEY)


def _to_dict(obj) -> dict:
    """Convert SDK response object to plain dict."""
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return {}


def _to_list(obj) -> list:
    """Convert SDK response body to list of plain dicts."""
    if obj is None:
        return []
    if isinstance(obj, list):
        return [_to_dict(item) if not isinstance(item, dict) else item for item in obj]
    body = getattr(obj, "body", obj)
    if isinstance(body, list):
        return [_to_dict(item) if not isinstance(item, dict) else item for item in body]
    return []


# ── User registration ─────────────────────────────────────────────────────────

def register_user(user_id: str) -> dict:
    """Register a Harvest user with SnapTrade. Returns {userId, userSecret}."""
    c = _client()
    resp = c.authentication.register_snap_trade_user(body={"userId": user_id})
    body = getattr(resp, "body", resp)
    if isinstance(body, dict):
        return body
    return _to_dict(body)


# ── Connection portal ─────────────────────────────────────────────────────────

def get_connection_link(
    snaptrade_user_id: str,
    user_secret: str,
    connection_id: Optional[str] = None,
) -> str:
    """
    Return the SnapTrade portal URL to open in an iframe.
    Pass connection_id to reconnect an existing broken authorization.
    """
    c = _client()
    body = {}
    if connection_id:
        body["reconnect"] = connection_id
    resp = c.authentication.login_snap_trade_user(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
        body=body,
    )
    payload = getattr(resp, "body", resp)
    if isinstance(payload, dict):
        return payload.get("redirectURI") or payload.get("redirect_uri", "")
    return getattr(payload, "redirect_uri", "") or getattr(payload, "redirectURI", "")


# ── Connections / authorizations ──────────────────────────────────────────────

def get_connections(snaptrade_user_id: str, user_secret: str) -> list:
    """Return list of broker authorizations for this user."""
    c = _client()
    resp = c.connections.list_broker_authorizations(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
    )
    return _to_list(getattr(resp, "body", resp))


def delete_connection(
    snaptrade_user_id: str,
    user_secret: str,
    connection_id: str,
) -> None:
    """Remove a broker authorization from SnapTrade."""
    c = _client()
    c.connections.remove_broker_authorization(
        authorization_id=connection_id,
        user_id=snaptrade_user_id,
        user_secret=user_secret,
    )


# ── Account data ──────────────────────────────────────────────────────────────

def get_accounts(snaptrade_user_id: str, user_secret: str) -> list:
    """Return list of brokerage accounts."""
    c = _client()
    resp = c.account_information.list_user_accounts(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
    )
    return _to_list(getattr(resp, "body", resp))


def get_positions(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
) -> list:
    """Return raw equity/stock positions for an account."""
    c = _client()
    resp = c.account_information.get_user_account_positions(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
        account_id=account_id,
    )
    return _to_list(getattr(resp, "body", resp))


def get_options_positions(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
) -> list:
    """Return raw options holdings for an account."""
    c = _client()
    resp = c.options.list_option_holdings(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
        account_id=account_id,
    )
    return _to_list(getattr(resp, "body", resp))


def get_balances(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
) -> list:
    """Return cash and account balances."""
    c = _client()
    resp = c.account_information.get_user_account_balance(
        user_id=snaptrade_user_id,
        user_secret=user_secret,
        account_id=account_id,
    )
    body = getattr(resp, "body", resp)
    if isinstance(body, list):
        return [_to_dict(i) if not isinstance(i, dict) else i for i in body]
    if isinstance(body, dict):
        return [body]
    return [_to_dict(body)]


# ── Categorization ────────────────────────────────────────────────────────────

def _unwrap_symbol(raw: dict) -> dict:
    """
    SnapTrade Position structure:
        raw["symbol"]          = outer wrapper  {symbol: <UniversalSymbol>, security_type, ...}
        raw["symbol"]["symbol"] = UniversalSymbol {symbol: "QQQ", type: {code: "et"}, ...}

    OptionsPosition structure (from list_option_holdings):
        raw["symbol"]          = OptionsSymbol   {option_type: "CALL", underlying_symbol: {...}, ...}

    Returns the innermost symbol dict that has a ticker string.
    """
    outer = raw.get("symbol") or {}
    if not isinstance(outer, dict):
        return {}
    inner = outer.get("symbol")
    if isinstance(inner, dict):
        return inner   # UniversalSymbol
    return outer       # OptionsSymbol or flat


def categorize_position(raw: dict) -> str:
    """
    Assign a harvest_category to a raw SnapTrade position or option.
    Returns one of:
        covered_call, long_stock, cash_secured_put, protective_put,
        long_call, crypto, fixed_income, uncategorized
    """
    outer = raw.get("symbol") or {}
    sym   = _unwrap_symbol(raw)

    # security_type lives on the outer wrapper ("et", "cs", "option", etc.)
    security_type = (outer.get("security_type") or "").lower() if isinstance(outer, dict) else ""

    # option_type lives on OptionsSymbol (the outer for option positions)
    opt_type = (outer.get("option_type") or outer.get("optionType") or "").upper()

    # type.code lives on UniversalSymbol (the inner for equity positions)
    type_info = sym.get("type") or {}
    type_code = (type_info.get("code") or "").lower() if isinstance(type_info, dict) else str(type_info).lower()

    currency_info = sym.get("currency") or {}
    currency = (currency_info.get("code") or "").upper() if isinstance(currency_info, dict) else ""

    # Crypto
    if currency in ("BTC", "ETH", "SOL", "USDC", "DOGE") or "crypto" in security_type:
        return "crypto"

    # Fixed income
    if type_code in ("bond", "fi", "mf") or security_type in ("bond", "fixed_income", "mutual_fund"):
        return "fixed_income"

    # Options (from list_option_holdings — outer IS the OptionsSymbol)
    if opt_type in ("CALL", "PUT") or security_type == "option":
        units = _safe_float(raw.get("units") or raw.get("quantity") or 0) or 0
        if opt_type == "CALL":
            return "covered_call" if units < 0 else "long_call"
        if opt_type == "PUT":
            return "cash_secured_put" if units < 0 else "protective_put"
        return "uncategorized"

    # Equity / ETF / stock
    return "long_stock"


# ── Mapping ───────────────────────────────────────────────────────────────────

def _extract_ticker(raw: dict) -> str:
    # _unwrap_symbol digs through the outer wrapper to the UniversalSymbol or OptionsSymbol
    sym = _unwrap_symbol(raw)
    if not sym:
        return ""

    # UniversalSymbol: sym["symbol"] = "QQQ"
    t = sym.get("symbol")
    if t and not isinstance(t, dict):
        return str(t).upper()

    # raw_symbol fallback
    t = sym.get("raw_symbol") or sym.get("rawSymbol")
    if t and not isinstance(t, dict):
        return str(t).upper()

    # OptionsSymbol: underlying_symbol.symbol = "SPY"
    underlying = sym.get("underlying_symbol")
    if isinstance(underlying, dict):
        t = underlying.get("symbol") or underlying.get("raw_symbol") or underlying.get("rawSymbol")
        if t and not isinstance(t, dict):
            return str(t).upper()

    # OCC ticker_symbol as last resort
    return (sym.get("ticker_symbol") or "").upper()


def _safe_float(val) -> Optional[float]:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def map_to_harvest(raw: dict, category: str, default_portfolio_id: str) -> Optional[dict]:
    """
    Convert a raw SnapTrade position dict to a Harvest positions schema dict.
    Returns None if the position cannot be meaningfully mapped.
    """
    ticker = _extract_ticker(raw)
    if not ticker:
        return None

    sym = _unwrap_symbol(raw)
    outer = raw.get("symbol") or {}
    snaptrade_id = raw.get("id") or (sym.get("id") if sym else None)

    # Units: equity = shares, options = contracts
    units = _safe_float(raw.get("units") or raw.get("fractional_units") or raw.get("quantity"))

    # Shares (equity) vs contracts (options)
    shares = units if category == "long_stock" else None
    contracts = max(1, int(abs(units))) if units and category not in ("long_stock",) else None

    # Strike and expiry — live on the OptionsSymbol (the outer wrapper for option positions)
    strike = _safe_float(
        outer.get("strike_price") or outer.get("strikePrice")
        or sym.get("strike_price") or sym.get("strikePrice")
    )
    expiry = (
        outer.get("expiration_date") or outer.get("expirationDate")
        or sym.get("expiration_date") or sym.get("expirationDate")
        or sym.get("expiry_date") or sym.get("expiry")
    )
    if expiry and len(str(expiry)) > 10:
        expiry = str(expiry)[:10]

    # Price / premium
    price      = _safe_float(raw.get("price") or raw.get("average_purchase_price") or raw.get("averagePurchasePrice"))
    avg_cost   = _safe_float(raw.get("average_purchase_price") or raw.get("averagePurchasePrice") or raw.get("price"))

    # Determine position type string from category
    type_map = {
        "covered_call":    "short_call",
        "cash_secured_put": "short_put",
        "protective_put":  "long_put",
        "long_call":       "long_call",
        "long_stock":      "stock",
        "crypto":          "crypto",
        "fixed_income":    "fixed_income",
        "uncategorized":   "uncategorized",
    }
    pos_type = type_map.get(category, "uncategorized")

    return {
        "id":               str(uuid.uuid4()),
        "portfolio_id":     default_portfolio_id,
        "ticker":           ticker,
        "type":             pos_type,
        "shares":           shares,
        "strike":           strike,
        "expiry":           expiry,
        "contracts":        contracts,
        "sell_price":       price if category not in ("long_stock",) else None,
        "avg_cost":         avg_cost if category == "long_stock" else None,
        "premium_collected": _safe_float(raw.get("premium_collected") or raw.get("openPnl")),
        "status":           "open",
        "harvest_category": category,
        "snaptrade_id":     str(snaptrade_id) if snaptrade_id else None,
        "snaptrade_raw":    raw,
    }


# ── Phase 2: Trading stubs ────────────────────────────────────────────────────

def place_order(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
    order: dict,
) -> dict:
    """Phase 2 — place a brokerage order via SnapTrade Trading API."""
    raise NotImplementedError("Trading not yet enabled (Phase 2)")


def get_order_status(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
    order_id: str,
) -> dict:
    """Phase 2 — check status of a previously placed order."""
    raise NotImplementedError("Trading not yet enabled (Phase 2)")


def cancel_order(
    snaptrade_user_id: str,
    user_secret: str,
    account_id: str,
    order_id: str,
) -> dict:
    """Phase 2 — cancel an open order."""
    raise NotImplementedError("Trading not yet enabled (Phase 2)")
