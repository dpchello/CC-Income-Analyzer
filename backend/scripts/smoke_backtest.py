"""
PIPE-REC-09 smoke test — runs the full SPY backtest history in 5-year blocks
across all five strategies and dumps a markdown summary for manual review.

Run from backend/:
    python -m scripts.smoke_backtest

Output: BACKTEST_RESULTS_SPY.md at the repo root.
"""

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import backtest
import data_store


STRATEGIES = ["wheel", "income", "safe", "watch", "conservative"]
TICKER = "SPY"

# Regime-aligned blocks per user feedback (2026-04-25 manual review). The
# original [2008-2012] window blended the GFC bottom with the recovery, which
# masks two very different vol regimes. Splitting at 2010 isolates the GFC
# acute period from the long recovery+bull. SPY chain coverage in DuckDB:
# 2008-01-02 → 2025-12-12.
BLOCKS = [
    (date(2008, 1, 2),  date(2010, 12, 31), "2008-2010 (GFC acute)"),
    (date(2011, 1, 3),  date(2017, 12, 31), "2011-2017 (recovery + low-vol bull)"),
    (date(2018, 1, 2),  date(2022, 12, 31), "2018-2022 (Volmageddon, COVID, Ukraine)"),
    (date(2023, 1, 2),  date(2025, 12, 12), "2023-2025 partial (AI bull tape)"),
]


def fmt_pct(x):
    return f"{x*100:.1f}%" if x is not None else "—"


def fmt_dec_pct(x):
    """Decimal already (CAGR returned as decimal). Pretty-print as percent."""
    return f"{x*100:.2f}%" if x is not None else "—"


def fmt_yield(x):
    return f"{x:.1f}%" if x is not None else "—"


def fmt_dollar(x):
    if x is None:
        return "—"
    sign = "-" if x < 0 else ""
    return f"{sign}${abs(x):,.0f}"


def fmt_ratio(x):
    return f"{x:.2f}" if x is not None else "—"


def section_for_track(track_label: str, m: dict, lines: list) -> None:
    """Render one cadence's metric table into the markdown."""
    if not m or m.get("trades_simulated", 0) == 0:
        lines.append(f"**{track_label}** — 0 qualifying trades (filters excluded all entries).")
        lines.append("")
        return

    lines.append(f"**{track_label}**")
    lines.append("")
    lines.append("| | |")
    lines.append("|---|---|")
    lines.append(f"| Trades simulated | {m['trades_simulated']} |")
    lines.append(f"| Starting capital (100 sh) | {fmt_dollar(m.get('starting_equity_100sh'))} |")
    lines.append(f"| **Trades expiring worthless** | **{m['max_profit_count']}** ({fmt_pct(m['max_profit_rate'])}) |")
    lines.append(f"| Closed early at 50% profit | {m.get('closed_early_count', 0)} ({fmt_pct(m.get('closed_early_rate'))}) |")
    lines.append(f"| Rolled up-and-out | {m.get('rolled_up_count', 0)} ({fmt_pct(m.get('rolled_up_rate'))}) |")
    lines.append(f"| Rolled at 21 DTE | {m.get('rolled_21dte_count', 0)} ({fmt_pct(m.get('rolled_21dte_rate'))}) |")
    lines.append(f"| Assigned | {m['assignment_count']} ({fmt_pct(m['assignment_rate'])}) |")
    lines.append(f"| Avg premium per trade | {fmt_dollar(m.get('avg_premium_per_trade_dollar'))} ({fmt_yield(m.get('avg_premium_per_trade_pct'))} of cost basis) |")
    lines.append(f"| Avg annualized yield | {fmt_yield(m.get('avg_ann_yield'))} |")
    lines.append(f"| Worst single trade P&L | {fmt_dollar(m.get('worst_single_trade_pnl'))} |")
    lines.append(f"| **Strategy total P&L** | **{fmt_dollar(m.get('total_profit_100sh'))}** ({fmt_dec_pct(m.get('strategy_total_return'))} of starting capital) |")
    lines.append(f"| Buy-and-hold total P&L | {fmt_dollar(m.get('buy_and_hold_total_profit'))} ({fmt_dec_pct(m.get('buy_and_hold_total_return'))} of starting capital) |")
    lines.append(f"| **Alpha vs buy-and-hold** | **{fmt_dollar(m.get('alpha_dollar'))}** ({fmt_dec_pct(m.get('alpha_pct'))} of starting capital) |")
    lines.append(f"| Final equity (100 sh) | {fmt_dollar(m.get('final_equity_100sh'))} |")
    lines.append(f"| Assignment opportunity cost | {fmt_dollar(m.get('assignment_opportunity_cost_dollar'))} |")
    lines.append(f"| CAGR (strategy) | {fmt_dec_pct(m.get('cagr'))} (vs B&H {fmt_dec_pct(m.get('bh_cagr'))}) |")
    lines.append(f"| Annualized vol (strategy) | {fmt_dec_pct(m.get('annualized_volatility'))} (vs B&H {fmt_dec_pct(m.get('bh_annualized_volatility'))}) |")
    lines.append(f"| Sharpe (rf={fmt_dec_pct(m.get('risk_free_rate_used'))}) | {fmt_ratio(m.get('sharpe_ratio'))} (vs B&H {fmt_ratio(m.get('bh_sharpe_ratio'))}) |")
    lines.append(f"| Max drawdown | {fmt_dollar(m.get('max_drawdown_dollar'))} ({fmt_dec_pct(m.get('max_drawdown_pct'))}) — vs B&H {fmt_dollar(m.get('bh_max_drawdown_dollar'))} ({fmt_dec_pct(m.get('bh_max_drawdown_pct'))}) |")
    lines.append(f"| Upside capture | {fmt_ratio(m.get('upside_capture'))} |")
    lines.append(f"| Downside capture | {fmt_ratio(m.get('downside_capture'))} |")
    if m.get("worst_3m_period"):
        w = m["worst_3m_period"]
        lines.append(f"| Worst 3-month window | {w['start']}..{w['end']} ({fmt_pct(w['max_profit_rate'])} max profit on {w['trades']} trades) |")
    lines.append("")


