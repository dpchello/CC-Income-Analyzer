import json
import uuid
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from data_fetcher import DataFetcher
from signals import SignalEngine
import alpha_fetcher as av
import oi_tracker
import rec_logger
import macro_calendar
import feedback_log

app = FastAPI(title="Covered Call Generator")

# ── CORS ─ wildcard for local network + cloud access ─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── File paths ────────────────────────────────────────────────────────────────
POSITIONS_FILE  = Path(__file__).parent / "positions.json"
PORTFOLIOS_FILE = Path(__file__).parent / "portfolios.json"
HOLDINGS_FILE   = Path(__file__).parent / "holdings.json"

fetcher = DataFetcher()
engine  = SignalEngine()


# ── Persistence helpers ───────────────────────────────────────────────────────

def load_portfolios():
    if PORTFOLIOS_FILE.exists():
        with open(PORTFOLIOS_FILE) as f:
            return json.load(f)
    return []

def save_portfolios(portfolios):
    with open(PORTFOLIOS_FILE, "w") as f:
        json.dump(portfolios, f, indent=2)

def _ensure_default_portfolio():
    portfolios = load_portfolios()
    if not any(p["id"] == "default" for p in portfolios):
        portfolios.insert(0, {
            "id": "default",
            "name": "Default",
            "created_date": date.today().isoformat(),
            "archived": False,
        })
        save_portfolios(portfolios)

def load_positions():
    if not POSITIONS_FILE.exists():
        return []
    with open(POSITIONS_FILE) as f:
        positions = json.load(f)
    # ── Lazy migration: assign unclaimed positions to Default portfolio ──
    needs_save = False
    for p in positions:
        if "portfolio_id" not in p:
            _ensure_default_portfolio()
            p["portfolio_id"] = "default"
            needs_save = True
    if needs_save:
        save_positions(positions)
    return positions

def save_positions(positions):
    with open(POSITIONS_FILE, "w") as f:
        json.dump(positions, f, indent=2)

def load_holdings():
    if not HOLDINGS_FILE.exists():
        return []
    with open(HOLDINGS_FILE) as f:
        return json.load(f)

def save_holdings(holdings):
    with open(HOLDINGS_FILE, "w") as f:
        json.dump(holdings, f, indent=2)


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

class HoldingIn(BaseModel):
    portfolio_id: str
    ticker: str = "SPY"
    shares: int
    avg_cost: float
    purchase_date: Optional[str] = None

class HoldingUpdate(BaseModel):
    shares: Optional[int] = None
    avg_cost: Optional[float] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dte(expiry_str: str) -> int:
    return (datetime.strptime(expiry_str, "%Y-%m-%d").date() - date.today()).days

def _portfolio_stats(portfolio_id: str, positions: list, spy_price: float) -> dict:
    """Compute stats for a single portfolio from pre-loaded positions."""
    mine = [p for p in positions if p.get("portfolio_id") == portfolio_id]
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

    # Coverage ratio
    holdings = [h for h in load_holdings() if h.get("portfolio_id") == portfolio_id]
    total_shares = sum(h["shares"] for h in holdings)
    covered_shares = sum(p["contracts"] * 100 for p in open_pos)
    coverage_pct = round(covered_shares / total_shares * 100, 1) if total_shares else None

    return {
        "open_count": len(open_pos),
        "closed_count": len(closed_pos),
        "total_premium_collected": round(total_premium, 2),
        "unrealized_pnl": round(unrealized_pnl, 2),
        "win_count": wins,
        "total_shares": total_shares,
        "covered_shares": covered_shares,
        "coverage_pct": coverage_pct,
    }


# ── Portfolio endpoints ───────────────────────────────────────────────────────

@app.get("/api/portfolios")
def get_portfolios():
    _ensure_default_portfolio()
    portfolios = load_portfolios()
    positions  = load_positions()
    spy_price  = fetcher.get_spy_price().get("price", 0)
    result = []
    for p in portfolios:
        row = dict(p)
        row["stats"] = _portfolio_stats(p["id"], positions, spy_price)
        result.append(row)
    return result

@app.post("/api/portfolios")
def create_portfolio(body: PortfolioIn):
    portfolios = load_portfolios()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Portfolio name cannot be empty")
    if any(p["name"].lower() == name.lower() for p in portfolios):
        raise HTTPException(status_code=400, detail=f"Portfolio '{name}' already exists")
    new_p = {
        "id": str(uuid.uuid4()),
        "name": name,
        "created_date": date.today().isoformat(),
        "archived": False,
    }
    portfolios.append(new_p)
    save_portfolios(portfolios)
    return new_p

