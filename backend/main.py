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

class PositionUpdate(BaseModel):
    status: Optional[str] = None
    close_price: Optional[float] = None
    close_date: Optional[str] = None

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
    spy_price = fetcher.get_spy_price().get("price", 0)
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
        enriched.append(p)
    return enriched

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
    positions.append(new_pos)
    save_positions(positions)
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
            if update.close_price is not None:
                pos["close_price"] = update.close_price
                sell_price = pos.get("sell_price", 0)
                contracts  = pos.get("contracts", 0)
                pos["final_pnl"] = round((sell_price - update.close_price) * contracts * 100, 2)
            pos["close_date"] = update.close_date or date.today().isoformat()
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
    )
    result["last_updated"] = datetime.utcnow().isoformat() + "Z"
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


# ── Static frontend (production build) ───────────────────────────────────────
# IMPORTANT: this catch-all must stay at the very bottom — FastAPI routes
# are matched in declaration order, so all /api/* routes above take priority.

DIST_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        return FileResponse(str(DIST_DIR / "index.html"))