def run_block(start: date, end: date, label: str, lines: list) -> None:
    print(f"\n###### BLOCK: {label}  [{start}..{end}] ######\n", flush=True)
    lines.append(f"## {label}")
    lines.append(f"**Window:** {start} → {end}")
    lines.append("")

    for strat in STRATEGIES:
        print(f"\n=== {strat.upper()} {label} ===", flush=True)
        t0 = time.time()
        try:
            result = backtest.run_backtest(
                ticker=TICKER, strategy_id=strat,
                start_date=start, end_date=end, cadence="both",
            )
        except Exception as e:
            print(f"  ERROR: {e}")
            lines.append(f"### {strat.upper()} — ERROR\n\n{e}\n")
            continue
        dt = time.time() - t0
        print(f"  ran in {dt:.1f}s, run_id={result['run_id']}")

        u = result.get("unconditional", {})
        r = result.get("regime_gated", {})
        edge = result.get("engine_edge", {})

        # Brief stdout summary for live monitoring (alpha = strategy − B&H, in $)
        if u.get("trades_simulated"):
            print(f"  uncond: {u['trades_simulated']} trades, "
                  f"strat_pnl={fmt_dollar(u.get('total_profit_100sh'))}, "
                  f"bh_pnl={fmt_dollar(u.get('buy_and_hold_total_profit'))}, "
                  f"alpha={fmt_dollar(u.get('alpha_dollar'))}")
        if r.get("trades_simulated"):
            print(f"  regime: {r['trades_simulated']} trades, "
                  f"strat_pnl={fmt_dollar(r.get('total_profit_100sh'))}, "
                  f"bh_pnl={fmt_dollar(r.get('buy_and_hold_total_profit'))}, "
                  f"alpha={fmt_dollar(r.get('alpha_dollar'))}")
        if edge:
            print(f"  engine_edge (regime − uncond): "
                  f"alpha_lift={fmt_dollar(edge.get('alpha_lift_dollar'))}, "
                  f"sharpe_lift={fmt_ratio(edge.get('sharpe_delta'))}")

        lines.append(f"### {strat.upper()}")
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


def main() -> int:
    data_store.init_schema()
    summary_path = Path(__file__).resolve().parent.parent.parent / "BACKTEST_RESULTS_SPY.md"

    lines: list[str] = []
    lines.append("# SPY backtest results — full history, all 5 strategies, 5-year blocks")
    lines.append("")
    lines.append(f"_Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}_")
    lines.append("")
    lines.append("**Source:** real DuckDB option chains (backend/data/options.duckdb), mid-fill model. ")
    lines.append("**Cadence:** entry every 5 trading days. ")
    lines.append("**Coverage:** SPY 2008-01-02 → 2025-12-12 in DuckDB.")
    lines.append("")
    lines.append("**Two tracks per strategy:**")
    lines.append("")
    lines.append("- *Unconditional* — entered on every 5th trading day regardless of market regime.")
    lines.append("- *Regime-gated* — entered only when historical `signals.py` would have emitted `SELL PREMIUM`. ")
    lines.append("  Difference between the two = the engine's contribution.")
    lines.append("")
    lines.append("**Metrics included** (Whaley 2002 + BXM methodology + Israelov critique — see Felix.md):")
    lines.append("")
    lines.append("- Outcomes: trades expiring worthless (count + rate), near-miss, assignment")
    lines.append("- Income: avg premium per trade, total premiums, worst single trade")
    lines.append("- Portfolio: total profit on 100-share lot, alpha vs buy-and-hold, assignment opp cost")
    lines.append("- Risk-adjusted: CAGR, ann vol, Sharpe, max DD, upside/downside capture")
    lines.append("")
    lines.append("---")
    lines.append("")

    for start, end, label in BLOCKS:
        run_block(start, end, label, lines)

    summary_path.write_text("\n".join(lines))
    print(f"\n\nSummary written to: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