@app.delete("/api/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: str):
    if portfolio_id == "default":
        raise HTTPException(status_code=400, detail="Cannot delete the Default portfolio")
    positions = load_positions()
    open_count = sum(1 for p in positions if p.get("portfolio_id") == portfolio_id and p.get("status") == "open")
    if open_count > 0:
        raise HTTPException(status_code=409, detail=f"Portfolio has {open_count} open position(s). Close or move them first.")
    portfolios = load_portfolios()
    updated = [p for p in portfolios if p["id"] != portfolio_id]
    if len(updated) == len(portfolios):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    save_portfolios(updated)
    # Reassign closed positions to default
    for pos in positions:
        if pos.get("portfolio_id") == portfolio_id:
            pos["portfolio_id"] = "default"
    save_positions(positions)
    return {"ok": True}

@app.put("/api/portfolios/{portfolio_id}/archive")
def archive_portfolio(portfolio_id: str):
    if portfolio_id == "default":
        raise HTTPException(status_code=400, detail="Cannot archive the Default portfolio")
    positions = load_positions()
    open_count = sum(1 for p in positions if p.get("portfolio_id") == portfolio_id and p.get("status") == "open")
    if open_count > 0:
        raise HTTPException(status_code=409, detail=f"Portfolio has {open_count} open position(s). Close or move them first.")
    portfolios = load_portfolios()
    for p in portfolios:
        if p["id"] == portfolio_id:
            p["archived"] = True
            save_portfolios(portfolios)
            return p
    raise HTTPException(status_code=404, detail="Portfolio not found")

@app.put("/api/portfolios/{portfolio_id}/unarchive")
def unarchive_portfolio(portfolio_id: str):
    portfolios = load_portfolios()
    for p in portfolios:
        if p["id"] == portfolio_id:
            p["archived"] = False
            save_portfolios(portfolios)
            return p
    raise HTTPException(status_code=404, detail="Portfolio not found")

@app.put("/api/portfolios/{portfolio_id}/rename")
def rename_portfolio(portfolio_id: str, body: PortfolioIn):
    portfolios = load_portfolios()
    name = body.name.strip()
    if any(p["name"].lower() == name.lower() and p["id"] != portfolio_id for p in portfolios):
        raise HTTPException(status_code=400, detail=f"Portfolio '{name}' already exists")
    for p in portfolios:
        if p["id"] == portfolio_id:
            p["name"] = name
            save_portfolios(portfolios)
            return p
    raise HTTPException(status_code=404, detail="Portfolio not found")


# ── Position endpoints ────────────────────────────────────────────────────────

@app.get("/api/positions")
def get_positions(portfolio_id: Optional[str] = Query(None)):
    positions = load_positions()
    if portfolio_id:
        positions = [p for p in positions if p.get("portfolio_id") == portfolio_id]
    spy_data  = fetcher.get_spy_price()
    spy_price = spy_data.get("price", 0)
    spy_change = spy_data.get("change", 0)   # dollar move today, used for daily P&L estimate

    # ── Macro context (computed once per request) ─────────────────────────────
    upcoming_events = macro_calendar.get_upcoming_events(within_days=7)
    try:
        news_articles = av.get_news_sentiment().get("feed", []) or []
    except Exception:
        news_articles = []
    news_uncertainty = macro_calendar.detect_news_uncertainty(news_articles)

    enriched = []
    for pos in positions:
        p = dict(pos)
        p["dte"] = _dte(pos["expiry"]) if pos.get("status") == "open" else None
        if pos.get("status") == "open":
            current = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
            p["current_price"] = current
            sell_price = pos["sell_price"]
            contracts  = pos["contracts"]
            p["pnl"] = round((sell_price - current) * contracts * 100, 2)
            p["pnl_pct"] = round((sell_price - current) / sell_price * 100, 2) if sell_price else 0
            p["profit_capture_pct"] = p["pnl_pct"]
            strike = pos["strike"]
            if spy_price > 0 and strike > 0:
                p["distance_to_strike_pct"] = round(((strike - spy_price) / spy_price) * 100, 2)
            else:
                p["distance_to_strike_pct"] = None
            # Add delta, theta + OI from cached options chain (60s TTL — no extra API call in typical usage)
            try:
                chain = fetcher.get_options_chain(pos["expiry"])
                chain_row = next((r for r in chain if r.get("strike") == float(strike)), None)
                p["delta"] = round(float(chain_row["delta"]), 4) if chain_row and chain_row.get("delta") is not None else None
                p["theta"] = round(float(chain_row["theta"]), 4) if chain_row and chain_row.get("theta") is not None else None
                # Daily P&L estimate (short call): theta gain - delta loss from SPY move
                # theta is negative (option loses value), so -theta is our daily gain from time decay
                # delta * spy_change is how much call gained from price move (our loss as short)
                if p["delta"] is not None and p["theta"] is not None:
                    daily_theta  = -p["theta"]                       # positive: time decay earns us this
                    daily_delta  = -p["delta"] * spy_change          # negative if SPY up (call worth more)
                    p["daily_pnl"] = round((daily_theta + daily_delta) * contracts * 100, 2)
                else:
                    p["daily_pnl"] = None
                # Record today's OI snapshot (first-write-wins, safe to call repeatedly)
                if chain_row and chain_row.get("openInterest"):
                    oi_tracker.record_batch([{
                        "expiry": pos["expiry"],
                        "strike": float(strike),
                        "oi": chain_row["openInterest"],
                    }])
            except Exception:
                p["delta"] = None
                p["theta"] = None
                p["daily_pnl"] = None
            # Attach OI change data
            oi_data = oi_tracker.get_changes_batch([{"expiry": pos["expiry"], "strike": float(strike)}])
            oi = oi_data.get(f"{pos['expiry']}|{float(strike)}", {})
            p["open_interest"]    = oi.get("current_oi")
            p["oi_change_1d_pct"] = oi.get("change_1d_pct")
            p["oi_signal"]        = oi.get("signal")
            p["oi_signal_label"]  = oi.get("signal_label")
            # ── P&L / tax impact fields for action cards (PIPE-019) ────────────
            # close_pnl_impact: dollars gained/lost if closing right now at current_price
            # (positive = profit, negative = loss relative to premium sold)
            p["close_pnl_impact"] = p["pnl"]  # already computed above
            # tax_event_on_close: closing a short call creates a taxable event (capital gain/loss)
            p["tax_event_on_close"] = True
            # roll_pnl_impact: rolling defers realization — P&L is not locked in ($0 net if done as a spread)
            p["roll_pnl_impact"] = 0.0
            # break_even_strike: SPY must stay below this price for holding to be better than closing
            # For a short call: break-even is where (sell_price - current_price) == 0 => strike
            # Plain-English: SPY needs to stay below the strike price for holding to be the better choice
            p["break_even_price"] = float(pos["strike"])
            # Loss severity: what % of original premium is being given back if we close now
            if sell_price and sell_price > 0:
                loss_as_pct_of_premium = round((current * contracts * 100) / (sell_price * contracts * 100) * 100, 1)
            else:
                loss_as_pct_of_premium = 0.0
            p["loss_as_pct_of_premium"] = loss_as_pct_of_premium
            # ── Confidence score (PIPE-020) ────────────────────────────────────
            # 0–100: how confident the action recommendation is.
            # Starts at 100 and applies penalties based on how far each trigger
            # is from its threshold and whether macro signal aligns.
            conf = 100.0
            conf_factors = []
            dte_val = p.get("dte") or 0
            dist   = p.get("distance_to_strike_pct")
            delta_val = p.get("delta")
            profit_cap = p.get("profit_capture_pct") or 0
            oi_sig = p.get("oi_signal") or ""
            # 1. DTE proximity — the closer to expiry the more certain the urgency
            if dte_val <= 7:
                conf_factors.append(f"{dte_val} days to expiry")
                # Full confidence at ≤7 DTE (this is a clear signal)
            elif dte_val <= 14:
                # 8–14 DTE: getting close — moderate confidence boost
                conf -= 10
                conf_factors.append(f"{dte_val} days to expiry")
            elif dte_val <= 21:
                conf -= 20
                conf_factors.append(f"{dte_val} days to expiry — roll window approaching")
            # 2. Strike distance — closer to strike = higher confidence in risk signal
            if dist is not None and 0 < dist <= 1.5:
                conf_factors.append(f"SPY is {dist:.1f}% below your strike")
            elif dist is not None and 0 < dist <= 3.0:
                conf -= 15
                conf_factors.append(f"SPY is {dist:.1f}% below your strike — approaching")
            elif dist is not None and dist <= 0:
                # ITM — very high confidence of a problem
                conf_factors.append("SPY is above your strike (in-the-money)")
            # 3. Delta level
            if delta_val is not None:
                if delta_val > 0.35:
                    conf_factors.append(f"Assignment risk is elevated ({delta_val:.2f})")
                elif delta_val > 0.30:
                    conf -= 10
                    conf_factors.append(f"Assignment risk rising ({delta_val:.2f})")
                elif delta_val <= 0.10:
                    conf_factors.append(f"Assignment risk very low ({delta_val:.2f}) — most premium decayed")
            # 4. Profit capture
            if profit_cap >= 50:
                conf_factors.append(f"{profit_cap:.0f}% of max income already collected")
            elif profit_cap >= 40:
                conf -= 10
                conf_factors.append(f"{profit_cap:.0f}% of max income collected — approaching 50% target")
            # 5. OI signal
            if oi_sig == "MAJOR_UNWIND":
                conf_factors.append("Large open interest unwind at this strike")
            elif oi_sig == "UNWINDING":
                conf -= 10
                conf_factors.append("Open interest declining at this strike")
            # 6. Penalize when closing is costly (loss > 40% of premium) — softens the signal
            if loss_as_pct_of_premium > 40:
                conf -= 15
                conf_factors.append(f"Buying back costs {loss_as_pct_of_premium:.0f}% of original premium")
            conf = max(0, min(100, round(conf)))
            p["confidence"] = conf
            p["confidence_factors"] = conf_factors
            # ── Macro context (PIPE-021) ───────────────────────────────────────
            # Attach the nearest upcoming event (if within 5 days) to each position
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
    """Lightweight signal snapshot — reuses cached fetcher data (60s TTL), no extra API calls."""
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
            "timestamp":    datetime.now().isoformat(),
            "regime":       signal.get("regime"),
            "total_score":  signal.get("total_score"),
            "max_score":    signal.get("max_score"),
            "factor_scores": signal.get("factor_scores", {}),
            "spy_price":    spy_price,
            "vix":          vix,
        }
    except Exception:
        return {"timestamp": datetime.now().isoformat(), "error": "snapshot_failed"}


