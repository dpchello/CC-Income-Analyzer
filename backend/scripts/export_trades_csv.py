"""
Export every backtest trade leg from the latest persisted runs into a flat CSV.

Pulls from `backtest_runs` (metadata) joined with `backtest_trades` (per-leg
detail) and writes one row per trade leg with both entry-side and exit-side
fields denormalized so the file is pivot-table friendly.

For each (ticker, strategy_id, lookback_days, cadence, share_count) tuple,
only the most-recent completed run is exported.

Run from backend/:
    python -m scripts.export_trades_csv

Output: BACKTEST_TRADES.csv at the repo root.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store


OUTPUT_PATH = Path(__file__).resolve().parent.parent.parent / "BACKTEST_TRADES.csv"


def _block_label(lookback_days: int) -> str:
    """Best-effort label per the smoke-test block boundaries."""
    return {
        1094: "2008-2010 GFC acute",
        2554: "2011-2017 recovery + low-vol bull",
        1824: "2018-2022 vol regime",
        1075: "2023-2025 partial AI bull",
    }.get(lookback_days, f"{lookback_days}d lookback")


def _safe_date(v):
    """DuckDB returns dates as datetime.date or pd.Timestamp depending on path."""
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v)


def _safe_float(v, ndp=4):
    if v is None:
        return ""
    try:
        return f"{float(v):.{ndp}f}"
    except (TypeError, ValueError):
        return ""


def _safe_int(v):
    if v is None:
        return ""
    try:
        return str(int(v))
    except (TypeError, ValueError):
        return ""


def main() -> int:
    with data_store.get_connection(read_only=True) as conn:
        # Find latest run per (ticker, strategy_id, lookback_days, cadence)
        latest_runs = conn.execute("""
            WITH latest AS (
                SELECT ticker, strategy_id, lookback_days, cadence,
                       MAX(started_at) AS ts
                FROM backtest_runs
                WHERE completed_at IS NOT NULL
                GROUP BY ticker, strategy_id, lookback_days, cadence
            )
            SELECT r.run_id, r.ticker, r.strategy_id, r.lookback_days, r.cadence,
                   r.started_at, r.completed_at, r.summary_json
            FROM backtest_runs r JOIN latest l
              ON r.ticker = l.ticker
             AND r.strategy_id = l.strategy_id
             AND r.lookback_days = l.lookback_days
             AND r.cadence = l.cadence
             AND r.started_at = l.ts
            ORDER BY r.ticker, r.strategy_id, r.lookback_days, r.cadence
        """).fetchall()

        # Pull share_count out of summary_json (encoded there since 2026-04-25)
        run_meta = {}
        for row in latest_runs:
            run_id = row[0]
            try:
                summary = json.loads(row[7]) if row[7] else {}
            except Exception:
                summary = {}
            run_meta[run_id] = {
                "ticker": row[1],
                "strategy_id": row[2],
                "lookback_days": row[3],
                "cadence_run": row[4],
                "started_at": row[5],
                "completed_at": row[6],
                "share_count": summary.get("share_count", 100),
                "max_concurrent": summary.get("max_concurrent_positions", 1),
                "data_source": summary.get("data_source", "duckdb"),
                "fill_model": summary.get("fill_model", "mid"),
                "data_window_start": (summary.get("data_window") or {}).get("start", ""),
                "data_window_end": (summary.get("data_window") or {}).get("end", ""),
            }

        # Pull all trades from those runs
        run_ids = list(run_meta.keys())
        if not run_ids:
            print("No completed runs found.")
            return 1

        # DuckDB: build a parameterized IN clause
        placeholders = ",".join(["?"] * len(run_ids))
        trades = conn.execute(f"""
            SELECT run_id, cadence, entry_date, expiry_date, strike,
                   spot_at_entry, mid, iv_at_entry, delta_at_entry, ann_yield,
                   expiry_close, outcome, pnl, regime_at_entry,
                   close_date, buyback_mid, chain_id, chain_position
            FROM backtest_trades
            WHERE run_id IN ({placeholders})
            ORDER BY run_id, entry_date, chain_position
        """, run_ids).fetchall()

    # Write CSV
    columns = [
        # Run metadata
        "run_id", "ticker", "strategy_id", "block_label",
        "lookback_days", "cadence_run", "share_count", "max_concurrent",
        "data_source", "fill_model",
        "data_window_start", "data_window_end",
        # Trade-leg cadence (unconditional vs regime_gated within a 'both' run)
        "cadence_leg",
        # Chain
        "chain_id", "chain_position", "is_initial_entry", "leg_index_in_chain",
        # Entry
        "entry_date", "spot_at_entry", "strike", "expiry_date",
        "dte_at_entry", "distance_pct_otm",
        "mid_entry", "premium_collected_per_contract",
        "iv_at_entry", "delta_at_entry", "ann_yield_pct",
        "regime_at_entry",
        # Exit
        "close_date", "buyback_mid", "expiry_close", "outcome",
        "exit_type", "days_held",
        # P&L
        "pnl_dollar", "pnl_per_share", "is_winning",
        # Useful for risk pivots
        "capped_upside_dollar", "is_assignment_severe",
    ]

    rows_written = 0
    with open(OUTPUT_PATH, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(columns)
        for tr in trades:
            (run_id, cadence_leg, entry_date, expiry_date, strike,
             spot, mid, iv, delta, ann_yield,
             expiry_close, outcome, pnl, regime,
             close_date, buyback_mid, chain_id, chain_pos) = tr
            meta = run_meta.get(run_id, {})

            # Derived fields
            spot_f = float(spot) if spot is not None else None
            strike_f = float(strike) if strike is not None else None
            distance_pct = ((strike_f / spot_f - 1) * 100) if (spot_f and strike_f and spot_f > 0) else None
            dte_entry = (expiry_date - entry_date).days if entry_date and expiry_date else None
            premium_per_contract = (float(mid) * 100) if mid is not None else None

            exit_date = close_date or expiry_date
            days_held = (exit_date - entry_date).days if exit_date and entry_date else None
            exit_type = "early" if close_date else "expiry"

            pnl_f = float(pnl) if pnl is not None else None
            is_win = (pnl_f is not None and pnl_f > 0)
            pnl_per_share = (pnl_f / 100) if pnl_f is not None else None

            # Capped upside on assignments (positive = strike was breached)
            capped_upside = 0.0
            severe = False
            if outcome == "assignment" and expiry_close is not None and strike_f is not None:
                breach = float(expiry_close) - strike_f
                if breach > 0:
                    capped_upside = breach * 100
                    # Severe = breach > 5% of spot
                    if spot_f and breach / spot_f > 0.05:
                        severe = True

            writer.writerow([
                run_id,
                meta.get("ticker", ""),
                meta.get("strategy_id", ""),
                _block_label(meta.get("lookback_days", 0)),
                meta.get("lookback_days", ""),
                meta.get("cadence_run", ""),
                meta.get("share_count", ""),
                meta.get("max_concurrent", ""),
                meta.get("data_source", ""),
                meta.get("fill_model", ""),
                meta.get("data_window_start", ""),
                meta.get("data_window_end", ""),
                cadence_leg,
                chain_id or "",
                _safe_int(chain_pos),
                "TRUE" if (chain_pos == 0) else "FALSE",
                _safe_int(chain_pos),
                _safe_date(entry_date),
                _safe_float(spot, 2),
                _safe_float(strike, 2),
                _safe_date(expiry_date),
                _safe_int(dte_entry),
                _safe_float(distance_pct, 3),
                _safe_float(mid, 4),
                _safe_float(premium_per_contract, 2),
                _safe_float(iv, 2),
                _safe_float(delta, 4),
                _safe_float(ann_yield, 2),
                regime or "",
                _safe_date(close_date),
                _safe_float(buyback_mid, 4),
                _safe_float(expiry_close, 2),
                outcome or "",
                exit_type,
                _safe_int(days_held),
                _safe_float(pnl, 2),
                _safe_float(pnl_per_share, 4),
                "TRUE" if is_win else "FALSE",
                _safe_float(capped_upside, 2),
                "TRUE" if severe else "FALSE",
            ])
            rows_written += 1

    print(f"Exported {rows_written} trade legs to {OUTPUT_PATH}")
    print(f"Source: {len(run_meta)} latest persisted runs")
    print()
    print("Suggested pivots:")
    print("  • Strategy P&L by block × strategy_id × cadence_run")
    print("  • Win rate by IV bucket × strategy_id (filter on entry_date)")
    print("  • Roll behavior: chain_id × chain_position (count of legs per chain)")
    print("  • Assignment severity: outcome=assignment, sort by capped_upside_dollar")
    print("  • Days-held distribution by outcome (early-close vs expiry)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
