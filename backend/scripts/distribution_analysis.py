"""
Distribution-based analysis of entry conditions vs trade outcomes.

Goal: support calibrated scoring + probability-of-profit (POP) in imperfect
environments. For each descriptive factor (IV, delta, DTE, distance %OTM),
report:

  1. Full distribution within positive-pnl trades (P10/P25/P50/P75/P90)
  2. Full distribution within negative-pnl trades
  3. Conditional probability P(positive | feature in bucket)
  4. 2D conditional probabilities for the most informative pairs

Uses ALL trades from the latest runs across all 5 strategies × 4 blocks
(unconditional cadence — broadest universe for the joint distribution).

Run from backend/:
    python -m scripts.distribution_analysis
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store


TICKER = "SPY"
LOOKBACKS = [1094, 2554, 1824, 1075]


def fetch_all_trades() -> pd.DataFrame:
    with data_store.get_connection(read_only=True) as conn:
        df = conn.execute("""
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
                   t.regime_at_entry, t.chain_position
            FROM backtest_trades t JOIN latest_runs lr ON t.run_id = lr.run_id
            WHERE t.cadence = 'unconditional'
        """, [TICKER, TICKER]).fetchdf()
    return df


def quantile_table(series: pd.Series, label: str) -> str:
    qs = series.quantile([0.1, 0.25, 0.5, 0.75, 0.9])
    return (
        f"{label:<22} n={len(series):>5}  "
        f"P10={qs.loc[0.1]:>8.2f}  P25={qs.loc[0.25]:>8.2f}  "
        f"P50={qs.loc[0.5]:>8.2f}  P75={qs.loc[0.75]:>8.2f}  "
        f"P90={qs.loc[0.9]:>8.2f}  "
        f"min={series.min():>8.2f}  max={series.max():>8.2f}"
    )


def conditional_table(df: pd.DataFrame, feature: str, bins, labels) -> pd.DataFrame:
    """For each bucket of `feature`, compute P(positive | bucket)."""
    df = df.copy()
    df["bucket"] = pd.cut(df[feature], bins=bins, labels=labels, include_lowest=True)
    df["positive"] = df["pnl"] > 0
    grp = df.groupby("bucket", observed=False).agg(
        total=("pnl", "size"),
        positive=("positive", "sum"),
        avg_pnl=("pnl", "mean"),
        median_pnl=("pnl", "median"),
        sum_pnl=("pnl", "sum"),
    )
    grp["P_positive"] = grp["positive"] / grp["total"].replace(0, 1)
    grp["expected_pnl_per_attempt"] = grp["sum_pnl"] / grp["total"].replace(0, 1)
    return grp


def two_d_conditional(df: pd.DataFrame,
                      f1: str, bins1, labels1,
                      f2: str, bins2, labels2) -> pd.DataFrame:
    """2D conditional probability table P(positive | f1, f2)."""
    df = df.copy()
    df["b1"] = pd.cut(df[f1], bins=bins1, labels=labels1, include_lowest=True)
    df["b2"] = pd.cut(df[f2], bins=bins2, labels=labels2, include_lowest=True)
    df["positive"] = (df["pnl"] > 0).astype(int)
    pivot_total = df.pivot_table(index="b1", columns="b2", values="positive",
                                  aggfunc="size", fill_value=0, observed=False)
    pivot_pos = df.pivot_table(index="b1", columns="b2", values="positive",
                                aggfunc="sum", fill_value=0, observed=False)
    p_pos = (pivot_pos / pivot_total.replace(0, 1)).round(2)
    return pivot_total, pivot_pos, p_pos


def main() -> int:
    df = fetch_all_trades()
    if df.empty:
        print("No trades found in latest runs.")
        return 0

    df["distance_pct"] = (df["strike"] / df["spot_at_entry"] - 1) * 100
    df["dte"] = (df["expiry_date"] - df["entry_date"]).dt.days
    df["positive"] = df["pnl"] > 0

    n_total = len(df)
    n_pos   = int(df["positive"].sum())
    n_neg   = n_total - n_pos

    print(f"=== Distribution Analysis — SPY, all 4 blocks, all 5 strategies, unconditional cadence ===")
    print(f"Total trade legs: {n_total:,}")
    print(f"Positive pnl    : {n_pos:,}  ({n_pos / n_total * 100:.1f}%)")
    print(f"Negative pnl    : {n_neg:,}  ({n_neg / n_total * 100:.1f}%)")
    print(f"Sum pnl         : ${df['pnl'].sum():,.0f}")
    print(f"Avg pnl/trade   : ${df['pnl'].mean():,.2f}")
    print()

    pos_df = df[df["positive"]]
    neg_df = df[~df["positive"]]

    print("=" * 100)
    print("FEATURE DISTRIBUTIONS (positive vs negative)")
    print("=" * 100)
    for feat, label, ndp in [
        ("iv_at_entry",   "Entry IV%",       1),
        ("delta_at_entry", "Entry delta",    3),
        ("dte",           "DTE on entry",    0),
        ("distance_pct",  "Strike % OTM",    2),
        ("mid",           "Premium ($/share)", 2),
    ]:
        print(f"\n{label}")
        print("  POSITIVE: " + quantile_table(pos_df[feat], ""))
        print("  NEGATIVE: " + quantile_table(neg_df[feat], ""))

    # ── 1D conditional P(positive | feature bucket) ──────────────────────────
    print()
    print("=" * 100)
    print("CONDITIONAL P(positive | feature bucket) + EXPECTED PNL")
    print("=" * 100)

    print("\n— By Entry IV% —")
    print(conditional_table(
        df, "iv_at_entry",
        bins=[0, 10, 13, 16, 20, 25, 30, 200],
        labels=["<10", "10-13", "13-16", "16-20", "20-25", "25-30", ">30"],
    ).to_string())

    print("\n— By Entry delta —")
    print(conditional_table(
        df, "delta_at_entry",
        bins=[0, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50],
        labels=["<.15", ".15-.20", ".20-.25", ".25-.30", ".30-.35", ".35-.40", ".40-.50"],
    ).to_string())

    print("\n— By DTE on entry —")
    print(conditional_table(
        df, "dte",
        bins=[0, 14, 21, 28, 35, 42, 49, 60, 90],
        labels=["≤14", "15-21", "22-28", "29-35", "36-42", "43-49", "50-60", ">60"],
    ).to_string())

    print("\n— By Strike % OTM —")
    print(conditional_table(
        df, "distance_pct",
        bins=[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 100],
        labels=["<0.5", "0.5-1", "1-1.5", "1.5-2", "2-2.5", "2.5-3", "3-4", "4-6", ">6"],
    ).to_string())

    # ── 2D heatmaps — IV × delta and IV × distance ───────────────────────────
    print()
    print("=" * 100)
    print("2D CONDITIONAL P(positive) — IV × delta")
    print("=" * 100)
    iv_bins   = [0, 13, 16, 20, 30, 200]
    iv_labels = ["<13", "13-16", "16-20", "20-30", ">30"]
    d_bins   = [0, 0.20, 0.25, 0.30, 0.35, 0.50]
    d_labels = ["<.20", ".20-.25", ".25-.30", ".30-.35", ".35+"]
    total, pos, p = two_d_conditional(df, "iv_at_entry", iv_bins, iv_labels,
                                       "delta_at_entry", d_bins, d_labels)
    print("Counts (total):"); print(total.to_string())
    print("\nP(positive):"); print(p.to_string())

    print()
    print("=" * 100)
    print("2D CONDITIONAL P(positive) — IV × distance %OTM")
    print("=" * 100)
    dist_bins   = [0, 1, 2, 3, 5, 100]
    dist_labels = ["<1", "1-2", "2-3", "3-5", ">5"]
    total, pos, p = two_d_conditional(df, "iv_at_entry", iv_bins, iv_labels,
                                       "distance_pct", dist_bins, dist_labels)
    print("Counts (total):"); print(total.to_string())
    print("\nP(positive):"); print(p.to_string())

    print()
    print("=" * 100)
    print("2D CONDITIONAL P(positive) — DTE × distance %OTM")
    print("=" * 100)
    dte_bins   = [0, 21, 35, 45, 90]
    dte_labels = ["≤21", "22-35", "36-45", ">45"]
    total, pos, p = two_d_conditional(df, "dte", dte_bins, dte_labels,
                                       "distance_pct", dist_bins, dist_labels)
    print("Counts (total):"); print(total.to_string())
    print("\nP(positive):"); print(p.to_string())

    # ── Regime conditional ───────────────────────────────────────────────────
    print()
    print("=" * 100)
    print("CONDITIONAL P(positive) by REGIME at entry")
    print("=" * 100)
    reg = df.groupby(df["regime_at_entry"].fillna("UNKNOWN"), observed=False).agg(
        n=("pnl", "size"),
        n_positive=("positive", "sum"),
        avg_pnl=("pnl", "mean"),
        median_pnl=("pnl", "median"),
        sum_pnl=("pnl", "sum"),
    )
    reg["P_positive"] = reg["n_positive"] / reg["n"].replace(0, 1)
    reg["expected_pnl"] = reg["sum_pnl"] / reg["n"].replace(0, 1)
    print(reg.to_string())

    # ── Putting it together: a candidate scoring formula ─────────────────────
    print()
    print("=" * 100)
    print("CANDIDATE SCORING — top conditions by expected pnl per attempt")
    print("=" * 100)
    # Bin everything, group by joint key, find the cells with highest expected pnl
    df["iv_b"]   = pd.cut(df["iv_at_entry"], bins=iv_bins, labels=iv_labels, include_lowest=True)
    df["d_b"]    = pd.cut(df["delta_at_entry"], bins=d_bins, labels=d_labels, include_lowest=True)
    df["dte_b"]  = pd.cut(df["dte"], bins=dte_bins, labels=dte_labels, include_lowest=True)
    df["dist_b"] = pd.cut(df["distance_pct"], bins=dist_bins, labels=dist_labels, include_lowest=True)
    grp = df.groupby(["iv_b", "d_b", "dte_b", "dist_b"], observed=True).agg(
        n=("pnl", "size"),
        n_positive=("positive", "sum"),
        sum_pnl=("pnl", "sum"),
    )
    grp = grp[grp["n"] >= 20]  # ignore noise cells
    grp["P_positive"] = grp["n_positive"] / grp["n"]
    grp["expected_pnl"] = grp["sum_pnl"] / grp["n"]
    grp = grp.sort_values("expected_pnl", ascending=False)
    print("\nTop 15 cells by expected pnl per attempt (n ≥ 20):")
    print(grp.head(15).to_string())
    print("\nBottom 10 cells by expected pnl per attempt (n ≥ 20):")
    print(grp.tail(10).to_string())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
