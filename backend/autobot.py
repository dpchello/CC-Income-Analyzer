"""
Auto-trade simulation bot.

Two responsibilities:
  open_for_user(user_id)  → for every holding with free contracts, write a
                            3-rung laddered set of short-call positions, gated
                            by the SignalEngine "SELL PREMIUM" regime.
  tick_user(user_id)      → daily monitor: 50%-profit close, ITM roll up-and-out,
                            21-DTE defensive roll, expiry handling. Mirrors the
                            CUSTOM strategy from backtest.py.

Writes simulated rows to Supabase `positions` table only. Never routes real orders.
Rows are tagged simulated=true and notes prefixed with `[autobot v1]`.

Entry uses the production "conservative" preset filter
(maxDelta=0.30, IV ≤ 15%, 28-42 DTE) — the same parameters the
backtest's CUSTOM strategy validated.

Reserve: 10% of total contracts is held back at open and only deployed on
debit rolls (when buyback cost > new sell credit).
"""

from __future__ import annotations

import math
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import db
from data_fetcher import DataFetcher
from signals import SignalEngine
import rec_logger

# ── Strategy constants (mirror backtest.py CLOSE/ROLL thresholds) ─────────────

LADDER_RUNGS = [
    {"label": "near", "dte_lo": 28, "dte_hi": 32},
    {"label": "mid",  "dte_lo": 33, "dte_hi": 37},
    {"label": "far",  "dte_lo": 38, "dte_hi": 42},
]
RESERVE_PCT     = 0.10
MAX_DELTA       = 0.30
DEPLOY_PCT      = 1.0 - RESERVE_PCT

# Per-ticker IV ceiling. Broad-market index ETFs get a looser ceiling (≤20%)
# than single names (≤30%). The backtest validated ≤15% on SPY only — these
# tiers are a defensible starting hypothesis, not backtest-validated thresholds.
BROAD_ETFS = {"SPY", "QQQ", "IWM", "VTI", "VOO", "DIA", "IVV"}
MAX_IV_PCT_ETF    = 20.0
MAX_IV_PCT_SINGLE = 30.0


def _max_iv_pct_for(ticker: str) -> float:
    return MAX_IV_PCT_ETF if ticker.upper() in BROAD_ETFS else MAX_IV_PCT_SINGLE

# Backtest CUSTOM strategy management thresholds (backtest.py:175-178)
CLOSE_EARLY_PROFIT_PCT      = 0.50
ITM_ROLL_DTE_FLOOR          = 21
ITM_ROLL_BREACH_PCT         = 1.005
DEFENSIVE_ROLL_AT_RISK_PCT  = 0.97

NOTE_PREFIX = "[autobot v1]"

# Single shared instances — cache hits across the run
fetcher = DataFetcher()
engine  = SignalEngine()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _today() -> date:
    return date.today()


def _compute_regime() -> dict:
    """Run the SignalEngine once; reused for every open call this tick."""
    spy_price_data = fetcher.get_spy_price()
    spy_price = spy_price_data.get("price", 0)
    sigt = fetcher.get_signal_tickers()
    return engine.analyze(
        spy_price     = spy_price,
        vix           = sigt.get("^VIX",  {}).get("price", 20),
        vix_iv_rank   = fetcher.get_vix_history().get("iv_rank", 50),
        vvix          = sigt.get("^VVIX", {}).get("price", 95),
        tnx           = sigt.get("^TNX",  {}).get("price", 4.3),
        fvx           = sigt.get("^FVX",  {}).get("price", 4.0),
        tlt           = sigt.get("TLT",   {}).get("price", 88),
        spy_ma_signal = fetcher.get_spy_ma_signal(),
        open_positions= [],
        tnx_history   = fetcher.get_tnx_history(10),
        tlt_history   = fetcher.get_tlt_history(10),
        available_expiries = [],
        vix_recent    = fetcher.get_vix_recent_history(10),
        spy_recent    = fetcher.get_spy_recent_history(10),
    )


