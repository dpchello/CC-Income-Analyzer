"""
Diagnostic — alpha as a function of share count (= max concurrent positions).

Re-runs the 2023-2025 SPY backtest at multiple share-count levels for WATCH
and CUSTOM (the strategies most affected by the active-position constraint)
and produces a comparison table showing how alpha scales when capacity
increases.

share_count interpretation:
    100  = 1 contract at a time (default, retail 100-share account)
    500  = 5 contracts in parallel
    1000 = 10 contracts in parallel
   ∞     = unlimited (every cadence day spawns a chain — pure strategy capacity)

Run from backend/:
    python -m scripts.share_count_comparison
"""

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import backtest


TICKER = "SPY"
START = date(2023, 1, 2)
END   = date(2025, 12, 12)
STRATEGIES = ["wheel", "watch", "conservative"]
SHARE_COUNTS = [100, 500, 1000, 1_000_000_000]  # last = effectively unlimited


def fmt_dollar(x):
    if x is None:
        return "—"
    sign = "−" if x < 0 else ""
    return f"{sign}${abs(x):,.0f}"


def fmt_dec_pct(x):
    return f"{x*100:+.2f}%" if x is not None else "—"


def label_for_count(n: int) -> str:
    if n >= 10**8:
        return "∞ (unlimited)"
    return f"{n:,}"


def main() -> int:
    print(f"=== Share-Count Comparison — SPY {START}..{END} ===")
    print(f"How does alpha scale when we lift the 'one position at a time' constraint?")
    print()

    md_lines = []
    md_lines.append("# Share-count sensitivity — SPY 2023-2025")
    md_lines.append("")
    md_lines.append(f"Generated {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    md_lines.append("")
    md_lines.append("Each row is the same strategy + cadence run at a different share count.")
    md_lines.append("`share_count` controls `max_concurrent_positions = floor(share_count / 100)`.")
    md_lines.append("Alpha = strategy P&L − buy-and-hold P&L. Both scale with share count.")
    md_lines.append("")
    md_lines.append("**Reading the table:** if alpha-as-% stays flat across share counts, the strategy")
    md_lines.append("is already capturing all available alpha at 100 shares. If alpha-% grows with share")
    md_lines.append("count, missed opportunities at 100 shares were leaving alpha on the table.")
    md_lines.append("")

    for strat in STRATEGIES:
        print(f"\n=== {strat.upper()} ===", flush=True)
        md_lines.append(f"## {strat.upper()}")
        md_lines.append("")

        for cadence in ("regime_gated", "unconditional"):
            print(f"\n--- cadence: {cadence} ---")
            md_lines.append(f"### Cadence: {cadence}")
            md_lines.append("")
            md_lines.append("| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |")
            md_lines.append("|---|---|---|---|---|---|---|---|---|")

            print(f"  {'shares':>10} {'legs':>6} {'strat$':>12} {'strat%':>8} {'bh$':>12} {'bh%':>8} {'alpha$':>10} {'alpha%':>8}")
            print(f"  {'-'*78}")

            for sc in SHARE_COUNTS:
                t0 = time.time()
                try:
                    result = backtest.run_backtest(
                        ticker=TICKER, strategy_id=strat,
                        start_date=START, end_date=END,
                        cadence="both", share_count=sc,
                    )
                except Exception as e:
                    md_lines.append(f"| {label_for_count(sc)} | — | ERROR: {e} | | | | | | |")
                    continue

                cad_data = result.get(cadence, {})
                n_legs = cad_data.get("trades_simulated", 0)
                strat_pnl = cad_data.get("total_profit_100sh")
                strat_ret = cad_data.get("strategy_total_return")
                bh_pnl = cad_data.get("buy_and_hold_total_profit")
                bh_ret = cad_data.get("buy_and_hold_total_return")
                alpha_d = cad_data.get("alpha_dollar")
                alpha_p = cad_data.get("alpha_pct")
                max_concurrent = result.get("max_concurrent_positions")

                dt = time.time() - t0
                print(f"  {sc:>10} {n_legs:>6} {fmt_dollar(strat_pnl):>12} "
                      f"{fmt_dec_pct(strat_ret):>8} {fmt_dollar(bh_pnl):>12} "
                      f"{fmt_dec_pct(bh_ret):>8} {fmt_dollar(alpha_d):>10} "
                      f"{fmt_dec_pct(alpha_p):>8}  ({dt:.1f}s)")

                md_lines.append(
                    f"| {label_for_count(sc)} | {max_concurrent} | "
                    f"{n_legs} | {fmt_dollar(strat_pnl)} | "
                    f"{fmt_dec_pct(strat_ret)} | {fmt_dollar(bh_pnl)} | "
                    f"{fmt_dec_pct(bh_ret)} | **{fmt_dollar(alpha_d)}** | "
                    f"**{fmt_dec_pct(alpha_p)}** |"
                )

            md_lines.append("")
        md_lines.append("---")
        md_lines.append("")

    out_path = Path(__file__).resolve().parent.parent.parent / "BACKTEST_SHARE_COUNT_COMPARISON.md"
    out_path.write_text("\n".join(md_lines))
    print(f"\nWritten: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