@app.post("/api/positions")
def add_position(pos: PositionIn):
    _ensure_default_portfolio()
    portfolio_id = pos.portfolio_id or "default"
    portfolios = load_portfolios()
    if not any(p["id"] == portfolio_id for p in portfolios):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    positions = load_positions()
    new_pos = pos.dict()
    new_pos["id"] = str(uuid.uuid4())
    new_pos["portfolio_id"] = portfolio_id
    if not new_pos.get("premium_collected"):
        new_pos["premium_collected"] = round(pos.sell_price * pos.contracts * 100, 2)
    if not new_pos.get("open_date"):
        new_pos["open_date"] = date.today().isoformat()
    new_pos["open_signal"] = _capture_signal_snapshot()
    positions.append(new_pos)
    save_positions(positions)
    try:
        rec_logger.mark_acted_on(pos.strike, pos.expiry, new_pos["id"])
    except Exception:
        pass
    return new_pos

@app.delete("/api/positions/{position_id}")
def delete_position(position_id: str):
    positions = load_positions()
    updated = [p for p in positions if p["id"] != position_id]
    if len(updated) == len(positions):
        raise HTTPException(status_code=404, detail="Position not found")
    save_positions(updated)
    return {"ok": True}

@app.put("/api/positions/{position_id}")
def update_position(position_id: str, update: PositionUpdate):
    positions = load_positions()
    for pos in positions:
        if pos["id"] == position_id:
            if update.status is not None:
                pos["status"] = update.status
            if update.contracts is not None:
                pos["contracts"] = update.contracts
                pos["premium_collected"] = round(pos.get("sell_price", 0) * update.contracts * 100, 2)
            if update.sell_price is not None:
                pos["sell_price"] = update.sell_price
                pos["premium_collected"] = round(update.sell_price * pos.get("contracts", 0) * 100, 2)
            if update.close_price is not None:
                pos["close_price"] = update.close_price
                sell_price = pos.get("sell_price", 0)
                contracts  = pos.get("contracts", 0)
                pos["final_pnl"] = round((sell_price - update.close_price) * contracts * 100, 2)
                pos["close_date"] = update.close_date or date.today().isoformat()
                pos["close_signal"] = _capture_signal_snapshot()
            if update.notes is not None:
                pos["notes"] = update.notes
            save_positions(positions)
            return pos
    raise HTTPException(status_code=404, detail="Position not found")

