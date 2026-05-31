"""
Trade-by-trade audit log for the most recent backtest run of a given strategy.

Produces a readable narrative of every entry, the regime context, and what
happened at expiry. Useful for "show me exactly what the model did."

Run from backend/:
    python -m scripts.audit_log

Output: BACKTEST_AUDIT_LOG.md at the repo root.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import data_store


# Most recent block. The user wants to inspect 2023-2025 specifically.
LOOKBACK_DAYS = 1075
TICKER = "SPY"
STRATEGIES = [("watch", "WATCH"), ("conservative", "CONSERVATIVE")]


def _latest_run_id(strategy: str) -> str | None:
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute("""
            SELECT run_id FROM backtest_runs
            WHERE ticker = ? AND strategy_id = ? AND lookback_days = ?
              AND completed_at IS NOT NULL
            ORDER BY started_at DESC LIMIT 1
        """, [TICKER, strategy, LOOKBACK_DAYS]).fetchone()
    return row[0] if row else None


def _run_summary(run_id: str) -> dict:
    """Pull the persisted summary_json for a run (returns dict or {})."""
    with data_store.get_connection(read_only=True) as conn:
        row = conn.execute(
            "SELECT summary_json FROM backtest_runs WHERE run_id = ?",
            [run_id],
        ).fetchone()
    if not row or not row[0]:
        return {}
    try:
        return json.loads(row[0])
    except Exception:
        return {}


def _fmt_dollar(x):
    if x is None:
        return "—"
    sign = "−" if x < 0 else ""
    return f"{sign}${abs(x):,.0f}"


def _alpha_summary_line(cadence_data: dict) -> str:
    """One-line alpha summary using the locked definition."""
    strat = cadence_data.get("total_profit_100sh")
    bh = cadence_data.get("buy_and_hold_total_profit")
    alpha = cadence_data.get("alpha_dollar")
    n = cadence_data.get("trades_simulated", 0)
    if strat is None or bh is None or alpha is None:
        return f"({n} trades — insufficient data for alpha)"
    return (
        f"{n} trades · "
        f"strategy P&L {_fmt_dollar(strat)} · "
        f"buy-and-hold P&L {_fmt_dollar(bh)} · "
        f"**alpha {_fmt_dollar(alpha)}**"
    )


def _trades_for(run_id: str, cadence: str):
    with data_store.get_connection(read_only=True) as conn:
        return conn.execute("""
            SELECT entry_date, expiry_date, strike, spot_at_entry,
                   mid, iv_at_entry, delta_at_entry,
                   expiry_close, outcome, regime_at_entry,
                   pnl, close_date, buyback_mid,
                   chain_id, chain_position
            FROM backtest_trades
            WHERE run_id = ? AND cadence = ?
            ORDER BY entry_date, chain_position
        """, [run_id, cadence]).fetchall()


def _action_string(spot, strike, expiry, mid, iv, delta, dte):
    """Mimic the live recommendation engine's action string."""
    return (f"Sell 1× SPY ${strike:.0f} call expiring {expiry} for ${mid:.2f} "
            f"(IV {iv:.1f}%, delta {delta:.3f}, {dte}d to expiry, "
            f"strike {((strike/spot - 1) * 100):.1f}% OTM)")


