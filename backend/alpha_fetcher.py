"""
AlphaVantage data fetcher.

Budget: 25 calls/day (free tier).
Strategy: disk-cache every response keyed by date. Same-day hits never cost a call.
Endpoints used (5 calls/day max):
  1. NEWS_SENTIMENT  – SPY news with sentiment scores
  2. RSI             – 14-day RSI for SPY
  3. BBANDS          – Bollinger Bands for SPY
  4. TREASURY_YIELD  – 10-year yield
  5. TREASURY_YIELD  – 5-year yield
"""

import json
import time
import requests
from datetime import date, datetime
from pathlib import Path

API_KEY = "93DOFI60YRJ0H7RC"
BASE_URL = "https://www.alphavantage.co/query"

CACHE_DIR = Path(__file__).parent / "av_cache"
USAGE_FILE = Path(__file__).parent / "av_usage.json"
DAILY_LIMIT = 25
SAFE_LIMIT = 20  # stop at 20 to leave buffer

CACHE_DIR.mkdir(exist_ok=True)


# ── Usage tracking ────────────────────────────────────────────────────────────

def _load_usage() -> dict:
    today = date.today().isoformat()
    if USAGE_FILE.exists():
        data = json.loads(USAGE_FILE.read_text())
        if data.get("date") == today:
            return data
    return {"date": today, "calls": 0}


def _save_usage(data: dict):
    USAGE_FILE.write_text(json.dumps(data))


def _increment_usage() -> int:
    data = _load_usage()
    data["calls"] += 1
    _save_usage(data)
    return data["calls"]


def get_usage() -> dict:
    data = _load_usage()
    calls_today = data.get("calls", 0)
    cached = _get_cached_endpoints()
    return {
        "calls_today": calls_today,
        "limit": DAILY_LIMIT,
        "remaining": max(0, DAILY_LIMIT - calls_today),
        "date": data.get("date"),
        "cached_endpoints": cached,
    }


def _get_cached_endpoints() -> list:
    today = date.today().isoformat()
    result = []
    for f in CACHE_DIR.glob(f"{today}_*.json"):
        try:
            mtime = f.stat().st_mtime
            age_hrs = round((time.time() - mtime) / 3600, 1)
            key = f.stem.replace(f"{today}_", "")
            result.append({"key": key, "age_hrs": age_hrs})
        except Exception:
            pass
    return result


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_path(key: str) -> Path:
    today = date.today().isoformat()
    return CACHE_DIR / f"{today}_{key}.json"


def _read_cache(key: str):
    p = _cache_path(key)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return None


def _write_cache(key: str, data):
    _cache_path(key).write_text(json.dumps(data))


# ── API call wrapper ──────────────────────────────────────────────────────────

def _call(params: dict, cache_key: str):
    """Check cache first, then hit API if budget allows."""
    cached = _read_cache(cache_key)
    if cached is not None:
        return cached

    usage = _load_usage()
    if usage["calls"] >= SAFE_LIMIT:
        return {"error": f"Daily API budget reached ({usage['calls']}/{DAILY_LIMIT} calls used)"}

    params["apikey"] = API_KEY
    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        # AlphaVantage returns error notes inside the JSON
        if "Note" in data or "Information" in data:
            return {"error": data.get("Note") or data.get("Information")}
        _increment_usage()
        _write_cache(cache_key, data)
        return data
    except Exception as e:
        return {"error": str(e)}


# ── Public fetchers ───────────────────────────────────────────────────────────

def get_news_sentiment() -> dict:
    """SPY news feed with per-article sentiment scores."""
    return _call(
        {"function": "NEWS_SENTIMENT", "tickers": "SPY", "limit": "20", "sort": "LATEST"},
        "news_sentiment_SPY",
    )


def get_rsi() -> dict:
    """14-day daily RSI for SPY."""
    data = _call(
        {"function": "RSI", "symbol": "SPY", "interval": "daily",
         "time_period": "14", "series_type": "close"},
        "RSI_SPY_14",
    )
    # Return only the latest 5 data points to keep payload small
    series = data.get("Technical Analysis: RSI", {})
    if series:
        recent = dict(list(series.items())[:5])
        return recent
    return data


def get_bbands() -> dict:
    """20-day daily Bollinger Bands for SPY."""
    data = _call(
        {"function": "BBANDS", "symbol": "SPY", "interval": "daily",
         "time_period": "20", "series_type": "close",
         "nbdevup": "2", "nbdevdn": "2"},
        "BBANDS_SPY_20",
    )
    series = data.get("Technical Analysis: BBANDS", {})
    if series:
        recent = dict(list(series.items())[:5])
        return recent
    return data


def get_treasury_yield_10y() -> dict:
    """Daily 10-year US Treasury yield."""
    data = _call(
        {"function": "TREASURY_YIELD", "interval": "daily", "maturity": "10year"},
        "TREASURY_10Y",
    )
    series = data.get("data", [])
    if series:
        return {"latest": series[0], "recent": series[:5]}
    return data


def get_treasury_yield_5y() -> dict:
    """Daily 5-year US Treasury yield."""
    data = _call(
        {"function": "TREASURY_YIELD", "interval": "daily", "maturity": "5year"},
        "TREASURY_5Y",
    )
    series = data.get("data", [])
    if series:
        return {"latest": series[0], "recent": series[:5]}
    return data


def get_all_technicals() -> dict:
    """Bundle RSI + BBANDS into one response (2 API calls total, cached per day)."""
    return {
        "rsi": get_rsi(),
        "bbands": get_bbands(),
    }