@app.put("/api/positions/{position_id}/move")
def move_position(position_id: str, body: PositionMove):
    portfolios = load_portfolios()
    if not any(p["id"] == body.portfolio_id for p in portfolios):
        raise HTTPException(status_code=404, detail="Target portfolio not found")
    positions = load_positions()
    for pos in positions:
        if pos["id"] == position_id:
            pos["portfolio_id"] = body.portfolio_id
            save_positions(positions)
            return pos
    raise HTTPException(status_code=404, detail="Position not found")


# ── Holdings endpoints ────────────────────────────────────────────────────────

@app.get("/api/holdings")
def get_holdings(portfolio_id: Optional[str] = Query(None)):
    holdings = load_holdings()
    if portfolio_id:
        holdings = [h for h in holdings if h.get("portfolio_id") == portfolio_id]
    spy_price = fetcher.get_spy_price().get("price", 0)
    enriched = []
    for h in holdings:
        row = dict(h)
        # Enrich with live market data (SPY only for now)
        price = spy_price if h["ticker"] == "SPY" else 0
        shares = h["shares"]
        avg_cost = h["avg_cost"]
        row["current_price"]   = price
        row["market_value"]    = round(price * shares, 2)
        row["cost_basis"]      = round(avg_cost * shares, 2)
        row["unrealized_pnl"]  = round((price - avg_cost) * shares, 2)
        row["unrealized_pnl_pct"] = round((price - avg_cost) / avg_cost * 100, 2) if avg_cost else 0
        enriched.append(row)
    return enriched

@app.post("/api/holdings")
def add_holding(body: HoldingIn):
    portfolios = load_portfolios()
    if not any(p["id"] == body.portfolio_id for p in portfolios):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    holdings = load_holdings()
    new_h = body.dict()
    new_h["id"] = str(uuid.uuid4())
    if not new_h.get("purchase_date"):
        new_h["purchase_date"] = date.today().isoformat()
    holdings.append(new_h)
    save_holdings(holdings)
    return new_h

@app.put("/api/holdings/{holding_id}")
def update_holding(holding_id: str, body: HoldingUpdate):
    holdings = load_holdings()
    for h in holdings:
        if h["id"] == holding_id:
            if body.shares is not None:
                h["shares"] = body.shares
            if body.avg_cost is not None:
                h["avg_cost"] = body.avg_cost
            save_holdings(holdings)
            return h
    raise HTTPException(status_code=404, detail="Holding not found")

@app.delete("/api/holdings/{holding_id}")
def delete_holding(holding_id: str):
    holdings = load_holdings()
    updated = [h for h in holdings if h["id"] != holding_id]
    if len(updated) == len(holdings):
        raise HTTPException(status_code=404, detail="Holding not found")
    save_holdings(updated)
    return {"ok": True}


# ── Market / signal endpoints (unchanged) ─────────────────────────────────────

@app.get("/api/dashboard")
def dashboard():
    spy_price     = fetcher.get_spy_price()
    signal_tickers = fetcher.get_signal_tickers()
    vix_history   = fetcher.get_vix_history()
    spy_ma        = fetcher.get_spy_ma_signal()
    return {
        "spy": spy_price,
        "signal_tickers": signal_tickers,
        "vix_history": vix_history,
        "spy_ma": spy_ma,
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }

