"""
PIPE-REC-09 — Strategy backtesting against real historical option chains.

Sources premiums, IV, and Greeks from the DuckDB options_chains table
(backend/data/options.duckdb), populated from ThetaData/lambdaclass.
For tickers without DuckDB coverage, the BS+RV fallback is deferred to v2.

Two cadences run side-by-side:
  - "unconditional"  → entry every 5 trading days regardless of regime
  - "regime_gated"   → entry only on days where signals.py would have said
                       "SELL PREMIUM" given the historical macro inputs

The dual-track output lets us claim "the regime engine added X% annualized
over the strategy alone" with evidence instead of assertion.

Metrics reported per run (Whaley 2002 / BXM methodology + Israelov critique;
see Felix.md for the full source list):

  Outcomes:        max_profit_rate, near_miss_rate, assignment_rate
                   max_profit_count (absolute, per Felix critique)
                   monthly_outcomes (bucketed)
  Income:          avg_ann_yield, avg_pnl_per_trade
                   avg_premium_per_trade ($ and % of cost basis)
                   worst_single_trade_pnl ($)
  Portfolio:       starting_equity_100sh, final_equity_100sh, total_profit_100sh
                   buy_and_hold_final_equity, buy_and_hold_total_profit, buy_and_hold_total_return
                   alpha_dollar, alpha_pct  ← strategy P&L − B&H P&L (user-locked
                                              definition 2026-04-25; alpha is always
                                              vs buy-and-hold, never cadence-vs-cadence)
                   assignment_opportunity_cost ($ — Felix's critique anchor)
  Risk-adjusted:   cagr, annualized_volatility, sharpe_ratio
                   max_drawdown_dollar, max_drawdown_pct
                   upside_capture, downside_capture (vs underlying)
"""

from __future__ import annotations

import json
import math
import uuid
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

import numpy as np
import pandas as pd

import data_store
from signals import SignalEngine

_signals = SignalEngine()
SHARES_PER_CONTRACT = 100  # standard equity options multiplier


# ── Strategy lookup (reuse the live preset, no duplication) ────────────────────

def _get_strategy(strategy_id: str) -> dict:
    # Late import to avoid circular import (main.py imports this file).
    from main import STRATEGY_PRESETS
    if strategy_id not in STRATEGY_PRESETS:
        raise ValueError(f"unknown strategy: {strategy_id}")
    return STRATEGY_PRESETS[strategy_id]


# ── Coverage check ────────────────────────────────────────────────────────────

def has_coverage(ticker: str, start: date, end: date) -> bool:
    """True if the DuckDB options_chains table has rows for ticker in window."""
    with data_store.get_connection(read_only=True) as conn:
        n = conn.execute("""
            SELECT COUNT(*) FROM options_chains
            WHERE symbol = ? AND quote_date BETWEEN ? AND ?
        """, [ticker.upper(), start, end]).fetchone()[0]
    return n > 0


# ── Expiry + strike selection (uses real chain data) ──────────────────────────

def _select_expiry(
    ticker: str, entry_date: date, dte_window: List[int],
) -> Optional[Tuple[date, int]]:
    """
    Pick the expiry inside the strategy's DTE window that's closest to the
    midpoint. Returns (expiry_date, dte) or None if no expiry exists in window
    on this quote_date.
    """
    lo, hi = dte_window
    target_mid = (lo + hi) / 2.0
    with data_store.get_connection(read_only=True) as conn:
        rows = conn.execute("""
            SELECT DISTINCT expiration FROM options_chains
            WHERE symbol = ? AND quote_date = ? AND option_type = 'C'
              AND (expiration - quote_date) BETWEEN ? AND ?
        """, [ticker.upper(), entry_date, lo, hi]).fetchall()
    if not rows:
        return None
    best = None
    best_diff = float("inf")
    for (exp,) in rows:
        dte = (exp - entry_date).days
        diff = abs(dte - target_mid)
        if diff < best_diff:
            best, best_diff = (exp, dte), diff
    return best


