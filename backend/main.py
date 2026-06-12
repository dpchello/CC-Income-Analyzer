import json
import math
import os
import uuid
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from data_fetcher import DataFetcher
from signals import SignalEngine
import alpha_fetcher as av
import oi_tracker
import position_marks
import rec_logger
import macro_calendar
import feedback_log
import db
import auth as auth_module
from auth import User
import backtest as backtest_module
from rate_limit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import hmac

app = FastAPI(title="Harvest")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth_module.router)

_DEFAULT_DEV_ORIGINS = "http://localhost:5173,http://localhost:3001,http://127.0.0.1:5173,http://127.0.0.1:3001"
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _DEFAULT_DEV_ORIGINS).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warmup():
    """Warm the Supabase HTTP pool so the first real request isn't the cold one."""
    db.warm_connection()


@app.middleware("http")
async def daily_snapshot_guard(request, call_next):
    """Self-healing: first request of each day kicks the OI snapshot in the
    background if the OS-level cron didn't fire. No-op the rest of the day."""
    try:
        oi_tracker.maybe_run_daily_snapshot()
    except Exception as e:  # never let the guard break a request
        print(f"[snapshot-guard] middleware error: {e}")
    return await call_next(request)

# ── Freemium gate ─────────────────────────────────────────────────────────────
# Free users have full access until their cumulative closed-position profit
# exceeds PROFIT_GATE_THRESHOLD. After that the app becomes read-only.

PROFIT_GATE_THRESHOLD = 1000.0

def get_cumulative_profit(user_id: str) -> float:
    positions = db.get_positions(user_id)
    return sum(
        p.get("final_pnl") or 0
        for p in positions
        if p.get("status") == "closed" and (p.get("final_pnl") or 0) > 0
    )

def check_write_access(current_user: User = Depends(auth_module.get_current_user)) -> User:
    """Dependency for mutating endpoints — blocks gated free users."""
    if current_user.tier == "pro":
        return current_user
    profit = get_cumulative_profit(current_user.id)
    if profit >= PROFIT_GATE_THRESHOLD:
        raise HTTPException(
            status_code=403,
            detail={"code": "PROFIT_GATE_REACHED", "profit": round(profit, 2)},
        )
    return current_user

fetcher = DataFetcher()
engine  = SignalEngine()


# ── App version ───────────────────────────────────────────────────────────────
# Source of truth is the repo-root VERSION file. STARTED_AT doubles as the
# last-deploy timestamp: the self-host upgrade reloads this process, so a fresh
# started_at confirms the new build is actually live.
_REPO_ROOT = Path(__file__).resolve().parent.parent


def _read_app_version() -> str:
    try:
        return (_REPO_ROOT / "VERSION").read_text().strip()
    except OSError:
        return "unknown"


def _read_git_sha() -> Optional[str]:
    try:
        import subprocess
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(_REPO_ROOT), stderr=subprocess.DEVNULL, timeout=2,
        ).decode().strip()
    except Exception:
        return None


APP_VERSION = _read_app_version()
GIT_SHA     = _read_git_sha()
STARTED_AT  = datetime.now().astimezone().isoformat()


@app.get("/api/version")
def get_version():
    """What build is live. Curl this after a deploy to confirm the reload took.
    started_at changes on every (re)start, so the app polls it to confirm a
    restart actually took effect."""
    return {"version": APP_VERSION, "git_sha": GIT_SHA, "started_at": STARTED_AT}


@app.post("/api/system/restart")
def restart_backend(current_user: User = Depends(auth_module.get_current_user)):
    """Restart the backend so it loads the latest code — the in-app equivalent of
    `harvestctl.sh reload`, callable from Settings.

    Re-execs this process after the response flushes: same PID and same launch
    flags (so `--reload` is preserved if it was on). Re-exec is atomic — if it
    fails, the server keeps running rather than being left down (unlike a
    stop-then-start, which can fail between the two). The triggering request's
    connection drops as the image is replaced; the client polls /api/version and
    watches started_at change to confirm the new process is live.
    """
    import sys
    import time
    import threading

    backend_dir = str(Path(__file__).resolve().parent)

    def _reexec():
        time.sleep(0.6)  # let this HTTP response reach the client before we vanish
        try:
            os.chdir(backend_dir)  # main:app + .env resolve relative to backend/
            args = [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]
            if "--reload" in sys.argv:
                args.append("--reload")  # preserve dev auto-reload mode if it was on
            os.execv(sys.executable, args)
        except Exception as exc:  # never leave the box down silently
            print(f"[restart] re-exec failed, server still up: {exc}")

    threading.Thread(target=_reexec, daemon=True).start()
    return {"ok": True, "message": "Backend restarting…", "was_started_at": STARTED_AT}


# ── Nightly upgrade agent toggle ────────────────────────────────────────────
# The nightly self-upgrade agent (scripts/nightly-upgrade.sh, run by cron at 1AM)
# reads this flag before doing any work and exits early if it is "off". These
# endpoints are the in-app switch — same maintainer control surface as Restart.
NIGHTLY_AGENT_FLAG = Path(__file__).resolve().parent.parent / ".nightly-agent.enabled"


class NightlyAgentIn(BaseModel):
    enabled: bool


def _nightly_agent_enabled() -> bool:
    try:
        return NIGHTLY_AGENT_FLAG.read_text().strip().lower() != "off"
    except FileNotFoundError:
        return True  # absence means "not disabled" — default on
    except Exception:
        return True


@app.get("/api/system/nightly-agent")
def get_nightly_agent(current_user: User = Depends(auth_module.get_current_user)):
    """Whether the 1AM nightly upgrade agent is enabled — reads the flag file that
    scripts/nightly-upgrade.sh checks before each run."""
    return {"enabled": _nightly_agent_enabled()}


@app.post("/api/system/nightly-agent")
def set_nightly_agent(body: NightlyAgentIn,
                      current_user: User = Depends(auth_module.get_current_user)):
    """Turn the nightly upgrade agent on or off. Writes the flag the cron job
    reads — effective on the next 1AM run; does not interrupt a run in progress."""
    NIGHTLY_AGENT_FLAG.write_text("on" if body.enabled else "off")
    return {"enabled": body.enabled}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dte(expiry_str: str) -> int:
    return (datetime.strptime(expiry_str, "%Y-%m-%d").date() - date.today()).days


# ── Strategy presets ──────────────────────────────────────────────────────────
# Each preset governs filter thresholds, DTE window, scoring weights, thesis
# template, and tag derivation rules for the recommendations engine.
#
# IV NOTE (v1): minIvr is compared against the raw at-the-money IV% from the
# options chain (impliedVolatility * 100), not a historical IV rank, because
# individual stock IV history is not available without a paid data source.

STRATEGY_PRESETS: dict = {
    "available": {
        "id": "available", "label": "My Available Shares",
        "hint": "Everything you can write today",
        "filt": {"maxDelta": 0.40, "minIvr": 0.0, "minYield": 0.0},
        "dte_window": [21, 45],
        "weights": {"signal": 25, "yield": 30, "delta": 20, "dte": 25},
        "portfolio_scoped_only": True,
        "thesis_tpl": (
            "You have {total_contracts} contract{s_total} total, {written_contracts} already written. "
            "Current IV is {iv_context} at {iv_pct:.0f}%. "
            "These {free_contracts} remaining contract{s_free} could earn ${premium_total:.0f} before {expiry_short} — "
            "conditions are {condition_context} right now."
        ),
    },
    "wheel": {
        "id": "wheel", "label": "Wheel starters",
        "hint": "Low risk, 30-delta ceiling — IV/yield filters dropped to capture calm-market winners (PIPE-REC-09 hypothesis test, 2026-04-25)",
        "filt": {"maxDelta": 0.32, "minIvr": 0.0, "minYield": 0.0},
        "dte_window": [21, 45],
        "weights": {"signal": 25, "yield": 30, "delta": 20, "dte": 25},
        "thesis_tpl": (
            "{ticker} IV is {iv_context} at {iv_pct:.0f}%. "
            "The ${strike} strike is {distance_pct:.1f}% above the current price with {dte} days until expiry, "
            "giving you time to collect ${premium_per_contract:.0f}/contract."
        ),
    },
    "income": {
        "id": "income", "label": "High-IV income",
        "hint": "Aggressive yield, 40-delta",
        "filt": {"maxDelta": 0.40, "minIvr": 40.0, "minYield": 22.0},
        "dte_window": [14, 35],
        "weights": {"signal": 15, "yield": 40, "delta": 15, "dte": 30},
        "thesis_tpl": (
            "{ticker} IV is elevated at {iv_pct:.0f}% — above the {minIvr:.0f}% floor for this strategy. "
            "The ${strike} strike with {dte} days collects ${premium_per_contract:.0f}/contract, "
            "{annYield:.0f}% annualized. Theta decay is accelerating."
        ),
    },
    "safe": {
        "id": "safe", "label": "Low-delta conservative",
        "hint": "Capital preservation first",
        "filt": {"maxDelta": 0.25, "minIvr": 10.0, "minYield": 8.0},
        "dte_window": [30, 60],
        "weights": {"signal": 30, "yield": 20, "delta": 30, "dte": 20},
        "thesis_tpl": (
            "{ticker} is in a {trend_context} trend with IV at {iv_pct:.0f}%. "
            "The ${strike} strike at delta {delta:.2f} gives a {distance_pct:.1f}% buffer above spot. "
            "{dte} days to expiry collects ${premium_per_contract:.0f}/contract with lower assignment risk."
        ),
    },
    "watch": {
        "id": "watch", "label": "From my watchlist",
        "hint": "Watchlist ideas — IV ceiling at 15% to match calm-market winning band (PIPE-REC-09 hypothesis test, 2026-04-25)",
        "filt": {"maxDelta": 0.40, "minIvr": 0.0, "maxIvr": 15.0, "minYield": 0.0},
        "dte_window": [21, 45],
        "weights": {"signal": 25, "yield": 25, "delta": 20, "dte": 30},
        "thesis_tpl": (
            "{ticker} (watchlist) shows IV at {iv_pct:.0f}%. "
            "The ${strike} strike collects ${premium_per_contract:.0f}/contract over {dte} days — "
            "{annYield:.0f}% annualized."
        ),
    },
    "conservative": {
        "id": "conservative", "label": "Conservative",
        "hint": "Calm-market 30-delta · IV ≤ 15% · 28-42 DTE",
        "filt": {"maxDelta": 0.30, "minIvr": 0.0, "maxIvr": 15.0, "minYield": 0.0},
        "dte_window": [28, 42],
        "weights": {"signal": 25, "yield": 30, "delta": 20, "dte": 25},
        "thesis_tpl": (
            "{ticker} IV at {iv_pct:.0f}% (calm). "
            "The ${strike} strike with {dte} days collects ${premium_per_contract:.0f}/contract "
            "({annYield:.0f}% annualized, delta {delta:.2f})."
        ),
    },
}


def _dte_score(dte: int, dte_window: List[int]) -> float:
    """Returns 0–1: peaks at midpoint of dte_window, tapers to 0 at edges."""
    lo, hi = dte_window
    if dte < lo or dte > hi:
        return 0.0
    mid = (lo + hi) / 2.0
    half = mid - lo
    if half <= 0:
        return 1.0
    return (dte - lo) / half if dte <= mid else (hi - dte) / (hi - mid)


def _build_thesis(strategy_id: str, metrics: dict) -> str:
    """Fill the strategy thesis template with computed metrics."""
    preset = STRATEGY_PRESETS.get(strategy_id, STRATEGY_PRESETS["conservative"])
    iv_raw = metrics.get("iv", 0) or 0
    iv_pct = iv_raw * 100
    iv_context = "elevated" if iv_pct >= 40 else "moderate" if iv_pct >= 20 else "low"
    trend_context = "bullish" if metrics.get("above_ma50") else "neutral"
    total_contracts   = metrics.get("total_contracts", 0)
    written_contracts = metrics.get("written_contracts", 0)
    free_contracts    = metrics.get("free_contracts", 0)
    composite_score   = metrics.get("composite_score", 0)
    condition_context = "ideal" if composite_score >= 80 else "decent" if composite_score >= 60 else "suboptimal"
    try:
        return preset["thesis_tpl"].format(
            ticker=metrics.get("ticker", ""),
            strike=metrics.get("strike", 0),
            distance_pct=metrics.get("distance_pct", 0),
            dte=metrics.get("dte", 0),
            premium_per_contract=metrics.get("premium_per_contract", 0),
            premium_total=metrics.get("premium_total", 0),
            annYield=metrics.get("annYield", 0),
            delta=metrics.get("delta", 0),
            iv_pct=iv_pct,
            iv_context=iv_context,
            trend_context=trend_context,
            minIvr=preset["filt"]["minIvr"],
            total_contracts=total_contracts,
            written_contracts=written_contracts,
            free_contracts=free_contracts,
            s_total="" if total_contracts == 1 else "s",
            s_free="" if free_contracts == 1 else "s",
            expiry_short=metrics.get("expiry_short", "expiry"),
            condition_context=condition_context,
        )
    except (KeyError, ValueError):
        return f"{metrics.get('ticker', '')} — {preset['hint']}"


def _derive_tags(ticker_metrics: dict, strategy: dict) -> List[str]:
    """Derive recommendation tags from computed ticker metrics."""
    tags: List[str] = []
    iv_pct = (ticker_metrics.get("iv") or 0) * 100
    if iv_pct > 60:
        tags.append("HIGH IV")
    written = ticker_metrics.get("written_contracts", 0)
    total   = ticker_metrics.get("total_contracts", 0)
    if total > 0 and written > 0:
        tags.append(f"{written}/{total} WRITTEN")
    expiry = ticker_metrics.get("expiry", "")
    earnings_date = ticker_metrics.get("earnings_date")
    if earnings_date and expiry and earnings_date > expiry:
        tags.append("EARNINGS BUFFER")
    high_52w = ticker_metrics.get("fifty_two_week_high")
    strike = ticker_metrics.get("strike") or 0
    if high_52w and high_52w > 0 and abs(strike - high_52w) / high_52w <= 0.03:
        tags.append("NEAR RESISTANCE")
    if ticker_metrics.get("above_ma50"):
        tags.append("STRONG TREND")
    dte = ticker_metrics.get("dte") or 0
    if 14 <= dte <= 28:
        tags.append("PEAK DECAY WINDOW")
    days_since_earnings = ticker_metrics.get("days_since_earnings")
    if days_since_earnings is not None and days_since_earnings <= 10:
        tags.append("POST-EARNINGS")
    return tags


def _roll_score(net_credit: float, new_time_prem: float, new_intrinsic: float, dte: int) -> float:
    s_time_prem   = min(new_time_prem / 3.0, 1.0) * 40
    s_credit_norm = (min(max(net_credit, -5.0), 3.0) + 5.0) / 8.0 * 30
    s_intrinsic   = max(0.0, 1.0 - new_intrinsic / 10.0) * 20
    if 28 <= dte <= 50:
        s_dte = 10.0
    elif dte < 28:
        s_dte = (dte / 28) * 10
    else:
        s_dte = max(0.0, (1 - (dte - 50) / 30.0) * 10)
    return round(s_time_prem + s_credit_norm + s_intrinsic + s_dte, 1)