@app.get("/api/signals")
def signals():
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
    spy_ma = fetcher.get_spy_ma_signal()
    tnx_history = fetcher.get_tnx_history(10)
    tlt_history = fetcher.get_tlt_history(10)
    vix_recent  = fetcher.get_vix_recent_history(10)
    spy_recent  = fetcher.get_spy_recent_history(10)
    available_expiries = fetcher.get_available_expiries()
    positions = [p for p in load_positions() if p.get("status") == "open"]
    for pos in positions:
        try:
            pos["current_price"] = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
        except Exception:
            pos["current_price"] = 0
    result = engine.analyze(
        spy_price=spy_price, vix=vix, vix_iv_rank=iv_rank, vvix=vvix,
        tnx=tnx, fvx=fvx, tlt=tlt, spy_ma_signal=spy_ma,
        open_positions=positions, tnx_history=tnx_history,
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
):
    # ── Holdings: derive total contracts and weighted avg cost ────────────────
    all_holdings = load_holdings()
    port_spy_holdings = [
        h for h in all_holdings
        if h.get("portfolio_id") == portfolio_id and h.get("ticker", "").upper() == "SPY"
    ]
    total_shares = sum(h.get("shares", 0) for h in port_spy_holdings)
    total_contracts = int(total_shares // 100)

    if total_shares > 0:
        avg_cost = sum(h.get("avg_cost", 0) * h.get("shares", 0) for h in port_spy_holdings) / total_shares
    else:
        avg_cost = 0.0

    max_per_strike = max(1, int(total_contracts * max_strike_alloc))
    max_per_expiry = max(1, int(total_contracts * max_expiry_alloc))

    # ── Open positions: tally used allocation ─────────────────────────────────
    all_positions = load_positions()
    open_port_positions = [
        p for p in all_positions
        if p.get("portfolio_id") == portfolio_id and p.get("status") == "open"
    ]
    used_per_strike: dict = {}
    used_per_expiry: dict = {}
    for p in open_port_positions:
        s = float(p.get("strike", 0))
        e = p.get("expiry", "")
        c = int(p.get("contracts", 0))
        used_per_strike[s] = used_per_strike.get(s, 0) + c
        used_per_expiry[e] = used_per_expiry.get(e, 0) + c

    # ── Signal score ──────────────────────────────────────────────────────────
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
    spy_ma = fetcher.get_spy_ma_signal()
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

    # ── Scan expiries and options chains ──────────────────────────────────────
    expiries = fetcher.get_screener_expiries(max_dte)
    today = date.today()
    candidates = []

    for exp in expiries:
        exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        dte = (exp_date - today).days
        if dte < min_dte:
            continue

        chain = fetcher.get_options_chain(exp)
        # Record OI snapshots for this expiry (first-write-wins, no-op if already recorded today)
        oi_tracker.record_batch([
            {"expiry": exp, "strike": float(r["strike"]), "oi": r.get("openInterest") or 0}
            for r in chain if r.get("strike") is not None
        ])
        used_expiry = used_per_expiry.get(exp, 0)
        cap_expiry = max(0, max_per_expiry - used_expiry)

        for row in chain:
            delta = row.get("delta")
            strike = row.get("strike")
            if delta is None or strike is None:
                continue
            if delta > max_delta or delta < min_delta:
                continue
            if strike <= spy_price:
                continue  # skip ITM

            bid = row.get("bid") or 0
            ask = row.get("ask") or 0
            mid = round((bid + ask) / 2, 2) if (bid or ask) else 0
            if mid <= 0:
                continue

            theta = row.get("theta") or 0
            gamma = row.get("gamma")
            vega  = row.get("vega")
            iv = row.get("impliedVolatility") or 0

            used_strike = used_per_strike.get(float(strike), 0)
            cap_strike = max(0, max_per_strike - used_strike)
            contracts_suggested = min(cap_strike, cap_expiry, total_contracts) if total_contracts > 0 else 0
            premium_total = round(mid * contracts_suggested * 100, 2)

            annualized_yield = round((mid / spy_price) * (365 / dte) * 100, 2) if spy_price > 0 and dte > 0 else 0

            # Tax risk = (Strike - Cost Basis) * 100 * Tax Rate * Delta * Contracts
            # Delta weights by probability of assignment; 100 = shares per contract
            TAX_RATE = 0.20
            gain_per_share = max(0.0, float(strike) - avg_cost)
            expected_tax = round(gain_per_share * 100 * TAX_RATE * float(delta) * contracts_suggested, 2)
            tax_if_assigned = round(gain_per_share * 100 * TAX_RATE * contracts_suggested, 2)  # worst case (delta=1)
            tax_ratio = round(expected_tax / max(premium_total, 1), 3)

            # Composite score (0–100): 4 components per academic/professional practice
            # Raw yield: premium as % of SPY spot — fair cross-DTE comparison (non-annualized)
            raw_yield_pct = (mid / spy_price * 100) if spy_price > 0 else 0
            s_signal = max(0.0, total_score) / 12 * 25           # 0–25 pts
            s_yield  = min(raw_yield_pct / 0.70, 1.0) * 30       # 0–30 pts, cap 0.70% of spot
            s_delta  = (1 - delta / max_delta) * 20               # 0–20 pts
            # DTE Quality: peaks 21–45 DTE (tastytrade/CBOE/ORATS consensus)
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
            candidates.append({
                "strike": float(strike),
                "expiry": exp,
                "dte": dte,
                "delta": round(float(delta), 4),
                "gamma": round(float(gamma), 4) if gamma is not None else None,
                "theta": round(float(theta), 4),
                "vega":  round(float(vega), 4) if vega is not None else None,
                "bid": round(float(bid), 2),
                "ask": round(float(ask), 2),
                "mid": mid,
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
                    "signal":      round(s_signal, 1),
                    "raw_yield":   round(s_yield, 1),
                    "delta":       round(s_delta, 1),
                    "dte_quality": round(s_dte, 1),
                },
                "has_position": open_pos is not None,
                "position_contracts": open_pos.get("contracts", 0) if open_pos else 0,
                "position_sell_price": open_pos.get("sell_price", 0) if open_pos else 0,
            })

    # ── Inject open positions outside the screener's delta filter ────────────
    # (e.g. delta drifted above max_delta — user still needs to see them)
    candidate_keys = {(c["strike"], c["expiry"]) for c in candidates}
    for p in open_port_positions:
        p_strike = float(p.get("strike", 0))
        p_expiry = p.get("expiry", "")
        if (p_strike, p_expiry) in candidate_keys:
            continue  # already tagged above
        try:
            exp_date_obj = datetime.strptime(p_expiry, "%Y-%m-%d").date()
        except ValueError:
            continue
        dte = (exp_date_obj - today).days
        if dte < 0:
            continue  # expired — skip
        chain_rows = fetcher.get_options_chain(p_expiry)
        row = next((r for r in chain_rows if r.get("strike") == p_strike), None)
        if not row:
            continue
        delta = row.get("delta")
        bid   = row.get("bid") or 0
        ask   = row.get("ask") or 0
        mid   = round((bid + ask) / 2, 2) if (bid or ask) else 0
        theta = row.get("theta") or 0
        gamma = row.get("gamma")
        vega  = row.get("vega")
        iv    = row.get("impliedVolatility") or 0
        contracts = p.get("contracts", 0)
        TAX_RATE = 0.20
        gain_per_share = max(0.0, p_strike - avg_cost)
        d_float = float(delta) if delta is not None else 0.0
        expected_tax = round(gain_per_share * 100 * TAX_RATE * d_float * contracts, 2)
        tax_if_assigned = round(gain_per_share * 100 * TAX_RATE * contracts, 2)
        premium_total_pos = round(mid * contracts * 100, 2)
        tax_ratio = round(expected_tax / max(premium_total_pos, 1), 3)
        annualized_yield = round((mid / spy_price) * (365 / dte) * 100, 2) if spy_price > 0 and dte > 0 else 0
        raw_yield_pct = (mid / spy_price * 100) if spy_price > 0 else 0
        s_signal = max(0.0, total_score) / 12 * 25
        s_yield  = min(raw_yield_pct / 0.70, 1.0) * 30
        s_delta  = (1 - float(delta) / max_delta) * 20 if delta is not None else 0
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
        candidates.append({
            "strike": p_strike,
            "expiry": p_expiry,
            "dte": dte,
            "delta": round(float(delta), 4) if delta is not None else None,
            "gamma": round(float(gamma), 4) if gamma is not None else None,
            "theta": round(float(theta), 4),
            "vega":  round(float(vega), 4) if vega is not None else None,
            "bid": round(float(bid), 2),
            "ask": round(float(ask), 2),
            "mid": mid,
            "iv": round(float(iv), 4),
            "open_interest": row.get("openInterest") or 0,
            "volume": row.get("volume") or 0,
            "contracts_suggested": 0,
            "premium_total": 0,
            "annualized_yield_pct": annualized_yield,
            "raw_yield_pct": round(raw_yield_pct, 3),
            "tax_if_assigned": tax_if_assigned,
            "expected_tax": expected_tax,
            "tax_ratio": tax_ratio,
            "capacity_strike_remaining": 0,
            "capacity_expiry_remaining": 0,
            "at_strike_limit": True,
            "at_expiry_limit": False,
            "composite_score": composite_score,
            "score_breakdown": {
                "signal":      round(s_signal, 1),
                "raw_yield":   round(s_yield, 1),
                "delta":       round(s_delta, 1),
                "dte_quality": round(s_dte, 1),
            },
            "has_position": True,
            "position_contracts": contracts,
            "position_sell_price": p.get("sell_price", 0),
        })

    # ── Enrich candidates with OI change data ────────────────────────────────
    oi_keys = [{"expiry": c["expiry"], "strike": c["strike"]} for c in candidates]
    oi_changes = oi_tracker.get_changes_batch(oi_keys)
    for c in candidates:
        oi = oi_changes.get(f"{c['expiry']}|{c['strike']}", {})
        c["oi_change_1d_pct"] = oi.get("change_1d_pct")
        c["oi_signal"]        = oi.get("signal", "NO_DATA")
        c["oi_signal_label"]  = oi.get("signal_label", "No history yet")

    # Open positions bubble to top, then sort the rest by score
    candidates.sort(key=lambda c: (not c.get("has_position", False), -c["composite_score"]))

    # Log top recommendations with market context (fire-and-forget, non-blocking)
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
            "portfolio_id": portfolio_id,
            "total_contracts": total_contracts,
            "total_shares": total_shares,
            "avg_cost": round(avg_cost, 2),
            "max_per_strike": max_per_strike,
            "max_per_expiry": max_per_expiry,
            "signal_score": total_score,
            "regime": signal_result.get("regime"),
            "spy_price": spy_price,
        },
    }


