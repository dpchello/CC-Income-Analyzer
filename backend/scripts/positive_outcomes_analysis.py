"""
Diagnostic — analyze positive-pnl trades from the latest backtest runs.

Question: ranked from "best" (held to expiry OTM, kept full premium) to
"partial-profit taking" (closed early at 50% profit / rolled at small gain),
what are the descriptive characteristics of the entry conditions? Is there
a pattern in IV, delta, DTE, distance-to-strike, or regime?

Pulls all trades with pnl > 0 from the latest run_id per
(strategy, cadence, lookback). Buckets by outcome tier and computes
distributional stats per bucket.

Run from backend/:
    python -m scripts.positive_outcomes_analysis
"""

from __future__ import annotations

import sys
from collections import Counter
from datetime import date
from pathlib import Path
from statistics import mean, median, stdev

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store


TICKER = "SPY"
LOOKBACKS = [1094, 2554, 1824, 1075]   # the 4 blocks per smoke_backtest

OUTCOME_TIER = {
    "max_profit":          1,  # held to expiry OTM — BEST
    "closed_early_50pct":  2,  # mid-trade close at 50% profit
    "rolled_at_21_dte":    3,  # defensive roll with positive net (decayed enough)
    "rolled_up_and_out":   4,  # rolled while breached, but pnl positive (rare)
    "assignment":          5,  # held to expiry ITM but pnl positive (barely breached)
}
TIER_LABEL = {
    1: "1 — held to expiry OTM (max profit, kept 100%)",
    2: "2 — closed early at 50% profit",
    3: "3 — rolled at 21 DTE (positive net)",
    4: "4 — rolled up-and-out (positive net, rare)",
    5: "5 — assigned with positive net (barely breached)",
}


def fetch_positive_trades() -> pd.DataFrame:
    """Pull all positive-pnl trade legs from the latest run per strategy."""
    with data_store.get_connection(read_only=True) as conn:
        rows = conn.execute("""
            WITH latest AS (
                SELECT strategy_id, lookback_days, MAX(started_at) AS ts
                FROM backtest_runs
                WHERE ticker = ? AND completed_at IS NOT NULL
                  AND lookback_days IN (1094, 2554, 1824, 1075)
                  AND cadence = 'both'
                GROUP BY strategy_id, lookback_days
            ),
            latest_runs AS (
                SELECT r.run_id, r.strategy_id, r.lookback_days
                FROM backtest_runs r JOIN latest l
                  ON r.strategy_id = l.strategy_id
                 AND r.lookback_days = l.lookback_days
                 AND r.started_at = l.ts
                WHERE r.ticker = ?
            )
            SELECT lr.strategy_id, lr.lookback_days,
                   t.cadence, t.entry_date, t.expiry_date, t.strike,
                   t.spot_at_entry, t.mid, t.iv_at_entry, t.delta_at_entry,
                   t.ann_yield, t.expiry_close, t.outcome, t.pnl,
                   t.regime_at_entry, t.close_date, t.buyback_mid,
                   t.chain_position
            FROM backtest_trades t JOIN latest_runs lr ON t.run_id = lr.run_id
            WHERE t.pnl > 0
            ORDER BY lr.strategy_id, t.entry_date
        """, [TICKER, TICKER]).fetchdf()
    return rows


def block_label(lookback: int) -> str:
    return {
        1094: "2008-2010 GFC",
        2554: "2011-2017 calm bull",
        1824: "2018-2022 vol regime",
        1075: "2023-2025 AI bull",
    }.get(lookback, str(lookback))


def fmt_stat(values, n_digits=1):
    if len(values) == 0:
        return "—"
    return f"med {median(values):.{n_digits}f} | mean {mean(values):.{n_digits}f} | std {stdev(values):.{n_digits}f}" if len(values) > 1 else f"single value {values[0]:.{n_digits}f}"


