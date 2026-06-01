"""
Diagnostic — opportunities vs actual entries in a backtest window.

For each strategy and cadence:
  Eligible cadence days  : cadence days (every 5th trading day) where strike
                           selection would have succeeded (filters all pass)
  SELL PREMIUM cadence days : subset where the regime engine was bullish on
                              premium-selling
  Actual initial entries  : count of chain_position=0 rows in the persisted
                            backtest_trades table (the live simulator only
                            opens when no position is active, so this can be
                            < eligible)
  Missed opportunities    : eligible − entered, the count of cadence days
                            we skipped because a position was already active

Run from backend/:
    python -m scripts.opportunity_audit
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store
import backtest


TICKER = "SPY"
START = date(2023, 1, 2)
END   = date(2025, 12, 12)
LOOKBACK = (END - START).days
ENTRY_STEP = 5
STRATEGIES = ["wheel", "income", "safe", "watch", "conservative"]


def _trading_days(ticker: str, start: date, end: date) -> list[date]:
    with data_store.get_connection(read_only=True) as conn:
        rows = conn.execute("""
            SELECT DISTINCT quote_date FROM options_chains
            WHERE symbol=? AND quote_date BETWEEN ? AND ?
            ORDER BY quote_date
        """, [ticker, start, end]).fetchall()
    return [r[0] for r in rows]


def _eligible_count(strategy_id: str, cadence_days: list[date]) -> int:
    """Count cadence days where the strategy could have opened a position."""
    strategy = backtest._get_strategy(strategy_id)
    n_eligible = 0
    for d in cadence_days:
        pos = backtest._open_position(TICKER, d, strategy)
        if pos is not None:
            n_eligible += 1
    return n_eligible


def _regime_eligible_count(strategy_id: str, cadence_days: list[date],
                           macro: dict) -> int:
    """Count cadence days where strike selection succeeds AND regime is SELL PREMIUM."""
    strategy = backtest._get_strategy(strategy_id)
    n = 0
    for d in cadence_days:
        snap = backtest._build_macro_snapshot(macro, d)
        if snap is None:
            continue
        regime, _ = backtest._historical_regime(snap)
        if regime != "SELL PREMIUM":
            continue
        if backtest._open_position(TICKER, d, strategy) is not None:
            n += 1
    return n


def _actual_entries(strategy_id: str, cadence: str) -> int:
    """Count actual initial entries (chain_position=0) from the latest persisted run."""
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT run_id FROM backtest_runs
            WHERE ticker=? AND strategy_id=? AND lookback_days=? AND cadence='both'
              AND completed_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1
        """, [TICKER, strategy_id, LOOKBACK]).fetchone()
        if not row:
            return 0
        run_id = row[0]
        n = conn.execute("""
            SELECT COUNT(*) FROM backtest_trades
            WHERE run_id=? AND cadence=? AND chain_position=0
        """, [run_id, cadence]).fetchone()[0]
    return int(n)


def _total_legs(strategy_id: str, cadence: str) -> int:
    """Total trade legs (entries + rolls) for context."""
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT run_id FROM backtest_runs
            WHERE ticker=? AND strategy_id=? AND lookback_days=? AND cadence='both'
              AND completed_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1
        """, [TICKER, strategy_id, LOOKBACK]).fetchone()
        if not row:
            return 0
        n = conn.execute("""
            SELECT COUNT(*) FROM backtest_trades
            WHERE run_id=? AND cadence=?
        """, [row[0], cadence]).fetchone()[0]
    return int(n)


def main() -> int:
    print(f"=== Opportunity vs Entry Audit — SPY {START}..{END} ===")
    print(f"Cadence: every {ENTRY_STEP} trading days")
    print()

    quote_dates = _trading_days(TICKER, START, END)
    cadence_days = quote_dates[::ENTRY_STEP]
    n_cadence = len(cadence_days)
    print(f"Total trading days: {len(quote_dates)}")
    print(f"Total cadence-eligible days (every 5th): {n_cadence}")
    print()

    print("Loading macro window for regime checks...", flush=True)
    macro = backtest._load_macro_window(END, lookback_days=LOOKBACK + 60)
    print()

    rows = []
    for strat in STRATEGIES:
        print(f"Processing {strat}...", flush=True)
        eligible = _eligible_count(strat, cadence_days)
        regime_eligible = _regime_eligible_count(strat, cadence_days, macro)
        uncond_entries = _actual_entries(strat, "unconditional")
        regime_entries = _actual_entries(strat, "regime_gated")
        uncond_legs = _total_legs(strat, "unconditional")
        regime_legs = _total_legs(strat, "regime_gated")

        rows.append({
            "strategy": strat,
            "eligible_uncond": eligible,
            "entries_uncond": uncond_entries,
            "missed_uncond": eligible - uncond_entries,
            "miss_pct_uncond": (eligible - uncond_entries) / eligible * 100 if eligible else 0,
            "legs_uncond": uncond_legs,

            "eligible_regime": regime_eligible,
            "entries_regime": regime_entries,
            "missed_regime": regime_eligible - regime_entries,
            "miss_pct_regime": (regime_eligible - regime_entries) / regime_eligible * 100 if regime_eligible else 0,
            "legs_regime": regime_legs,
        })

    print()
    print("=== UNCONDITIONAL CADENCE ===")
    print(f"{'strategy':<10} {'eligible':>10} {'entered':>10} {'missed':>10} {'miss %':>10} {'all legs':>10}")
    print("-" * 70)
    for r in rows:
        print(f"{r['strategy']:<10} "
              f"{r['eligible_uncond']:>10} "
              f"{r['entries_uncond']:>10} "
              f"{r['missed_uncond']:>10} "
              f"{r['miss_pct_uncond']:>9.1f}% "
              f"{r['legs_uncond']:>10}")

    print()
    print("=== REGIME-GATED CADENCE (only when SELL PREMIUM) ===")
    print(f"{'strategy':<10} {'eligible':>10} {'entered':>10} {'missed':>10} {'miss %':>10} {'all legs':>10}")
    print("-" * 70)
    for r in rows:
        print(f"{r['strategy']:<10} "
              f"{r['eligible_regime']:>10} "
              f"{r['entries_regime']:>10} "
              f"{r['missed_regime']:>10} "
              f"{r['miss_pct_regime']:>9.1f}% "
              f"{r['legs_regime']:>10}")

    print()
    print("Reading the table:")
    print("  eligible  = cadence days where the strategy filters approve a strike")
    print("  entered   = actual initial entries (chain_position=0) — limited by")
    print("              'no double-positions' rule (can't open new while one is active)")
    print("  missed    = eligible − entered")
    print("  miss %    = missed / eligible — fraction of opportunities we skipped")
    print("  all legs  = entries + rolls (the persisted trade total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