@app.get("/api/pnl")
def get_pnl():
    positions = load_positions()
    open_positions = [p for p in positions if p.get("status") == "open"]
    total_premium = sum(p.get("premium_collected", 0) for p in open_positions)
    total_pnl = 0
    results = []
    for pos in open_positions:
        current = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
        sell_price = pos["sell_price"]
        contracts  = pos["contracts"]
        pnl = (sell_price - current) * contracts * 100
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
        "unrealized_pnl": round(total_pnl, 2),
        "positions": results,
        "closed_count": len(closed),
        "win_count": wins,
    }

@app.get("/api/pnl-summary")
def get_pnl_summary(portfolio_id: Optional[str] = Query(None)):
    positions = load_positions()
    if portfolio_id:
        positions = [p for p in positions if p.get("portfolio_id") == portfolio_id]

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
        "total_realized":           round(total_realized, 2),
        "total_unrealized":         round(total_unrealized, 2),
        "total_pnl":                round(total_realized + total_unrealized, 2),
        "estimated_tax_this_year":  estimated_tax,
        "tax_rate_used":            tax_rate,
        "by_year":                  by_year,
        "open_positions":           len(open_),
        "closed_positions":         len(closed),
        "win_rate":                 round(wins / len(closed) * 100, 1) if closed else 0,
    }