def _portfolio_stats(portfolio_id: str, positions: list, spy_price: float, all_holdings: list) -> dict:
    mine      = [p for p in positions if p.get("portfolio_id") == portfolio_id]
    open_pos  = [p for p in mine if p.get("status") == "open"]
    closed_pos = [p for p in mine if p.get("status") == "closed"]
    total_premium = sum(p.get("premium_collected", 0) for p in open_pos)
    unrealized_pnl = 0.0
    for p in open_pos:
        try:
            cur = fetcher.get_option_price(p["expiry"], p["strike"], "call")
            unrealized_pnl += (p["sell_price"] - cur) * p["contracts"] * 100
        except Exception:
            pass
    wins = sum(1 for p in closed_pos if p.get("final_pnl", 0) > 0)
    holdings = [h for h in all_holdings if h.get("portfolio_id") == portfolio_id]
    total_shares   = sum(h["shares"] for h in holdings)
    covered_shares = sum(p["contracts"] * 100 for p in open_pos)
    coverage_pct   = round(covered_shares / total_shares * 100, 1) if total_shares else None
    return {
        "open_count":               len(open_pos),
        "closed_count":             len(closed_pos),
        "total_premium_collected":  round(total_premium, 2),
        "unrealized_pnl":           round(unrealized_pnl, 2),
        "win_count":                wins,
        "total_shares":             total_shares,
        "covered_shares":           covered_shares,
        "coverage_pct":             coverage_pct,
    }


# ── Pydantic models ───────────────────────────────────────────────────────────

class PortfolioIn(BaseModel):
    name: str

class PositionIn(BaseModel):
    ticker: str = "SPY"
    type: str = "short_call"
    strike: float
    expiry: str
    contracts: int = 6
    sell_price: float
    premium_collected: Optional[float] = None
    open_date: Optional[str] = None
    status: str = "open"
    portfolio_id: Optional[str] = None
    notes: Optional[str] = None

class PositionUpdate(BaseModel):
    status: Optional[str] = None
    close_price: Optional[float] = None
    close_date: Optional[str] = None
    contracts: Optional[int] = None
    sell_price: Optional[float] = None
    notes: Optional[str] = None

class PositionMove(BaseModel):
    portfolio_id: str

class PartialCloseIn(BaseModel):
    contracts_to_close: int
    close_price: float
    close_date: Optional[str] = None

class HoldingIn(BaseModel):
    portfolio_id: str
    ticker: str = "SPY"
    shares: int
    avg_cost: float
    purchase_date: Optional[str] = None

class HoldingUpdate(BaseModel):
    shares: Optional[int] = None
    avg_cost: Optional[float] = None


# ── Gate status endpoint ──────────────────────────────────────────────────────

@app.get("/api/user/gate-status")
def user_gate_status(current_user: User = Depends(auth_module.get_current_user)):
    if current_user.tier == "pro":
        return {"gated": False, "cumulative_profit": 0.0, "threshold": PROFIT_GATE_THRESHOLD}
    profit = get_cumulative_profit(current_user.id)
    return {
        "gated": profit >= PROFIT_GATE_THRESHOLD,
        "cumulative_profit": round(profit, 2),
        "threshold": PROFIT_GATE_THRESHOLD,
    }

@app.get("/api/strategies")
def get_strategies():
    return list(STRATEGY_PRESETS.values())


# ── Backtest endpoint (PIPE-REC-09) ───────────────────────────────────────────
#
# Returns historical-success metrics for a strategy on a single ticker. Uses
# real DuckDB option chains for premiums + Greeks, dual-track results
# (unconditional vs regime-gated), and 24h cache.
# Pro-tier — backtest is a credibility-builder for the upgrade narrative.

BACKTEST_MAX_LOOKBACK_DAYS = 1825  # 5y hard cap to bound endpoint latency
BACKTEST_DEFAULT_LOOKBACK = 730    # 2y default per spec

@app.get("/api/backtest")
def get_backtest(
    strategy: str = Query(..., min_length=2, max_length=32),
    ticker: str = Query("SPY", min_length=1, max_length=8),
    lookback: int = Query(BACKTEST_DEFAULT_LOOKBACK, ge=90, le=BACKTEST_MAX_LOOKBACK_DAYS),
    cadence: str = Query("both", pattern="^(unconditional|regime_gated|both)$"),
    share_count: int = Query(100, ge=100, le=1_000_000),  # PIPE-REC-13
    current_user: User = Depends(auth_module.get_current_user),
):
    if current_user.tier != "pro":
        raise HTTPException(
            status_code=402,
            detail={"code": "PRO_FEATURE", "message": "Strategy backtests are a Pro feature."},
        )
    if strategy not in STRATEGY_PRESETS:
        raise HTTPException(status_code=400, detail=f"unknown strategy: {strategy}")
    ticker_u = ticker.upper()
    try:
        return backtest_module.get_or_run(
            ticker=ticker_u, strategy_id=strategy,
            lookback_days=lookback, cadence=cadence,
            share_count=share_count,
        )
    except ValueError as e:
        # Coverage missing or invalid params
        raise HTTPException(status_code=422, detail=str(e))


# ── Portfolio endpoints ───────────────────────────────────────────────────────

@app.get("/api/portfolios")
def get_portfolios(current_user: User = Depends(auth_module.get_current_user)):
    db.ensure_default_portfolio(current_user.id)
    portfolios   = db.get_portfolios(current_user.id)
    positions    = db.get_positions(current_user.id)
    all_holdings = db.get_holdings(current_user.id)
    spy_price    = fetcher.get_spy_price().get("price", 0)
    result = []
    for p in portfolios:
        row = dict(p)
        row["stats"] = _portfolio_stats(p["id"], positions, spy_price, all_holdings)
        result.append(row)
    return result

