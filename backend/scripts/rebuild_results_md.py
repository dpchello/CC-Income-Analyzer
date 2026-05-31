"""
Rebuild BACKTEST_RESULTS_SPY.md from the latest persisted run summaries in
DuckDB. Doesn't re-simulate — just re-renders. Useful when you've changed
the report template but the run data is already there.

Run from backend/:
    python -m scripts.rebuild_results_md
"""

from __future__ import annotations

import json
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store
from scripts.smoke_backtest import (
    STRATEGIES, TICKER, BLOCKS, section_for_track,
    fmt_dollar, fmt_dec_pct, fmt_pct, fmt_yield, fmt_ratio,
)


def _latest_run(ticker: str, strategy: str, lookback: int, cadence: str = "both") -> dict | None:
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT summary_json FROM backtest_runs
            WHERE ticker = ? AND strategy_id = ? AND lookback_days = ?
              AND cadence = ? AND completed_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1
        """, [ticker, strategy, lookback, cadence]).fetchone()
    if not row or not row[0]:
        return None
    return json.loads(row[0])


def main() -> int:
    summary_path = Path(__file__).resolve().parent.parent.parent / "BACKTEST_RESULTS_SPY.md"
    lines: list[str] = []
    lines.append(f"# SPY backtest results — all 5 strategies, multiple lookbacks")
    lines.append("")
    lines.append(f"_Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())} (rebuilt from persisted runs)_")
    lines.append("")
    lines.append("**Source:** real DuckDB chains (backend/data/options.duckdb), mid-fill model.")
    lines.append("**Cadence:** entry every 5 trading days.")
    lines.append("**Active management:** 50%-profit close + ITM roll up-and-out + 21-DTE defensive roll.")
    lines.append("**Coverage:** SPY 2008-01-02 → 2025-12-12.")
    lines.append("")
    lines.append("**Alpha definition:** strategy total P&L − buy-and-hold total P&L. Reported in dollars and as % of starting capital (100 × initial spot).")
    lines.append("")
    lines.append("---")
    lines.append("")

    for start, end, label in BLOCKS:
        lookback = (end - start).days
        years = lookback / 365.0
        lines.append(f"# {label}")
        lines.append(f"**Window:** {start} → {end} ({years:.1f}y)")
        lines.append("")

        for strat in STRATEGIES:
            result = _latest_run(TICKER, strat, lookback)
            if not result:
                lines.append(f"## {strat.upper()} — no run found\n")
                continue

            u = result.get("unconditional", {})
            r = result.get("regime_gated", {})
            edge = result.get("engine_edge", {})

            lines.append(f"## {strat.upper()}")
            lines.append("")
            section_for_track("Unconditional cadence", u, lines)
            section_for_track("Regime-gated cadence", r, lines)
            if edge:
                lines.append("**Engine edge — regime-gated minus unconditional**")
                lines.append("_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_")
                lines.append("")
                lines.append(f"- Max profit rate delta: {edge.get('max_profit_rate_delta', 0):+.3f}")
                lines.append(f"- Avg ann yield delta:   {edge.get('ann_yield_delta', 0):+.2f} pts")
                if edge.get("alpha_lift_dollar") is not None:
                    lines.append(f"- Alpha lift ($):        {fmt_dollar(edge['alpha_lift_dollar'])}")
                if edge.get("alpha_lift_pct") is not None:
                    lines.append(f"- Alpha lift (%):        {fmt_dec_pct(edge['alpha_lift_pct'])}")
                if edge.get("sharpe_delta") is not None:
                    lines.append(f"- Sharpe lift:           {edge['sharpe_delta']:+.2f}")
                if edge.get("total_profit_delta") is not None:
                    lines.append(f"- Strategy P&L delta:    {fmt_dollar(edge['total_profit_delta'])}")
                lines.append("")
            lines.append("---")
            lines.append("")

    summary_path.write_text("\n".join(lines))
    print(f"Rebuilt {summary_path} ({len(lines)} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