def _holdings_by_ticker(holdings: list) -> Dict[str, list]:
    out: Dict[str, list] = {}
    for h in holdings:
        t = (h.get("ticker") or "").upper()
        if t:
            out.setdefault(t, []).append(h)
    return out


def _free_contracts(ticker: str, holdings: list, open_positions: list) -> Tuple[int, int]:
    """Returns (total_contracts, free_contracts) for a ticker."""
    rows = [h for h in holdings if (h.get("ticker") or "").upper() == ticker]
    total_shares    = sum(h.get("shares", 0) for h in rows)
    total_contracts = int(total_shares // 100)
    written = sum(
        int(p.get("contracts", 0))
        for p in open_positions
        if (p.get("ticker") or "").upper() == ticker
        and p.get("type") in ("short_call", "covered_call")
    )
    return total_contracts, max(0, total_contracts - written)


def _reserve_for(total_contracts: int) -> int:
    return math.ceil(total_contracts * RESERVE_PCT) if total_contracts > 0 else 0


def _portfolio_for_holding(h: dict) -> Optional[str]:
    return h.get("portfolio_id")


def _select_rung_candidate(
    ticker: str, spot: float, expiries: List[str], rung: dict, today: date,
) -> Optional[dict]:
    """Pick best (expiry, strike, mid) for one ladder rung.

    Filters: DTE in [lo, hi], strike OTM with delta ≤ MAX_DELTA (closest without
    exceeding), IV ≤ MAX_IV_PCT, mid > 0.
    """
    valid_exp = []
    for exp in expiries:
        d = (datetime.strptime(exp, "%Y-%m-%d").date() - today).days
        if rung["dte_lo"] <= d <= rung["dte_hi"]:
            valid_exp.append((d, exp))
    if not valid_exp:
        return None
    # Pick the expiry closest to bucket midpoint to maximize ladder spread
    mid_dte = (rung["dte_lo"] + rung["dte_hi"]) / 2.0
    valid_exp.sort(key=lambda v: abs(v[0] - mid_dte))

    iv_ceiling = _max_iv_pct_for(ticker)
    for dte, expiry in valid_exp:
        try:
            chain = fetcher.get_options_chain_for(ticker, expiry)
        except Exception:
            chain = []
        best = None
        best_diff = float("inf")
        for row in chain:
            d_v = row.get("delta")
            s_v = row.get("strike")
            iv  = row.get("impliedVolatility")
            if d_v is None or s_v is None:
                continue
            if float(s_v) <= spot or float(d_v) > MAX_DELTA:
                continue
            iv_pct = float(iv or 0) * 100.0
            if iv_pct > iv_ceiling:
                continue
            mid_p = round(((row.get("bid") or 0) + (row.get("ask") or 0)) / 2, 2)
            if mid_p <= 0:
                continue
            diff = abs(float(d_v) - MAX_DELTA)
            if diff < best_diff:
                best_diff = diff
                best = {
                    "expiry": expiry,
                    "dte":    dte,
                    "strike": float(s_v),
                    "delta":  float(d_v),
                    "iv_pct": round(iv_pct, 2),
                    "mid":    mid_p,
                }
        if best is not None:
            return best
    return None


def _allocate_contracts(deployable: int, valid_rung_count: int) -> List[int]:
    """Equal split with bias to near rungs (front-loaded remainder)."""
    if valid_rung_count == 0 or deployable <= 0:
        return [0] * valid_rung_count
    per = deployable // valid_rung_count
    rem = deployable - per * valid_rung_count
    out = [per] * valid_rung_count
    for i in range(rem):
        out[i] += 1
    return out


def _insert_position(
    user_id: str,
    portfolio_id: Optional[str],
    ticker: str,
    contracts: int,
    candidate: dict,
    open_signal: dict,
    rung_label: str,
    roll_of: Optional[str] = None,
    extra_note: str = "",
) -> dict:
    note_bits = [NOTE_PREFIX, f"rung={rung_label}"]
    if roll_of:
        note_bits.append(f"roll_of={roll_of}")
    if extra_note:
        note_bits.append(extra_note)
    return db.create_position(user_id, {
        "portfolio_id":      portfolio_id,
        "ticker":            ticker,
        "type":              "short_call",
        "strike":            candidate["strike"],
        "expiry":            candidate["expiry"],
        "contracts":         contracts,
        "sell_price":        candidate["mid"],
        "premium_collected": round(candidate["mid"] * contracts * 100, 2),
        "open_date":         _today().isoformat(),
        "status":            "open",
        "notes":             " ".join(note_bits),
        "open_signal": {
            "regime":       open_signal.get("regime"),
            "total_score":  open_signal.get("total_score"),
            "delta":        candidate["delta"],
            "iv_pct":       candidate["iv_pct"],
            "dte":          candidate["dte"],
            "rung":         rung_label,
        },
        "simulated":           True,
        "roll_of_position_id": roll_of,
    })


# ── Open path ────────────────────────────────────────────────────────────────

def open_for_user(user_id: str) -> dict:
    """Open laddered short-call positions for every holding with free contracts."""
    holdings = db.get_holdings(user_id)
    if not holdings:
        return {"user_id": user_id, "regime": None, "opened": [], "skipped": [], "note": "no holdings"}

    open_positions = db.get_open_positions(user_id)
    signal = _compute_regime()
    regime = signal.get("regime")
    today  = _today()

    opened: List[dict] = []
    skipped: List[dict] = []

    by_ticker = _holdings_by_ticker(holdings)
    for ticker, rows in by_ticker.items():
        total_contracts, free = _free_contracts(ticker, holdings, open_positions)
        if total_contracts <= 0:
            skipped.append({"ticker": ticker, "reason": "<100 shares"})
            continue
        if free <= 0:
            skipped.append({"ticker": ticker, "reason": "all contracts already written"})
            continue

        reserve    = _reserve_for(total_contracts)
        deployable = max(0, free - reserve)
        if deployable <= 0:
            skipped.append({
                "ticker": ticker,
                "reason": f"reserve gate: free={free} reserve={reserve}",
            })
            continue

        # Regime gate: not SELL PREMIUM → log "would-have-opened" and skip.
        if regime != "SELL PREMIUM":
            try:
                spot = fetcher.get_price_for(ticker)
            except Exception:
                spot = 0.0
            rec_logger.log_recommendations(
                [{
                    "ticker": ticker,
                    "strike": None,
                    "expiry": None,
                    "composite_score": None,
                    "delta":  None,
                    "mid":    None,
                    "contracts_suggested": deployable,
                    "dte":    None,
                    "recommendation": "would_have_opened_blocked_by_regime",
                }],
                signal,
                spot,
            )
            skipped.append({
                "ticker": ticker,
                "reason": f"regime gate ({regime})",
                "deployable": deployable,
            })
            continue

        # Build per-rung candidates
        try:
            spot = fetcher.get_price_for(ticker)
        except Exception:
            spot = 0.0
        if spot <= 0:
            skipped.append({"ticker": ticker, "reason": "no spot price"})
            continue

        try:
            expiries = fetcher.get_screener_expiries_for(ticker, max_dte=60)
        except Exception:
            expiries = []
        if not expiries:
            skipped.append({"ticker": ticker, "reason": "no expiries"})
            continue

        rung_candidates: List[Tuple[dict, Optional[dict]]] = []
        for rung in LADDER_RUNGS:
            cand = _select_rung_candidate(ticker, spot, expiries, rung, today)
            rung_candidates.append((rung, cand))

        valid = [(r, c) for r, c in rung_candidates if c is not None]
        if not valid:
            skipped.append({"ticker": ticker, "reason": "no candidate met filters in any rung"})
            continue

        alloc = _allocate_contracts(deployable, len(valid))

        # Pick the holding's portfolio for placement (use first matching row).
        portfolio_id = _portfolio_for_holding(rows[0])

        for (rung, cand), n in zip(valid, alloc):
            if n <= 0:
                continue
            pos = _insert_position(
                user_id      = user_id,
                portfolio_id = portfolio_id,
                ticker       = ticker,
                contracts    = n,
                candidate    = cand,
                open_signal  = signal,
                rung_label   = rung["label"],
            )
            opened.append({
                "ticker":   ticker,
                "rung":     rung["label"],
                "expiry":   cand["expiry"],
                "strike":   cand["strike"],
                "contracts": n,
                "mid":      cand["mid"],
                "delta":    cand["delta"],
                "iv_pct":   cand["iv_pct"],
                "id":       pos.get("id"),
            })

    return {
        "user_id": user_id,
        "regime":  regime,
        "opened":  opened,
        "skipped": skipped,
    }


# ── Manage path ──────────────────────────────────────────────────────────────

def _option_mid_now(ticker: str, expiry: str, strike: float) -> Optional[float]:
    try:
        chain = fetcher.get_options_chain_for(ticker, expiry)
    except Exception:
        return None
    for row in chain:
        if abs(float(row.get("strike") or 0) - strike) < 1e-6:
            mid = round(((row.get("bid") or 0) + (row.get("ask") or 0)) / 2, 2)
            return mid if mid > 0 else None
    return None


def _close_position(
    pos: dict, close_price: float, outcome: str, signal: Optional[dict] = None,
    extra_note: str = "",
) -> dict:
    contracts = int(pos.get("contracts", 0))
    sell_price = float(pos.get("sell_price") or 0)
    final_pnl = round((sell_price - close_price) * contracts * 100, 2)
    note_bits = [pos.get("notes") or "", outcome]
    if extra_note:
        note_bits.append(extra_note)
    return db.update_position(pos["user_id"], pos["id"], {
        "status":       "closed",
        "close_date":   _today().isoformat(),
        "close_price":  round(close_price, 4),
        "final_pnl":    final_pnl,
        "close_signal": {"outcome": outcome, **(signal or {})},
        "notes":        " | ".join(b for b in note_bits if b).strip(),
    })


def _decrement_holding_for_assignment(user_id: str, ticker: str, contracts: int) -> None:
    """On assignment: reduce holding shares by contracts*100. Removes holdings
    that drop to ≤ 0."""
    qty = contracts * 100
    holdings = [h for h in db.get_holdings(user_id) if (h.get("ticker") or "").upper() == ticker.upper()]
    holdings.sort(key=lambda h: h.get("shares", 0), reverse=True)
    for h in holdings:
        if qty <= 0:
            break
        cur = h.get("shares", 0)
        take = min(cur, qty)
        new_shares = cur - take
        if new_shares <= 0:
            db.delete_holding(user_id, h["id"])
        else:
            db.update_holding(user_id, h["id"], {"shares": new_shares})
        qty -= take


def _open_roll_replacement(
    user_id: str,
    closed_pos: dict,
    rung_label: str,
    today: date,
    signal: dict,
    extra_contracts_from_reserve: int = 0,
) -> Optional[dict]:
    ticker = closed_pos["ticker"]
    try:
        spot = fetcher.get_price_for(ticker)
    except Exception:
        spot = 0.0
    if spot <= 0:
        return None
    try:
        expiries = fetcher.get_screener_expiries_for(ticker, max_dte=60)
    except Exception:
        expiries = []
    rung = next((r for r in LADDER_RUNGS if r["label"] == rung_label), LADDER_RUNGS[1])
    cand = _select_rung_candidate(ticker, spot, expiries, rung, today)
    if cand is None:
        # Fall back: try any rung with a candidate
        for r in LADDER_RUNGS:
            cand = _select_rung_candidate(ticker, spot, expiries, r, today)
            if cand is not None:
                rung_label = r["label"]
                break
        if cand is None:
            return None
    contracts = int(closed_pos.get("contracts", 0)) + max(0, extra_contracts_from_reserve)
    if contracts <= 0:
        return None
    return _insert_position(
        user_id      = user_id,
        portfolio_id = closed_pos.get("portfolio_id"),
        ticker       = ticker,
        contracts    = contracts,
        candidate    = cand,
        open_signal  = signal,
        rung_label   = rung_label,
        roll_of      = closed_pos["id"],
        extra_note   = f"reserve_used={extra_contracts_from_reserve}" if extra_contracts_from_reserve > 0 else "",
    )


def _reserve_available(user_id: str, ticker: str) -> int:
    """How many reserve contracts can still be deployed for this ticker.

    Reserve capacity = ceil(total_contracts × 10%). Reserve used = open contracts
    beyond total_contracts × 90%. Available = capacity − used (clamped ≥ 0).
    """
    holdings = db.get_holdings(user_id)
    total_contracts, _ = _free_contracts(ticker, holdings, db.get_open_positions(user_id))
    capacity = _reserve_for(total_contracts)
    open_calls = [
        p for p in db.get_open_positions(user_id)
        if (p.get("ticker") or "").upper() == ticker
        and p.get("type") in ("short_call", "covered_call")
    ]
    written = sum(int(p.get("contracts", 0)) for p in open_calls)
    deployed_cap = math.floor(total_contracts * DEPLOY_PCT)
    used_reserve = max(0, written - deployed_cap)
    return max(0, capacity - used_reserve)


def tick_user(user_id: str) -> dict:
    """Daily monitor — close/roll/expire each open simulated position per the
    CUSTOM strategy."""
    today  = _today()
    signal = _compute_regime()  # used to stamp close_signal context
    open_positions = [
        p for p in db.get_open_positions(user_id)
        if p.get("simulated")
        and p.get("type") in ("short_call", "covered_call")
    ]

    closed: List[dict] = []
    rolled: List[dict] = []
    expired_max: List[dict] = []
    assigned: List[dict] = []
    kept: List[dict] = []

    for pos in open_positions:
        ticker     = pos["ticker"]
        expiry_str = pos["expiry"]
        try:
            expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()
        except Exception:
            kept.append({"id": pos["id"], "reason": "bad expiry"})
            continue
        days_remaining = (expiry - today).days
        rung_label = "mid"
        notes = pos.get("notes") or ""
        for r in LADDER_RUNGS:
            if f"rung={r['label']}" in notes:
                rung_label = r["label"]
                break

        # Expiry handling
        if days_remaining <= 0:
            try:
                underlying = fetcher.get_price_for(ticker)
            except Exception:
                underlying = 0.0
            if underlying <= 0:
                kept.append({"id": pos["id"], "reason": "expiry: no spot"})
                continue
            strike = float(pos["strike"])
            contracts = int(pos.get("contracts", 0))
            if underlying <= strike:
                _close_position(
                    pos, close_price=0.0, outcome="expired_max_profit", signal=signal,
                )
                expired_max.append({"id": pos["id"], "ticker": ticker, "underlying": underlying})
            else:
                # Assignment: pay (underlying - strike) intrinsic out of the credit
                _close_position(
                    pos,
                    close_price = underlying - strike,
                    outcome     = "assigned",
                    signal      = signal,
                    extra_note  = f"assigned_at={underlying:.2f}",
                )
                _decrement_holding_for_assignment(user_id, ticker, contracts)
                assigned.append({"id": pos["id"], "ticker": ticker, "underlying": underlying, "shares_called": contracts * 100})
            continue

        current_mid = _option_mid_now(ticker, expiry_str, float(pos["strike"]))
        try:
            underlying = fetcher.get_price_for(ticker)
        except Exception:
            underlying = 0.0

        if current_mid is None:
            kept.append({"id": pos["id"], "reason": "no current mid"})
            continue

        sell_price = float(pos.get("sell_price") or 0)
        strike     = float(pos["strike"])

        # Trigger 1: 50%-profit close
        if sell_price > 0 and current_mid <= sell_price * CLOSE_EARLY_PROFIT_PCT:
            _close_position(pos, close_price=current_mid, outcome="closed_early_50pct", signal=signal)
            closed.append({"id": pos["id"], "ticker": ticker, "buyback": current_mid})
            continue

        if underlying <= 0:
            kept.append({"id": pos["id"], "reason": "no underlying"})
            continue

        # Trigger 2: ITM roll up-and-out (DTE > 21 and underlying > strike × 1.005)
        if (underlying > strike * ITM_ROLL_BREACH_PCT
                and days_remaining > ITM_ROLL_DTE_FLOOR):
            _do_roll(pos, current_mid, signal, rung_label, today, ticker, rolled,
                     reason="itm_roll_up_and_out")
            continue

        # Trigger 3: 21-DTE defensive roll (DTE ≤ 21 and underlying ≥ strike × 0.97)
        if (days_remaining <= ITM_ROLL_DTE_FLOOR
                and underlying >= strike * DEFENSIVE_ROLL_AT_RISK_PCT):
            _do_roll(pos, current_mid, signal, rung_label, today, ticker, rolled,
                     reason="defensive_roll_21dte")
            continue

        kept.append({"id": pos["id"], "ticker": ticker, "dte": days_remaining})

    return {
        "user_id":   user_id,
        "closed":    closed,
        "rolled":    rolled,
        "expired_max": expired_max,
        "assigned":  assigned,
        "kept":      kept,
    }


def _do_roll(
    pos: dict, current_mid: float, signal: dict, rung_label: str,
    today: date, ticker: str, rolled_log: list, reason: str,
) -> None:
    """Close current → open replacement. Deploy reserve if the roll is a debit."""
    user_id   = pos["user_id"]
    contracts = int(pos.get("contracts", 0))

    # Probe a candidate first to compute roll credit
    try:
        spot = fetcher.get_price_for(ticker)
    except Exception:
        spot = 0.0
    expiries = fetcher.get_screener_expiries_for(ticker, max_dte=60)
    rung = next((r for r in LADDER_RUNGS if r["label"] == rung_label), LADDER_RUNGS[1])
    cand = _select_rung_candidate(ticker, spot, expiries, rung, today)
    if cand is None:
        for r in LADDER_RUNGS:
            cand = _select_rung_candidate(ticker, spot, expiries, r, today)
            if cand is not None:
                rung_label = r["label"]
                break
    if cand is None:
        # No replacement available — just close
        _close_position(pos, close_price=current_mid, outcome=f"{reason}_close_only", signal=signal)
        rolled_log.append({"id": pos["id"], "ticker": ticker, "reason": reason, "replacement": None})
        return

    new_mid = cand["mid"]
    base_credit = round((new_mid - current_mid) * contracts * 100, 2)

    # Reserve top-up if debit
    extra = 0
    if base_credit < 0:
        avail = _reserve_available(user_id, ticker)
        if avail > 0 and new_mid > 0:
            need = math.ceil(abs(base_credit) / (new_mid * 100))
            extra = min(avail, need)

    _close_position(pos, close_price=current_mid, outcome=reason, signal=signal)
    new_pos = _open_roll_replacement(
        user_id, pos, rung_label, today, signal,
        extra_contracts_from_reserve=extra,
    )
    rolled_log.append({
        "id": pos["id"],
        "ticker": ticker,
        "reason": reason,
        "buyback": current_mid,
        "new_id": (new_pos or {}).get("id"),
        "new_strike": cand["strike"],
        "new_expiry": cand["expiry"],
        "reserve_used": extra,
    })
