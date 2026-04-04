import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
import threading

CACHE_TTL = 60  # seconds


class Cache:
    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            entry = self._store.get(key)
            if entry and time.time() - entry["ts"] < CACHE_TTL:
                return entry["data"]
        return None

    def set(self, key, data):
        with self._lock:
            self._store[key] = {"data": data, "ts": time.time()}


_cache = Cache()


def _ticker(symbol):
    return yf.Ticker(symbol)


class DataFetcher:

    def get_spy_price(self) -> dict:
        cached = _cache.get("spy_price")
        if cached:
            return cached
        try:
            t = _ticker("SPY")
            info = t.fast_info
            hist = t.history(period="2d", interval="1d")
            price = float(info.last_price)
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else price
            change = price - prev_close
            change_pct = (change / prev_close) * 100
            result = {
                "price": round(price, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "day_high": round(float(info.day_high), 2),
                "day_low": round(float(info.day_low), 2),
                "volume": int(info.three_month_average_volume or 0),
            }
        except Exception as e:
            result = {"price": 0, "change": 0, "change_pct": 0,
                      "day_high": 0, "day_low": 0, "volume": 0, "error": str(e)}
        _cache.set("spy_price", result)
        return result

    def get_spy_history(self, days: int = 60) -> pd.DataFrame:
        cached = _cache.get(f"spy_hist_{days}")
        if cached is not None:
            return cached
        t = _ticker("SPY")
        df = t.history(period=f"{days}d", interval="1d")
        _cache.set(f"spy_hist_{days}", df)
        return df

    def get_signal_tickers(self) -> dict:
        cached = _cache.get("signal_tickers")
        if cached:
            return cached
        symbols = {
            "^VIX": {"label": "VIX"},
            "^VVIX": {"label": "VVIX"},
            "^TNX": {"label": "TNX"},
            "^FVX": {"label": "FVX"},
            "TLT": {"label": "TLT"},
        }
        result = {}
        for sym, meta in symbols.items():
            try:
                t = _ticker(sym)
                hist = t.history(period="5d", interval="1d")
                if len(hist) >= 2:
                    price = float(hist["Close"].iloc[-1])
                    prev = float(hist["Close"].iloc[-2])
                    change = price - prev
                    change_pct = (change / prev) * 100
                else:
                    price = change = change_pct = 0
                result[sym] = {
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "change_pct": round(change_pct, 2),
                    "label": meta["label"],
                }
            except Exception as e:
                result[sym] = {"price": 0, "change": 0, "change_pct": 0,
                               "label": meta["label"], "error": str(e)}
        _cache.set("signal_tickers", result)
        return result

    def get_vix_history(self, days: int = 252) -> dict:
        cached = _cache.get("vix_history")
        if cached:
            return cached
        try:
            t = _ticker("^VIX")
            hist = t.history(period="1y", interval="1d")
            current = float(hist["Close"].iloc[-1])
            high_52wk = float(hist["High"].max())
            low_52wk = float(hist["Low"].min())
            iv_rank = ((current - low_52wk) / (high_52wk - low_52wk)) * 100 if (high_52wk - low_52wk) != 0 else 50
            result = {
                "current": round(current, 2),
                "high_52wk": round(high_52wk, 2),
                "low_52wk": round(low_52wk, 2),
                "iv_rank": round(iv_rank, 1),
            }
        except Exception as e:
            result = {"current": 0, "high_52wk": 0, "low_52wk": 0, "iv_rank": 50, "error": str(e)}
        _cache.set("vix_history", result)
        return result

    def get_spy_ma_signal(self) -> dict:
        cached = _cache.get("spy_ma_signal")
        if cached:
            return cached
        try:
            df = self.get_spy_history(60)
            closes = df["Close"].values
            ma_20 = float(np.mean(closes[-20:]))
            ma_20_prev = float(np.mean(closes[-40:-20]))
            current_price = float(closes[-1])
            above_ma = current_price > ma_20
            slope_pct = ((ma_20 - ma_20_prev) / ma_20_prev) * 100
            result = {
                "ma_20": round(ma_20, 2),
                "current_price": round(current_price, 2),
                "above_ma": above_ma,
                "slope_pct": round(slope_pct, 2),
            }
        except Exception as e:
            result = {"ma_20": 0, "current_price": 0, "above_ma": True, "slope_pct": 0, "error": str(e)}
        _cache.set("spy_ma_signal", result)
        return result

    def get_options_chain(self, expiry: str) -> dict:
        cached = _cache.get(f"chain_{expiry}")
        if cached:
            return cached
        try:
            t = _ticker("SPY")
            chain = t.option_chain(expiry)
            calls = chain.calls
            result = calls[["strike", "bid", "ask", "lastPrice", "volume",
                             "openInterest", "impliedVolatility", "delta", "theta"]].to_dict("records")
            for row in result:
                for k, v in row.items():
                    if isinstance(v, float) and np.isnan(v):
                        row[k] = None
                    elif isinstance(v, float):
                        row[k] = round(v, 4)
        except Exception as e:
            result = []
        _cache.set(f"chain_{expiry}", result)
        return result

    def get_option_price(self, expiry: str, strike: float, option_type: str = "call") -> float:
        cache_key = f"opt_price_{expiry}_{strike}_{option_type}"
        cached = _cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            t = _ticker("SPY")
            chain = t.option_chain(expiry)
            df = chain.calls if option_type == "call" else chain.puts
            row = df[df["strike"] == strike]
            if row.empty:
                row = df.iloc[(df["strike"] - strike).abs().argsort()[:1]]
            bid = float(row["bid"].iloc[0])
            ask = float(row["ask"].iloc[0])
            mid = round((bid + ask) / 2, 2)
        except Exception:
            mid = 0.0
        _cache.set(cache_key, mid)
        return mid

    def get_available_expiries(self) -> list:
        cached = _cache.get("expiries")
        if cached:
            return cached
        try:
            t = _ticker("SPY")
            all_expiries = t.options
            today = datetime.today().date()
            filtered = []
            for exp in all_expiries:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                dte = (exp_date - today).days
                if 21 <= dte <= 60:
                    filtered.append(exp)
            result = filtered[:6]
        except Exception:
            result = []
        _cache.set("expiries", result)
        return result

    def get_screener_expiries(self, max_dte: int = 60) -> list:
        cache_key = f"screener_expiries_{max_dte}"
        cached = _cache.get(cache_key)
        if cached:
            return cached
        try:
            t = _ticker("SPY")
            all_expiries = t.options
            today = datetime.today().date()
            result = [
                e for e in all_expiries
                if 0 <= (datetime.strptime(e, "%Y-%m-%d").date() - today).days <= max_dte
            ]
        except Exception:
            result = []
        _cache.set(cache_key, result)
        return result

    def get_tnx_history(self, days: int = 10) -> list:
        cached = _cache.get(f"tnx_hist_{days}")
        if cached:
            return cached
        try:
            t = _ticker("^TNX")
            hist = t.history(period=f"{days}d", interval="1d")
            result = hist["Close"].tolist()
        except Exception:
            result = []
        _cache.set(f"tnx_hist_{days}", result)
        return result

    def get_tlt_history(self, days: int = 10) -> list:
        cached = _cache.get(f"tlt_hist_{days}")
        if cached:
            return cached
        try:
            t = _ticker("TLT")
            hist = t.history(period=f"{days}d", interval="1d")
            result = hist["Close"].tolist()
        except Exception:
            result = []
        _cache.set(f"tlt_hist_{days}", result)
        return result