@app.get("/api/iv-rank")
def get_iv_rank():
    return fetcher.get_vix_history()

@app.get("/api/history/spy")
def get_spy_history():
    df = fetcher.get_spy_history(60)
    records = []
    for idx, row in df.iterrows():
        records.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low":  round(float(row["Low"]),  2),
            "close": round(float(row["Close"]), 2),
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


# ── Macro calendar endpoints (PIPE-021) ───────────────────────────────────────

class MacroEventIn(BaseModel):
    date: str           # "YYYY-MM-DD"
    description: str

class FeedbackIn(BaseModel):
    position_context: dict          # {ticker, strike, expiry, action_type}
    option_chosen: str              # one of the predefined options or "Other"
    free_text: Optional[str] = None # user's free-text note (max 280 chars)

@app.get("/api/macro")
def get_macro_context():
    """Return upcoming macro events (within 10 days) + news uncertainty status."""
    upcoming = macro_calendar.get_upcoming_events(within_days=10)
    try:
        news_articles = av.get_news_sentiment().get("feed", []) or []
    except Exception:
        news_articles = []
    news_uncertainty = macro_calendar.detect_news_uncertainty(news_articles)
    return {
        "upcoming_events": upcoming,
        "user_events": macro_calendar.get_user_events(),
        "news_uncertainty": news_uncertainty,
    }

@app.post("/api/macro/events")
def add_macro_event(body: MacroEventIn):
    """Add a user-defined upcoming macro event."""
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
def remove_macro_event(event_date: str = Query(...), description: str = Query(...)):
    """Remove a specific user-defined macro event."""
    events = macro_calendar.remove_user_event(event_date, description)
    return {"ok": True, "user_events": events}


# ── Feedback endpoint (PIPE-022) ──────────────────────────────────────────────

@app.post("/api/feedback")
def submit_feedback(body: FeedbackIn):
    """Store a user feedback entry on an action card recommendation."""
    text = (body.free_text or "").strip()
    if len(text) > 280:
        raise HTTPException(status_code=400, detail="free_text must be 280 characters or fewer")
    entry = feedback_log.log_feedback(
        position_context=body.position_context,
        option_chosen=body.option_chosen,
        free_text=text,
    )
    return entry

@app.get("/api/feedback")
def get_feedback_log(limit: int = Query(100)):
    return feedback_log.get_log(limit)

@app.get("/api/feedback/config")
def get_feedback_config():
    """Return current notification settings (omits SMTP password)."""
    config_file = Path(__file__).parent / "config.json"
    if not config_file.exists():
        return {}
    try:
        cfg = json.loads(config_file.read_text())
    except Exception:
        return {}
    return {
        "feedback_email":           cfg.get("feedback_email", ""),
        "feedback_phone":           cfg.get("feedback_phone", ""),
        "sms_webhook_url":          cfg.get("sms_webhook_url", ""),
        "feedback_notify_immediate": cfg.get("feedback_notify_immediate", True),
        "smtp_host":                cfg.get("smtp_host", ""),
        "smtp_port":                cfg.get("smtp_port", 587),
        "smtp_user":                cfg.get("smtp_user", ""),
        # smtp_pass intentionally omitted from GET response
    }

class FeedbackConfigIn(BaseModel):
    feedback_email:            Optional[str] = None
    feedback_phone:            Optional[str] = None
    sms_webhook_url:           Optional[str] = None
    feedback_notify_immediate: Optional[bool] = None
    smtp_host:                 Optional[str] = None
    smtp_port:                 Optional[int] = None
    smtp_user:                 Optional[str] = None
    smtp_pass:                 Optional[str] = None