@app.post("/api/portfolios")
def create_portfolio(body: PortfolioIn, current_user: User = Depends(check_write_access)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Portfolio name cannot be empty")
    existing = db.get_portfolios(current_user.id)
    if any(p["name"].lower() == name.lower() for p in existing):
        raise HTTPException(status_code=400, detail=f"Portfolio '{name}' already exists")
    return db.create_portfolio(current_user.id, name)

@app.delete("/api/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: str, current_user: User = Depends(check_write_access)):
    portfolio = db.get_portfolio(current_user.id, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    portfolios = db.get_portfolios(current_user.id)
    if portfolio["name"] == "Default" and len(portfolios) == 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only portfolio")
    positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)
    open_count = sum(1 for p in positions if p.get("status") == "open")
    if open_count > 0:
        raise HTTPException(status_code=409, detail=f"Portfolio has {open_count} open position(s). Close or move them first.")
    default = db.ensure_default_portfolio(current_user.id)
    # Reassign closed positions to default
    closed = [p for p in positions if p.get("status") == "closed"]
    for pos in closed:
        db.update_position(current_user.id, pos["id"], {"portfolio_id": default["id"]})
    db.delete_portfolio(current_user.id, portfolio_id)
    return {"ok": True}

@app.put("/api/portfolios/{portfolio_id}/archive")
def archive_portfolio(portfolio_id: str, current_user: User = Depends(check_write_access)):
    portfolio = db.get_portfolio(current_user.id, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if portfolio["name"] == "Default":
        raise HTTPException(status_code=400, detail="Cannot archive the Default portfolio")
    positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)
    open_count = sum(1 for p in positions if p.get("status") == "open")
    if open_count > 0:
        raise HTTPException(status_code=409, detail=f"Portfolio has {open_count} open position(s). Close or move them first.")
    return db.update_portfolio(current_user.id, portfolio_id, {"archived": True})

@app.put("/api/portfolios/{portfolio_id}/unarchive")
def unarchive_portfolio(portfolio_id: str, current_user: User = Depends(check_write_access)):
    if not db.get_portfolio(current_user.id, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return db.update_portfolio(current_user.id, portfolio_id, {"archived": False})

@app.put("/api/portfolios/{portfolio_id}/rename")
def rename_portfolio(portfolio_id: str, body: PortfolioIn, current_user: User = Depends(check_write_access)):
    if not db.get_portfolio(current_user.id, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    name = body.name.strip()
    existing = db.get_portfolios(current_user.id)
    if any(p["name"].lower() == name.lower() and p["id"] != portfolio_id for p in existing):
        raise HTTPException(status_code=400, detail=f"Portfolio '{name}' already exists")
    return db.update_portfolio(current_user.id, portfolio_id, {"name": name})

class StarIn(BaseModel):
    starred: bool

@app.put("/api/portfolios/{portfolio_id}/star")
def star_portfolio(portfolio_id: str, body: StarIn, current_user: User = Depends(check_write_access)):
    result = db.star_portfolio(current_user.id, portfolio_id, body.starred)
    if not result:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return result


# ── Position endpoints ────────────────────────────────────────────────────────

@app.get("/api/positions")
def get_positions(
    portfolio_id: Optional[str] = Query(None),
    current_user: User = Depends(auth_module.get_current_user),
):
    positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)

    # ── Free-tier 3-position hard cap (PIPE-029) ──────────────────────────
    FREE_POSITION_CAP = 3
    if current_user.tier != "pro":
        open_positions = [p for p in positions if p.get("status") == "open"]
        closed_positions = [p for p in positions if p.get("status") != "open"]
        positions = open_positions[:FREE_POSITION_CAP] + closed_positions

    spy_data  = fetcher.get_spy_price()
    spy_price = spy_data.get("price", 0)
    spy_change = spy_data.get("change", 0)

    div_data          = fetcher.get_spy_dividends()
    upcoming_dividend = div_data.get("next_div_amount") or 0.0
    days_until_ex_div = div_data.get("days_until_ex_div")
    next_ex_div_date  = div_data.get("next_ex_div_date")

    upcoming_events = macro_calendar.get_upcoming_events(within_days=7)
    try:
        news_articles = av.get_news_sentiment().get("feed", []) or []
    except Exception:
        news_articles = []
    news_uncertainty = macro_calendar.detect_news_uncertainty(news_articles)

    enriched = []
    for pos in positions:
        p = dict(pos)
        p["dte"] = _dte(pos["expiry"]) if pos.get("status") == "open" and pos.get("expiry") else None
        if pos.get("status") == "open":
            sell_price = pos["sell_price"]
            contracts  = pos["contracts"]
            strike = pos["strike"]
            if spy_price > 0 and strike and strike > 0:
                p["distance_to_strike_pct"] = round(((strike - spy_price) / spy_price) * 100, 2)
            else:
                p["distance_to_strike_pct"] = None

            # --- Live pull: option mark + greeks ---
            current = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
            live_delta = live_theta = None
            try:
                chain = fetcher.get_options_chain(pos["expiry"])
                chain_row = next((r for r in chain if r.get("strike") == float(strike)), None)
                live_delta = round(float(chain_row["delta"]), 4) if chain_row and chain_row.get("delta") is not None else None
                live_theta = round(float(chain_row["theta"]), 4) if chain_row and chain_row.get("theta") is not None else None
                if chain_row and chain_row.get("openInterest"):
                    oi_tracker.record_batch([{
                        "expiry": pos["expiry"],
                        "strike": float(strike),
                        "oi": chain_row["openInterest"],
                    }])
            except Exception:
                live_delta = live_theta = None

            # --- Last-known fallback ---
            # Before the market opens (and on provider hiccups) the live pull comes
            # back with a 0 mark and no greeks, which would blank every metric on the
            # Portfolios tab or — worse — read the 0 mark as "100% profit, take it."
            # Record good live data, and when the pull is empty fall back to the last
            # mark we stored, flagged stale + dated so the UI says "as of <date>"
            # rather than showing nothing or a fabricated max gain.
            position_marks.record(pos["expiry"], strike, "call", current, live_delta, live_theta)
            last_known = position_marks.get(pos["expiry"], strike, "call")
            current, delta, theta, pricing_stale, priced_as_of = position_marks.merge(
                current, live_delta, live_theta, last_known
            )

            p["current_price"] = current
            p["delta"] = delta
            p["theta"] = theta
            p["pricing_stale"] = pricing_stale
            p["priced_as_of"]  = priced_as_of
            p["pnl"] = round((sell_price - current) * contracts * 100, 2)
            p["pnl_pct"] = round((sell_price - current) / sell_price * 100, 2) if sell_price else 0
            p["profit_capture_pct"] = p["pnl_pct"]
            if delta is not None and theta is not None:
                daily_theta = -theta
                daily_delta = -delta * spy_change
                p["daily_pnl"] = round((daily_theta + daily_delta) * contracts * 100, 2)
            else:
                p["daily_pnl"] = None
            # Only truly unavailable when even the last-known fallback came up empty:
            # no usable mark AND no greeks anywhere. A genuinely worthless option
            # still carries greeks, so requiring both avoids the fake "max gain."
            p["price_unavailable"] = ((current is None or current == 0) and delta is None)
            intrinsic_val = round(max(0.0, spy_price - float(pos["strike"])), 2) if spy_price > 0 else 0.0
            p["intrinsic_value"] = intrinsic_val
            p["time_premium"] = round(max(0.0, (p.get("current_price") or 0.0) - intrinsic_val), 2)
            p["next_ex_div_date"]    = next_ex_div_date
            p["days_until_ex_div"]   = days_until_ex_div
            p["upcoming_dividend"]   = upcoming_dividend
            p["expiry_after_ex_div"] = (pos["expiry"] >= next_ex_div_date) if next_ex_div_date and pos.get("expiry") else None
            if intrinsic_val <= 0:
                p["early_exercise_risk"] = "NONE"
            elif p["expiry_after_ex_div"] and p["time_premium"] < upcoming_dividend:
                p["early_exercise_risk"] = "CRITICAL"
            elif p["time_premium"] < 0.20:
                p["early_exercise_risk"] = "HIGH"
            elif p["time_premium"] < 0.50:
                p["early_exercise_risk"] = "MEDIUM"
            else:
                p["early_exercise_risk"] = "LOW"
            oi_data = oi_tracker.get_changes_batch([{"expiry": pos["expiry"], "strike": float(strike)}])
            oi = oi_data.get(f"{pos['expiry']}|{float(strike)}", {})
            p["open_interest"]    = oi.get("current_oi")
            p["oi_change_1d_pct"] = oi.get("change_1d_pct")
            p["oi_signal"]        = oi.get("signal")
            p["oi_signal_label"]  = oi.get("signal_label")
            p["close_pnl_impact"] = p["pnl"]
            p["tax_event_on_close"] = True
            p["roll_pnl_impact"] = 0.0
            p["break_even_price"] = float(pos["strike"])
            if sell_price and sell_price > 0:
                loss_as_pct_of_premium = round((current * contracts * 100) / (sell_price * contracts * 100) * 100, 1)
            else:
                loss_as_pct_of_premium = 0.0
            p["loss_as_pct_of_premium"] = loss_as_pct_of_premium
            conf = 100.0
            conf_factors = []
            dte_val   = p.get("dte") or 0
            dist      = p.get("distance_to_strike_pct")
            delta_val = p.get("delta")
            profit_cap = p.get("profit_capture_pct") or 0
            oi_sig = p.get("oi_signal") or ""
            if dte_val <= 7:
                conf_factors.append(f"{dte_val} days to expiry")
            elif dte_val <= 14:
                conf -= 10
                conf_factors.append(f"{dte_val} days to expiry")
            elif dte_val <= 21:
                conf -= 20
                conf_factors.append(f"{dte_val} days to expiry — roll window approaching")
            if dist is not None and 0 < dist <= 1.5:
                conf_factors.append(f"SPY is {dist:.1f}% below your strike")
            elif dist is not None and 0 < dist <= 3.0:
                conf -= 15
                conf_factors.append(f"SPY is {dist:.1f}% below your strike — approaching")
            elif dist is not None and dist <= 0:
                conf_factors.append("SPY is above your strike (in-the-money)")
            if delta_val is not None:
                if delta_val > 0.35:
                    conf_factors.append(f"Assignment risk is elevated ({delta_val:.2f})")
                elif delta_val > 0.30:
                    conf -= 10
                    conf_factors.append(f"Assignment risk rising ({delta_val:.2f})")
                elif delta_val <= 0.10:
                    conf_factors.append(f"Assignment risk very low ({delta_val:.2f}) — most premium decayed")
            if profit_cap >= 50:
                conf_factors.append(f"{profit_cap:.0f}% of max income already collected")
            elif profit_cap >= 40:
                conf -= 10
                conf_factors.append(f"{profit_cap:.0f}% of max income collected — approaching 50% target")
            if oi_sig == "MAJOR_UNWIND":
                conf_factors.append("Large open interest unwind at this strike")
            elif oi_sig == "UNWINDING":
                conf -= 10
                conf_factors.append("Open interest declining at this strike")
            if loss_as_pct_of_premium > 40:
                conf -= 15
                conf_factors.append(f"Buying back costs {loss_as_pct_of_premium:.0f}% of original premium")
            _ee = p.get("early_exercise_risk", "NONE")
            if _ee == "CRITICAL":
                conf -= 30
                conf_factors.append("Critical early exercise risk — time value below upcoming dividend")
            elif _ee == "HIGH":
                conf -= 20
                conf_factors.append(f"High early exercise risk — time value only ${p.get('time_premium', 0):.2f}")
            elif _ee == "MEDIUM":
                conf -= 10
                conf_factors.append(f"Early exercise risk elevated — time value ${p.get('time_premium', 0):.2f}")
            conf = max(0, min(100, round(conf)))
            p["confidence"] = conf
            p["confidence_factors"] = conf_factors
            near_events = [e for e in upcoming_events if e["days_away"] <= 5]
            if near_events:
                nearest = near_events[0]
                p["macro_event"] = {
                    "date": nearest["date"],
                    "description": nearest["description"],
                    "days_away": nearest["days_away"],
                    "source": nearest["source"],
                }
            else:
                p["macro_event"] = None
            p["macro_uncertainty"] = news_uncertainty.get("is_elevated", False)
        enriched.append(p)
    return enriched


def _capture_signal_snapshot() -> dict:
    try:
        spy_price_data = fetcher.get_spy_price()
        spy_price = spy_price_data.get("price", 0)
        signal_tickers = fetcher.get_signal_tickers()
        vix  = signal_tickers.get("^VIX",  {}).get("price", 20)
        vvix = signal_tickers.get("^VVIX", {}).get("price", 95)
        tnx  = signal_tickers.get("^TNX",  {}).get("price", 4.3)
        fvx  = signal_tickers.get("^FVX",  {}).get("price", 4.0)
        tlt  = signal_tickers.get("TLT",   {}).get("price", 88)
        vix_history = fetcher.get_vix_history()
        iv_rank = vix_history.get("iv_rank", 50)
        spy_ma  = fetcher.get_spy_ma_signal()
        tnx_history = fetcher.get_tnx_history(10)
        tlt_history = fetcher.get_tlt_history(10)
        vix_recent  = fetcher.get_vix_recent_history(10)
        spy_recent  = fetcher.get_spy_recent_history(10)
        signal = engine.analyze(
            spy_price=spy_price, vix=vix, vix_iv_rank=iv_rank, vvix=vvix,
            tnx=tnx, fvx=fvx, tlt=tlt, spy_ma_signal=spy_ma,
            open_positions=[], tnx_history=tnx_history, tlt_history=tlt_history,
            vix_recent=vix_recent, spy_recent=spy_recent,
        )
        return {
            "timestamp":     datetime.now().isoformat(),
            "regime":        signal.get("regime"),
            "total_score":   signal.get("total_score"),
            "max_score":     signal.get("max_score"),
            "factor_scores": signal.get("factor_scores", {}),
            "spy_price":     spy_price,
            "vix":           vix,
        }
    except Exception:
        return {"timestamp": datetime.now().isoformat(), "error": "snapshot_failed"}


# ── PIPE-REC-12: Roll candidates endpoint ─────────────────────────────────────
# Returns the user's open positions that are eligible to roll, with a
# suggested replacement contract per the active strategy.

@app.get("/api/positions/roll-candidates")
def get_roll_candidates(
    strategy: str = Query("conservative"),
    current_user: User = Depends(auth_module.get_current_user),
):
    """For each open position with DTE ≤ 21 OR mid-trade profit ≥ 50%,
    return a suggested next contract using the strategy's filters.

    Triggers (matching backtest.py:_manage_position):
      - 50%-profit close: current_mid ≤ entry_mid × 0.50
      - 21-DTE defensive: dte ≤ 21 AND underlying ≥ strike × 0.97 (at-risk)
      - ITM roll up-and-out: underlying > strike × 1.005 AND DTE > 21
    """
    preset = STRATEGY_PRESETS.get(strategy, STRATEGY_PRESETS["conservative"])
    open_positions = [p for p in db.get_open_positions(current_user.id) if p.get("status") == "open"]
    if not open_positions:
        return {"strategy": strategy, "candidates": []}

    candidates = []
    for pos in open_positions:
        ticker = (pos.get("ticker") or "").upper()
        if not ticker:
            continue
        try:
            spot = fetcher.get_price_for(ticker)
        except Exception:
            continue
        if not spot or spot <= 0:
            continue
        entry_premium = float(pos.get("sell_price") or 0)
        strike = float(pos.get("strike") or 0)
        if strike <= 0 or entry_premium <= 0:
            continue
        dte = _dte(pos["expiry"]) if pos.get("expiry") else None
        if dte is None or dte < 0:
            continue
        try:
            current_mid = fetcher.get_option_price(pos["expiry"], strike, "call") or 0
        except Exception:
            current_mid = 0

        # Trigger evaluation
        is_50pct = entry_premium > 0 and current_mid > 0 and current_mid <= entry_premium * 0.50
        is_itm_roll = spot > strike * 1.005 and dte > 21
        is_21dte_defensive = dte <= 21 and spot >= strike * 0.97
        triggered = is_50pct or is_itm_roll or is_21dte_defensive
        if not triggered:
            continue

        if is_50pct:
            reason = "Hit 50% profit target — close to lock in gains and redeploy"
            trigger_label = "50% profit close"
        elif is_itm_roll:
            reason = f"SPY at ${spot:.2f} is above ${strike:.0f} strike — roll up-and-out to recover upside"
            trigger_label = "ITM roll up-and-out"
        else:
            reason = "21 DTE with strike at-risk — defensive roll to reset gamma"
            trigger_label = "21-DTE defensive roll"

        # Suggest a new contract using the strategy's filters
        try:
            expiries = fetcher.get_screener_expiries_for(ticker, max_dte=preset["dte_window"][1])
        except Exception:
            expiries = []
        target_dte = sum(preset["dte_window"]) // 2
        suggested = None
        for exp in expiries:
            try:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            except Exception:
                continue
            this_dte = (exp_date - date.today()).days
            lo, hi = preset["dte_window"]
            if not (lo <= this_dte <= hi):
                continue
            try:
                chain = fetcher.get_options_chain_for(ticker, exp)
            except Exception:
                continue
            best = None
            for row in chain:
                row_delta = row.get("delta")
                if row_delta is None or row_delta <= 0 or row_delta > preset["filt"]["maxDelta"]:
                    continue
                row_iv = (row.get("impliedVolatility") or 0) * 100
                if row_iv < preset["filt"].get("minIvr", 0.0):
                    continue
                max_iv = preset["filt"].get("maxIvr")
                if max_iv is not None and row_iv > max_iv:
                    continue
                row_strike = row.get("strike")
                if row_strike is None or row_strike <= spot:
                    continue
                if best is None or abs(row_delta - preset["filt"]["maxDelta"]) < abs(best["delta"] - preset["filt"]["maxDelta"]):
                    best = {"strike": row_strike, "delta": row_delta, "iv_pct": row_iv,
                            "bid": row.get("bid", 0) or 0, "ask": row.get("ask", 0) or 0}
            if best is not None:
                bid, ask = best["bid"], best["ask"]
                if bid > 0 and ask > 0:
                    mid = (bid + ask) / 2.0
                    suggested = {
                        "strike": best["strike"], "expiry": exp, "dte": this_dte,
                        "mid": round(mid, 2), "delta": round(best["delta"], 3),
                        "iv_pct": round(best["iv_pct"], 1),
                        "ann_yield": round((mid / spot) * (365 / max(1, this_dte)) * 100, 1),
                        "premium_total": round(mid * (pos.get("contracts") or 1) * 100, 2),
                    }
                    break

        candidates.append({
            "position_id": pos.get("id"),
            "ticker": ticker,
            "current": {
                "strike": strike, "expiry": pos.get("expiry"),
                "dte": dte, "entry_premium": entry_premium,
                "current_mid": round(current_mid, 2) if current_mid else None,
                "contracts": pos.get("contracts", 1),
                "spot": round(spot, 2),
            },
            "trigger": trigger_label,
            "reason": reason,
            "suggestion": suggested,
        })
    return {"strategy": strategy, "candidates": candidates}


@app.post("/api/positions")
def add_position(pos: PositionIn, current_user: User = Depends(check_write_access)):
    default = db.ensure_default_portfolio(current_user.id)
    portfolio_id = pos.portfolio_id or default["id"]
    if not db.get_portfolio(current_user.id, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    new_pos = pos.dict()
    new_pos["id"] = str(uuid.uuid4())
    new_pos["portfolio_id"] = portfolio_id
    if not new_pos.get("premium_collected"):
        new_pos["premium_collected"] = round(pos.sell_price * pos.contracts * 100, 2)
    if not new_pos.get("open_date"):
        new_pos["open_date"] = date.today().isoformat()
    new_pos["open_signal"] = _capture_signal_snapshot()
    saved = db.create_position(current_user.id, new_pos)
    try:
        rec_logger.mark_acted_on(pos.strike, pos.expiry, saved["id"])
    except Exception:
        pass
    return saved

@app.delete("/api/positions/{position_id}")
def delete_position_endpoint(position_id: str, current_user: User = Depends(check_write_access)):
    if not db.get_position(current_user.id, position_id):
        raise HTTPException(status_code=404, detail="Position not found")
    db.delete_position(current_user.id, position_id)
    return {"ok": True}

@app.put("/api/positions/{position_id}")
def update_position_endpoint(position_id: str, update: PositionUpdate, current_user: User = Depends(check_write_access)):
    pos = db.get_position(current_user.id, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    updates: dict = {}
    if update.status is not None:
        updates["status"] = update.status
    if update.contracts is not None:
        updates["contracts"] = update.contracts
        updates["premium_collected"] = round(pos.get("sell_price", 0) * update.contracts * 100, 2)
    if update.sell_price is not None:
        updates["sell_price"] = update.sell_price
        updates["premium_collected"] = round(update.sell_price * pos.get("contracts", 0) * 100, 2)
    if update.close_price is not None:
        sell_price = pos.get("sell_price", 0)
        contracts  = pos.get("contracts", 0)
        updates["close_price"] = update.close_price
        updates["final_pnl"]   = round((sell_price - update.close_price) * contracts * 100, 2)
        updates["close_date"]  = update.close_date or date.today().isoformat()
        updates["close_signal"] = _capture_signal_snapshot()
    if update.notes is not None:
        updates["notes"] = update.notes
    return db.update_position(current_user.id, position_id, updates)

@app.put("/api/positions/{position_id}/reopen")
def reopen_position(position_id: str, current_user: User = Depends(check_write_access)):
    pos = db.get_position(current_user.id, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos.get("status") != "closed":
        raise HTTPException(status_code=400, detail="Position is not closed")
    updates = {
        "status": "open",
        "close_price": None,
        "close_date": None,
        "final_pnl": None,
        "close_signal": None,
    }
    return db.update_position(current_user.id, position_id, updates)

@app.post("/api/positions/{position_id}/partial-close")
def partial_close_position(position_id: str, body: PartialCloseIn, current_user: User = Depends(check_write_access)):
    pos = db.get_position(current_user.id, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos.get("status") != "open":
        raise HTTPException(status_code=400, detail="Position is not open")
    total = pos.get("contracts", 0)
    n = body.contracts_to_close
    if n <= 0 or n >= total:
        raise HTTPException(status_code=400, detail=f"contracts_to_close must be between 1 and {total - 1}")
    sell_price = pos.get("sell_price", 0)
    close_date = body.close_date or date.today().isoformat()
    closed_portion = {k: v for k, v in pos.items() if k not in ("id", "user_id")}
    closed_portion["id"] = str(uuid.uuid4())
    closed_portion["contracts"] = n
    closed_portion["premium_collected"] = round(sell_price * n * 100, 2)
    closed_portion["status"] = "closed"
    closed_portion["close_price"] = body.close_price
    closed_portion["close_date"] = close_date
    closed_portion["final_pnl"] = round((sell_price - body.close_price) * n * 100, 2)
    closed_portion["close_signal"] = _capture_signal_snapshot()
    remaining = total - n
    updated_open = db.update_position(current_user.id, position_id, {
        "contracts": remaining,
        "premium_collected": round(sell_price * remaining * 100, 2),
    })
    saved_closed = db.create_position(current_user.id, closed_portion)
    return {"open": updated_open, "closed": saved_closed}

@app.put("/api/positions/{position_id}/move")
def move_position(position_id: str, body: PositionMove, current_user: User = Depends(check_write_access)):
    if not db.get_portfolio(current_user.id, body.portfolio_id):
        raise HTTPException(status_code=404, detail="Target portfolio not found")
    pos = db.get_position(current_user.id, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    return db.update_position(current_user.id, position_id, {"portfolio_id": body.portfolio_id})


# ── Holdings endpoints ────────────────────────────────────────────────────────

@app.get("/api/holdings")
def get_holdings_endpoint(
    portfolio_id: Optional[str] = Query(None),
    current_user: User = Depends(auth_module.get_current_user),
):
    holdings = db.get_holdings(current_user.id, portfolio_id=portfolio_id)
    price_cache = {}  # memo within this request so a repeated ticker fetches once
    enriched = []
    for h in holdings:
        row = dict(h)
        ticker   = h["ticker"]
        if ticker not in price_cache:
            price_cache[ticker] = fetcher.get_price_for(ticker)
        price    = price_cache[ticker]
        shares   = h["shares"]
        avg_cost = h.get("avg_cost") or 0
        row["current_price"]      = price
        row["market_value"]       = round(price * shares, 2)
        row["cost_basis"]         = round(avg_cost * shares, 2)
        row["unrealized_pnl"]     = round((price - avg_cost) * shares, 2)
        row["unrealized_pnl_pct"] = round((price - avg_cost) / avg_cost * 100, 2) if avg_cost else 0
        enriched.append(row)
    return enriched

@app.post("/api/holdings")
def add_holding(body: HoldingIn, current_user: User = Depends(check_write_access)):
    if not db.get_portfolio(current_user.id, body.portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    new_h = body.dict()
    new_h["id"] = str(uuid.uuid4())
    if not new_h.get("purchase_date"):
        new_h["purchase_date"] = date.today().isoformat()
    return db.create_holding(current_user.id, new_h)

@app.put("/api/holdings/{holding_id}")
def update_holding_endpoint(holding_id: str, body: HoldingUpdate, current_user: User = Depends(check_write_access)):
    if not db.get_holding(current_user.id, holding_id):
        raise HTTPException(status_code=404, detail="Holding not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    return db.update_holding(current_user.id, holding_id, updates)

@app.delete("/api/holdings/{holding_id}")
def delete_holding_endpoint(holding_id: str, current_user: User = Depends(check_write_access)):
    if not db.get_holding(current_user.id, holding_id):
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete_holding(current_user.id, holding_id)
    return {"ok": True}


# ── Market / signal endpoints ─────────────────────────────────────────────────

@app.get("/api/dashboard")
def dashboard():
    spy_price      = fetcher.get_spy_price()
    signal_tickers = fetcher.get_signal_tickers()
    vix_history    = fetcher.get_vix_history()
    spy_ma         = fetcher.get_spy_ma_signal()
    return {
        "spy":            spy_price,
        "signal_tickers": signal_tickers,
        "vix_history":    vix_history,
        "spy_ma":         spy_ma,
        "last_updated":   datetime.utcnow().isoformat() + "Z",
    }

@app.get("/api/signals")
def signals(current_user: User = Depends(auth_module.get_current_user)):
    spy_price_data = fetcher.get_spy_price()
    spy_price = spy_price_data.get("price", 0)
    signal_tickers = fetcher.get_signal_tickers()
    vix  = signal_tickers.get("^VIX",  {}).get("price", 20)
    vvix = signal_tickers.get("^VVIX", {}).get("price", 95)
    tnx  = signal_tickers.get("^TNX",  {}).get("price", 4.3)
    fvx  = signal_tickers.get("^FVX",  {}).get("price", 4.0)
    tlt  = signal_tickers.get("TLT",   {}).get("price", 88)
    vix_history = fetcher.get_vix_history()
    iv_rank = vix_history.get("iv_rank", 50)
    spy_ma  = fetcher.get_spy_ma_signal()
    tnx_history = fetcher.get_tnx_history(10)
    tlt_history = fetcher.get_tlt_history(10)
    vix_recent  = fetcher.get_vix_recent_history(10)
    spy_recent  = fetcher.get_spy_recent_history(10)
    available_expiries = fetcher.get_available_expiries()
    open_positions = db.get_open_positions(current_user.id)
    for pos in open_positions:
        try:
            pos["current_price"] = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
        except Exception:
            pos["current_price"] = 0
    result = engine.analyze(
        spy_price=spy_price, vix=vix, vix_iv_rank=iv_rank, vvix=vvix,
        tnx=tnx, fvx=fvx, tlt=tlt, spy_ma_signal=spy_ma,
        open_positions=open_positions, tnx_history=tnx_history,
        tlt_history=tlt_history, available_expiries=available_expiries,
        vix_recent=vix_recent, spy_recent=spy_recent,
    )
    result["last_updated"] = datetime.utcnow().isoformat() + "Z"
    result["market_inputs"] = {
        "vix":          round(float(vix), 2),
        "vvix":         round(float(vvix), 1),
        "iv_rank":      round(float(iv_rank), 1),
        "tnx":          round(float(tnx), 3),
        "fvx":          round(float(fvx), 3),
        "tlt":          round(float(tlt), 2),
        "spy_price":    round(float(spy_price), 2),
        "spy_slope_pct": round(float(spy_ma.get("slope_pct", 0)), 3) if spy_ma else None,
    }
    return result

@app.get("/api/options/expiries")
def get_expiries():
    return fetcher.get_available_expiries()

@app.get("/api/options/chain/{expiry}")
def get_chain(expiry: str):
    return fetcher.get_options_chain(expiry)

@app.get("/api/options/price")
def get_option_price(expiry: str, strike: float, type: str = "call"):
    return {"price": fetcher.get_option_price(expiry, strike, type)}


# ── Screener ──────────────────────────────────────────────────────────────────

@app.get("/api/screener")
def screener(
    portfolio_id: str,
    max_delta: float = Query(0.30),
    min_delta: float = Query(0.05),
    min_dte: int = Query(7),
    max_dte: int = Query(60),
    limit: int = Query(20),
    max_strike_alloc: float = Query(0.30),
    max_expiry_alloc: float = Query(0.30),
    ticker: str = Query("SPY"),
    current_user: User = Depends(auth_module.get_current_user),
):
    ticker = ticker.upper().strip()
    all_holdings = db.get_holdings(current_user.id, portfolio_id=portfolio_id)
    port_ticker_holdings = [h for h in all_holdings if h.get("ticker", "").upper() == ticker]
    total_shares   = sum(h.get("shares", 0) for h in port_ticker_holdings)
    total_contracts = int(total_shares // 100)
    if total_shares > 0:
        avg_cost = sum(h.get("avg_cost", 0) * h.get("shares", 0) for h in port_ticker_holdings) / total_shares
    else:
        avg_cost = 0.0
    max_per_strike = max(1, int(total_contracts * max_strike_alloc))
    max_per_expiry = max(1, int(total_contracts * max_expiry_alloc))

    all_positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)
    open_port_positions = [p for p in all_positions if p.get("status") == "open"]
    used_per_strike: dict = {}
    used_per_expiry: dict = {}
    for p in open_port_positions:
        s = float(p.get("strike", 0))
        e = p.get("expiry", "")
        c = int(p.get("contracts", 0))
        used_per_strike[s] = used_per_strike.get(s, 0) + c
        used_per_expiry[e] = used_per_expiry.get(e, 0) + c

    _scr_div       = fetcher.get_spy_dividends() if ticker == "SPY" else {}
    scr_next_exdiv = _scr_div.get("next_ex_div_date")
    scr_days_exdiv = _scr_div.get("days_until_ex_div")
    scr_div_amount = _scr_div.get("next_div_amount") or 0.0

    spy_price_data = fetcher.get_spy_price()
    spy_price  = spy_price_data.get("price", 0)
    spot_price = spy_price if ticker == "SPY" else fetcher.get_price_for(ticker)
    signal_tickers = fetcher.get_signal_tickers()
    vix  = signal_tickers.get("^VIX",  {}).get("price", 20)
    vvix = signal_tickers.get("^VVIX", {}).get("price", 95)
    tnx  = signal_tickers.get("^TNX",  {}).get("price", 4.3)
    fvx  = signal_tickers.get("^FVX",  {}).get("price", 4.0)
    tlt  = signal_tickers.get("TLT",   {}).get("price", 88)
    vix_history = fetcher.get_vix_history()
    iv_rank = vix_history.get("iv_rank", 50)
    spy_ma  = fetcher.get_spy_ma_signal()
    tnx_history = fetcher.get_tnx_history(10)
    tlt_history = fetcher.get_tlt_history(10)
    vix_recent  = fetcher.get_vix_recent_history(10)
    spy_recent  = fetcher.get_spy_recent_history(10)
    signal_result = engine.analyze(
        spy_price=spy_price, vix=vix, vix_iv_rank=iv_rank, vvix=vvix,
        tnx=tnx, fvx=fvx, tlt=tlt, spy_ma_signal=spy_ma,
        open_positions=[], tnx_history=tnx_history, tlt_history=tlt_history,
        available_expiries=[], vix_recent=vix_recent, spy_recent=spy_recent,
    )
    total_score = signal_result.get("total_score", 0)

    expiries = fetcher.get_screener_expiries_for(ticker, max_dte)
    today    = date.today()
    candidates = []

    for exp in expiries:
        exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        dte = (exp_date - today).days
        if dte < min_dte:
            continue
        chain = fetcher.get_options_chain_for(ticker, exp)
        oi_tracker.record_batch([
            {"expiry": exp, "strike": float(r["strike"]), "oi": r.get("openInterest") or 0}
            for r in chain if r.get("strike") is not None
        ])
        used_expiry = used_per_expiry.get(exp, 0)
        cap_expiry  = max(0, max_per_expiry - used_expiry)
        for row in chain:
            delta  = row.get("delta")
            strike = row.get("strike")
            if delta is None or strike is None:
                continue
            if delta > max_delta or delta < min_delta:
                continue
            if strike <= spot_price:
                continue
            bid = row.get("bid") or 0
            ask = row.get("ask") or 0
            mid = round((bid + ask) / 2, 2) if (bid or ask) else 0
            if mid <= 0:
                continue
            theta = row.get("theta") or 0
            gamma = row.get("gamma")
            vega  = row.get("vega")
            iv    = row.get("impliedVolatility") or 0
            used_strike     = used_per_strike.get(float(strike), 0)
            cap_strike      = max(0, max_per_strike - used_strike)
            contracts_suggested = min(cap_strike, cap_expiry, total_contracts) if total_contracts > 0 else 0
            premium_total       = round(mid * contracts_suggested * 100, 2)
            annualized_yield    = round((mid / spot_price) * (365 / dte) * 100, 2) if spot_price > 0 and dte > 0 else 0
            TAX_RATE = 0.20
            gain_per_share = max(0.0, float(strike) - avg_cost)
            expected_tax   = round(gain_per_share * 100 * TAX_RATE * float(delta) * contracts_suggested, 2)
            tax_if_assigned = round(gain_per_share * 100 * TAX_RATE * contracts_suggested, 2)
            tax_ratio       = round(expected_tax / max(premium_total, 1), 3)
            raw_yield_pct   = (mid / spot_price * 100) if spot_price > 0 else 0
            s_signal = max(0.0, total_score) / 12 * 25
            s_yield  = min(raw_yield_pct / 0.70, 1.0) * 30
            s_delta  = (1 - delta / max_delta) * 20
            if dte <= 7:
                s_dte = 0.0
            elif dte <= 21:
                s_dte = ((dte - 7) / (21 - 7)) * 25
            elif dte <= 45:
                s_dte = 25.0
            elif dte <= 90:
                s_dte = ((90 - dte) / (90 - 45)) * 25
            else:
                s_dte = 0.0
            composite_score = round(s_signal + s_yield + s_delta + s_dte)
            open_pos = next(
                (p for p in open_port_positions
                 if float(p.get("strike", 0)) == float(strike) and p.get("expiry") == exp),
                None,
            )
            _intrinsic = round(max(0.0, spot_price - float(strike)), 2)
            candidates.append({
                "ticker": ticker, "strike": float(strike), "expiry": exp, "dte": dte,
                "delta": round(float(delta), 4),
                "gamma": round(float(gamma), 4) if gamma is not None else None,
                "theta": round(float(theta), 4),
                "vega":  round(float(vega), 4) if vega is not None else None,
                "bid": round(float(bid), 2), "ask": round(float(ask), 2), "mid": mid,
                "intrinsic_value": _intrinsic,
                "time_premium": round(max(0.0, mid - _intrinsic), 2),
                "next_ex_div_date":    scr_next_exdiv,
                "days_until_ex_div":   scr_days_exdiv,
                "expiry_after_ex_div": (exp >= scr_next_exdiv) if scr_next_exdiv else None,
                "upcoming_dividend":   scr_div_amount,
                "iv": round(float(iv), 4),
                "open_interest": row.get("openInterest") or 0,
                "volume": row.get("volume") or 0,
                "contracts_suggested": contracts_suggested,
                "premium_total": premium_total,
                "annualized_yield_pct": annualized_yield,
                "raw_yield_pct": round(raw_yield_pct, 3),
                "tax_if_assigned": tax_if_assigned,
                "expected_tax": expected_tax,
                "tax_ratio": tax_ratio,
                "capacity_strike_remaining": cap_strike,
                "capacity_expiry_remaining": cap_expiry,
                "at_strike_limit": cap_strike <= 0,
                "at_expiry_limit": cap_expiry <= 0,
                "composite_score": composite_score,
                "score_breakdown": {
                    "signal": round(s_signal, 1), "raw_yield": round(s_yield, 1),
                    "delta": round(s_delta, 1),   "dte_quality": round(s_dte, 1),
                },
                "has_position": open_pos is not None,
                "position_contracts": open_pos.get("contracts", 0) if open_pos else 0,
                "position_sell_price": open_pos.get("sell_price", 0) if open_pos else 0,
            })

    # Inject open positions outside the screener's delta filter
    candidate_keys = {(c["strike"], c["expiry"]) for c in candidates}
    for p in open_port_positions:
        p_strike = float(p.get("strike", 0))
        p_expiry = p.get("expiry", "")
        if (p_strike, p_expiry) in candidate_keys:
            continue
        try:
            exp_date_obj = datetime.strptime(p_expiry, "%Y-%m-%d").date()
        except ValueError:
            continue
        dte2 = (exp_date_obj - today).days
        if dte2 < min_dte or dte2 > max_dte:
            continue
        try:
            chain2 = fetcher.get_options_chain_for(ticker, p_expiry)
            row = next((r for r in chain2 if r.get("strike") == float(p_strike)), None)
        except Exception:
            row = None
        if not row:
            continue
        bid2 = row.get("bid") or 0
        ask2 = row.get("ask") or 0
        mid2 = round((bid2 + ask2) / 2, 2) if (bid2 or ask2) else 0
        if mid2 <= 0:
            continue
        delta2 = row.get("delta") or 0
        theta2 = row.get("theta") or 0
        gamma2 = row.get("gamma")
        vega2  = row.get("vega")
        iv2    = row.get("impliedVolatility") or 0
        contracts = p.get("contracts", 0)
        raw_yield_pct2   = (mid2 / spot_price * 100) if spot_price > 0 else 0
        annualized_yield2 = round((mid2 / spot_price) * (365 / dte2) * 100, 2) if spot_price > 0 and dte2 > 0 else 0
        gain_per_share2   = max(0.0, float(p_strike) - avg_cost)
        expected_tax2     = round(gain_per_share2 * 100 * 0.20 * float(delta2) * contracts, 2)
        tax_if_assigned2  = round(gain_per_share2 * 100 * 0.20 * contracts, 2)
        tax_ratio2        = round(expected_tax2 / max(mid2 * contracts * 100, 1), 3)
        s_signal2 = max(0.0, total_score) / 12 * 25
        s_yield2  = min(raw_yield_pct2 / 0.70, 1.0) * 30
        s_delta2  = (1 - min(float(delta2), max_delta) / max_delta) * 20
        s_dte2    = 25.0 if 21 <= dte2 <= 45 else (((dte2 - 7) / (21 - 7)) * 25 if dte2 <= 21 else ((90 - dte2) / (90 - 45)) * 25)
        composite_score2 = round(s_signal2 + s_yield2 + s_delta2 + max(0.0, s_dte2))
        _intrinsic2 = round(max(0.0, spot_price - float(p_strike)), 2)
        candidates.append({
            "ticker": ticker, "strike": float(p_strike), "expiry": p_expiry, "dte": dte2,
            "delta": round(float(delta2), 4),
            "gamma": round(float(gamma2), 4) if gamma2 is not None else None,
            "theta": round(float(theta2), 4),
            "vega":  round(float(vega2), 4) if vega2 is not None else None,
            "bid": round(float(bid2), 2), "ask": round(float(ask2), 2), "mid": mid2,
            "intrinsic_value": _intrinsic2,
            "time_premium": round(max(0.0, mid2 - _intrinsic2), 2),
            "next_ex_div_date":    scr_next_exdiv,
            "days_until_ex_div":   scr_days_exdiv,
            "expiry_after_ex_div": (p_expiry >= scr_next_exdiv) if scr_next_exdiv else None,
            "upcoming_dividend":   scr_div_amount,
            "iv": round(float(iv2), 4),
            "open_interest": row.get("openInterest") or 0,
            "volume": row.get("volume") or 0,
            "contracts_suggested": 0,
            "premium_total": 0,
            "annualized_yield_pct": annualized_yield2,
            "raw_yield_pct": round(raw_yield_pct2, 3),
            "tax_if_assigned": tax_if_assigned2,
            "expected_tax": expected_tax2,
            "tax_ratio": tax_ratio2,
            "capacity_strike_remaining": 0,
            "capacity_expiry_remaining": 0,
            "at_strike_limit": True,
            "at_expiry_limit": False,
            "composite_score": composite_score2,
            "score_breakdown": {
                "signal": round(s_signal2, 1), "raw_yield": round(s_yield2, 1),
                "delta": round(s_delta2, 1),   "dte_quality": round(max(0.0, s_dte2), 1),
            },
            "has_position": True,
            "position_contracts": contracts,
            "position_sell_price": p.get("sell_price", 0),
        })

    oi_keys = [{"expiry": c["expiry"], "strike": c["strike"]} for c in candidates]
    oi_changes = oi_tracker.get_changes_batch(oi_keys)
    for c in candidates:
        oi = oi_changes.get(f"{c['expiry']}|{c['strike']}", {})
        c["oi_change_1d_pct"] = oi.get("change_1d_pct")
        c["oi_signal"]        = oi.get("signal", "NO_DATA")
        c["oi_signal_label"]  = oi.get("signal_label", "No history yet")

    candidates.sort(key=lambda c: (not c.get("has_position", False), -c["composite_score"]))
    try:
        rec_logger.log_recommendations(
            [c for c in candidates if not c.get("has_position")],
            signal_result,
            spy_price,
        )
    except Exception:
        pass
    return {
        "candidates": candidates[:limit],
        "meta": {
            "portfolio_id": portfolio_id, "ticker": ticker,
            "total_contracts": total_contracts, "total_shares": total_shares,
            "avg_cost": round(avg_cost, 2),
            "max_per_strike": max_per_strike, "max_per_expiry": max_per_expiry,
            "signal_score": total_score, "regime": signal_result.get("regime"),
            "spy_price": spy_price, "spot_price": round(spot_price, 2),
        },
    }


# ── Screener (exploratory, freeform-ticker) ───────────────────────────────────
# PIPE-037: backs the revamped Screener UI. Returns raw chain + metadata for
# arbitrary tickers (no portfolio scope). IVR is served from PIPE-036's
# iv_snapshots table when we have ≥20 daily samples; otherwise returns null.

@app.get("/api/screener/meta")
def screener_meta(
    ticker: str = Query(...),
    current_user: User = Depends(auth_module.get_current_user),
):
    sym = ticker.upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    meta = fetcher.get_meta_for(sym)
    atm_iv = fetcher.get_atm_iv(sym)

    # PIPE-036: record today's ATM IV snapshot + compute IVR from rolling 252d
    ivr = None
    samples = 0
    ivr_confidence = "insufficient_history"
    try:
        db.ensure_universe_ticker(sym, source="on_demand")
        if atm_iv is not None:
            db.record_iv_snapshot(sym, date.today(), atm_iv)
        history = db.get_iv_history(sym, days=252)
        samples = len(history)
        if samples >= 20 and atm_iv is not None:
            lo = min(history)
            hi = max(history)
            if hi > lo:
                ivr = round((atm_iv - lo) / (hi - lo) * 100, 1)
                ivr = max(0.0, min(100.0, ivr))
                ivr_confidence = "ok"
    except Exception:
        # Tables may not exist yet — graceful fallback
        pass

    return {
        "ticker": sym,
        "name":    meta.get("name") or sym,
        "price":   meta.get("price") or 0.0,
        "iv":      atm_iv,
        "ivr":     ivr,
        "ivr_confidence": ivr_confidence,
        "ivr_samples":    samples,
        "sector":        meta.get("sector"),
        "earnings_date": meta.get("earnings_date"),
        "mcap":          meta.get("mcap"),
    }


@app.get("/api/screener/expiries")
def screener_expiries(
    ticker: str = Query(...),
    max_dte: int = Query(90),
    current_user: User = Depends(auth_module.get_current_user),
):
    sym = ticker.upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    return fetcher.get_expiries_union(sym, max_dte)


@app.get("/api/screener/chain")
def screener_chain(
    ticker: str = Query(...),
    expiry: str = Query(...),
    current_user: User = Depends(auth_module.get_current_user),
):
    sym = ticker.upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    spot = fetcher.get_price_for(sym)
    today = date.today()
    try:
        exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="expiry must be YYYY-MM-DD")
    dte = (exp_date - today).days
    try:
        raw = fetcher.get_options_chain_for(sym, expiry)
    except Exception:
        raw = []
    chain = []
    for row in raw or []:
        strike = row.get("strike")
        if strike is None:
            continue
        bid = row.get("bid") or 0
        ask = row.get("ask") or 0
        mid = round((float(bid) + float(ask)) / 2, 2) if (bid or ask) else 0
        chain.append({
            "strike": float(strike),
            "bid":    round(float(bid), 2),
            "ask":    round(float(ask), 2),
            "mid":    mid,
            "iv":     row.get("impliedVolatility"),
            "delta":  row.get("delta"),
            "gamma":  row.get("gamma"),
            "theta":  row.get("theta"),
            "vega":   row.get("vega"),
            "volume":        row.get("volume") or 0,
            "open_interest": row.get("openInterest") or 0,
        })
    return {
        "ticker": sym,
        "expiry": expiry,
        "dte":    dte,
        "spot":   round(spot, 2) if spot else 0.0,
        "chain":  chain,
    }


@app.get("/api/screener/price-history")
def screener_price_history(
    ticker: str = Query(...),
    days: int = Query(60),
    current_user: User = Depends(auth_module.get_current_user),
):
    sym = ticker.upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    days = max(1, min(days, 365))
    return fetcher.get_recent_history_for(sym, days)


# ── Admin: seed IV universe from curated ticker lists (PIPE-036) ─────────────
# One-shot idempotent endpoint. Auth-gated to the admin user for now.

@app.post("/api/admin/iv-universe/seed")
def admin_seed_iv_universe(
    current_user: User = Depends(auth_module.get_current_user),
):
    if current_user.email != "leslie.c.george@gmail.com":
        raise HTTPException(status_code=403, detail="admin only")
    from universe import CURATED_UNIVERSE, source_for
    inserted = 0
    for sym in CURATED_UNIVERSE:
        try:
            if db.ensure_universe_ticker(sym, source=source_for(sym)):
                inserted += 1
        except Exception:
            continue
    return {"seeded": len(CURATED_UNIVERSE), "inserted": inserted}


# ── Recommendations engine ───────────────────────────────────────────────────

@app.get("/api/recommendations")
def get_recommendations(
    portfolio: Optional[str] = Query(None),
    strategy: str = Query("available"),
    current_user: User = Depends(auth_module.get_current_user),
):
    preset     = STRATEGY_PRESETS.get(strategy, STRATEGY_PRESETS["available"])
    filt       = preset["filt"]
    weights    = preset["weights"]
    dte_window = preset["dte_window"]
    max_delta  = filt["maxDelta"]
    min_ivr    = filt["minIvr"]    # raw ATM IV% (not historical rank — see PIPE-REC-01 note)
    min_yield  = filt["minYield"]  # annualized yield %

    # Resolve portfolio scope — frontend sends ?portfolio=all or ?portfolio=<uuid>
    pid = None if (portfolio is None or portfolio == "all") else portfolio
    all_holdings   = db.get_holdings(current_user.id, portfolio_id=pid)
    open_positions = db.get_open_positions(current_user.id)

    # Market signal score — computed once, reused for every ticker
    spy_price_data = fetcher.get_spy_price()
    spy_price      = spy_price_data.get("price", 0)
    signal_tickers = fetcher.get_signal_tickers()
    vix   = signal_tickers.get("^VIX",  {}).get("price", 20)
    vvix  = signal_tickers.get("^VVIX", {}).get("price", 95)
    tnx   = signal_tickers.get("^TNX",  {}).get("price", 4.3)
    fvx   = signal_tickers.get("^FVX",  {}).get("price", 4.0)
    tlt   = signal_tickers.get("TLT",   {}).get("price", 88)
    vix_history   = fetcher.get_vix_history()
    iv_rank       = vix_history.get("iv_rank", 50)
    spy_ma        = fetcher.get_spy_ma_signal()
    tnx_history   = fetcher.get_tnx_history(10)
    tlt_history   = fetcher.get_tlt_history(10)
    vix_recent    = fetcher.get_vix_recent_history(10)
    spy_recent    = fetcher.get_spy_recent_history(10)
    signal_result = engine.analyze(
        spy_price=spy_price, vix=vix, vix_iv_rank=iv_rank, vvix=vvix,
        tnx=tnx, fvx=fvx, tlt=tlt, spy_ma_signal=spy_ma,
        open_positions=[], tnx_history=tnx_history, tlt_history=tlt_history,
        available_expiries=[], vix_recent=vix_recent, spy_recent=spy_recent,
    )
    total_score = signal_result.get("total_score", 0)

    # Deduplicate tickers preserving insertion order
    seen: dict = {}
    for h in all_holdings:
        t = h.get("ticker", "").upper()
        if t:
            seen[t] = True
    tickers = list(seen.keys())

    today = date.today()
    dots: List[dict] = []
    recs: List[dict] = []

    for ticker in tickers:
        # ── Share ownership gate ──────────────────────────────────────────────
        # All rows in the holdings table represent stock ownership (no category
        # column in schema). Filter only by ticker.
        ticker_holdings   = [h for h in all_holdings if h.get("ticker", "").upper() == ticker]
        total_shares      = sum(h.get("shares", 0) for h in ticker_holdings)
        total_contracts   = int(total_shares // 100)

        # Only count explicitly tracked short calls as written contracts.
        # Avoid including None-type positions which could be any position type.
        open_calls        = [
            p for p in open_positions
            if p.get("ticker", "").upper() == ticker
            and p.get("type") in ("short_call", "covered_call")
        ]
        written_contracts = sum(int(p.get("contracts", 0)) for p in open_calls)
        free_contracts    = max(0, total_contracts - written_contracts)

        # Spot price — add ineligible dot on failure so ticker is always visible
        try:
            spot = fetcher.get_price_for(ticker)
        except Exception:
            spot = 0.0
        if spot <= 0:
            dots.append({
                "id": f"dot_{ticker}", "sym": ticker,
                "x": 0, "y": 0, "delta": 0, "ivr": 0,
                "eligible": False,
                "total_shares": int(total_shares),
                "free_contracts": free_contracts,
                "sub_label": "Price unavailable",
            })
            continue

        # Select target expiry: nearest expiry within strategy DTE window
        expiries = fetcher.get_screener_expiries_for(ticker, dte_window[1])
        lo_dte, hi_dte = dte_window
        valid = []
        for exp in expiries:
            d = (datetime.strptime(exp, "%Y-%m-%d").date() - today).days
            if lo_dte <= d <= hi_dte:
                valid.append((d, exp))

        if not valid:
            if total_shares > 0:
                dots.append({
                    "id": f"dot_{ticker}", "sym": ticker,
                    "x": 0, "y": 0, "delta": 0, "ivr": 0,
                    "eligible": False,
                    "total_shares": int(total_shares),
                    "free_contracts": free_contracts,
                    "sub_label": f"No expiry in {lo_dte}–{hi_dte} DTE",
                })
            continue

        target_dte, target_expiry = min(valid, key=lambda v: v[0])

        # Fetch chain
        try:
            chain = fetcher.get_options_chain_for(ticker, target_expiry)
        except Exception:
            chain = []
        if not chain:
            dots.append({
                "id": f"dot_{ticker}", "sym": ticker,
                "x": 0, "y": 0, "delta": 0, "ivr": 0,
                "eligible": False,
                "total_shares": int(total_shares),
                "free_contracts": free_contracts,
                "sub_label": "No options data",
            })
            continue

        # Find best strike: OTM call closest to maxDelta without exceeding it
        best_row       = None
        best_delta_diff = float("inf")
        for row in chain:
            d = row.get("delta")
            s = row.get("strike")
            if d is None or s is None:
                continue
            if float(s) <= spot or float(d) > max_delta:
                continue
            diff = abs(float(d) - max_delta)
            if diff < best_delta_diff:
                best_delta_diff = diff
                best_row = row

        if best_row is None:
            if total_shares > 0:
                dots.append({
                    "id": f"dot_{ticker}", "sym": ticker,
                    "x": 0, "y": 0, "delta": 0, "ivr": 0,
                    "eligible": False,
                    "total_shares": int(total_shares),
                    "free_contracts": free_contracts,
                    "sub_label": f"No strike ≤ {max_delta}Δ found",
                })
            continue

        # Compute metrics
        delta    = float(best_row.get("delta", 0))
        strike   = float(best_row.get("strike", 0))
        bid      = float(best_row.get("bid") or 0)
        ask      = float(best_row.get("ask") or 0)
        mid      = round((bid + ask) / 2, 2) if (bid or ask) else 0
        if mid <= 0:
            dots.append({
                "id": f"dot_{ticker}", "sym": ticker,
                "x": 0, "y": 0, "delta": round(delta, 4), "ivr": round(float(best_row.get("impliedVolatility") or 0) * 100, 1),
                "eligible": False,
                "total_shares": int(total_shares),
                "free_contracts": free_contracts,
                "sub_label": "Market closed",
            })
            continue
        iv_raw   = float(best_row.get("impliedVolatility") or 0)
        iv_pct   = iv_raw * 100
        dte      = target_dte

        raw_yield_pct = (mid / spot * 100) if spot > 0 else 0
        ann_yield     = round((mid / spot) * (365 / dte) * 100, 2) if spot > 0 and dte > 0 else 0
        pop           = round((1 - delta) * 100)
        distance_pct  = round((strike - spot) / spot * 100, 1) if spot > 0 else 0
        premium_per_contract = round(mid * 100, 2)
        premium_total        = round(mid * free_contracts * 100, 2) if free_contracts > 0 else 0

        # Eligibility — for "available", only free_contracts > 0 matters
        if strategy == "available":
            eligible = free_contracts > 0
        else:
            eligible = (
                free_contracts > 0
                and delta <= max_delta
                and iv_pct >= min_ivr
                and ann_yield >= min_yield
            )

        # Dot — always added for every holding ticker
        dot: dict = {
            "id": f"dot_{ticker}", "sym": ticker,
            "x": round(raw_yield_pct, 3),
            "y": ann_yield,
            "delta": round(delta, 4),
            "ivr": round(iv_pct, 1),
            "eligible": eligible,
            "total_shares": int(total_shares),
            "free_contracts": free_contracts,
            "total_contracts": total_contracts,
        }
        if 0 < total_shares < 100:
            dot["sub_label"] = f"({int(total_shares)} shares — need 100)"
        elif free_contracts == 0 and total_contracts > 0:
            dot["sub_label"] = f"{total_contracts}/{total_contracts} written"
        dots.append(dot)

        if not eligible:
            continue

        # Score with strategy-specific weights
        s_signal = max(0.0, total_score) / 12 * weights["signal"]
        if min_yield > 0:
            s_yield = min(ann_yield / (min_yield * 2.0), 1.0) * weights["yield"]
        else:
            s_yield = min(raw_yield_pct / 0.70, 1.0) * weights["yield"]
        s_delta         = (1 - delta / max_delta) * weights["delta"]
        s_dte           = _dte_score(dte, dte_window) * weights["dte"]
        composite_score = round(s_signal + s_yield + s_delta + s_dte)
        conviction      = "High" if composite_score >= 80 else "Med" if composite_score >= 60 else "Low"

        # Action string
        exp_date_obj   = datetime.strptime(target_expiry, "%Y-%m-%d").date()
        expiry_short   = exp_date_obj.strftime("%b") + " " + str(exp_date_obj.day)
        strike_display = int(strike) if strike == int(strike) else strike
        action         = f"Sell {free_contracts}× {expiry_short} ${strike_display} Call"

        # Thesis + tags
        metrics = {
            "ticker": ticker, "strike": strike_display,
            "distance_pct": distance_pct, "dte": dte,
            "premium_per_contract": premium_per_contract,
            "premium_total": premium_total,
            "annYield": ann_yield, "delta": delta,
            "iv": iv_raw, "above_ma50": None,
            "total_contracts": total_contracts,
            "written_contracts": written_contracts,
            "free_contracts": free_contracts,
            "expiry_short": expiry_short,
            "composite_score": composite_score,
        }
        thesis = _build_thesis(strategy, metrics)
        tags   = _derive_tags({
            **metrics, "expiry": target_expiry,
            "earnings_date": None, "fifty_two_week_high": None,
            "days_since_earnings": None,
            "written_contracts": written_contracts,
            "total_contracts": total_contracts,
        }, preset)

        recs.append({
            "id": f"rec_{ticker}", "sym": ticker,
            "conviction": conviction, "score": composite_score,
            "action": action,
            "premium": premium_total,
            "annYield": ann_yield,
            "pop": pop, "delta": round(delta, 4),
            "strike": strike, "expiry": target_expiry,
            "expiry_short": expiry_short, "dte": dte,
            "contracts": free_contracts, "mid": mid,
            "iv": round(iv_pct, 1),
            "thesis": thesis, "tags": tags,
            "score_breakdown": {
                "signal": round(s_signal, 1), "yield": round(s_yield, 1),
                "delta": round(s_delta, 1),   "dte_quality": round(s_dte, 1),
            },
        })

    recs.sort(key=lambda r: -r["score"])

    return {
        "meta": {
            "updatedAt": datetime.utcnow().isoformat() + "Z",
            "eligibleCount": len(recs),
            "strategy": strategy,
            "portfolio_id": pid,
        },
        "dots": dots,
        "recs": recs,
    }


# ── P&L endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/pnl")
def get_pnl(current_user: User = Depends(auth_module.get_current_user)):
    positions      = db.get_positions(current_user.id)
    open_positions = [p for p in positions if p.get("status") == "open"]
    total_premium  = sum(p.get("premium_collected", 0) for p in open_positions)
    total_pnl = 0
    results = []
    for pos in open_positions:
        current    = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
        sell_price = pos["sell_price"]
        contracts  = pos["contracts"]
        pnl        = (sell_price - current) * contracts * 100
        profit_pct = (sell_price - current) / sell_price * 100 if sell_price else 0
        total_pnl += pnl
        results.append({
            "id": pos["id"], "expiry": pos["expiry"], "strike": pos["strike"],
            "pnl": round(pnl, 2), "profit_capture_pct": round(profit_pct, 2),
            "fifty_pct_rule_triggered": profit_pct >= 50,
        })
    closed = [p for p in positions if p.get("status") == "closed"]
    wins   = sum(1 for p in closed if p.get("final_pnl", 0) > 0)
    return {
        "total_premium_collected": round(total_premium, 2),
        "unrealized_pnl":          round(total_pnl, 2),
        "positions":               results,
        "closed_count":            len(closed),
        "win_count":               wins,
    }

@app.get("/api/pnl-summary")
def get_pnl_summary(
    portfolio_id: Optional[str] = Query(None),
    current_user: User = Depends(auth_module.get_current_user),
):
    positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)
    closed = [p for p in positions if p.get("status") == "closed" and p.get("final_pnl") is not None]
    open_  = [p for p in positions if p.get("status") == "open"]
    by_year: dict = {}
    for p in closed:
        year = (p.get("close_date") or "")[:4] or "unknown"
        by_year.setdefault(year, {"realized_pnl": 0.0, "trades": 0, "wins": 0})
        by_year[year]["realized_pnl"] += p["final_pnl"]
        by_year[year]["trades"] += 1
        if p["final_pnl"] > 0:
            by_year[year]["wins"] += 1
    total_realized   = sum(p["final_pnl"] for p in closed)
    total_unrealized = sum(
        round((p.get("sell_price", 0) - p.get("current_price", p.get("sell_price", 0))) * p.get("contracts", 0) * 100, 2)
        for p in open_
    )
    config_file = Path(__file__).parent / "config.json"
    tax_rate = 0.35
    if config_file.exists():
        try:
            cfg = json.loads(config_file.read_text())
            tax_rate = cfg.get("marginal_tax_rate", 0.35)
        except Exception:
            pass
    current_year = str(date.today().year)
    current_year_realized = by_year.get(current_year, {}).get("realized_pnl", 0.0)
    estimated_tax = round(max(0, current_year_realized) * tax_rate, 2)
    wins = sum(1 for p in closed if p.get("final_pnl", 0) > 0)
    return {
        "total_realized":          round(total_realized, 2),
        "total_unrealized":        round(total_unrealized, 2),
        "total_pnl":               round(total_realized + total_unrealized, 2),
        "estimated_tax_this_year": estimated_tax,
        "tax_rate_used":           tax_rate,
        "by_year":                 by_year,
        "open_positions":          len(open_),
        "closed_positions":        len(closed),
        "win_rate":                round(wins / len(closed) * 100, 1) if closed else 0,
    }

@app.get("/api/iv-rank")
def get_iv_rank():
    return fetcher.get_vix_history()

@app.get("/api/dividends")
def get_dividends():
    return fetcher.get_spy_dividends()

@app.get("/api/equity-curve")
def get_equity_curve(
    range: str = Query("3M"),
    current_user: User = Depends(auth_module.get_current_user),
):
    import yfinance as yf
    import pandas as pd
    holdings = db.get_holdings(current_user.id)
    if not holdings:
        return {"dates": [], "equity": [], "income": []}
    today = date.today()
    if range == "1M":
        start = today - timedelta(days=30)
    elif range == "YTD":
        start = date(today.year, 1, 1)
    elif range == "1Y":
        start = today - timedelta(days=365)
    elif range == "All":
        start = today - timedelta(days=730)
    else:
        start = today - timedelta(days=90)
    ticker_shares: dict = {}
    for h in holdings:
        t = h["ticker"]
        ticker_shares[t] = ticker_shares.get(t, 0) + h["shares"]
    tickers = list(ticker_shares.keys())
    try:
        raw    = yf.download(tickers, start=start.isoformat(), interval="1d", progress=False, auto_adjust=True)
        closes = raw["Close"]
        if isinstance(closes, pd.Series):
            closes = closes.to_frame(tickers[0])
    except Exception as e:
        return {"dates": [], "equity": [], "income": [], "error": str(e)}
    dates: list = []
    equity: list = []
    for idx, row in closes.iterrows():
        day_val = 0.0
        for t, shares in ticker_shares.items():
            px = row.get(t)
            if px is not None and not pd.isna(px):
                day_val += float(px) * shares
        dates.append(idx.strftime("%Y-%m-%d"))
        equity.append(round(day_val, 2))
    positions = db.get_positions(current_user.id)
    income_by_date: dict = {}
    start_iso = start.isoformat()
    for pos in positions:
        if pos.get("status") == "closed" and pos.get("final_pnl") is not None:
            d = (pos.get("close_date") or pos.get("open_date") or "")[:10]
            if d >= start_iso:
                income_by_date[d] = income_by_date.get(d, 0) + pos["final_pnl"]
        else:
            d = (pos.get("open_date") or "")[:10]
            if d >= start_iso:
                income_by_date[d] = income_by_date.get(d, 0) + (pos.get("premium_collected") or 0)
    cumulative: list = []
    running = 0.0
    for d in dates:
        running += income_by_date.get(d, 0.0)
        cumulative.append(round(running, 2))
    return {"dates": dates, "equity": equity, "income": cumulative}

@app.get("/api/history/spy")
def get_spy_history():
    df = fetcher.get_spy_history(60)
    records = []
    for idx, row in df.iterrows():
        records.append({
            "date":   idx.strftime("%Y-%m-%d"),
            "open":   round(float(row["Open"]), 2),
            "high":   round(float(row["High"]), 2),
            "low":    round(float(row["Low"]),  2),
            "close":  round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })
    closes = [r["close"] for r in records]
    for i, rec in enumerate(records):
        rec["ma_20"] = round(sum(closes[i-19:i+1]) / 20, 2) if i >= 19 else None
    return records


# ── AlphaVantage endpoints ────────────────────────────────────────────────────

@app.get("/api/alpha/news")
def alpha_news():
    return av.get_news_sentiment()

@app.get("/api/alpha/technicals")
def alpha_technicals():
    return av.get_all_technicals()

@app.get("/api/alpha/yields")
def alpha_yields():
    return {"ten_year": av.get_treasury_yield_10y(), "five_year": av.get_treasury_yield_5y()}

@app.get("/api/alpha/usage")
def alpha_usage():
    return av.get_usage()


# ── Macro calendar endpoints ──────────────────────────────────────────────────

class MacroEventIn(BaseModel):
    date: str
    description: str

@app.get("/api/macro")
def get_macro_context():
    upcoming = macro_calendar.get_upcoming_events(within_days=10)
    try:
        news_articles = av.get_news_sentiment().get("feed", []) or []
    except Exception:
        news_articles = []
    news_uncertainty = macro_calendar.detect_news_uncertainty(news_articles)
    return {
        "upcoming_events": upcoming,
        "user_events":     macro_calendar.get_user_events(),
        "news_uncertainty": news_uncertainty,
    }

@app.post("/api/macro/events")
def add_macro_event(body: MacroEventIn, current_user: User = Depends(auth_module.get_current_user)):
    from datetime import datetime as _dt
    try:
        _dt.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if not body.description.strip():
        raise HTTPException(status_code=400, detail="description cannot be empty")
    events = macro_calendar.add_user_event(body.date, body.description.strip())
    return {"ok": True, "user_events": events}

@app.delete("/api/macro/events")
def remove_macro_event(
    event_date: str = Query(...),
    description: str = Query(...),
    current_user: User = Depends(auth_module.get_current_user),
):
    events = macro_calendar.remove_user_event(event_date, description)
    return {"ok": True, "user_events": events}


# ── Feedback endpoints ────────────────────────────────────────────────────────

class FeedbackIn(BaseModel):
    position_context: dict
    option_chosen: str
    free_text: Optional[str] = None

class FeedbackConfigIn(BaseModel):
    feedback_email:             Optional[str] = None
    feedback_phone:             Optional[str] = None
    sms_webhook_url:            Optional[str] = None
    feedback_notify_immediate:  Optional[bool] = None
    smtp_host:                  Optional[str] = None
    smtp_port:                  Optional[int] = None
    smtp_user:                  Optional[str] = None
    smtp_pass:                  Optional[str] = None

@app.post("/api/feedback")
@limiter.limit("10/minute")
def submit_feedback(request: Request, body: FeedbackIn):
    text = (body.free_text or "").strip()
    if len(text) > 280:
        raise HTTPException(status_code=400, detail="free_text must be 280 characters or fewer")
    return feedback_log.log_feedback(
        position_context=body.position_context,
        option_chosen=body.option_chosen,
        free_text=text,
    )

@app.get("/api/feedback")
def get_feedback_log(limit: int = Query(100)):
    return feedback_log.get_log(limit)

@app.get("/api/feedback/config")
def get_feedback_config():
    config_file = Path(__file__).parent / "config.json"
    if not config_file.exists():
        return {}
    try:
        cfg = json.loads(config_file.read_text())
    except Exception:
        return {}
    return {
        "feedback_email":            cfg.get("feedback_email", ""),
        "feedback_phone":            cfg.get("feedback_phone", ""),
        "sms_webhook_url":           cfg.get("sms_webhook_url", ""),
        "feedback_notify_immediate": cfg.get("feedback_notify_immediate", True),
        "smtp_host":                 cfg.get("smtp_host", ""),
        "smtp_port":                 cfg.get("smtp_port", 587),
        "smtp_user":                 cfg.get("smtp_user", ""),
    }

@app.put("/api/feedback/config")
def save_feedback_config(body: FeedbackConfigIn, current_user: User = Depends(auth_module.get_current_user)):
    config_file = Path(__file__).parent / "config.json"
    cfg = {}
    if config_file.exists():
        try:
            cfg = json.loads(config_file.read_text())
        except Exception:
            pass
    cfg.update(body.dict(exclude_none=True))
    config_file.write_text(json.dumps(cfg, indent=2))
    return {k: v for k, v in cfg.items() if k != "smtp_pass"}


# ── OI / Recommendations / Scorecard ─────────────────────────────────────────

@app.get("/api/recommendations/log")
def get_recommendation_log(limit: int = Query(100)):
    return rec_logger.get_log(limit)

@app.get("/api/scorecard")
def get_scorecard(
    portfolio_id: Optional[str] = Query(None),
    current_user: User = Depends(auth_module.get_current_user),
):
    _require_pro(current_user)
    positions = db.get_positions(current_user.id, portfolio_id=portfolio_id)
    rec_log = rec_logger.get_log(500)
    open_now_recs = [
        r for batch in rec_log
        for r in batch.get("recommendations", [])
        if r.get("recommendation") in ("OPEN NOW", "OPEN")
    ]
    acted_batches = [b for b in rec_log if b.get("acted_on")]
    total_acted   = sum(len(b["acted_on"]) for b in acted_batches)
    adherence_rate = (total_acted / len(open_now_recs) * 100) if open_now_recs else 0
    open_positions = [p for p in positions if p.get("open_signal") and p["open_signal"].get("total_score") is not None]
    avg_signal_at_open = (
        sum(p["open_signal"]["total_score"] for p in open_positions) / len(open_positions)
        if open_positions else 0
    )
    missed_recs = [
        r for batch in rec_log
        if not batch.get("acted_on")
        for r in batch.get("recommendations", [])
        if r.get("recommendation") == "OPEN NOW"
        and r.get("mid") and r.get("contracts_suggested", 0) > 0
    ]
    hypothetical_missed_pnl = round(sum(
        r["mid"] * r["contracts_suggested"] * 100 * 0.50 for r in missed_recs
    ), 2)
    actual_realized = round(sum(p.get("final_pnl", 0) for p in positions if p.get("status") == "closed"), 2)
    feedback = []
    max_score = 14
    if open_positions and avg_signal_at_open < 6:
        feedback.append(f"You tend to open positions when the signal score is below 6/{max_score} — consider waiting for SELL PREMIUM regime.")
    if open_now_recs and adherence_rate < 50:
        feedback.append(f"You acted on {adherence_rate:.0f}% of OPEN NOW signals. Missed opportunities represent ~${hypothetical_missed_pnl:,.0f} in potential premium.")
    if open_now_recs and adherence_rate >= 80:
        feedback.append("Strong adherence to signals — you are closely following the system's recommendations.")
    collecting = len(rec_log) < 10
    return {
        "adherence_rate":               round(adherence_rate, 1),
        "avg_signal_score_at_open":     round(avg_signal_at_open, 1),
        "actual_realized_pnl":          actual_realized,
        "hypothetical_missed_pnl":      hypothetical_missed_pnl,
        "total_open_now_recommendations": len(open_now_recs),
        "total_acted_on":               total_acted,
        "feedback":                     feedback,
        "positions_with_signal_data":   len(open_positions),
        "log_entries":                  len(rec_log),
        "collecting":                   collecting,
        "recent_log":                   rec_log[-20:],
    }

@app.get("/api/oi/expiries")
def get_oi_expiries():
    """Near-term daily expiries for the OI chart (distinct from the 21–60 DTE
    set /api/options/expiries returns for the position-entry flow)."""
    return fetcher.get_oi_chart_expiries()


@app.post("/api/oi/snapshot")
def run_oi_snapshot(current_user: User = Depends(auth_module.get_current_user)):
    """Capture today's OI snapshot for the near-term chart expiries on demand.
    Synchronous so the chart can refetch and show data immediately. force=True
    overwrites today's frame with this fresh pull (and re-stamps its capture time
    + spot), since the user explicitly asked to refresh."""
    spot = fetcher.get_spy_price().get("price", 0) or 0
    expiries = fetcher.get_oi_chart_expiries()
    captured, errors = 0, []
    for exp in expiries:
        try:
            chain = fetcher.get_options_chain(exp)
            if chain:
                oi_tracker.record_chain_snapshot(exp, chain, force=True, spot=spot)
                captured += 1
        except Exception as e:
            errors.append(f"{exp}: {e}")
    return {
        "date":      date.today().isoformat(),
        "expiries":  len(expiries),
        "captured":  captured,
        "errors":    errors,
    }


def _json_safe(obj):
    """Recursively replace non-finite floats (NaN / Infinity) with None.

    json.dumps emits those as bare NaN/Infinity tokens that the browser's
    JSON.parse rejects — a single one anywhere makes the whole response
    unparseable and the chart shows "Could not load." This is the last line of
    defense after spot/gamma are coerced upstream.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


def _strike_band(center: float, iv: float, dte: int, sigmas: float = 6.0):
    """±`sigmas`σ x-axis window for the OI chart, symmetric around `center`.

    `center` must be the LIVE underlying (the price the chart's dashed spot line
    marks) so the window brackets where the stock is now — not yesterday's close,
    which on a gap day pushes the whole band to one side and hides the strikes the
    trader cares about. σ is the expected move to expiry from the ATM IV:
    σ = center · IV · √(DTE/365). The half-width is floored at 1.5% of center so a
    0DTE tab isn't razor-thin. Returns (low, high), or (None, None) if inputs are
    unusable. Pure + side-effect-free so the centring contract is unit-testable.
    """
    if not (center and center > 0 and iv and iv > 0):
        return None, None
    T = max(dte, 1) / 365.0
    sigma = center * iv * math.sqrt(T)
    half = max(sigmas * sigma, center * 0.015)
    return round(center - half, 2), round(center + half, 2)


@app.get("/api/oi/chain/history")
def get_oi_chain_history(
    expiry: str = Query(...),
    current_user: User = Depends(auth_module.get_current_user),
):
    """Every non-empty snapshot for an expiry in a single payload — a frozen
    morning view, not a live feed.

    The chart loads this once per expiry and then scrubs / auto-plays purely in
    memory (no per-frame fetch), so the history slider is instant. Each frame is
    rendered exactly as captured: open interest, option mids, and the underlying
    spot are all the morning-pull values, so nothing drifts intraday. Open
    interest is a once-daily figure anyway (OCC settles a session's trades
    overnight and publishes them the next morning); the daily capture is owned by
    the pre-open snapshot job + first-request self-heal, so this endpoint is
    read-only and never re-fetches the chain.
    """
    _require_pro(current_user)
    snapshots = oi_tracker.get_chain_history(expiry)
    today_str = date.today().isoformat()

    # Fallback spot only for frames captured before per-frame spot was stored
    # (legacy data). Cached + cheap, and skipped entirely once every frame has a
    # stored morning spot. yfinance can return a NaN price without raising, and
    # `NaN or 0` stays NaN (NaN is truthy) — which would poison the JSON — so this
    # must be coerced to a finite value, not just `or 0`.
    fallback_spot = 0
    if any(s.get("spot") is None for s in snapshots):
        try:
            raw = fetcher.get_spy_price().get("price", 0)
            fallback_spot = raw if (isinstance(raw, (int, float)) and math.isfinite(raw) and raw > 0) else 0
        except Exception:
            fallback_spot = 0

    out = []
    for snap in snapshots:
        frame_spot = snap.get("spot") or fallback_spot
        strikes = []
        for s in snap["strikes"]:
            strike_f = float(s["strike"])
            cm = s.get("call_mid") or 0.0
            pm = s.get("put_mid")  or 0.0
            call_intrinsic = max(0.0, frame_spot - strike_f) if frame_spot else 0.0
            put_intrinsic  = max(0.0, strike_f - frame_spot) if frame_spot else 0.0
            call_time_prem = max(0.0, cm - call_intrinsic)
            put_time_prem  = max(0.0, pm - put_intrinsic)
            strikes.append({
                "strike":          strike_f,
                "call_oi":         s.get("call_oi") or 0,
                "put_oi":          s.get("put_oi")  or 0,
                "call_change_1d":  s.get("call_change_1d"),
                "put_change_1d":   s.get("put_change_1d"),
                "call_time_value": round((s.get("call_oi") or 0) * call_time_prem * 100, 2),
                "put_time_value":  round((s.get("put_oi")  or 0) * put_time_prem  * 100, 2),
            })
        out.append({
            "capture_date": snap["capture_date"],
            "captured_at":  snap["captured_at"],
            "is_today":     snap["capture_date"] == today_str,
            "spot":         round(float(frame_spot), 2) if frame_spot else None,
            "pin":          oi_tracker.compute_pin_analysis(snap["strikes"], frame_spot),
            "strikes":      strikes,
        })

    latest_spot = out[-1]["spot"] if out else (fallback_spot or 0)

    # Live underlying for the spot line on today's frame (the morning-pull spot is
    # frozen; the dashed reference line should track where SPY is *now*). Also derive
    # the prior session's close, which anchors the x-axis window below.
    live = fetcher.get_spy_price()
    raw_live = live.get("price", 0)
    live_spot = round(float(raw_live), 2) if (isinstance(raw_live, (int, float)) and math.isfinite(raw_live) and raw_live > 0) else 0
    prev_close = round(live_spot - float(live.get("change", 0) or 0), 2) if live_spot else 0

    # ±6σ x-axis window, centred on the LIVE underlying — the same price the dashed
    # spot line marks — so the window stays symmetric around where SPY is *now*, even
    # on a big gap/move day. (Centring on the prior close instead pushed the whole
    # band to one side on a -11pt day: the spot line sat at the far edge and every
    # strike past it was filtered out — see PIPE bug 2026-06-11.) σ is the expected
    # move *to this expiry* from the option's own ATM IV: σ = S · IV · √(DTE/365).
    # Near-dated tabs come out tight, far-dated ones wider.
    band_low = band_high = None
    atm_iv = None
    center = live_spot or prev_close or latest_spot or 0
    if center > 0:
        try:
            exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            dte = (exp_date - date.today()).days
            chain = fetcher.get_options_chain(expiry)
            atm = min(
                (r for r in chain if (r.get("impliedVolatility") or 0) > 0),
                key=lambda r: abs(float(r.get("strike") or 0) - center),
                default=None,
            )
            iv = float((atm or {}).get("impliedVolatility") or 0)
            if iv > 0:
                atm_iv = round(iv, 4)
                band_low, band_high = _strike_band(center, iv, dte)
        except Exception:
            band_low = band_high = atm_iv = None

    return _json_safe({
        "expiry":        expiry,
        "ticker":        "SPY",
        "spy_price":     latest_spot or 0,
        "live_spot":     live_spot or None,
        "prev_close":    prev_close or None,
        "band_low":      band_low,
        "band_high":     band_high,
        "atm_iv":        atm_iv,
        "today":         today_str,
        "snapshots":     out,
        "num_snapshots": len(out),
    })


@app.post("/api/oi/snapshot")
def trigger_oi_snapshot(current_user: User = Depends(auth_module.get_current_user)):
    open_pos = db.get_open_positions(current_user.id)
    expiries = list({p["expiry"] for p in open_pos if p.get("expiry")})
    strikes_recorded = 0
    errors = []
    for exp in expiries:
        try:
            chain = fetcher.get_options_chain(exp)
            records = [
                {"expiry": exp, "strike": float(r["strike"]), "oi": r.get("openInterest") or 0}
                for r in chain if r.get("strike") is not None
            ]
            oi_tracker.record_batch(records)
            strikes_recorded += sum(1 for r in records if r["oi"] > 0)
        except Exception as e:
            errors.append(f"{exp}: {str(e)}")
    return {
        "ok": True,
        "expiries_processed": len(expiries),
        "strikes_recorded":   strikes_recorded,
        "errors":             errors,
        "timestamp":          datetime.now().isoformat(),
    }


# ── Roll targets ──────────────────────────────────────────────────────────────

@app.get("/api/roll-targets/{position_id}")
def get_roll_targets(position_id: str, current_user: User = Depends(auth_module.get_current_user)):
    pos = db.get_position(current_user.id, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos.get("status") != "open":
        raise HTTPException(status_code=400, detail="Position is not open")
    spy_data      = fetcher.get_spy_price()
    spy_price     = spy_data.get("price", 0)
    current_price = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
    close_cost    = round(current_price * pos["contracts"] * 100, 2)
    intrinsic_now = round(max(0.0, spy_price - float(pos["strike"])), 2)
    time_prem_now = round(max(0.0, current_price - intrinsic_now), 2)
    today         = date.today()
    all_expiries  = fetcher.get_screener_expiries(max_dte=60)
    target_expiries = [
        e for e in all_expiries
        if 28 <= (datetime.strptime(e, "%Y-%m-%d").date() - today).days <= 50
    ]
    if not target_expiries:
        target_expiries = [
            e for e in all_expiries
            if 21 <= (datetime.strptime(e, "%Y-%m-%d").date() - today).days <= 60
        ]
    all_candidates: list = []
    for exp in target_expiries:
        chain    = fetcher.get_options_chain(exp)
        exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        dte      = (exp_date - today).days
        for row in chain:
            strike = row.get("strike")
            if strike is None:
                continue
            bid = row.get("bid") or 0
            ask = row.get("ask") or 0
            mid = round((bid + ask) / 2, 2) if (bid or ask) else 0
            if mid <= 0:
                continue
            new_intrinsic = round(max(0.0, spy_price - float(strike)), 2)
            new_time_prem = round(max(0.0, mid - new_intrinsic), 2)
            net_credit    = round(mid - current_price, 2)
            delta         = row.get("delta")
            score         = _roll_score(net_credit, new_time_prem, new_intrinsic, dte)
            all_candidates.append({
                "strike": float(strike), "expiry": exp, "dte": dte, "mid": mid,
                "new_intrinsic": new_intrinsic, "new_time_prem": new_time_prem,
                "net_credit": net_credit,
                "delta": round(float(delta), 4) if delta is not None else None,
                "roll_score": score,
            })
    def _fmt(scenario_key: str, c, label: str, description: str) -> dict:
        if c is None:
            return {"scenario": scenario_key, "viable": False, "label": label, "description": description}
        net_credit_total = round(c["net_credit"] * pos["contracts"] * 100, 2)
        break_even = round(float(c["strike"]) + c["new_time_prem"], 2)
        return {
            "scenario": scenario_key, "viable": True, "label": label, "description": description,
            "new_strike": c["strike"], "new_expiry": c["expiry"], "new_dte": c["dte"],
            "new_mid": c["mid"], "close_cost": round(current_price, 2),
            "net_credit": c["net_credit"], "net_credit_total": net_credit_total,
            "new_time_premium": c["new_time_prem"], "new_intrinsic": c["new_intrinsic"],
            "new_delta": c["delta"], "break_even_price": break_even, "roll_score": c["roll_score"],
        }
    otm_credit = [c for c in all_candidates if c["strike"] > spy_price and c["net_credit"] >= 0]
    otm_credit.sort(key=lambda c: (-c["strike"], c["dte"]))
    atm_low   = spy_price * 0.98
    atm_high  = spy_price * 1.02
    atm_range = sorted([c for c in all_candidates if atm_low <= c["strike"] <= atm_high], key=lambda c: -c["roll_score"])
    by_tp     = sorted(all_candidates, key=lambda c: -c["new_time_prem"])
    used: set = set()
    def _dedup(cand, pool):
        if cand is None:
            return None
        key = (cand["strike"], cand["expiry"])
        if key not in used:
            used.add(key)
            return cand
        for alt in pool:
            ak = (alt["strike"], alt["expiry"])
            if ak not in used:
                used.add(ak)
                return alt
        return None
    return {
        "position_id": position_id,
        "position": {
            "strike": pos["strike"], "expiry": pos["expiry"], "dte": _dte(pos["expiry"]),
            "sell_price": pos["sell_price"], "contracts": pos["contracts"],
            "current_price": round(current_price, 2),
            "intrinsic_value": intrinsic_now, "time_premium": time_prem_now,
        },
        "spy_price":        spy_price,
        "close_cost_total": close_cost,
        "scenarios": [
            _fmt("DEFENSIVE", _dedup(otm_credit[0] if otm_credit else None, otm_credit),
                 "Safe Harbor Roll",
                 "Move to a higher strike and collect a credit — you stay out-of-the-money and bring in new income."),
            _fmt("BALANCED", _dedup(atm_range[0] if atm_range else None, atm_range),
                 "Balanced Harvest",
                 "Roll near the current price to maximize time value. You may carry some intrinsic risk but collect the most premium per day."),
            _fmt("INCOME", _dedup(by_tp[0] if by_tp else None, by_tp),
                 "Income-First Roll",
                 "Go where the time value is richest. Best income potential; may carry assignment risk at the new strike if it's near the money."),
        ],
    }


# ── SnapTrade endpoints ───────────────────────────────────────────────────────

import snaptrade as st

class SnapTradeImportParams(BaseModel):
    conflict_resolution: str = "brokerage"  # "brokerage" | "harvest"
    account_ids: Optional[List[str]] = None  # None = all accounts

@app.post("/api/snaptrade/register")
def snaptrade_register(current_user: User = Depends(auth_module.get_current_user)):
    creds = db.get_snaptrade_credentials(current_user.id)
    if creds:
        return {"already_registered": True, "snaptrade_user_id": creds["snaptrade_user_id"]}
    result = st.register_user(current_user.id)
    db.upsert_snaptrade_credentials(current_user.id, result["userId"], result["userSecret"])
    return {"registered": True, "snaptrade_user_id": result["userId"]}

@app.get("/api/snaptrade/connect-link")
def snaptrade_connect_link(
    connection_id: Optional[str] = Query(None),
    current_user: User = Depends(auth_module.get_current_user),
):
    creds = db.get_snaptrade_credentials(current_user.id)
    if not creds:
        raise HTTPException(status_code=400, detail="SnapTrade account not registered. Call /api/snaptrade/register first.")
    link = st.get_connection_link(
        creds["snaptrade_user_id"],
        creds["user_secret"],
        connection_id=connection_id,
    )
    return {"link": link}

@app.get("/api/snaptrade/connections")
def snaptrade_connections(current_user: User = Depends(auth_module.get_current_user)):
    creds = db.get_snaptrade_credentials(current_user.id)
    if not creds:
        return []
    live = st.get_connections(creds["snaptrade_user_id"], creds["user_secret"])
    stored = {c["connection_id"]: c for c in db.get_snaptrade_connections(current_user.id)}
    result = []
    for conn in live:
        cid = conn.get("id") or conn.get("connection_id")
        row = {
            "connection_id":  cid,
            "brokerage_name": conn.get("brokerage", {}).get("name") if isinstance(conn.get("brokerage"), dict) else conn.get("brokerage_name", ""),
            "status":         conn.get("status", "ACTIVE"),
            "last_synced":    stored.get(cid, {}).get("last_synced"),
        }
        db.upsert_snaptrade_connection(current_user.id, {
            "connection_id":  row["connection_id"],
            "brokerage_name": row["brokerage_name"],
            "status":         row["status"],
        })
        result.append(row)
    return result

@app.delete("/api/snaptrade/connections/{connection_id}")
def snaptrade_disconnect(connection_id: str, current_user: User = Depends(auth_module.get_current_user)):
    creds = db.get_snaptrade_credentials(current_user.id)
    if creds:
        try:
            st.delete_connection(creds["snaptrade_user_id"], creds["user_secret"], connection_id)
        except Exception:
            pass
    db.delete_snaptrade_connection(current_user.id, connection_id)
    return {"ok": True}

@app.get("/api/snaptrade/health")
def snaptrade_health(current_user: User = Depends(auth_module.get_current_user)):
    creds = db.get_snaptrade_credentials(current_user.id)
    if not creds:
        return {"connected": False, "connections": []}
    try:
        live = st.get_connections(creds["snaptrade_user_id"], creds["user_secret"])
    except Exception:
        return {"connected": False, "connections": [], "error": "Could not reach SnapTrade"}
    broken = [c for c in live if c.get("status") not in ("ACTIVE", "active")]
    return {"connected": True, "connections": live, "broken_count": len(broken), "needs_reconnect": len(broken) > 0}

@app.get("/api/snaptrade/accounts")
def snaptrade_accounts(current_user: User = Depends(auth_module.get_current_user)):
    creds = db.get_snaptrade_credentials(current_user.id)
    if not creds:
        return []
    try:
        accounts = st.get_accounts(creds["snaptrade_user_id"], creds["user_secret"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SnapTrade error: {e}")
    result = []
    for acc in accounts:
        acc_id = acc.get("id") or acc.get("account_id", "")
        brokerage = acc.get("brokerage") or {}
        conn = acc.get("broker_authorization") or acc.get("connection") or {}
        result.append({
            "id":              acc_id,
            "name":            acc.get("name") or acc.get("account_name", ""),
            "number":          acc.get("number") or acc.get("account_number", ""),
            "type":            acc.get("type", ""),
            "brokerage_name":  brokerage.get("name") if isinstance(brokerage, dict) else str(brokerage),
            "connection_id":   conn.get("id") if isinstance(conn, dict) else str(conn),
        })
    return result

@app.post("/api/snaptrade/import")
def snaptrade_import(
    body: SnapTradeImportParams,
    current_user: User = Depends(auth_module.get_current_user),
):
    creds = db.get_snaptrade_credentials(current_user.id)
    if not creds:
        raise HTTPException(status_code=400, detail="SnapTrade account not registered.")
    accounts = st.get_accounts(creds["snaptrade_user_id"], creds["user_secret"])
    result = {"imported": 0, "updated": 0, "skipped": 0, "conflicts": [], "accounts": len(accounts), "raw_total": 0}

    for account in accounts:
        account_id   = account.get("id") or account.get("account_id", "")
        if body.account_ids and account_id not in body.account_ids:
            continue
        conn_id   = account.get("brokerage_authorization") or account.get("broker_authorization") or None
        meta      = account.get("meta") if isinstance(account.get("meta"), dict) else {}
        brok_name = account.get("institution_name") or meta.get("institution_name") or "Unknown Brokerage"
        acc_name = account.get("name") or account.get("account_name", "")
        try:
            portfolio = db.ensure_brokerage_portfolio(
                current_user.id, conn_id or None, brok_name, account_id, acc_name
            )
        except Exception as e:
            msg = str(e)
            if "does not exist" in msg and "column" in msg:
                raise HTTPException(
                    status_code=500,
                    detail="Database migration required. Run backend/migrations/002_brokerage_portfolios.sql in Supabase before syncing.",
                )
            raise HTTPException(status_code=500, detail=f"Portfolio setup failed: {msg}")
        portfolio_id = portfolio["id"]

        raw_positions = st.get_positions(creds["snaptrade_user_id"], creds["user_secret"], account_id)
        raw_options   = st.get_options_positions(creds["snaptrade_user_id"], creds["user_secret"], account_id)
        raw_balances  = st.get_balances(creds["snaptrade_user_id"], creds["user_secret"], account_id)
        db.save_raw_import(current_user.id, account_id, {
            "positions": raw_positions,
            "options":   raw_options,
            "balances":  raw_balances,
        })
        result["raw_total"] += len(raw_positions) + len(raw_options)
        for raw in raw_positions + raw_options:
            try:
                category = st.categorize_position(raw)
                mapped   = st.map_to_harvest(raw, category, portfolio_id)
            except Exception as e:
                result.setdefault("parse_errors", []).append(str(e))
                continue
            if not mapped:
                continue
            # Check for conflict: same ticker + strike + expiry (options only)
            conflict = None
            if mapped.get("strike") and mapped.get("expiry"):
                all_pos = db.get_positions(current_user.id)
                conflict = next(
                    (p for p in all_pos
                     if p.get("ticker") == mapped.get("ticker")
                     and str(p.get("strike")) == str(mapped.get("strike"))
                     and str(p.get("expiry")) == str(mapped.get("expiry"))),
                    None,
                )
            if conflict:
                if body.conflict_resolution == "brokerage":
                    updates = {k: v for k, v in mapped.items() if k not in ("id", "user_id", "notes", "open_signal", "close_signal")}
                    db.update_position(current_user.id, conflict["id"], updates)
                    result["updated"] += 1
                elif body.conflict_resolution == "harvest":
                    result["skipped"] += 1
                else:
                    result["conflicts"].append({"incoming": mapped, "existing": conflict})
            elif category in ("covered_call", "long_stock", "cash_secured_put", "protective_put", "long_call"):
                if category == "long_stock":
                    _, created = db.upsert_holding(current_user.id, {
                        "id":                  str(uuid.uuid4()),
                        "portfolio_id":        portfolio_id,
                        "ticker":              mapped.get("ticker"),
                        "shares":              mapped.get("shares") or 0,
                        "avg_cost":            mapped.get("avg_cost"),
                        "snaptrade_id":        mapped.get("snaptrade_id"),
                        "snaptrade_account_id": account_id,
                        "snaptrade_raw":       raw,
                    })
                    if created:
                        result["imported"] += 1
                    else:
                        result["updated"] += 1
                else:
                    db.create_position(current_user.id, {**mapped, "portfolio_id": portfolio_id})
                    result["imported"] += 1
            else:
                # Uncategorized — store as position with harvest_category for review
                db.create_position(current_user.id, {**mapped, "portfolio_id": default["id"]})
                result["imported"] += 1

        # Update last_synced for this connection
        connections = db.get_snaptrade_connections(current_user.id)
        for conn in connections:
            db.upsert_snaptrade_connection(current_user.id, {
                **conn,
                "last_synced": datetime.utcnow().isoformat(),
            })
    return result

_SNAPTRADE_WEBHOOK_SECRET = os.getenv("SNAPTRADE_WEBHOOK_SECRET", "")

@app.post("/api/snaptrade/webhook")
async def snaptrade_webhook(request: Request):
    if not _SNAPTRADE_WEBHOOK_SECRET:
        # Fail closed: refuse to process webhooks until the secret is configured.
        raise HTTPException(status_code=503, detail="Webhook not configured")
    payload = await request.json()
    sent_secret = payload.get("webhookSecret", "")
    if not hmac.compare_digest(str(sent_secret), _SNAPTRADE_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    event_type = payload.get("type") or payload.get("eventType", "")
    user_id    = payload.get("userId")
    if event_type in ("CONNECTION_BROKEN", "AUTHORIZATION_DISABLED") and user_id:
        creds = db.get_snaptrade_credentials(user_id)
        if creds:
            connections = db.get_snaptrade_connections(user_id)
            for conn in connections:
                db.upsert_snaptrade_connection(user_id, {**conn, "status": "DISABLED"})
    return {"ok": True}


# ── Calculator (public, anonymous, rate-limited by IP) ───────────────────────

WAITLIST_FILE = Path(__file__).parent / "waitlist.json"
_calc_ip_calls: dict = defaultdict(list)
CALC_LIMIT = 3
CALC_WINDOW_HOURS = 24

@app.get("/api/calculator")
def public_calculator(
    ticker: str,
    shares: int,
    request: Request,
    current_user: Optional[User] = Depends(auth_module.get_optional_user),
):
    if current_user is None:
        client_ip = request.client.host if request.client else "unknown"
        now    = datetime.utcnow()
        cutoff = now - timedelta(hours=CALC_WINDOW_HOURS)
        _calc_ip_calls[client_ip] = [t for t in _calc_ip_calls[client_ip] if t > cutoff]
        if len(_calc_ip_calls[client_ip]) >= CALC_LIMIT:
            raise HTTPException(
                status_code=429,
                detail={"limit_reached": True, "message": "Daily limit reached. Sign up free to continue."},
            )
        _calc_ip_calls[client_ip].append(now)
    if shares <= 0:
        raise HTTPException(status_code=400, detail="shares must be positive")
    ticker    = ticker.upper().strip()
    contracts = shares // 100
    if contracts == 0:
        raise HTTPException(status_code=400, detail="Need at least 100 shares to write covered calls (1 contract = 100 shares).")
    try:
        data          = fetcher.get_calculator_data(ticker)
        spot          = data["spot"]
        target_expiry = data["expiry"]
        dte           = data["dte"]
        chain         = data["chain"]
        best = None
        for row in chain:
            delta = row.get("delta")
            mid   = row.get("mid", 0)
            if delta is None or mid <= 0:
                continue
            if 0.15 <= delta <= 0.30:
                if best is None or abs(delta - 0.22) < abs((best.get("delta") or 1) - 0.22):
                    best = row
        if not best:
            raise HTTPException(status_code=503, detail=f"No suitable strike found for {ticker} — needs liquid options market")
        mid                = best["mid"]
        monthly_estimate   = round(mid * contracts * 100, 2)
        annualized_yield_pct = round((mid / spot) * (365 / dte) * 100, 2) if spot > 0 and dte > 0 else 0
        return {
            "ticker": ticker, "shares": shares, "contracts": contracts,
            "monthly_estimate": monthly_estimate, "annualized_yield_pct": annualized_yield_pct,
            "strike": best.get("strike"), "expiry": target_expiry, "dte": dte,
            "mid": mid, "price": round(spot, 2),
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Market data error: {str(exc)}")


class WaitlistEntry(BaseModel):
    email: str

@app.post("/api/waitlist")
@limiter.limit("5/minute")
def join_waitlist(request: Request, entry: WaitlistEntry):
    email = entry.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email address")
    records: list = []
    if WAITLIST_FILE.exists():
        with open(WAITLIST_FILE) as f:
            records = json.load(f)
    if not any(r.get("email") == email for r in records):
        records.append({"email": email, "joined_at": datetime.utcnow().isoformat()})
        with open(WAITLIST_FILE, "w") as f:
            json.dump(records, f, indent=2)
    return {"ok": True}


# ── Markets endpoints (PIPE-MARKETS-01, Pro-gated) ───────────────────────────
# Powers the Markets tab: market-cap-weighted S&P 500 volume composite,
# per-ticker volume series, and SPY/QQQ overlay.

ALLOWED_ETF_TICKERS = {"SPY", "QQQ"}

def _require_pro(current_user: User) -> None:
    if current_user.tier != "pro":
        raise HTTPException(
            status_code=402,
            detail={"code": "PRO_FEATURE", "message": "Markets is a Pro feature."},
        )


def _parse_range(start: Optional[str], end: Optional[str]) -> tuple:
    today = date.today()
    if not end:
        e = today
    else:
        try:
            e = datetime.strptime(end, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail=f"invalid end date: {end}")
    if not start:
        s = e - timedelta(days=365)
    else:
        try:
            s = datetime.strptime(start, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail=f"invalid start date: {start}")
    if s > e:
        raise HTTPException(status_code=400, detail="start must be <= end")
    return s, e


@app.get("/api/markets/composite")
def get_composite(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(auth_module.get_current_user),
):
    """Pareto-80 market-cap-weighted S&P 500 volume composite."""
    _require_pro(current_user)
    s, e = _parse_range(start, end)
    rows = db.get_sp500_composite(s, e)
    return {
        "kind": "composite",
        "label": "S&P 500 Pareto-80 (cap-weighted)",
        "dates":           [r["date"] for r in rows],
        "weighted_volume": [float(r["weighted_volume"]) for r in rows],
        "total_volume":    [int(r["total_volume"]) for r in rows],
        "ticker_count":    [int(r["ticker_count"]) for r in rows],
    }


@app.get("/api/markets/ticker/{ticker}")
def get_ticker_series(
    ticker: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(auth_module.get_current_user),
):
    """Daily close + volume for a single ticker. Allowed: any ticker that has
    appeared in S&P 500 membership ever, plus SPY/QQQ."""
    _require_pro(current_user)
    s, e = _parse_range(start, end)
    sym = ticker.upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="ticker required")
    if sym in ALLOWED_ETF_TICKERS:
        rows = db.get_ticker_daily(sym, s, e, source="etf")
    else:
        # Membership check — block arbitrary tickers
        intervals = db.get_membership_intervals()
        if sym not in intervals:
            raise HTTPException(status_code=404, detail=f"{sym} not in S&P 500 membership history")
        rows = db.get_ticker_daily(sym, s, e, source="sp500")
    return {
        "kind": "ticker",
        "ticker": sym,
        "label": sym,
        "dates":  [r["date"] for r in rows],
        "close":  [float(r["close"]) if r.get("close") is not None else None for r in rows],
        "volume": [int(r["volume"]) if r.get("volume") is not None else None for r in rows],
    }


@app.get("/api/markets/top-n")
def get_top_n(
    n: int = Query(10, ge=1, le=500),
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(auth_module.get_current_user),
):
    """Cap-weighted volume composite restricted to the current top-N tickers
    by market cap. (Membership is current-as-of-today, applied across history.)"""
    _require_pro(current_user)
    if n not in (10, 50, 100, 500):
        raise HTTPException(status_code=400, detail="n must be one of 10, 50, 100, 500")
    s, e = _parse_range(start, end)
    members = db.get_top_n_tickers(n)
    if not members:
        return {"kind": "top_n", "n": n, "members": [], "dates": [], "weighted_volume": []}

    # Aggregate weighted volume per date over the chosen members. We use the
    # most recent market_cap as the static weight (point-in-time top-N is a
    # different feature; out of scope for v1).
    member_set = set(members)
    # Pull all daily rows for these members in range, in pages
    rows: list = []
    page_size = 1000
    offset = 0
    while True:
        page = (db.sb.table("sp500_daily")
                  .select("ticker, date, volume, market_cap")
                  .in_("ticker", members)
                  .gte("date", s.isoformat())
                  .lte("date", e.isoformat())
                  .range(offset, offset + page_size - 1)
                  .execute())
        data = page.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size

    # Group by date, weight volume by market cap on that date
    by_date: dict = {}
    for r in rows:
        d = r["date"]
        v = r.get("volume")
        mc = r.get("market_cap")
        if v is None or mc is None:
            continue
        slot = by_date.setdefault(d, {"vol_sum": 0.0, "cap_sum": 0.0, "raw_vol": 0})
        slot["vol_sum"] += float(v) * float(mc)
        slot["cap_sum"] += float(mc)
        slot["raw_vol"] += int(v)
    sorted_dates = sorted(by_date.keys())
    return {
        "kind": "top_n",
        "n": n,
        "label": f"Top {n} by market cap (cap-weighted)",
        "members": members,
        "dates":           sorted_dates,
        "weighted_volume": [
            (by_date[d]["vol_sum"] / by_date[d]["cap_sum"]) if by_date[d]["cap_sum"] else 0.0
            for d in sorted_dates
        ],
        "total_volume":    [by_date[d]["raw_vol"] for d in sorted_dates],
    }


@app.get("/api/markets/etfs")
def get_etfs(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(auth_module.get_current_user),
):
    """SPY + QQQ daily close + volume."""
    _require_pro(current_user)
    s, e = _parse_range(start, end)
    out = {}
    for sym in ("SPY", "QQQ"):
        rows = db.get_ticker_daily(sym, s, e, source="etf")
        out[sym] = {
            "dates":  [r["date"] for r in rows],
            "close":  [float(r["close"]) if r.get("close") is not None else None for r in rows],
            "volume": [int(r["volume"]) if r.get("volume") is not None else None for r in rows],
        }
    return out


@app.get("/api/markets/membership/current")
def get_current_membership(current_user: User = Depends(auth_module.get_current_user)):
    """Current S&P 500 ticker list — drives the typeahead filter UI."""
    _require_pro(current_user)
    tickers = db.get_current_sp500_tickers()
    return {"tickers": tickers, "count": len(tickers)}


# ── Static frontend (production only) ────────────────────────────────────────
# Skipped when HARVEST_DEV=1 so the Vite dev server owns port 5173.

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if DIST_DIR.exists() and not os.getenv("HARVEST_DEV"):
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        return FileResponse(str(DIST_DIR / "index.html"))
