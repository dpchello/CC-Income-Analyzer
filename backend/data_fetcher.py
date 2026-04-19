import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
import threading
import math


# ── Black-Scholes Greeks (pure Python, no scipy) ──────────────────────────────

def _ncdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def _npdf(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def _bs_greeks(S, K, T, sigma, r=0.043, q=0.012):
    """
    Return (delta, gamma, theta, vega) for a European call using
    Black-Scholes-Merton with continuous dividend yield q.
    S     = spot price
    K     = strike
    T     = time to expiry in years
    sigma = implied volatility (annualized, e.g. 0.20 for 20%)
    r     = risk-free rate (10-yr TNX ≈ 4.3%)
    q     = continuous dividend yield (SPY ≈ 1.2%)
    """
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None, None, None, None
    try:
        d1 = (math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        eq_T  = math.exp(-q * T)
        er_T  = math.exp(-r * T)
        nd1   = _ncdf(d1)
        nd2   = _ncdf(d2)
        npd1  = _npdf(d1)

        delta = eq_T * nd1
        gamma = eq_T * npd1 / (S * sigma * math.sqrt(T))
        # theta: daily P&L decay per share (negative = time decay costs the holder)
        theta = (
            -S * eq_T * npd1 * sigma / (2.0 * math.sqrt(T))
            - r * K * er_T * nd2
            + q * S * eq_T * nd1
        ) / 365.0
        # vega: $ change per 1 percentage-point move in IV
        vega  = S * eq_T * npd1 * math.sqrt(T) / 100.0

        return round(delta, 4), round(gamma, 4), round(theta, 4), round(vega, 4)
    except Exception:
        return None, None, None, None

CACHE_TTL = 60  # seconds

# ── Dividend cache (24h TTL — quarterly data doesn't change intraday) ─────────
_div_cache: dict = {"data": None, "ts": 0.0}
DIV_CACHE_TTL = 86400  # 24 hours


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

    def get_options_chain(self, expiry: str) -> list:
        cached = _cache.get(f"chain_{expiry}")
        if cached:
            return cached
        try:
            t = _ticker("SPY")
            chain = t.option_chain(expiry)
            calls = chain.calls

            # SPY spot price for B-S calculation
            spot = self.get_spy_price().get("price", 0)

            # Time to expiry in years
            exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            T = max((exp_date - datetime.today().date()).days, 1) / 365.0

            available_cols = [c for c in ["strike", "bid", "ask", "lastPrice", "volume",
                              "openInterest", "impliedVolatility"]
                              if c in calls.columns]
            result = calls[available_cols].to_dict("records")

            # Build put OI lookup by strike
            put_oi_by_strike: dict = {}
            try:
                puts = chain.puts
                if "strike" in puts.columns and "openInterest" in puts.columns:
                    for _, row in puts[["strike", "openInterest"]].iterrows():
                        k = round(float(row["strike"]), 2)
                        oi = row["openInterest"]
                        put_oi_by_strike[k] = int(oi) if oi is not None and not (isinstance(oi, float) and np.isnan(oi)) else None
            except Exception:
                pass

            for row in result:
                # Clean NaNs
                for k, v in list(row.items()):
                    if isinstance(v, float) and np.isnan(v):
                        row[k] = None
                    elif isinstance(v, float):
                        row[k] = round(v, 4)

                # Attach put OI for this strike
                row["put_oi"] = put_oi_by_strike.get(round(float(row.get("strike") or 0), 2))

                # Compute Greeks via Black-Scholes (yfinance doesn't supply them)
                iv = row.get("impliedVolatility") or 0
                strike = row.get("strike") or 0
                if spot > 0 and iv > 0 and strike > 0:
                    delta, gamma, theta, vega = _bs_greeks(spot, strike, T, iv)
                else:
                    delta = gamma = theta = vega = None
                row["delta"] = delta
                row["gamma"] = gamma
                row["theta"] = theta
                row["vega"]  = vega

                # Intrinsic value & time premium
                mid = round(((row.get("bid") or 0) + (row.get("ask") or 0)) / 2, 2)
                intrinsic = round(max(0.0, spot - float(row.get("strike") or 0)), 2)
                row["intrinsic_value"] = intrinsic
                row["time_premium"]    = round(max(0.0, mid - intrinsic), 2)

        except Exception:
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

    def get_vix_recent_history(self, days: int = 10) -> list:
        """Return list of recent VIX daily closes, oldest first."""
        cache_key = f"vix_recent_{days}"
        cached = _cache.get(cache_key)
        if cached:
            return cached
        try:
            t = _ticker("^VIX")
            hist = t.history(period=f"{days}d", interval="1d")
            result = [round(float(v), 2) for v in hist["Close"].tolist()]
        except Exception:
            result = []
        _cache.set(cache_key, result)
        return result

    def get_spy_recent_history(self, days: int = 10) -> list:
        """Return list of recent SPY daily closes, oldest first."""
        cache_key = f"spy_recent_{days}"
        cached = _cache.get(cache_key)
        if cached:
            return cached
        try:
            df = self.get_spy_history(days + 5)
            result = [round(float(v), 2) for v in df["Close"].tolist()[-days:]]
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

    def get_spy_dividends(self) -> dict:
        """
        Return SPY dividend data with 24h cache.
        {
          "next_ex_div_date": "YYYY-MM-DD" | None,
          "next_div_amount":  float,         # upcoming dividend per share
          "days_until_ex_div": int | None,
          "recent_quarterly_avg": float,     # avg of last 4 dividends
        }
        Falls back to $1.60/quarter if yfinance data unavailable.
        """
        if time.time() - _div_cache["ts"] < DIV_CACHE_TTL and _div_cache["data"]:
            return _div_cache["data"]
        try:
            t = _ticker("SPY")
            next_ex_div: str | None = None
            next_amount: float | None = None

            # Try .calendar for next ex-dividend date
            try:
                cal = t.calendar
                if cal is not None and "Ex-Dividend Date" in cal:
                    raw = cal["Ex-Dividend Date"]
                    next_ex_div = raw.date().isoformat() if hasattr(raw, "date") else str(raw)[:10]
            except Exception:
                pass

            # .dividends for amounts and fallback ex-div estimation
            recent_quarterly_avg = 1.60
            try:
                divs = t.dividends
                if divs is not None and len(divs) >= 1:
                    next_amount = round(float(divs.iloc[-1]), 4)
                if divs is not None and len(divs) >= 4:
                    recent_quarterly_avg = round(float(divs.iloc[-4:].mean()), 4)
                # If calendar failed, estimate next ex-div from last payment date + ~91 days
                if next_ex_div is None and len(divs) >= 1:
                    last_ts = divs.index[-1]
                    last_date = last_ts.date() if hasattr(last_ts, "date") else last_ts
                    estimated = last_date + timedelta(days=91)
                    next_ex_div = estimated.isoformat()
            except Exception:
                pass

            days_until: int | None = None
            if next_ex_div:
                try:
                    ex_date = datetime.strptime(next_ex_div, "%Y-%m-%d").date()
                    days_until = (ex_date - datetime.today().date()).days
                    if days_until < 0:
                        # Already passed — clear it so callers don't act on stale data
                        next_ex_div = None
                        days_until = None
                except Exception:
                    next_ex_div = None
                    days_until = None

            result = {
                "next_ex_div_date":    next_ex_div,
                "next_div_amount":     next_amount or recent_quarterly_avg,
                "days_until_ex_div":   days_until,
                "recent_quarterly_avg": recent_quarterly_avg,
            }
        except Exception as e:
            result = {
                "next_ex_div_date":    None,
                "next_div_amount":     1.60,
                "days_until_ex_div":   None,
                "recent_quarterly_avg": 1.60,
                "error": str(e),
            }
        _div_cache["data"] = result
        _div_cache["ts"] = time.time()
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

    def get_calculator_data(self, ticker: str, max_dte: int = 45) -> dict:
        """Fetch spot price + nearest 20-45 DTE options chain for any ticker.

        Returns { spot, expiry, dte, chain } or raises ValueError on failure.
        Used by the public /api/calculator endpoint.
        """
        cache_key = f"calc_{ticker}_{max_dte}"
        cached = _cache.get(cache_key)
        if cached:
            return cached

        try:
            t = _ticker(ticker)
            info = t.fast_info
            spot = round(float(info.last_price), 2)
            if spot <= 0:
                raise ValueError(f"Could not get price for {ticker}")

            all_expiries = t.options
            if not all_expiries:
                raise ValueError(f"No options available for {ticker}")

            today = datetime.today().date()
            target_expiry = None
            for exp in all_expiries:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                dte = (exp_date - today).days
                if 20 <= dte <= max_dte:
                    target_expiry = exp
                    break

            # Fall back to nearest expiry with at least 7 DTE
            if not target_expiry:
                for exp in all_expiries:
                    exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                    dte = (exp_date - today).days
                    if dte >= 7:
                        target_expiry = exp
                        break

            if not target_expiry:
                raise ValueError(f"No suitable expiry found for {ticker}")

            exp_date = datetime.strptime(target_expiry, "%Y-%m-%d").date()
            dte = max((exp_date - today).days, 1)
            T = dte / 365.0

            chain_raw = t.option_chain(target_expiry)
            calls = chain_raw.calls

            available_cols = [c for c in ["strike", "bid", "ask", "impliedVolatility"]
                              if c in calls.columns]
            rows = calls[available_cols].to_dict("records")

            # Compute Greeks and clean NaNs
            chain = []
            for row in rows:
                for k, v in list(row.items()):
                    if isinstance(v, float) and np.isnan(v):
                        row[k] = None

                iv = row.get("impliedVolatility") or 0
                strike = row.get("strike") or 0
                bid = row.get("bid") or 0
                ask = row.get("ask") or 0
                mid = round((bid + ask) / 2, 4)

                if spot > 0 and iv > 0 and strike > 0:
                    delta, _, _, _ = _bs_greeks(spot, strike, T, iv)
                else:
                    delta = None

                chain.append({
                    "strike": float(strike),
                    "bid": float(bid),
                    "ask": float(ask),
                    "mid": mid,
                    "delta": delta,
                    "iv": round(float(iv), 4) if iv else None,
                })

            result = {"spot": spot, "expiry": target_expiry, "dte": dte, "chain": chain}
        except (ValueError, KeyError) as exc:
            raise ValueError(str(exc))
        except Exception as exc:
            raise ValueError(f"Market data unavailable for {ticker}: {exc}")

        _cache.set(cache_key, result)
        return result