def _outcome_narrative(strike, mid, expiry_close, outcome, close_date, buyback_mid):
    if outcome == "max_profit":
        breach = expiry_close - strike
        return (f"SPY closed ${expiry_close:.2f} (${abs(breach):.2f} below strike). "
                f"Held to expiry. Call expired worthless. Kept full premium ${mid * 100:.0f}.")
    if outcome == "closed_early_50pct":
        kept = (mid - buyback_mid) * 100 if buyback_mid is not None else None
        return (f"Option mid fell to ${buyback_mid:.2f} (≤ 50% of entry mid ${mid:.2f}) "
                f"on {close_date}. Trader closed at 50% profit. "
                f"Kept ${kept:.0f} of ${mid * 100:.0f} entry premium.")
    if outcome == "rolled_up_and_out":
        cost = (buyback_mid - mid) * 100 if buyback_mid is not None else None
        return (f"SPY breached strike with > 21 DTE remaining. Bought back at "
                f"${buyback_mid:.2f} on {close_date} to roll up-and-out. "
                f"Buyback cost: ${cost:.0f}/contract above entry premium. "
                f"New position opens same day at higher strike + further expiry.")
    if outcome == "rolled_at_21_dte":
        net = (mid - buyback_mid) * 100 if buyback_mid is not None else None
        sign = "" if net >= 0 else "−"
        return (f"At 21 DTE with underlying within 3% of strike, defensive roll fired. "
                f"Bought back at ${buyback_mid:.2f} on {close_date}. "
                f"Net on this leg: {sign}${abs(net):.0f}. "
                f"New position opens same day at fresh expiry.")
    # assignment
    breach = expiry_close - strike
    capped = max(0.0, breach) * 100
    net = (mid * 100) - capped
    sign = "" if net >= 0 else "−"
    return (f"SPY closed ${expiry_close:.2f} (${breach:.2f} above strike). "
            f"No mid-trade trigger fired (option stayed expensive, no roll target available, "
            f"or all conditions skipped). Held to expiry, shares assigned at ${strike:.0f}. "
            f"Kept premium ${mid * 100:.0f}, missed ${capped:.0f} of upside. "
            f"Net per contract: {sign}${abs(net):.0f}.")


def _running_pnl(trades_rows):
    """
    Convert raw rows into a list of trade dicts with running P&L. Uses the
    persisted `pnl` column from the path-dependent simulator.
    """
    out = []
    cum = 0.0
    cum_capped = 0.0
    for r in trades_rows:
        (entry, expiry, strike, spot, mid, iv, delta,
         close, outcome, regime, pnl, close_date, buyback_mid,
         chain_id, chain_pos) = r
        capped = max(0.0, (close - strike) * 100) if outcome == "assignment" and close is not None else 0.0
        net = float(pnl)
        cum += net
        cum_capped += capped
        dte = (expiry - entry).days
        out.append({
            "entry_date": entry, "expiry": expiry, "strike": strike,
            "spot": spot, "mid": mid, "iv": iv, "delta": delta,
            "close": close, "outcome": outcome, "regime": regime,
            "close_date": close_date, "buyback_mid": buyback_mid,
            "chain_id": chain_id, "chain_pos": chain_pos,
            "dte": dte, "net": net, "cum": cum,
            "premium_dollar": mid * 100,
            "capped": capped,
            "cum_capped": cum_capped,
        })
    return out