def _select_strike(
    ticker: str, entry_date: date, expiry: date, max_delta: float,
    min_iv_pct: float, min_yield_pct: float,
    max_iv_pct: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Pick the OTM call with delta closest to (but not exceeding) max_delta.
    Returns a dict with strike/bid/ask/iv/delta or None if no row qualifies.

    IV gates:
      - min_iv_pct: floor on the strike's implied_volatility (in %)
      - max_iv_pct: optional ceiling on the strike's IV (in %). Used by
                    calm-market strategies that only want to sell premium
                    when IV is BELOW some threshold.
    """
    with data_store.get_connection(read_only=True) as conn:
        df = conn.execute("""
            SELECT strike, bid, ask, last_price,
                   implied_volatility AS iv, delta
            FROM options_chains
            WHERE symbol = ? AND quote_date = ? AND expiration = ?
              AND option_type = 'C'
              AND delta IS NOT NULL AND delta > 0 AND delta <= ?
              AND bid IS NOT NULL AND ask IS NOT NULL
              AND bid >= 0 AND ask > 0
            ORDER BY delta DESC
            LIMIT 1
        """, [ticker.upper(), entry_date, expiry, max_delta]).fetchdf()
    if df.empty:
        return None
    row = df.iloc[0].to_dict()
    bid, ask = float(row["bid"]), float(row["ask"])
    if bid <= 0 and ask <= 0:
        return None
    mid = (bid + ask) / 2.0
    iv_pct = float(row["iv"] or 0) * 100.0  # data is decimal (0.18) → 18.0%
    if iv_pct < min_iv_pct:
        return None
    if max_iv_pct is not None and iv_pct > max_iv_pct:
        return None
    return {
        "strike": float(row["strike"]),
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "iv_pct": iv_pct,
        "delta": float(row["delta"]),
    }


# ── Position open / management / expiry resolution ────────────────────────────
#
# The simulator walks every trading day in the window. Whenever no position
# is active and cadence + gate conditions allow, _open_position picks a strike
# and opens a new short call. While a position is active, _manage_position
# checks three triggers daily:
#
#   1. 50%-profit close   — current option mid ≤ 50% of entry mid
#   2. ITM roll up-and-out — underlying > strike × 1.005 AND DTE > 21
#   3. 21-DTE defensive roll — DTE ≤ 21 AND at-risk (underlying ≥ strike × 0.97)
#
# Triggers 2 and 3 are *rolls* — the current position closes (paying buyback
# at that day's mid) and a new position opens SAME DAY at the strategy's
# standard delta target with a fresh expiry. Both legs are recorded as
# separate trades linked by chain_id.
#
# Rolls bypass the regime gate. The gate only governs *initial* entry.

CLOSE_EARLY_PROFIT_PCT = 0.50      # 50%-profit close trigger
ITM_ROLL_DTE_FLOOR     = 21        # only roll up-and-out while DTE > 21
ITM_ROLL_BREACH_PCT    = 1.005     # 0.5% above strike → ITM enough to roll
DEFENSIVE_ROLL_AT_RISK_PCT = 0.97  # within 3% of strike at 21 DTE → roll


def _open_position(
    ticker: str, entry_date: date, strategy: dict,
) -> Optional[Dict[str, Any]]:
    """Pick strike + expiry + mid for a new short call. Returns None if no
    eligible contract on this date (filters reject everything)."""
    filt = strategy["filt"]
    dte_window = strategy["dte_window"]

    expiry_pick = _select_expiry(ticker, entry_date, dte_window)
    if not expiry_pick:
        return None
    expiry, dte = expiry_pick
    if dte <= 0:
        return None

    strike_pick = _select_strike(
        ticker, entry_date, expiry,
        max_delta=filt["maxDelta"],
        min_iv_pct=filt.get("minIvr", 0.0),
        min_yield_pct=filt.get("minYield", 0.0),
        max_iv_pct=filt.get("maxIvr"),
    )
    if not strike_pick:
        return None

    with data_store.get_connection(read_only=True) as conn:
        spot_row = conn.execute(
            "SELECT close FROM underlying_prices WHERE symbol=? AND date<=? "
            "ORDER BY date DESC LIMIT 1",
            [ticker.upper(), entry_date],
        ).fetchone()
    if not spot_row:
        return None
    spot = float(spot_row[0])
    if spot <= 0:
        return None

    mid = strike_pick["mid"]
    ann_yield = (mid / spot) * (365.0 / dte) * 100.0
    if ann_yield < filt.get("minYield", 0.0):
        return None

    return {
        "entry_date": entry_date,
        "expiry_date": expiry,
        "strike": strike_pick["strike"],
        "spot_at_entry": spot,
        "mid": mid,
        "iv_at_entry": strike_pick["iv_pct"],
        "delta_at_entry": strike_pick["delta"],
        "ann_yield": ann_yield,
        # These get filled by the management loop on close/expiry:
        "expiry_close": None,
        "outcome": None,
        "pnl": None,
        "close_date": None,
        "buyback_mid": None,
    }


def _underlying_close_on(ticker: str, day: date) -> Optional[float]:
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute(
            "SELECT close FROM underlying_prices WHERE symbol=? AND date=? LIMIT 1",
            [ticker.upper(), day],
        ).fetchone()
    return float(row[0]) if row else None


def _option_mid_on(ticker: str, strike: float, expiry: date, day: date) -> Optional[float]:
    """Single-day option mid lookup. None if no quote that day."""
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute(
            "SELECT (bid + ask) / 2.0 FROM options_chains "
            "WHERE symbol=? AND option_type='C' AND strike=? AND expiration=? "
            "AND quote_date=? AND bid IS NOT NULL AND ask IS NOT NULL AND ask > 0 "
            "LIMIT 1",
            [ticker.upper(), strike, expiry, day],
        ).fetchone()
    if not row or row[0] is None:
        return None
    mid = float(row[0])
    return mid if mid > 0 else None


def _manage_position(
    position: Dict[str, Any], day: date, ticker: str,
) -> str:
    """
    Check exit/roll triggers for an active position on `day`.

    Mutates `position` if a close/roll fires. Returns one of:
      'kept'   — no trigger, hold for another day
      'closed' — 50%-profit close fired; no roll, no new position opens today
      'rolled' — roll trigger fired; close current + caller should open new same-day
      'expired' — reached expiry, resolve at expiry close
    """
    expiry = position["expiry_date"]
    if day == expiry:
        # Resolve at expiry
        underlying = _underlying_close_on(ticker, day)
        if underlying is None:
            return "kept"  # missing data, will be retried (but expiry passed — orchestrator handles)
        position["expiry_close"] = underlying
        if underlying <= position["strike"]:
            position["outcome"] = "max_profit"
            position["pnl"] = position["mid"] * 100.0
        else:
            capped = (underlying - position["strike"]) * 100.0
            position["outcome"] = "assignment"
            position["pnl"] = position["mid"] * 100.0 - capped
        position["close_date"] = day
        return "expired"

    if day <= position["entry_date"]:
        return "kept"

    days_remaining = (expiry - day).days
    current_mid = _option_mid_on(ticker, position["strike"], expiry, day)
    underlying = _underlying_close_on(ticker, day)

    # Trigger 1: 50%-profit close. Always primary if it fires.
    if current_mid is not None and current_mid <= position["mid"] * CLOSE_EARLY_PROFIT_PCT:
        position["outcome"] = "closed_early_50pct"
        position["close_date"] = day
        position["buyback_mid"] = current_mid
        position["pnl"] = (position["mid"] - current_mid) * 100.0
        return "closed"

    # Trigger 2: ITM roll up-and-out (only while DTE > 21 — meaningful time value left)
    if (current_mid is not None and underlying is not None
            and underlying > position["strike"] * ITM_ROLL_BREACH_PCT
            and days_remaining > ITM_ROLL_DTE_FLOOR):
        position["outcome"] = "rolled_up_and_out"
        position["close_date"] = day
        position["buyback_mid"] = current_mid
        position["pnl"] = (position["mid"] - current_mid) * 100.0
        return "rolled"

    # Trigger 3: 21-DTE defensive roll (only when at-risk: within 3% of strike or above)
    if (current_mid is not None and underlying is not None
            and days_remaining <= ITM_ROLL_DTE_FLOOR
            and underlying >= position["strike"] * DEFENSIVE_ROLL_AT_RISK_PCT):
        position["outcome"] = "rolled_at_21_dte"
        position["close_date"] = day
        position["buyback_mid"] = current_mid
        position["pnl"] = (position["mid"] - current_mid) * 100.0
        return "rolled"

    return "kept"


# ── Historical regime backfill (PIPE-REC-09 dual-track gate) ──────────────────

@dataclass
class _MacroSnapshot:
    vix: float
    vvix: Optional[float]
    tnx: float
    fvx: float
    tlt: float
    spy_close: float
    spy_ma20: Optional[float]
    spy_ma_slope_pct: Optional[float]
    vix_iv_rank: Optional[float]
    vix_recent: List[float]
    spy_recent: List[float]
    tnx_history: List[float]
    tlt_history: List[float]


def _load_macro_window(end_date: date, lookback_days: int = 252) -> Dict[str, pd.DataFrame]:
    """Load all macro series from DuckDB ending on end_date."""
    start = end_date - timedelta(days=lookback_days + 30)
    out = {}
    for series in ("VIX", "VVIX", "TNX", "FVX", "TLT"):
        out[series] = data_store.get_macro_series(series, start, end_date)
    spy = data_store.get_underlying_prices("SPY", start, end_date)
    out["SPY"] = spy
    return out


def _build_macro_snapshot(
    macro: Dict[str, pd.DataFrame], on_date: date,
) -> Optional[_MacroSnapshot]:
    """
    Build the inputs needed by SignalEngine.analyze() for `on_date`.
    Returns None if any required series is missing on or before on_date.
    """
    # DuckDB returns DATE columns as datetime64[us] from fetchdf(); coerce
    # the comparison RHS to the same dtype to avoid pandas TypeError.
    on_ts = pd.Timestamp(on_date)

    def latest(df: pd.DataFrame, col: str = "value") -> Optional[float]:
        if df.empty:
            return None
        sub = df[df["date"] <= on_ts]
        if sub.empty:
            return None
        return float(sub.iloc[-1][col])

    def tail(df: pd.DataFrame, n: int, col: str = "value") -> List[float]:
        if df.empty:
            return []
        sub = df[df["date"] <= on_ts].tail(n)
        return [float(v) for v in sub[col].tolist()]

    vix = latest(macro["VIX"])
    tnx = latest(macro["TNX"])
    fvx = latest(macro["FVX"])
    tlt = latest(macro["TLT"])
    if vix is None or tnx is None or fvx is None or tlt is None:
        return None
    vvix = latest(macro["VVIX"])  # may be None pre-2007; signals tolerates that

    spy_df = macro["SPY"]
    if spy_df.empty:
        return None
    spy_sub = spy_df[spy_df["date"] <= on_ts].tail(25)
    if len(spy_sub) < 20:
        return None
    spy_close = float(spy_sub.iloc[-1]["close"])
    spy_ma20 = float(spy_sub["close"].tail(20).mean())
    # Simple slope: (today - 5d ago) / 5d ago * 100
    if len(spy_sub) >= 5:
        slope_pct = (spy_close - float(spy_sub.iloc[-5]["close"])) / float(spy_sub.iloc[-5]["close"]) * 100.0
    else:
        slope_pct = 0.0

    # IV rank for VIX over trailing 252 days
    vix_window = macro["VIX"]
    vix_window = vix_window[vix_window["date"] <= on_ts].tail(252)
    if len(vix_window) >= 30:
        lo, hi = vix_window["value"].min(), vix_window["value"].max()
        rank = (vix - lo) / (hi - lo) * 100.0 if hi > lo else 50.0
    else:
        rank = 50.0  # neutral when insufficient history

    return _MacroSnapshot(
        vix=vix,
        vvix=vvix if vvix is not None else 95.0,  # neutral default if VVIX missing
        tnx=tnx, fvx=fvx, tlt=tlt,
        spy_close=spy_close,
        spy_ma20=spy_ma20,
        spy_ma_slope_pct=slope_pct,
        vix_iv_rank=rank,
        vix_recent=tail(macro["VIX"], 10),
        spy_recent=[float(v) for v in spy_sub["close"].tail(10).tolist()],
        tnx_history=tail(macro["TNX"], 10),
        tlt_history=tail(macro["TLT"], 10),
    )


def _historical_regime(snap: _MacroSnapshot) -> Tuple[str, str]:
    """Run signals.analyze() with historical inputs. Returns (regime, confidence)."""
    spy_ma_signal = {
        "above_ma": snap.spy_close >= (snap.spy_ma20 or snap.spy_close),
        "slope_pct": snap.spy_ma_slope_pct or 0.0,
    }
    result = _signals.analyze(
        spy_price=snap.spy_close,
        vix=snap.vix,
        vix_iv_rank=snap.vix_iv_rank or 50.0,
        vvix=snap.vvix or 95.0,
        tnx=snap.tnx, fvx=snap.fvx, tlt=snap.tlt,
        spy_ma_signal=spy_ma_signal,
        open_positions=[],
        tnx_history=snap.tnx_history,
        tlt_history=snap.tlt_history,
        available_expiries=[],
        vix_recent=snap.vix_recent,
        spy_recent=snap.spy_recent,
    )
    return result["regime"], result["confidence"]


# ── Portfolio metrics (PIPE-REC-09 extended) ──────────────────────────────────
#
# These compute institutional-grade stats per Whaley 2002 / BXM methodology
# augmented with Israelov & Nielsen (2015) — Sharpe alone is misleading for
# short-vol strategies, so we also report upside/downside capture and alpha
# vs simple buy-and-hold of the underlying. Felix's critique is operationalized
# as "assignment_opportunity_cost" — total $ of capped upside.

def _build_underlying_track(ticker: str, start: date, end: date) -> pd.DataFrame:
    """Daily close prices indexed by date for the window."""
    df = data_store.get_underlying_prices(ticker, start, end)
    if df.empty:
        return df
    df = df[["date", "close"]].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.sort_values("date").reset_index(drop=True)
    return df


def _trade_cash_impact(trade: Dict[str, Any]) -> float:
    """
    $ impact of one trade on the running cash balance for a 100-share lot.
    Uses the path-dependent pnl computed by _classify_with_path, which
    already accounts for early-close buyback and assignment opportunity cost.
    """
    return float(trade["pnl"])


def _build_equity_curve(
    trades: List[Dict[str, Any]],
    underlying: pd.DataFrame,
    share_count: int = 100,
) -> pd.DataFrame:
    """
    Build a daily equity timeline for a `share_count`-share holding.

    Equity[d] = share_count * close[d] + cash_balance[d]
    cash_balance accrues per-trade pnl on each trade's close_date or expiry date.

    Returns a DataFrame: date, close, cash, strategy_equity, bh_equity.
    """
    if underlying.empty:
        return pd.DataFrame(columns=["date", "close", "cash", "strategy_equity", "bh_equity"])

    track = underlying.copy().reset_index(drop=True)
    track["cash"] = 0.0
    # Map close-date → cumulative cash impact landing that day. Use close_date
    # for trades closed mid-window (rolls / 50%-close) and expiry_date for
    # trades held to expiry.
    cash_events: Dict[date, float] = {}
    for t in trades:
        d = t.get("close_date") or t["expiry_date"]
        if isinstance(d, datetime):
            d = d.date()
        cash_events[d] = cash_events.get(d, 0.0) + _trade_cash_impact(t)
    cash_running = 0.0
    cash_col = []
    for d in track["date"]:
        if d in cash_events:
            cash_running += cash_events[d]
        cash_col.append(cash_running)
    track["cash"] = cash_col

    track["strategy_equity"] = share_count * track["close"] + track["cash"]
    track["bh_equity"] = share_count * track["close"]
    return track


def _risk_free_rate_avg(start: date, end: date) -> float:
    """
    Average annualised risk-free rate over the window, sourced from the TNX
    series (10y treasury yield, percent) already stored in macro_history.
    Returns a decimal (e.g. 0.043 for 4.3%). Falls back to 0.04 if missing.
    """
    df = data_store.get_macro_series("TNX", start, end)
    if df.empty:
        return 0.04
    # TNX is stored as percentage points (e.g. 4.30 means 4.30%)
    return float(df["value"].mean()) / 100.0


def _max_drawdown(equity: pd.Series) -> Tuple[float, float]:
    """Return (max_drawdown_dollar, max_drawdown_pct). Both positive numbers."""
    if equity.empty:
        return 0.0, 0.0
    running_max = equity.cummax()
    dd = running_max - equity
    dd_pct = dd / running_max
    return float(dd.max()), float(dd_pct.max())


def _annualised_stats(monthly_returns: pd.Series, rf: float) -> Dict[str, float]:
    """CAGR, annualised vol, Sharpe — from monthly return series."""
    if monthly_returns.empty or len(monthly_returns) < 2:
        return {"cagr": None, "annualized_volatility": None, "sharpe_ratio": None}
    n_months = len(monthly_returns)
    cumulative = (1.0 + monthly_returns).prod()
    years = n_months / 12.0
    cagr = cumulative ** (1.0 / years) - 1.0 if cumulative > 0 else None
    vol_annual = float(monthly_returns.std(ddof=1)) * math.sqrt(12.0)
    if cagr is None or vol_annual <= 0:
        sharpe = None
    else:
        sharpe = (cagr - rf) / vol_annual
    return {
        "cagr": round(cagr, 4) if cagr is not None else None,
        "annualized_volatility": round(vol_annual, 4),
        "sharpe_ratio": round(sharpe, 3) if sharpe is not None else None,
    }


def _capture_ratios(
    strat_monthly: pd.Series, bh_monthly: pd.Series,
) -> Dict[str, Optional[float]]:
    """
    Upside capture: Σ strat_returns_when_bh_up / Σ bh_returns_when_bh_up
    Downside capture: Σ strat_returns_when_bh_down / Σ bh_returns_when_bh_down

    Returns ratios as decimals (1.0 = matches underlying). Covered calls
    typically show <1 upside capture and >1 downside capture (the bargain).
    """
    if strat_monthly.empty or bh_monthly.empty:
        return {"upside_capture": None, "downside_capture": None}
    aligned = pd.concat([strat_monthly.rename("s"), bh_monthly.rename("b")], axis=1).dropna()
    if aligned.empty:
        return {"upside_capture": None, "downside_capture": None}
    up = aligned[aligned["b"] > 0]
    dn = aligned[aligned["b"] < 0]
    upside = float(up["s"].sum() / up["b"].sum()) if not up.empty and up["b"].sum() > 0 else None
    downside = float(dn["s"].sum() / dn["b"].sum()) if not dn.empty and dn["b"].sum() < 0 else None
    return {
        "upside_capture": round(upside, 3) if upside is not None else None,
        "downside_capture": round(downside, 3) if downside is not None else None,
    }


def _portfolio_metrics(
    trades: List[Dict[str, Any]],
    ticker: str, start: date, end: date,
    share_count: int = 100,
) -> Dict[str, Any]:
    """
    Compute the full institutional-grade metric pack for `share_count` shares.
    Equity curve and B&H baseline both scale with share_count.
    """
    underlying = _build_underlying_track(ticker, start, end)
    if underlying.empty:
        return {"error": f"no underlying price data for {ticker} in window"}

    initial_close = float(underlying.iloc[0]["close"])
    final_close = float(underlying.iloc[-1]["close"])
    starting_equity = share_count * initial_close
    bh_final_equity = share_count * final_close
    bh_total_return = (final_close - initial_close) / initial_close if initial_close > 0 else None
    bh_total_profit = bh_final_equity - starting_equity  # dollar form of B&H P&L

    # Outcome counts (absolute). Five outcomes possible with rolling enabled.
    counts = {
        "max_profit": 0,
        "closed_early_50pct": 0,
        "rolled_up_and_out": 0,
        "rolled_at_21_dte": 0,
        "assignment": 0,
    }
    premiums_collected = 0.0
    premium_pct_basis = []
    pnls = []
    assignment_opp_cost = 0.0
    for t in trades:
        counts[t["outcome"]] = counts.get(t["outcome"], 0) + 1
        premiums_collected += t["mid"] * SHARES_PER_CONTRACT
        if t["spot_at_entry"] > 0:
            premium_pct_basis.append((t["mid"] / t["spot_at_entry"]) * 100.0)
        pnls.append(t["pnl"])
        if t["outcome"] == "assignment" and t.get("expiry_close") is not None:
            opp = max(0.0, t["expiry_close"] - t["strike"]) * SHARES_PER_CONTRACT
            assignment_opp_cost += opp

    # Equity curve
    track = _build_equity_curve(trades, underlying, share_count=share_count)
    if track.empty:
        return {"error": "could not build equity curve"}
    final_equity = float(track.iloc[-1]["strategy_equity"])
    total_profit = final_equity - starting_equity
    strat_total_return = (final_equity - starting_equity) / starting_equity if starting_equity > 0 else None
    # User-locked alpha definition (2026-04-25): alpha = strategy P&L − B&H P&L.
    # We report it both in dollar terms (the primary form) and as a return delta.
    alpha_dollar = total_profit - bh_total_profit
    alpha_pct = (strat_total_return - bh_total_return) if (strat_total_return is not None and bh_total_return is not None) else None

    # Monthly returns from daily equity
    track_idx = track.copy()
    track_idx["date"] = pd.to_datetime(track_idx["date"])
    track_idx = track_idx.set_index("date")
    monthly_strat = track_idx["strategy_equity"].resample("ME").last().pct_change().dropna()
    monthly_bh = track_idx["bh_equity"].resample("ME").last().pct_change().dropna()

    rf = _risk_free_rate_avg(start, end)
    ann_strat = _annualised_stats(monthly_strat, rf)
    ann_bh = _annualised_stats(monthly_bh, rf)
    capture = _capture_ratios(monthly_strat, monthly_bh)

    max_dd_dollar, max_dd_pct = _max_drawdown(track_idx["strategy_equity"])
    bh_max_dd_dollar, bh_max_dd_pct = _max_drawdown(track_idx["bh_equity"])

    n_trades = len(trades)
    return {
        # Window
        "window_start": str(start),
        "window_end": str(end),
        "trading_days": int(len(underlying)),

        # Outcome counts (absolute). Five buckets — three "successful" (worthless,
        # closed_early, rolled-then-continued) and two "managed-against" (assignment,
        # rolled_up_and_out at a buyback cost).
        "trades_simulated": n_trades,
        "max_profit_count": counts["max_profit"],
        "closed_early_count": counts["closed_early_50pct"],
        "rolled_up_count": counts["rolled_up_and_out"],
        "rolled_21dte_count": counts["rolled_at_21_dte"],
        "assignment_count": counts["assignment"],
        "max_profit_rate": round(counts["max_profit"] / n_trades, 3) if n_trades else None,
        "closed_early_rate": round(counts["closed_early_50pct"] / n_trades, 3) if n_trades else None,
        "rolled_up_rate": round(counts["rolled_up_and_out"] / n_trades, 3) if n_trades else None,
        "rolled_21dte_rate": round(counts["rolled_at_21_dte"] / n_trades, 3) if n_trades else None,
        "assignment_rate": round(counts["assignment"] / n_trades, 3) if n_trades else None,

        # Income
        "avg_premium_per_trade_dollar": round(premiums_collected / n_trades, 2) if n_trades else None,
        "avg_premium_per_trade_pct": round(sum(premium_pct_basis) / len(premium_pct_basis), 3) if premium_pct_basis else None,
        "total_premiums_collected": round(premiums_collected, 2),
        "avg_pnl_per_trade": round(sum(pnls) / n_trades, 2) if n_trades else None,
        "worst_single_trade_pnl": round(min(pnls), 2) if pnls else None,

        # Portfolio (100-share lot)
        "starting_equity_100sh": round(starting_equity, 2),
        "final_equity_100sh": round(final_equity, 2),
        "total_profit_100sh": round(total_profit, 2),
        "strategy_total_return": round(strat_total_return, 4) if strat_total_return is not None else None,

        # Buy-and-hold benchmark
        "buy_and_hold_final_equity": round(bh_final_equity, 2),
        "buy_and_hold_total_profit": round(bh_total_profit, 2),
        "buy_and_hold_total_return": round(bh_total_return, 4) if bh_total_return is not None else None,
        # Alpha — user-locked definition: strategy P&L − B&H P&L.
        # Dollar form is primary, return-delta form is secondary.
        "alpha_dollar": round(alpha_dollar, 2),
        "alpha_pct": round(alpha_pct, 4) if alpha_pct is not None else None,

        # Felix's critique anchor
        "assignment_opportunity_cost_dollar": round(assignment_opp_cost, 2),

        # Risk-adjusted (strategy)
        "cagr": ann_strat["cagr"],
        "annualized_volatility": ann_strat["annualized_volatility"],
        "sharpe_ratio": ann_strat["sharpe_ratio"],
        "max_drawdown_dollar": round(max_dd_dollar, 2),
        "max_drawdown_pct": round(max_dd_pct, 4),

        # Risk-adjusted (buy-and-hold)
        "bh_cagr": ann_bh["cagr"],
        "bh_annualized_volatility": ann_bh["annualized_volatility"],
        "bh_sharpe_ratio": ann_bh["sharpe_ratio"],
        "bh_max_drawdown_dollar": round(bh_max_dd_dollar, 2),
        "bh_max_drawdown_pct": round(bh_max_dd_pct, 4),

        # Capture (Israelov framing)
        "upside_capture": capture["upside_capture"],
        "downside_capture": capture["downside_capture"],

        # Risk-free rate used
        "risk_free_rate_used": round(rf, 4),
    }


def _aggregate_outcome_buckets(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Monthly bucket + worst 3-month rolling window."""
    monthly = {}
    for t in trades:
        key = t["entry_date"].strftime("%Y-%m") if hasattr(t["entry_date"], "strftime") else str(t["entry_date"])[:7]
        m = monthly.setdefault(key, {
            "month": key, "max_profit": 0, "closed_early_50pct": 0,
            "rolled_up_and_out": 0, "rolled_at_21_dte": 0, "assignment": 0,
        })
        m[t["outcome"]] = m.get(t["outcome"], 0) + 1
    monthly_list = sorted(monthly.values(), key=lambda x: x["month"])
    worst = None
    if len(monthly_list) >= 3:
        for i in range(len(monthly_list) - 2):
            window = monthly_list[i:i + 3]
            total = sum(
                m["max_profit"] + m["closed_early_50pct"]
                + m["rolled_up_and_out"] + m["rolled_at_21_dte"] + m["assignment"]
                for m in window
            )
            if total < 3:
                continue
            mp = sum(m["max_profit"] for m in window) / total
            if worst is None or mp < worst["max_profit_rate"]:
                worst = {
                    "start": window[0]["month"],
                    "end": window[-1]["month"],
                    "max_profit_rate": round(mp, 3),
                    "trades": total,
                }
    return {"monthly_outcomes": monthly_list, "worst_3m_period": worst}


# ── Orchestrator ──────────────────────────────────────────────────────────────

def _trading_days(ticker: str, start: date, end: date) -> List[date]:
    """All quote_dates in window where ticker has option chain rows."""
    with data_store.get_connection(read_only=True) as conn:
        rows = conn.execute("""
            SELECT DISTINCT quote_date FROM options_chains
            WHERE symbol = ? AND quote_date BETWEEN ? AND ?
            ORDER BY quote_date
        """, [ticker.upper(), start, end]).fetchall()
    return [r[0] for r in rows]


def _expiry_close(ticker: str, expiry: date) -> Optional[float]:
    """Underlying close on expiry. Falls back to nearest prior trading day."""
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT close FROM underlying_prices
            WHERE symbol = ? AND date <= ?
            ORDER BY date DESC LIMIT 1
        """, [ticker.upper(), expiry]).fetchone()
    return float(row[0]) if row else None


def _simulate_managed_chain(
    ticker: str, strategy: dict,
    trading_days: List[date], cadence_days: set,
    gate_fn,
    max_concurrent: int = 1,
) -> List[Dict[str, Any]]:
    """
    Walk every trading day. Maintain up to `max_concurrent` simultaneous active
    positions (= floor(share_count / 100)). On cadence days that pass the gate,
    open a new position if there's capacity. Manage every active position daily
    via the three triggers. Rolls continue the same chain (bypass the gate).

    max_concurrent semantics:
      1   → standard 100-share retail account (default)
      N   → 100*N shares, can write N covered calls in parallel
      ∞   → unlimited (use a large int like 10**9). Models pure strategy
            capacity, useful as a sanity check.

    Returns a flat list of trade dicts. Trades from the same opening share a chain_id.
    """
    trades: List[Dict[str, Any]] = []
    # Each entry: {"position": dict, "chain_id": str, "chain_position": int}
    active: List[Dict[str, Any]] = []

    def _new_chain_id() -> str:
        return uuid.uuid4().hex[:12]

    for day in trading_days:
        # 1. Manage every active position
        still_active: List[Dict[str, Any]] = []
        for entry in active:
            pos = entry["position"]
            label = _manage_position(pos, day, ticker)
            if label == "kept":
                still_active.append(entry)
                continue
            # Trade is closing one way or another — record the leg
            pos["chain_id"] = entry["chain_id"]
            pos["chain_position"] = entry["chain_position"]
            trades.append(pos)
            if label == "rolled":
                # Open new position SAME DAY, continuing this chain (bypass gate)
                new_pos = _open_position(ticker, day, strategy)
                if new_pos is not None:
                    still_active.append({
                        "position": new_pos,
                        "chain_id": entry["chain_id"],
                        "chain_position": entry["chain_position"] + 1,
                    })
                # else: roll target unavailable, chain ends here
            # closed / expired: chain ends, slot is freed for next cadence day
        active = still_active

        # 2. Cadence-eligible day with capacity → try to open a new chain
        if (day in cadence_days and gate_fn(day)
                and len(active) < max_concurrent):
            new_pos = _open_position(ticker, day, strategy)
            if new_pos is not None:
                active.append({
                    "position": new_pos,
                    "chain_id": _new_chain_id(),
                    "chain_position": 0,
                })

    # End of window: any still-active positions are dropped (incomplete chains)
    return trades


def _aggregate(
    trades: List[Dict[str, Any]],
    ticker: str, start: date, end: date,
    share_count: int = 100,
) -> Dict[str, Any]:
    """
    Aggregate one cadence's trades. Portfolio metrics scale with share_count.
    """
    if not trades:
        return {
            "trades_simulated": 0,
            "max_profit_rate": None, "closed_early_rate": None,
            "rolled_up_rate": None, "rolled_21dte_rate": None,
            "assignment_rate": None,
            "avg_ann_yield": None, "avg_pnl_per_trade": None,
            "worst_3m_period": None, "monthly_outcomes": [],
        }
    portfolio = _portfolio_metrics(trades, ticker, start, end, share_count=share_count)
    buckets = _aggregate_outcome_buckets(trades)
    avg_ann = sum(t["ann_yield"] for t in trades) / len(trades)
    return {
        **portfolio,
        **buckets,
        "avg_ann_yield": round(avg_ann, 2),
    }


def run_backtest(
    ticker: str, strategy_id: str,
    lookback_days: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    cadence: str = "both", entry_step: int = 5,
    share_count: int = 100,
) -> Dict[str, Any]:
    """
    Main entry point. Runs the simulation for `ticker` over the requested
    window. Window can be specified two ways:
      - lookback_days from today (legacy / endpoint default)
      - explicit start_date + end_date (used by 5y-block runs)

    cadence ∈ {'unconditional', 'regime_gated', 'both'}.
    share_count: number of underlying shares the user owns. 100 = 1 contract
                 capacity at any given time. 500 = 5 contracts. Pass a very
                 large value (e.g. 10**9) to model unlimited capacity (every
                 cadence day spawns its own chain) — useful as a sanity check
                 to confirm the active-position constraint is what's limiting
                 alpha.
    """
    if cadence not in ("unconditional", "regime_gated", "both"):
        raise ValueError(f"invalid cadence: {cadence}")

    ticker = ticker.upper()
    strategy = _get_strategy(strategy_id)

    if start_date is not None and end_date is not None:
        start, end = start_date, end_date
        lookback_days = (end - start).days
    elif lookback_days is not None:
        end = date.today()
        start = end - timedelta(days=lookback_days)
    else:
        raise ValueError("must supply lookback_days or both start_date+end_date")

    if not has_coverage(ticker, start, end):
        raise ValueError(f"no historical chain coverage for {ticker} in window {start}..{end}")

    started_at = datetime.utcnow()
    quote_dates = _trading_days(ticker, start, end)
    cadence_days = set(quote_dates[::entry_step])

    macro = _load_macro_window(end, lookback_days=lookback_days + 60) if cadence != "unconditional" else None

    # Pre-compute regime label for every cadence-eligible day. This avoids
    # re-running signals.analyze() inside the management loop.
    regime_cache: Dict[date, str] = {}
    if macro is not None:
        for d in cadence_days:
            snap = _build_macro_snapshot(macro, d)
            if snap is None:
                regime_cache[d] = "UNKNOWN"
            else:
                regime, _conf = _historical_regime(snap)
                regime_cache[d] = regime

    def _gate_unconditional(_d: date) -> bool:
        return True

    def _gate_regime(d: date) -> bool:
        return regime_cache.get(d, "UNKNOWN") == "SELL PREMIUM"

    max_concurrent = max(1, share_count // SHARES_PER_CONTRACT)

    # Run two parallel managed-chain simulations
    uncond_trades: List[Dict[str, Any]] = []
    regime_trades: List[Dict[str, Any]] = []
    if cadence in ("unconditional", "both"):
        uncond_trades = _simulate_managed_chain(
            ticker, strategy, quote_dates, cadence_days, _gate_unconditional,
            max_concurrent=max_concurrent,
        )
    if cadence in ("regime_gated", "both"):
        regime_trades = _simulate_managed_chain(
            ticker, strategy, quote_dates, cadence_days, _gate_regime,
            max_concurrent=max_concurrent,
        )

    # Tag with regime label at entry (using regime_cache for cadence days)
    def _tag(trades_list: List[Dict[str, Any]], cad_label: str) -> List[Dict[str, Any]]:
        out = []
        for t in trades_list:
            regime_label = regime_cache.get(t["entry_date"], "UNKNOWN")
            out.append({**t, "cadence": cad_label, "regime_at_entry": regime_label})
        return out

    all_persist_rows: List[Dict[str, Any]] = (
        _tag(uncond_trades, "unconditional") + _tag(regime_trades, "regime_gated")
    )

    completed_at = datetime.utcnow()
    run_id = (f"{ticker}:{strategy_id}:{lookback_days}:{cadence}:s{share_count}:"
              f"{started_at.strftime('%Y%m%dT%H%M%S')}:{uuid.uuid4().hex[:6]}")

    summary: Dict[str, Any] = {
        "ticker": ticker,
        "strategy_id": strategy_id,
        "lookback_days": lookback_days,
        "data_window": {"start": str(start), "end": str(end)},
        "fill_model": "mid",
        "data_source": "duckdb",
        "cadence_requested": cadence,
        "trading_days_in_window": len(quote_dates),
        "entry_dates_evaluated": len(cadence_days),
        "rolls_modeled": True,  # PIPE-REC-12 v1
        "share_count": share_count,
        "max_concurrent_positions": max_concurrent,
    }
    if cadence in ("unconditional", "both"):
        summary["unconditional"] = _aggregate(uncond_trades, ticker, start, end, share_count=share_count)
    if cadence in ("regime_gated", "both"):
        summary["regime_gated"] = _aggregate(regime_trades, ticker, start, end, share_count=share_count)
    if cadence == "both" and uncond_trades and regime_trades:
        u, r = summary["unconditional"], summary["regime_gated"]
        def _delta(field, ndp=4):
            if u.get(field) is None or r.get(field) is None:
                return None
            return round(r[field] - u[field], ndp)
        # engine_edge is the cadence-vs-cadence delta. NEVER labeled as alpha.
        # Alpha (per locked definition) is always strategy P&L vs buy-and-hold.
        summary["engine_edge"] = {
            "max_profit_rate_delta": round((r["max_profit_rate"] or 0) - (u["max_profit_rate"] or 0), 3),
            "ann_yield_delta": round((r["avg_ann_yield"] or 0) - (u["avg_ann_yield"] or 0), 2),
            "alpha_lift_dollar": _delta("alpha_dollar", 2),
            "alpha_lift_pct": _delta("alpha_pct"),
            "sharpe_delta": _delta("sharpe_ratio", 2),
            "total_profit_delta": _delta("total_profit_100sh", 2),
            "trade_count_unconditional": u["trades_simulated"],
            "trade_count_regime_gated": r["trades_simulated"],
        }

    summary_json = json.dumps(summary, default=str)

    # Persist
    trades_df = pd.DataFrame(all_persist_rows) if all_persist_rows else pd.DataFrame(
        columns=["entry_date", "expiry_date", "strike", "spot_at_entry", "mid",
                 "iv_at_entry", "delta_at_entry", "ann_yield", "expiry_close",
                 "outcome", "pnl", "cadence", "regime_at_entry",
                 "close_date", "buyback_mid", "chain_id", "chain_position"])
    try:
        data_store.insert_backtest_run(
            run_id=run_id, ticker=ticker, strategy_id=strategy_id,
            lookback_days=lookback_days, cadence=cadence,
            started_at=started_at, completed_at=completed_at,
            n_trades_uncond=len(uncond_trades), n_trades_regime=len(regime_trades),
            summary_json=summary_json, trades_df=trades_df,
        )
    except Exception:
        # Persistence failure is non-fatal — return the result, next call re-runs.
        pass

    summary["run_id"] = run_id
    summary["cache_age_seconds"] = 0
    return summary


def get_or_run(
    ticker: str, strategy_id: str, lookback_days: int,
    cadence: str = "both", max_age_seconds: int = 86400,
    share_count: int = 100,
) -> Dict[str, Any]:
    """Return cached run if fresh, else simulate and cache."""
    # Cache key needs to include share_count to avoid serving 100-share results
    # to a user who passed 1000. We do this by constructing a cadence_key that
    # encodes share_count when it's not the default.
    cache_cadence = f"{cadence}:s{share_count}" if share_count != 100 else cadence
    cached = data_store.get_cached_run(ticker, strategy_id, lookback_days, cache_cadence, max_age_seconds)
    if cached and cached.get("summary_json"):
        out = json.loads(cached["summary_json"])
        out["run_id"] = cached["run_id"]
        out["cache_age_seconds"] = cached["age_seconds"]
        return out
    return run_backtest(
        ticker=ticker, strategy_id=strategy_id,
        lookback_days=lookback_days, cadence=cadence,
        share_count=share_count,
    )