def main() -> int:
    df = fetch_positive_trades()
    if df.empty:
        print("No positive-pnl trades found.")
        return 0

    df["distance_pct"] = (df["strike"] / df["spot_at_entry"] - 1) * 100
    df["dte"] = (df["expiry_date"] - df["entry_date"]).dt.days
    df["tier"] = df["outcome"].map(OUTCOME_TIER)
    df["block"] = df["lookback_days"].map(block_label)

    print(f"=== Positive-PnL Trades Analysis (SPY, all 4 blocks) ===")
    print(f"Total positive trades: {len(df)}")
    print(f"Total pnl across positive trades: ${df['pnl'].sum():,.0f}")
    print()

    # ── Per-tier breakdown ────────────────────────────────────────────────────
    for tier in (1, 2, 3, 4, 5):
        sub = df[df["tier"] == tier]
        if sub.empty:
            continue
        print(f"\n=== TIER {TIER_LABEL[tier]} ===")
        print(f"  Count: {len(sub)} trades  ·  Total pnl: ${sub['pnl'].sum():,.0f}  ·  "
              f"Avg pnl/trade: ${sub['pnl'].mean():,.0f}")
        print()
        print(f"  Entry IV %        : {fmt_stat(sub['iv_at_entry'].tolist(), 1)}  range [{sub['iv_at_entry'].min():.1f}, {sub['iv_at_entry'].max():.1f}]")
        print(f"  Entry delta       : {fmt_stat(sub['delta_at_entry'].tolist(), 3)}")
        print(f"  DTE on entry      : {fmt_stat(sub['dte'].tolist(), 0)}")
        print(f"  Strike % OTM      : {fmt_stat(sub['distance_pct'].tolist(), 2)}")
        print(f"  Ann yield (est)   : {fmt_stat(sub['ann_yield'].tolist(), 1)}")
        print(f"  Premium per contract: med ${(sub['mid'].median() * 100):.0f}  ·  mean ${(sub['mid'].mean() * 100):.0f}")
        print()
        # Regime distribution
        regimes = Counter(sub["regime_at_entry"].fillna("UNKNOWN").tolist())
        print(f"  Regime distribution: {dict(regimes.most_common())}")
        # Strategy distribution
        strats = Counter(sub["strategy_id"].tolist())
        print(f"  Strategy distribution: {dict(strats.most_common())}")
        # Block distribution
        blocks = Counter(sub["block"].tolist())
        print(f"  Block distribution: {dict(blocks.most_common())}")
        # Cadence distribution
        cads = Counter(sub["cadence"].tolist())
        print(f"  Cadence distribution: {dict(cads.most_common())}")

    # ── Cross-tier comparison: where do the descriptive factors differ? ──────
    print()
    print()
    print("=" * 78)
    print("CROSS-TIER COMPARISON — descriptive medians")
    print("=" * 78)
    print(f"{'tier':<8} {'n':>6} {'iv%_med':>8} {'delta_med':>10} {'dte_med':>8} "
          f"{'%OTM_med':>10} {'pnl$_med':>10} {'pnl$_total':>14}")
    print("-" * 78)
    for tier in (1, 2, 3, 4, 5):
        sub = df[df["tier"] == tier]
        if sub.empty:
            continue
        print(f"{tier:<8} {len(sub):>6} "
              f"{sub['iv_at_entry'].median():>8.1f} "
              f"{sub['delta_at_entry'].median():>10.3f} "
              f"{sub['dte'].median():>8.0f} "
              f"{sub['distance_pct'].median():>10.2f} "
              f"{sub['pnl'].median():>10.0f} "
              f"${sub['pnl'].sum():>12,.0f}")

    # ── Heatmap-style: regime × tier ─────────────────────────────────────────
    print()
    print("=" * 78)
    print("REGIME × TIER (count of positive trades)")
    print("=" * 78)
    pivot = pd.crosstab(
        df["regime_at_entry"].fillna("UNKNOWN"),
        df["tier"],
        margins=True, margins_name="ALL",
    )
    print(pivot.to_string())

    # ── Strategy × tier ──────────────────────────────────────────────────────
    print()
    print("=" * 78)
    print("STRATEGY × TIER (count of positive trades)")
    print("=" * 78)
    pivot2 = pd.crosstab(df["strategy_id"], df["tier"],
                         margins=True, margins_name="ALL")
    print(pivot2.to_string())

    # ── IV bucket analysis: low/mid/high IV → outcome distribution ───────────
    print()
    print("=" * 78)
    print("IV BUCKET × TIER (count) — does low IV correlate with max-profit holds?")
    print("=" * 78)
    df["iv_bucket"] = pd.cut(
        df["iv_at_entry"],
        bins=[0, 13, 16, 20, 30, 200],
        labels=["<13%", "13-16%", "16-20%", "20-30%", ">30%"],
    )
    pivot3 = pd.crosstab(df["iv_bucket"], df["tier"],
                         margins=True, margins_name="ALL")
    print(pivot3.to_string())

    # ── DTE bucket × tier ────────────────────────────────────────────────────
    print()
    print("=" * 78)
    print("DTE BUCKET × TIER (count)")
    print("=" * 78)
    df["dte_bucket"] = pd.cut(
        df["dte"],
        bins=[0, 21, 30, 40, 60, 90],
        labels=["≤21", "22-30", "31-40", "41-60", ">60"],
    )
    pivot4 = pd.crosstab(df["dte_bucket"], df["tier"],
                         margins=True, margins_name="ALL")
    print(pivot4.to_string())

    # ── Distance % OTM bucket × tier ─────────────────────────────────────────
    print()
    print("=" * 78)
    print("STRIKE DISTANCE %OTM × TIER (count)")
    print("=" * 78)
    df["dist_bucket"] = pd.cut(
        df["distance_pct"],
        bins=[0, 1, 2, 3, 5, 100],
        labels=["<1%", "1-2%", "2-3%", "3-5%", ">5%"],
    )
    pivot5 = pd.crosstab(df["dist_bucket"], df["tier"],
                         margins=True, margins_name="ALL")
    print(pivot5.to_string())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