def render_strategy(strategy: str, label: str, lines: list) -> None:
    run_id = _latest_run_id(strategy)
    if not run_id:
        lines.append(f"## {label} — no run found\n")
        return

    summary = _run_summary(run_id)
    lines.append(f"## {label} strategy (latest run: `{run_id}`)")
    lines.append("")
    lines.append(f"**Window:** 2023-01-02 → 2025-12-12 (1075-day lookback). ")
    lines.append("**Cadence:** entry every 5 trading days. ")
    lines.append("**Path-dependent:** trades close mid-window when option mid hits ≤ 50% of entry; otherwise held to expiry.")
    lines.append("")
    lines.append("**Alpha summary** (alpha = strategy P&L − buy-and-hold P&L):")
    lines.append("")
    if summary.get("regime_gated"):
        lines.append(f"- **Regime-gated:** {_alpha_summary_line(summary['regime_gated'])}")
    if summary.get("unconditional"):
        lines.append(f"- **Unconditional:** {_alpha_summary_line(summary['unconditional'])}")
    if summary.get("engine_edge"):
        e = summary["engine_edge"]
        lines.append(f"- **Engine edge** (regime-gated minus unconditional, NOT alpha): "
                     f"alpha lift {_fmt_dollar(e.get('alpha_lift_dollar'))}, "
                     f"sharpe lift {e.get('sharpe_delta', 0):+.2f}")
    lines.append("")

    for cadence, cad_label in [
        ("regime_gated", "Regime-gated (only when SELL PREMIUM signal active)"),
        ("unconditional", "Unconditional (every 5 trading days, regardless of regime)"),
    ]:
        rows = _trades_for(run_id, cadence)
        lines.append(f"### {cad_label}")
        lines.append("")
        if not rows:
            lines.append(f"_0 trades in this cadence._\n")
            continue
        lines.append(f"_{len(rows)} trades total. Showing chronological ledger._\n")

        narrated = _running_pnl(rows)
        # Summary table — chain ID lets you see roll groups
        lines.append("| # | Chain | Entry | DTE | Action | Regime | Outcome | Net $ | Cum $ |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        chain_short = {}  # short numeric label per chain_id
        for i, t in enumerate(narrated, 1):
            action = (f"Sell 1× ${t['strike']:.0f}C exp {t['expiry']} "
                      f"@ ${t['mid']:.2f} (δ {t['delta']:.3f})")
            net_sign = "" if t["net"] >= 0 else "−"
            cum_sign = "" if t["cum"] >= 0 else "−"
            cid = t["chain_id"]
            if cid not in chain_short:
                chain_short[cid] = len(chain_short) + 1
            chain_label = f"C{chain_short[cid]}.{t['chain_pos']}"
            lines.append(
                f"| {i} | {chain_label} | {t['entry_date']} | {t['dte']}d | {action} | "
                f"{t['regime']} | {t['outcome']} | "
                f"{net_sign}${abs(t['net']):.0f} | {cum_sign}${abs(t['cum']):.0f} |"
            )
        lines.append("")
        lines.append(f"_Chain labels: C1.0 = first trade in chain 1; C1.1 = first roll in chain 1 (same opening, rolled forward); etc._")
        lines.append("")

        # Per-trade narrative for first 10 + last 5 (so the doc isn't a wall)
        n = len(narrated)
        if n > 0:
            lines.append("**Walkthrough (showing detailed narrative for select trades):**")
            lines.append("")
            walkthrough_idx = list(range(min(8, n))) + (
                list(range(n - 4, n)) if n > 12 else []
            )
            walkthrough_idx = sorted(set(walkthrough_idx))
            for i in walkthrough_idx:
                t = narrated[i]
                lines.append(f"**Trade {i+1} — {t['entry_date']}**")
                lines.append(f"- Spot at entry: ${t['spot']:.2f}")
                lines.append(f"- Regime context: `{t['regime']}` "
                             f"({'engine recommended entry' if t['regime'] == 'SELL PREMIUM' else 'engine did NOT recommend; trade only happens in unconditional cadence'})")
                lines.append(f"- Action: {_action_string(t['spot'], t['strike'], t['expiry'], t['mid'], t['iv'], t['delta'], t['dte'])}")
                lines.append(f"- Outcome: {_outcome_narrative(t['strike'], t['mid'], t['close'], t['outcome'], t['close_date'], t['buyback_mid'])}")
                lines.append(f"- Cumulative P&L (option leg, all trades to date): ${t['cum']:,.0f}")
                lines.append("")

        last = narrated[-1]
        lines.append("**Cadence totals:**")
        lines.append("")
        n_mp = sum(1 for t in narrated if t["outcome"] == "max_profit")
        n_ce = sum(1 for t in narrated if t["outcome"] == "closed_early_50pct")
        n_ru = sum(1 for t in narrated if t["outcome"] == "rolled_up_and_out")
        n_r21 = sum(1 for t in narrated if t["outcome"] == "rolled_at_21_dte")
        n_as = sum(1 for t in narrated if t["outcome"] == "assignment")
        n_chains = len(set(t["chain_id"] for t in narrated))
        lines.append(f"- Total trades (legs): {n}  ·  Chains (independent openings): {n_chains}  ·  Avg chain length: {n / n_chains:.2f}")
        lines.append(f"- Expired worthless: {n_mp} ({n_mp/n*100:.1f}%)")
        lines.append(f"- Closed early at 50% profit: {n_ce} ({n_ce/n*100:.1f}%)")
        lines.append(f"- Rolled up-and-out (ITM, > 21 DTE): {n_ru} ({n_ru/n*100:.1f}%)")
        lines.append(f"- Rolled at 21 DTE (defensive, at-risk): {n_r21} ({n_r21/n*100:.1f}%)")
        lines.append(f"- Assigned (held to expiry, ITM, no roll fired): {n_as} ({n_as/n*100:.1f}%)")
        lines.append(f"- Total capped upside (from assignments): ${last['cum_capped']:,.0f}")
        lines.append(f"- **Option-leg P&L (sum of trade pnls): ${last['cum']:,.0f}**")
        lines.append("")
        lines.append("_Note: option-leg P&L is the sum of per-trade pnls. Strategy total P&L (in BACKTEST_RESULTS_SPY.md) adds the underlying's price change × 100 over the window. Alpha = strategy P&L − buy-and-hold P&L._")
        lines.append("")

    lines.append("---")
    lines.append("")


def main() -> int:
    lines: list[str] = []
    lines.append("# SPY backtest — trade-by-trade audit log (2023-2025 window)")
    lines.append("")
    lines.append("Generated to answer: \"What exactly did the model advise?\"")
    lines.append("")
    lines.append("**Coverage:** SPY, 2023-01-02 → 2025-12-12 (most recent block). ")
    lines.append("**Two cadences shown per strategy:** regime-gated (engine on) and unconditional (engine off). ")
    lines.append("**Methodology:** path-dependent simulation with active position management — three triggers checked daily: (1) close at 50% profit, (2) roll up-and-out when ITM with > 21 DTE, (3) defensive roll at ≤ 21 DTE if at-risk. Rolls produce chains of linked trades.")
    lines.append("")
    lines.append("**Methodology — path-dependent simulation (corrected 2026-04-25):**")
    lines.append("")
    lines.append("For every trade, we walk every trading day from entry to expiry and look up the option's actual mid-price in the DuckDB chain. If mid ever falls to ≤ 50% of the entry mid, the live engine's \"close at 50% profit\" rule fires — trader buys back that day. Otherwise we hold to expiry.")
    lines.append("")
    lines.append("**Outcome semantics:**")
    lines.append("- `max_profit` — held to expiry, SPY ≤ strike, expired worthless → kept full premium")
    lines.append("- `closed_early_50pct` — option mid hit ≤ 50% of entry mid → closed at 50% profit, no follow-on trade until next cadence day")
    lines.append("- `rolled_up_and_out` — underlying breached strike with > 21 DTE remaining → bought back, opened new higher-strike+later-expiry position SAME DAY (negative pnl on this leg = buyback cost above entry premium)")
    lines.append("- `rolled_at_21_dte` — DTE ≤ 21 with underlying ≥ strike × 0.97 (at-risk) → bought back, opened fresh position SAME DAY")
    lines.append("- `assignment` — held to expiry, SPY > strike, no roll fired (e.g., roll target unavailable due to strategy filters) → shares called away at strike")
    lines.append("")
    lines.append("**Chain semantics:** when a roll fires, the closed leg is one trade and the new position is another, both sharing a `chain_id`. A chain ends when a leg resolves to `max_profit`, `closed_early_50pct`, `assignment`, or when a roll target is unavailable.")
    lines.append("")
    lines.append("**Alpha definition (locked 2026-04-25):**")
    lines.append("Alpha = strategy total P&L − buy-and-hold total P&L. Always vs the buy-and-hold baseline of the same 100-share lot over the same window. The cadence-vs-cadence comparison is reported separately as \"engine edge\" or \"alpha lift\" — never as alpha.")
    lines.append("")
    lines.append("**Regime label semantics (`regime_at_entry`):**")
    lines.append("- `SELL PREMIUM` — engine recommended entry. In *regime-gated* cadence, only these trades happen.")
    lines.append("- `HOLD`, `CAUTION`, `AVOID` — engine did NOT recommend entry. In *unconditional* cadence, the trade still happens (no gate).")
    lines.append("- `UNKNOWN` — historical macro data missing on that day, regime undetermined")
    lines.append("")
    lines.append("---")
    lines.append("")

    for strategy, label in STRATEGIES:
        render_strategy(strategy, label, lines)

    out_path = Path(__file__).resolve().parent.parent.parent / "BACKTEST_AUDIT_LOG.md"
    out_path.write_text("\n".join(lines))
    print(f"Audit log written to: {out_path}")
    print(f"({len(lines)} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
