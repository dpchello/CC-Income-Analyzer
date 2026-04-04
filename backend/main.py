import json
import uuid
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_fetcher import DataFetcher
from signals import SignalEngine
import alpha_fetcher as av

app = FastAPI(title="SPY Covered Call Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POSITIONS_FILE = Path(__file__).parent / "positions.json"
fetcher = DataFetcher()
engine = SignalEngine()


def load_positions():
    if POSITIONS_FILE.exists():
        with open(POSITIONS_FILE) as f:
            return json.load(f)
    return []


def save_positions(positions):
    with open(POSITIONS_FILE, "w") as f:
        json.dump(positions, f, indent=2)


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


class PositionUpdate(BaseModel):
    status: Optional[str] = None
    close_price: Optional[float] = None
    close_date: Optional[str] = None


def _dte(expiry_str: str) -> int:
    return (datetime.strptime(expiry_str, "%Y-%m-%d").date() - date.today()).days


@app.get("/api/dashboard")
def dashboard():
    spy_price = fetcher.get_spy_price()
    signal_tickers = fetcher.get_signal_tickers()
    vix_history = fetcher.get_vix_history()
    spy_ma = fetcher.get_spy_ma_signal()
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
    vix = signal_tickers.get("^VIX", {}).get("price", 20)
    vvix = signal_tickers.get("^VVIX", {}).get("price", 95)
    tnx = signal_tickers.get("^TNX", {}).get("price", 4.3)
    fvx = signal_tickers.get("^FVX", {}).get("price", 4.0)
    tlt = signal_tickers.get("TLT", {}).get("price", 88)

    vix_history = fetcher.get_vix_history()
    iv_rank = vix_history.get("iv_rank", 50)

    spy_ma = fetcher.get_spy_ma_signal()
    tnx_history = fetcher.get_tnx_history(10)
    tlt_history = fetcher.get_tlt_history(10)
    available_expiries = fetcher.get_available_expiries()

    positions = [p for p in load_positions() if p.get("status") == "open"]

    # Enrich positions with current price for alert logic
    for pos in positions:
        try:
            current = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
            pos["current_price"] = current
        except Exception:
            pos["current_price"] = 0

    result = engine.analyze(
        spy_price=spy_price,
        vix=vix,
        vix_iv_rank=iv_rank,
        vvix=vvix,
        tnx=tnx,
        fvx=fvx,
        tlt=tlt,
        spy_ma_signal=spy_ma,
        open_positions=positions,
        tnx_history=tnx_history,
        tlt_history=tlt_history,
        available_expiries=available_expiries,
    )
    result["last_updated"] = datetime.utcnow().isoformat() + "Z"
    return result


@app.get("/api/positions")
def get_positions():
    positions = load_positions()
    spy_price = fetcher.get_spy_price().get("price", 0)
    enriched = []
    for pos in positions:
        p = dict(pos)
        p["dte"] = _dte(pos["expiry"]) if pos.get("status") == "open" else None
        if pos.get("status") == "open":
            current = fetcher.get_option_price(pos["expiry"], pos["strike"], "call")
            p["current_price"] = current
            sell_price = pos["sell_price"]
            contracts = pos["contracts"]
            p["pnl"] = round((sell_price - current) * contracts * 100, 2)
            p["pnl_pct"] = round((sell_price - current) / sell_price * 100, 2) if sell_price else 0
            p["profit_capture_pct"] = p["pnl_pct"]
            # Breach risk
            strike = pos["strike"]
            if spy_price > 0 and strike > 0:
                p["distance_to_strike_pct"] = round(((strike - spy_price) / spy_price) * 100, 2)
            else:
                p["distance_to_strike_pct"] = None
        enriched.append(p)
    return enriched


@app.post("/api/positions")
def add_position(pos: PositionIn):
    positions = load_positions()
    new_pos = pos.dict()
    new_pos["id"] = str(uuid.uuid4())
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
                contracts = pos.get("contracts", 0)
                pos["final_pnl"] = round((sell_price - update.close_price) * contracts * 100, 2)
            if update.close_date is not None:
                pos["close_date"] = update.close_date
            else:
                pos["close_date"] = date.today().isoformat()
            save_positions(positions)
            return pos
    raise HTTPException(status_code=404, detail="Position not found")


@app.get("/api/options/expiries")
def get_expiries():
    return fetcher.get_available_expiries()


@app.get("/api/options/chain/{expiry}")
def get_chain(expiry: str):
    return fetcher.get_options_chain(expiry)


@app.get("/api/options/price")
def get_option_price(expiry: str, strike: float, type: str = "call"):
    price = fetcher.get_option_price(expiry, strike, type)
    return {"price": price}


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
        contracts = pos["contracts"]
        pnl = (sell_price - current) * contracts * 100
        profit_pct = (sell_price - current) / sell_price * 100 if sell_price else 0
        total_pnl += pnl
        results.append({
            "id": pos["id"],
            "expiry": pos["expiry"],
            "strike": pos["strike"],
            "pnl": round(pnl, 2),
            "profit_capture_pct": round(profit_pct, 2),
            "fifty_pct_rule_triggered": profit_pct >= 50,
        })
    closed = [p for p in positions if p.get("status") == "closed"]
    wins = sum(1 for p in closed if p.get("final_pnl", 0) > 0)
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
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })
    # Compute 20MA overlay
    closes = [r["close"] for r in records]
    for i, rec in enumerate(records):
        if i >= 19:
            rec["ma_20"] = round(sum(closes[i-19:i+1]) / 20, 2)
        else:
            rec["ma_20"] = None
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
    return {
        "ten_year": av.get_treasury_yield_10y(),
        "five_year": av.get_treasury_yield_5y(),
    }


@app.get("/api/alpha/usage")
def alpha_usage():
    return av.get_usage()