@app.put("/api/feedback/config")
def save_feedback_config(body: FeedbackConfigIn):
    """Persist notification settings to config.json (merged — never overwrites unrelated keys)."""
    config_file = Path(__file__).parent / "config.json"
    cfg = {}
    if config_file.exists():
        try:
            cfg = json.loads(config_file.read_text())
        except Exception:
            pass
    updates = body.dict(exclude_none=True)
    cfg.update(updates)
    config_file.write_text(json.dumps(cfg, indent=2))
    # Return safe view (no smtp_pass)
    return {k: v for k, v in cfg.items() if k != "smtp_pass"}


# ── OI snapshot endpoint ──────────────────────────────────────────────────────

@app.get("/api/recommendations/log")
def get_recommendation_log(limit: int = Query(100)):
    return rec_logger.get_log(limit)


@app.get("/api/scorecard")
def get_scorecard(portfolio_id: Optional[str] = Query(None)):
    positions = load_positions()
    if portfolio_id:
        positions = [p for p in positions if p.get("portfolio_id") == portfolio_id]

    rec_log = rec_logger.get_log(500)

    # 1. All OPEN NOW / OPEN recommendations ever made
    open_now_recs = [
        r for batch in rec_log
        for r in batch.get("recommendations", [])
        if r.get("recommendation") in ("OPEN NOW", "OPEN")
    ]

    # 2. Batches where at least one recommendation was acted on
    acted_batches = [b for b in rec_log if b.get("acted_on")]
    total_acted   = sum(len(b["acted_on"]) for b in acted_batches)
    adherence_rate = (total_acted / len(open_now_recs) * 100) if open_now_recs else 0

    # 3. Average signal score at open (positions that have open_signal)
    open_positions = [p for p in positions if p.get("open_signal") and p["open_signal"].get("total_score") is not None]
    avg_signal_at_open = (
        sum(p["open_signal"]["total_score"] for p in open_positions) / len(open_positions)
        if open_positions else 0
    )

    # 4. Hypothetical missed P&L: OPEN NOW recs in batches with no acted_on
    missed_recs = [
        r for batch in rec_log
        if not batch.get("acted_on")
        for r in batch.get("recommendations", [])
        if r.get("recommendation") == "OPEN NOW"
        and r.get("mid") and r.get("contracts_suggested", 0) > 0
    ]
    hypothetical_missed_pnl = round(sum(
        r["mid"] * r["contracts_suggested"] * 100 * 0.50
        for r in missed_recs
    ), 2)

    # 5. Actual realized P&L
    actual_realized = round(sum(p.get("final_pnl", 0) for p in positions if p.get("status") == "closed"), 2)

    # 6. Behavioral feedback
    feedback = []
    max_score = 14
    if open_positions and avg_signal_at_open < 6:
        feedback.append(f"You tend to open positions when the signal score is below 6/{max_score} — consider waiting for SELL PREMIUM regime.")
    if open_now_recs and adherence_rate < 50:
        feedback.append(f"You acted on {adherence_rate:.0f}% of OPEN NOW signals. Missed opportunities represent ~${hypothetical_missed_pnl:,.0f} in potential premium.")
    if open_now_recs and adherence_rate >= 80:
        feedback.append("Strong adherence to signals — you are closely following the system's recommendations.")

    # 7. Data accumulation notice
    collecting = len(rec_log) < 10

    return {
        "adherence_rate":              round(adherence_rate, 1),
        "avg_signal_score_at_open":    round(avg_signal_at_open, 1),
        "actual_realized_pnl":         actual_realized,
        "hypothetical_missed_pnl":     hypothetical_missed_pnl,
        "total_open_now_recommendations": len(open_now_recs),
        "total_acted_on":              total_acted,
        "feedback":                    feedback,
        "positions_with_signal_data":  len(open_positions),
        "log_entries":                 len(rec_log),
        "collecting":                  collecting,
        "recent_log":                  rec_log[-20:],
    }


@app.get("/api/oi/chain")
def get_oi_chain(expiry: str = Query(...)):
    chain = fetcher.get_options_chain(expiry)
    oi_tracker.record_chain_snapshot(expiry, chain)
    strikes = oi_tracker.get_chain_oi_change(expiry)
    spy_price_data = fetcher.get_spy_price()
    return {
        "expiry":    expiry,
        "strikes":   strikes,
        "spy_price": spy_price_data.get("price", 0),
    }


@app.post("/api/oi/snapshot")
def trigger_oi_snapshot():
    """Manually trigger an OI snapshot for all open position strikes across all portfolios."""
    positions = load_positions()
    open_pos  = [p for p in positions if p.get("status") == "open" and p.get("expiry")]
    expiries  = list({p["expiry"] for p in open_pos})

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
        "strikes_recorded": strikes_recorded,
        "errors": errors,
        "timestamp": datetime.now().isoformat(),
    }


# ── Static frontend (production build) ───────────────────────────────────────
# IMPORTANT: this catch-all must stay at the very bottom — FastAPI routes
# are matched in declaration order, so all /api/* routes above take priority.

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        return FileResponse(str(DIST_DIR / "index.html"))
