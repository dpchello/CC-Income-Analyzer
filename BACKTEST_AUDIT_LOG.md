# SPY backtest — trade-by-trade audit log (2023-2025 window)

Generated to answer: "What exactly did the model advise?"

**Coverage:** SPY, 2023-01-02 → 2025-12-12 (most recent block).
**Two cadences shown per strategy:** regime-gated (engine on) and unconditional (engine off).
**Methodology:** path-dependent simulation with active position management — three triggers checked daily: (1) close at 50% profit, (2) roll up-and-out when ITM with > 21 DTE, (3) defensive roll at ≤ 21 DTE if at-risk. Rolls produce chains of linked trades.

**Methodology — path-dependent simulation (corrected 2026-04-25):**

For every trade, we walk every trading day from entry to expiry and look up the option's actual mid-price in the DuckDB chain. If mid ever falls to ≤ 50% of the entry mid, the live engine's "close at 50% profit" rule fires — trader buys back that day. Otherwise we hold to expiry.

**Outcome semantics:**
- `max_profit` — held to expiry, SPY ≤ strike, expired worthless → kept full premium
- `closed_early_50pct` — option mid hit ≤ 50% of entry mid → closed at 50% profit, no follow-on trade until next cadence day
- `rolled_up_and_out` — underlying breached strike with > 21 DTE remaining → bought back, opened new higher-strike+later-expiry position SAME DAY (negative pnl on this leg = buyback cost above entry premium)
- `rolled_at_21_dte` — DTE ≤ 21 with underlying ≥ strike × 0.97 (at-risk) → bought back, opened fresh position SAME DAY
- `assignment` — held to expiry, SPY > strike, no roll fired (e.g., roll target unavailable due to strategy filters) → shares called away at strike

**Chain semantics:** when a roll fires, the closed leg is one trade and the new position is another, both sharing a `chain_id`. A chain ends when a leg resolves to `max_profit`, `closed_early_50pct`, `assignment`, or when a roll target is unavailable.

**Alpha definition (locked 2026-04-25):**
Alpha = strategy total P&L − buy-and-hold total P&L. Always vs the buy-and-hold baseline of the same 100-share lot over the same window. The cadence-vs-cadence comparison is reported separately as "engine edge" or "alpha lift" — never as alpha.

**Regime label semantics (`regime_at_entry`):**
- `SELL PREMIUM` — engine recommended entry. In *regime-gated* cadence, only these trades happen.
- `HOLD`, `CAUTION`, `AVOID` — engine did NOT recommend entry. In *unconditional* cadence, the trade still happens (no gate).
- `UNKNOWN` — historical macro data missing on that day, regime undetermined

---

## WATCH strategy (latest run: `SPY:watch:1075:both:20260425T231530:11a017`)

**Window:** 2023-01-02 → 2025-12-12 (1075-day lookback).
**Cadence:** entry every 5 trading days.
**Path-dependent:** trades close mid-window when option mid hits ≤ 50% of entry; otherwise held to expiry.

**Alpha summary** (alpha = strategy P&L − buy-and-hold P&L):

- **Regime-gated:** 15 trades · strategy P&L $28,142 · buy-and-hold P&L $30,094 · **alpha −$1,952**
- **Unconditional:** 32 trades · strategy P&L $26,685 · buy-and-hold P&L $30,094 · **alpha −$3,409**
- **Engine edge** (regime-gated minus unconditional, NOT alpha): alpha lift $1,458, sharpe lift +0.16

### Regime-gated (only when SELL PREMIUM signal active)

_15 trades total. Showing chronological ledger._

| # | Chain | Entry | DTE | Action | Regime | Outcome | Net $ | Cum $ |
|---|---|---|---|---|---|---|---|---|
| 1 | C1.0 | 2023-02-01 | 30d | Sell 1× $418C exp 2023-03-03 @ $5.02 (δ 0.391) | SELL PREMIUM | rolled_at_21_dte | $195 | $195 |
| 2 | C1.1 | 2023-02-10 | 35d | Sell 1× $416C exp 2023-03-17 @ $6.13 (δ 0.399) | UNKNOWN | closed_early_50pct | $426 | $621 |
| 3 | C2.0 | 2023-03-09 | 36d | Sell 1× $400C exp 2023-04-14 @ $5.95 (δ 0.394) | SELL PREMIUM | rolled_at_21_dte | $27 | $648 |
| 4 | C2.1 | 2023-03-24 | 35d | Sell 1× $404C exp 2023-04-28 @ $6.12 (δ 0.398) | UNKNOWN | rolled_up_and_out | −$573 | $75 |
| 5 | C2.2 | 2023-03-31 | 35d | Sell 1× $418C exp 2023-05-05 @ $5.26 (δ 0.382) | UNKNOWN | rolled_at_21_dte | $160 | $235 |
| 6 | C3.0 | 2023-10-26 | 36d | Sell 1× $422C exp 2023-12-01 @ $5.89 (δ 0.383) | SELL PREMIUM | rolled_up_and_out | −$772 | −$537 |
| 7 | C4.0 | 2024-08-06 | 31d | Sell 1× $534C exp 2024-09-06 @ $8.07 (δ 0.391) | SELL PREMIUM | rolled_up_and_out | −$712 | −$1249 |
| 8 | C5.0 | 2024-10-30 | 30d | Sell 1× $590C exp 2024-11-29 @ $6.46 (δ 0.390) | SELL PREMIUM | closed_early_50pct | $359 | −$890 |
| 9 | C6.0 | 2025-02-27 | 32d | Sell 1× $595C exp 2025-03-31 @ $7.31 (δ 0.394) | SELL PREMIUM | closed_early_50pct | $378 | −$512 |
| 10 | C7.0 | 2025-03-13 | 35d | Sell 1× $564C exp 2025-04-17 @ $9.47 (δ 0.395) | SELL PREMIUM | rolled_up_and_out | −$453 | −$964 |
| 11 | C7.1 | 2025-03-17 | 31d | Sell 1× $577C exp 2025-04-17 @ $6.98 (δ 0.396) | UNKNOWN | rolled_at_21_dte | $187 | −$778 |
| 12 | C7.2 | 2025-03-27 | 34d | Sell 1× $577C exp 2025-04-30 @ $7.12 (δ 0.396) | HOLD | closed_early_50pct | $580 | −$197 |
| 13 | C8.0 | 2025-05-09 | 35d | Sell 1× $576C exp 2025-06-13 @ $8.36 (δ 0.396) | SELL PREMIUM | rolled_up_and_out | −$821 | −$1018 |
| 14 | C9.0 | 2025-10-16 | 36d | Sell 1× $674C exp 2025-11-21 @ $9.28 (δ 0.393) | SELL PREMIUM | rolled_up_and_out | −$933 | −$1952 |
| 15 | C10.0 | 2025-11-20 | 36d | Sell 1× $666C exp 2025-12-26 @ $10.00 (δ 0.396) | SELL PREMIUM | rolled_up_and_out | −$870 | −$2822 |

_Chain labels: C1.0 = first trade in chain 1; C1.1 = first roll in chain 1 (same opening, rolled forward); etc._

**Walkthrough (showing detailed narrative for select trades):**

**Trade 1 — 2023-02-01**
- Spot at entry: $410.80
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $418 call expiring 2023-03-03 for $5.02 (IV 16.1%, delta 0.391, 30d to expiry, strike 1.8% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $3.07 on 2023-02-10. Net on this leg: $195. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $195

**Trade 2 — 2023-02-10**
- Spot at entry: $408.04
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $416 call expiring 2023-03-17 for $6.13 (IV 17.1%, delta 0.399, 35d to expiry, strike 2.0% OTM)
- Outcome: Option mid fell to $1.87 (≤ 50% of entry mid $6.13) on 2023-02-21. Trader closed at 50% profit. Kept $426 of $613 entry premium.
- Cumulative P&L (option leg, all trades to date): $621

**Trade 3 — 2023-03-09**
- Spot at entry: $391.56
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $400 call expiring 2023-04-14 for $5.95 (IV 18.1%, delta 0.394, 36d to expiry, strike 2.2% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $5.68 on 2023-03-24. Net on this leg: $27. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $648

**Trade 4 — 2023-03-24**
- Spot at entry: $395.75
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $404 call expiring 2023-04-28 for $6.12 (IV 18.1%, delta 0.398, 35d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $11.84 on 2023-03-31 to roll up-and-out. Buyback cost: $573/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $75

**Trade 5 — 2023-03-31**
- Spot at entry: $409.39
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $418 call expiring 2023-05-05 for $5.26 (IV 16.1%, delta 0.382, 35d to expiry, strike 2.1% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $3.66 on 2023-04-14. Net on this leg: $160. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $235

**Trade 6 — 2023-10-26**
- Spot at entry: $412.55
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $422 call expiring 2023-12-01 for $5.89 (IV 17.1%, delta 0.383, 36d to expiry, strike 2.3% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $13.62 on 2023-11-02 to roll up-and-out. Buyback cost: $772/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-537

**Trade 7 — 2024-08-06**
- Spot at entry: $522.15
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $534 call expiring 2024-09-06 for $8.07 (IV 20.0%, delta 0.391, 31d to expiry, strike 2.3% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $15.18 on 2024-08-13 to roll up-and-out. Buyback cost: $712/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-1,249

**Trade 8 — 2024-10-30**
- Spot at entry: $580.01
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $590 call expiring 2024-11-29 for $6.46 (IV 15.1%, delta 0.390, 30d to expiry, strike 1.7% OTM)
- Outcome: Option mid fell to $2.87 (≤ 50% of entry mid $6.46) on 2024-11-04. Trader closed at 50% profit. Kept $359 of $646 entry premium.
- Cumulative P&L (option leg, all trades to date): $-890

**Trade 12 — 2025-03-27**
- Spot at entry: $567.08
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $577 call expiring 2025-04-30 for $7.12 (IV 15.1%, delta 0.396, 34d to expiry, strike 1.7% OTM)
- Outcome: Option mid fell to $1.31 (≤ 50% of entry mid $7.12) on 2025-04-03. Trader closed at 50% profit. Kept $580 of $712 entry premium.
- Cumulative P&L (option leg, all trades to date): $-197

**Trade 13 — 2025-05-09**
- Spot at entry: $564.34
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $576 call expiring 2025-06-13 for $8.36 (IV 18.1%, delta 0.396, 35d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $16.57 on 2025-05-12 to roll up-and-out. Buyback cost: $821/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-1,018

**Trade 14 — 2025-10-16**
- Spot at entry: $660.64
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $674 call expiring 2025-11-21 for $9.28 (IV 17.1%, delta 0.393, 36d to expiry, strike 2.0% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $18.61 on 2025-10-27 to roll up-and-out. Buyback cost: $933/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-1,952

**Trade 15 — 2025-11-20**
- Spot at entry: $652.53
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $666 call expiring 2025-12-26 for $10.00 (IV 18.1%, delta 0.396, 36d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $18.70 on 2025-11-25 to roll up-and-out. Buyback cost: $870/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-2,822

**Cadence totals:**

- Total trades (legs): 15  ·  Chains (independent openings): 10  ·  Avg chain length: 1.50
- Expired worthless: 0 (0.0%)
- Closed early at 50% profit: 4 (26.7%)
- Rolled up-and-out (ITM, > 21 DTE): 7 (46.7%)
- Rolled at 21 DTE (defensive, at-risk): 4 (26.7%)
- Assigned (held to expiry, ITM, no roll fired): 0 (0.0%)
- Total capped upside (from assignments): $0
- **Option-leg P&L (sum of trade pnls): $-2,822**

_Note: option-leg P&L is the sum of per-trade pnls. Strategy total P&L (in BACKTEST_RESULTS_SPY.md) adds the underlying's price change × 100 over the window. Alpha = strategy P&L − buy-and-hold P&L._

### Unconditional (every 5 trading days, regardless of regime)

_32 trades total. Showing chronological ledger._

| # | Chain | Entry | DTE | Action | Regime | Outcome | Net $ | Cum $ |
|---|---|---|---|---|---|---|---|---|
| 1 | C1.0 | 2023-01-03 | 31d | Sell 1× $389C exp 2023-02-03 @ $6.33 (δ 0.399) | HOLD | rolled_up_and_out | −$652 | −$652 |
| 2 | C1.1 | 2023-01-11 | 30d | Sell 1× $404C exp 2023-02-10 @ $5.62 (δ 0.384) | UNKNOWN | closed_early_50pct | $318 | −$335 |
| 3 | C2.0 | 2023-01-18 | 30d | Sell 1× $399C exp 2023-02-17 @ $5.42 (δ 0.393) | HOLD | rolled_up_and_out | −$583 | −$918 |
| 4 | C2.1 | 2023-01-26 | 36d | Sell 1× $413C exp 2023-03-03 @ $5.12 (δ 0.378) | UNKNOWN | rolled_up_and_out | −$466 | −$1384 |
| 5 | C3.0 | 2023-02-08 | 30d | Sell 1× $418C exp 2023-03-10 @ $5.44 (δ 0.397) | AVOID | closed_early_50pct | $305 | −$1079 |
| 6 | C4.0 | 2023-02-23 | 36d | Sell 1× $409C exp 2023-03-31 @ $5.32 (δ 0.385) | HOLD | closed_early_50pct | $382 | −$697 |
| 7 | C5.0 | 2023-03-09 | 36d | Sell 1× $400C exp 2023-04-14 @ $5.95 (δ 0.394) | SELL PREMIUM | rolled_at_21_dte | $27 | −$670 |
| 8 | C5.1 | 2023-03-24 | 35d | Sell 1× $404C exp 2023-04-28 @ $6.12 (δ 0.398) | UNKNOWN | rolled_up_and_out | −$573 | −$1242 |
| 9 | C5.2 | 2023-03-31 | 35d | Sell 1× $418C exp 2023-05-05 @ $5.26 (δ 0.382) | UNKNOWN | rolled_at_21_dte | $160 | −$1082 |
| 10 | C6.0 | 2023-10-05 | 36d | Sell 1× $432C exp 2023-11-10 @ $5.57 (δ 0.398) | CAUTION | rolled_up_and_out | −$554 | −$1636 |
| 11 | C7.0 | 2023-10-19 | 36d | Sell 1× $435C exp 2023-11-24 @ $5.70 (δ 0.396) | HOLD | closed_early_50pct | $361 | −$1275 |
| 12 | C8.0 | 2023-10-26 | 36d | Sell 1× $422C exp 2023-12-01 @ $5.89 (δ 0.383) | SELL PREMIUM | rolled_up_and_out | −$772 | −$2047 |
| 13 | C9.0 | 2024-04-18 | 36d | Sell 1× $509C exp 2024-05-24 @ $6.54 (δ 0.397) | HOLD | rolled_at_21_dte | −$218 | −$2265 |
| 14 | C10.0 | 2024-08-06 | 31d | Sell 1× $534C exp 2024-09-06 @ $8.07 (δ 0.391) | SELL PREMIUM | rolled_up_and_out | −$712 | −$2977 |
| 15 | C11.0 | 2024-10-23 | 30d | Sell 1× $588C exp 2024-11-22 @ $6.69 (δ 0.389) | CAUTION | rolled_at_21_dte | $321 | −$2656 |
| 16 | C11.1 | 2024-11-01 | 35d | Sell 1× $582C exp 2024-12-06 @ $8.06 (δ 0.396) | UNKNOWN | rolled_up_and_out | −$856 | −$3511 |
| 17 | C12.0 | 2024-12-19 | 36d | Sell 1× $597C exp 2025-01-24 @ $7.18 (δ 0.392) | HOLD | rolled_up_and_out | −$489 | −$4000 |
| 18 | C13.0 | 2025-01-14 | 31d | Sell 1× $592C exp 2025-02-14 @ $7.06 (δ 0.392) | AVOID | rolled_up_and_out | −$629 | −$4630 |
| 19 | C14.0 | 2025-02-27 | 32d | Sell 1× $595C exp 2025-03-31 @ $7.31 (δ 0.394) | SELL PREMIUM | closed_early_50pct | $378 | −$4252 |
| 20 | C15.0 | 2025-03-06 | 36d | Sell 1× $585C exp 2025-04-11 @ $9.42 (δ 0.400) | HOLD | closed_early_50pct | $582 | −$3670 |
| 21 | C16.0 | 2025-03-13 | 35d | Sell 1× $564C exp 2025-04-17 @ $9.47 (δ 0.395) | SELL PREMIUM | rolled_up_and_out | −$453 | −$4122 |
| 22 | C16.1 | 2025-03-17 | 31d | Sell 1× $577C exp 2025-04-17 @ $6.98 (δ 0.396) | UNKNOWN | rolled_at_21_dte | $187 | −$3935 |
| 23 | C16.2 | 2025-03-27 | 34d | Sell 1× $577C exp 2025-04-30 @ $7.12 (δ 0.396) | HOLD | closed_early_50pct | $580 | −$3354 |
| 24 | C17.0 | 2025-04-03 | 36d | Sell 1× $551C exp 2025-05-09 @ $10.82 (δ 0.399) | HOLD | closed_early_50pct | $632 | −$2722 |
| 25 | C18.0 | 2025-04-10 | 36d | Sell 1× $543C exp 2025-05-16 @ $13.79 (δ 0.400) | CAUTION | closed_early_50pct | $900 | −$1822 |
| 26 | C19.0 | 2025-04-25 | 35d | Sell 1× $563C exp 2025-05-30 @ $9.18 (δ 0.397) | HOLD | rolled_up_and_out | −$641 | −$2464 |
| 27 | C19.1 | 2025-05-02 | 35d | Sell 1× $579C exp 2025-06-06 @ $8.10 (δ 0.383) | AVOID | rolled_up_and_out | −$481 | −$2944 |
| 28 | C20.0 | 2025-05-23 | 35d | Sell 1× $590C exp 2025-06-27 @ $7.44 (δ 0.388) | HOLD | rolled_up_and_out | −$527 | −$3472 |
| 29 | C21.0 | 2025-10-16 | 36d | Sell 1× $674C exp 2025-11-21 @ $9.28 (δ 0.393) | SELL PREMIUM | rolled_up_and_out | −$933 | −$4405 |
| 30 | C22.0 | 2025-10-30 | 36d | Sell 1× $692C exp 2025-12-05 @ $8.64 (δ 0.394) | CAUTION | closed_early_50pct | $486 | −$3918 |
| 31 | C23.0 | 2025-11-06 | 36d | Sell 1× $683C exp 2025-12-12 @ $9.03 (δ 0.394) | CAUTION | closed_early_50pct | $510 | −$3409 |
| 32 | C24.0 | 2025-11-20 | 36d | Sell 1× $666C exp 2025-12-26 @ $10.00 (δ 0.396) | SELL PREMIUM | rolled_up_and_out | −$870 | −$4279 |

_Chain labels: C1.0 = first trade in chain 1; C1.1 = first roll in chain 1 (same opening, rolled forward); etc._

**Walkthrough (showing detailed narrative for select trades):**

**Trade 1 — 2023-01-03**
- Spot at entry: $380.82
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $389 call expiring 2023-02-03 for $6.33 (IV 21.0%, delta 0.399, 31d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $12.86 on 2023-01-11 to roll up-and-out. Buyback cost: $652/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-652

**Trade 2 — 2023-01-11**
- Spot at entry: $395.52
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $404 call expiring 2023-02-10 for $5.62 (IV 19.0%, delta 0.384, 30d to expiry, strike 2.1% OTM)
- Outcome: Option mid fell to $2.45 (≤ 50% of entry mid $5.62) on 2023-01-18. Trader closed at 50% profit. Kept $318 of $562 entry premium.
- Cumulative P&L (option leg, all trades to date): $-335

**Trade 3 — 2023-01-18**
- Spot at entry: $391.49
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $399 call expiring 2023-02-17 for $5.42 (IV 18.1%, delta 0.393, 30d to expiry, strike 1.9% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $11.25 on 2023-01-26 to roll up-and-out. Buyback cost: $583/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-918

**Trade 4 — 2023-01-26**
- Spot at entry: $404.75
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $413 call expiring 2023-03-03 for $5.12 (IV 15.1%, delta 0.378, 36d to expiry, strike 2.0% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $9.78 on 2023-02-02 to roll up-and-out. Buyback cost: $466/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-1,384

**Trade 5 — 2023-02-08**
- Spot at entry: $410.65
- Regime context: `AVOID` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $418 call expiring 2023-03-10 for $5.44 (IV 17.1%, delta 0.397, 30d to expiry, strike 1.8% OTM)
- Outcome: Option mid fell to $2.39 (≤ 50% of entry mid $5.44) on 2023-02-17. Trader closed at 50% profit. Kept $305 of $544 entry premium.
- Cumulative P&L (option leg, all trades to date): $-1,079

**Trade 6 — 2023-02-23**
- Spot at entry: $400.66
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $409 call expiring 2023-03-31 for $5.32 (IV 16.1%, delta 0.385, 36d to expiry, strike 2.1% OTM)
- Outcome: Option mid fell to $1.50 (≤ 50% of entry mid $5.32) on 2023-03-09. Trader closed at 50% profit. Kept $382 of $532 entry premium.
- Cumulative P&L (option leg, all trades to date): $-697

**Trade 7 — 2023-03-09**
- Spot at entry: $391.56
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $400 call expiring 2023-04-14 for $5.95 (IV 18.1%, delta 0.394, 36d to expiry, strike 2.2% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $5.68 on 2023-03-24. Net on this leg: $27. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $-670

**Trade 8 — 2023-03-24**
- Spot at entry: $395.75
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $404 call expiring 2023-04-28 for $6.12 (IV 18.1%, delta 0.398, 35d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $11.84 on 2023-03-31 to roll up-and-out. Buyback cost: $573/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-1,242

**Trade 29 — 2025-10-16**
- Spot at entry: $660.64
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $674 call expiring 2025-11-21 for $9.28 (IV 17.1%, delta 0.393, 36d to expiry, strike 2.0% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $18.61 on 2025-10-27 to roll up-and-out. Buyback cost: $933/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-4,405

**Trade 30 — 2025-10-30**
- Spot at entry: $679.83
- Regime context: `CAUTION` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $692 call expiring 2025-12-05 for $8.64 (IV 15.1%, delta 0.394, 36d to expiry, strike 1.8% OTM)
- Outcome: Option mid fell to $3.78 (≤ 50% of entry mid $8.64) on 2025-11-06. Trader closed at 50% profit. Kept $486 of $864 entry premium.
- Cumulative P&L (option leg, all trades to date): $-3,918

**Trade 31 — 2025-11-06**
- Spot at entry: $670.31
- Regime context: `CAUTION` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $683 call expiring 2025-12-12 for $9.03 (IV 16.1%, delta 0.394, 36d to expiry, strike 1.9% OTM)
- Outcome: Option mid fell to $3.93 (≤ 50% of entry mid $9.03) on 2025-11-18. Trader closed at 50% profit. Kept $510 of $902 entry premium.
- Cumulative P&L (option leg, all trades to date): $-3,409

**Trade 32 — 2025-11-20**
- Spot at entry: $652.53
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $666 call expiring 2025-12-26 for $10.00 (IV 18.1%, delta 0.396, 36d to expiry, strike 2.1% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $18.70 on 2025-11-25 to roll up-and-out. Buyback cost: $870/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-4,279

**Cadence totals:**

- Total trades (legs): 32  ·  Chains (independent openings): 24  ·  Avg chain length: 1.33
- Expired worthless: 0 (0.0%)
- Closed early at 50% profit: 11 (34.4%)
- Rolled up-and-out (ITM, > 21 DTE): 16 (50.0%)
- Rolled at 21 DTE (defensive, at-risk): 5 (15.6%)
- Assigned (held to expiry, ITM, no roll fired): 0 (0.0%)
- Total capped upside (from assignments): $0
- **Option-leg P&L (sum of trade pnls): $-4,279**

_Note: option-leg P&L is the sum of per-trade pnls. Strategy total P&L (in BACKTEST_RESULTS_SPY.md) adds the underlying's price change × 100 over the window. Alpha = strategy P&L − buy-and-hold P&L._

---

## CUSTOM strategy (latest run: `SPY:custom:1075:both:20260425T231541:ba6826`)

**Window:** 2023-01-02 → 2025-12-12 (1075-day lookback).
**Cadence:** entry every 5 trading days.
**Path-dependent:** trades close mid-window when option mid hits ≤ 50% of entry; otherwise held to expiry.

**Alpha summary** (alpha = strategy P&L − buy-and-hold P&L):

- **Regime-gated:** 55 trades · strategy P&L $24,435 · buy-and-hold P&L $30,094 · **alpha −$5,659**
- **Unconditional:** 132 trades · strategy P&L $23,069 · buy-and-hold P&L $30,094 · **alpha −$7,025**
- **Engine edge** (regime-gated minus unconditional, NOT alpha): alpha lift $1,366, sharpe lift +0.09

### Regime-gated (only when SELL PREMIUM signal active)

_55 trades total. Showing chronological ledger._

| # | Chain | Entry | DTE | Action | Regime | Outcome | Net $ | Cum $ |
|---|---|---|---|---|---|---|---|---|
| 1 | C1.0 | 2023-02-01 | 30d | Sell 1× $413C exp 2023-03-03 @ $7.56 (δ 0.495) | SELL PREMIUM | rolled_up_and_out | −$222 | −$222 |
| 2 | C1.1 | 2023-02-02 | 36d | Sell 1× $420C exp 2023-03-10 @ $7.00 (δ 0.480) | UNKNOWN | closed_early_50pct | $466 | $245 |
| 3 | C2.0 | 2023-03-09 | 36d | Sell 1× $395C exp 2023-04-14 @ $8.31 (δ 0.482) | SELL PREMIUM | rolled_up_and_out | −$289 | −$44 |
| 4 | C2.1 | 2023-03-21 | 31d | Sell 1× $402C exp 2023-04-21 @ $8.02 (δ 0.484) | UNKNOWN | rolled_at_21_dte | −$399 | −$443 |
| 5 | C2.2 | 2023-03-31 | 35d | Sell 1× $412C exp 2023-05-05 @ $8.29 (δ 0.498) | UNKNOWN | rolled_at_21_dte | $146 | −$297 |
| 6 | C2.3 | 2023-04-14 | 35d | Sell 1× $415C exp 2023-05-19 @ $7.34 (δ 0.497) | SELL PREMIUM | closed_early_50pct | $379 | $82 |
| 7 | C3.0 | 2023-04-28 | 35d | Sell 1× $419C exp 2023-06-02 @ $6.18 (δ 0.482) | SELL PREMIUM | closed_early_50pct | $316 | $398 |
| 8 | C4.0 | 2023-10-12 | 36d | Sell 1× $437C exp 2023-11-17 @ $7.36 (δ 0.487) | SELL PREMIUM | closed_early_50pct | $490 | $888 |
| 9 | C5.0 | 2023-10-26 | 36d | Sell 1× $416C exp 2023-12-01 @ $8.89 (δ 0.490) | SELL PREMIUM | rolled_up_and_out | −$134 | $754 |
| 10 | C5.1 | 2023-10-31 | 31d | Sell 1× $421C exp 2023-12-01 @ $7.24 (δ 0.491) | UNKNOWN | rolled_up_and_out | −$716 | $38 |
| 11 | C5.2 | 2023-11-02 | 36d | Sell 1× $434C exp 2023-12-08 @ $6.73 (δ 0.487) | HOLD | rolled_up_and_out | −$288 | −$250 |
| 12 | C5.3 | 2023-11-07 | 31d | Sell 1× $440C exp 2023-12-08 @ $5.89 (δ 0.479) | UNKNOWN | rolled_up_and_out | −$694 | −$944 |
| 13 | C5.4 | 2023-11-14 | 31d | Sell 1× $452C exp 2023-12-15 @ $5.58 (δ 0.476) | UNKNOWN | rolled_up_and_out | −$181 | −$1125 |
| 14 | C5.5 | 2023-11-20 | 32d | Sell 1× $457C exp 2023-12-22 @ $4.96 (δ 0.488) | UNKNOWN | rolled_at_21_dte | −$124 | −$1249 |
| 15 | C5.6 | 2023-12-01 | 35d | Sell 1× $462C exp 2024-01-05 @ $5.00 (δ 0.489) | CAUTION | rolled_up_and_out | −$526 | −$1775 |
| 16 | C5.7 | 2023-12-13 | 37d | Sell 1× $474C exp 2024-01-19 @ $4.79 (δ 0.475) | UNKNOWN | rolled_up_and_out | −$306 | −$2080 |
| 17 | C5.8 | 2023-12-27 | 35d | Sell 1× $480C exp 2024-01-31 @ $6.04 (δ 0.482) | UNKNOWN | closed_early_50pct | $386 | −$1694 |
| 18 | C6.0 | 2024-02-21 | 36d | Sell 1× $501C exp 2024-03-28 @ $6.28 (δ 0.481) | SELL PREMIUM | rolled_up_and_out | −$593 | −$2286 |
| 19 | C6.1 | 2024-02-22 | 35d | Sell 1× $511C exp 2024-03-28 @ $6.20 (δ 0.484) | UNKNOWN | rolled_at_21_dte | −$212 | −$2498 |
| 20 | C6.2 | 2024-03-07 | 36d | Sell 1× $518C exp 2024-04-12 @ $6.82 (δ 0.497) | UNKNOWN | rolled_up_and_out | −$245 | −$2743 |
| 21 | C6.3 | 2024-03-21 | 36d | Sell 1× $526C exp 2024-04-26 @ $6.83 (δ 0.485) | UNKNOWN | closed_early_50pct | $446 | −$2297 |
| 22 | C7.0 | 2024-07-30 | 31d | Sell 1× $545C exp 2024-08-30 @ $8.24 (δ 0.497) | SELL PREMIUM | rolled_up_and_out | −$678 | −$2974 |
| 23 | C7.1 | 2024-07-31 | 37d | Sell 1× $555C exp 2024-09-06 @ $9.62 (δ 0.490) | UNKNOWN | closed_early_50pct | $582 | −$2392 |
| 24 | C8.0 | 2024-08-06 | 31d | Sell 1× $526C exp 2024-09-06 @ $12.38 (δ 0.495) | SELL PREMIUM | rolled_up_and_out | −$372 | −$2764 |
| 25 | C8.1 | 2024-08-08 | 36d | Sell 1× $535C exp 2024-09-13 @ $11.86 (δ 0.493) | UNKNOWN | rolled_up_and_out | −$402 | −$3166 |
| 26 | C8.2 | 2024-08-13 | 31d | Sell 1× $546C exp 2024-09-13 @ $8.66 (δ 0.484) | AVOID | rolled_up_and_out | −$506 | −$3672 |
| 27 | C8.3 | 2024-08-15 | 36d | Sell 1× $557C exp 2024-09-20 @ $7.68 (δ 0.489) | UNKNOWN | rolled_up_and_out | −$432 | −$4104 |
| 28 | C8.4 | 2024-08-21 | 30d | Sell 1× $564C exp 2024-09-20 @ $7.54 (δ 0.488) | UNKNOWN | rolled_at_21_dte | $114 | −$3990 |
| 29 | C8.5 | 2024-08-30 | 35d | Sell 1× $567C exp 2024-10-04 @ $6.54 (δ 0.495) | UNKNOWN | closed_early_50pct | $335 | −$3655 |
| 30 | C9.0 | 2024-09-04 | 30d | Sell 1× $554C exp 2024-10-04 @ $8.55 (δ 0.497) | SELL PREMIUM | closed_early_50pct | $447 | −$3208 |
| 31 | C10.0 | 2024-10-30 | 30d | Sell 1× $583C exp 2024-11-29 @ $10.12 (δ 0.499) | SELL PREMIUM | rolled_up_and_out | −$405 | −$3613 |
| 32 | C10.1 | 2024-11-06 | 30d | Sell 1× $594C exp 2024-12-06 @ $8.38 (δ 0.497) | AVOID | rolled_up_and_out | −$346 | −$3958 |
| 33 | C10.2 | 2024-11-08 | 35d | Sell 1× $602C exp 2024-12-13 @ $8.27 (δ 0.487) | UNKNOWN | closed_early_50pct | $578 | −$3380 |
| 34 | C11.0 | 2025-02-27 | 32d | Sell 1× $588C exp 2025-03-31 @ $10.97 (δ 0.499) | SELL PREMIUM | rolled_up_and_out | −$376 | −$3756 |
| 35 | C11.1 | 2025-02-28 | 35d | Sell 1× $598C exp 2025-04-04 @ $9.85 (δ 0.496) | UNKNOWN | closed_early_50pct | $526 | −$3229 |
| 36 | C12.0 | 2025-03-13 | 35d | Sell 1× $555C exp 2025-04-17 @ $14.14 (δ 0.500) | SELL PREMIUM | rolled_up_and_out | −$352 | −$3580 |
| 37 | C12.1 | 2025-03-14 | 34d | Sell 1× $566C exp 2025-04-17 @ $11.04 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$478 | −$4058 |
| 38 | C12.2 | 2025-03-24 | 32d | Sell 1× $577C exp 2025-04-25 @ $10.03 (δ 0.498) | UNKNOWN | closed_early_50pct | $706 | −$3352 |
| 39 | C13.0 | 2025-05-09 | 35d | Sell 1× $568C exp 2025-06-13 @ $12.59 (δ 0.496) | SELL PREMIUM | rolled_up_and_out | −$1002 | −$4355 |
| 40 | C13.1 | 2025-05-12 | 32d | Sell 1× $586C exp 2025-06-13 @ $10.07 (δ 0.497) | UNKNOWN | rolled_up_and_out | −$387 | −$4742 |
| 41 | C13.2 | 2025-05-15 | 36d | Sell 1× $594C exp 2025-06-20 @ $9.84 (δ 0.494) | UNKNOWN | closed_early_50pct | $507 | −$4234 |
| 42 | C14.0 | 2025-06-02 | 31d | Sell 1× $596C exp 2025-07-03 @ $9.14 (δ 0.490) | SELL PREMIUM | rolled_up_and_out | −$178 | −$4412 |
| 43 | C14.1 | 2025-06-06 | 35d | Sell 1× $603C exp 2025-07-11 @ $8.68 (δ 0.484) | UNKNOWN | rolled_at_21_dte | $319 | −$4093 |
| 44 | C14.2 | 2025-06-20 | 35d | Sell 1× $598C exp 2025-07-25 @ $11.80 (δ 0.500) | UNKNOWN | rolled_up_and_out | −$591 | −$4684 |
| 45 | C14.3 | 2025-06-24 | 31d | Sell 1× $610C exp 2025-07-25 @ $9.21 (δ 0.493) | AVOID | rolled_up_and_out | −$388 | −$5072 |
| 46 | C14.4 | 2025-06-27 | 34d | Sell 1× $618C exp 2025-07-31 @ $9.46 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$580 | −$5652 |
| 47 | C14.5 | 2025-07-03 | 36d | Sell 1× $629C exp 2025-08-08 @ $10.15 (δ 0.493) | UNKNOWN | rolled_at_21_dte | $227 | −$5425 |
| 48 | C14.6 | 2025-07-18 | 35d | Sell 1× $631C exp 2025-08-22 @ $9.99 (δ 0.496) | UNKNOWN | rolled_up_and_out | −$299 | −$5724 |
| 49 | C14.7 | 2025-07-23 | 30d | Sell 1× $637C exp 2025-08-22 @ $9.12 (δ 0.499) | HOLD | closed_early_50pct | $602 | −$5123 |
| 50 | C15.0 | 2025-10-16 | 36d | Sell 1× $665C exp 2025-11-21 @ $14.19 (δ 0.494) | SELL PREMIUM | rolled_up_and_out | −$350 | −$5472 |
| 51 | C15.1 | 2025-10-20 | 32d | Sell 1× $675C exp 2025-11-21 @ $11.00 (δ 0.490) | UNKNOWN | rolled_up_and_out | −$684 | −$6157 |
| 52 | C15.2 | 2025-10-27 | 32d | Sell 1× $689C exp 2025-11-28 @ $9.86 (δ 0.489) | UNKNOWN | closed_early_50pct | $498 | −$5659 |
| 53 | C16.0 | 2025-11-20 | 36d | Sell 1× $657C exp 2025-12-26 @ $14.87 (δ 0.492) | SELL PREMIUM | rolled_up_and_out | −$727 | −$6386 |
| 54 | C16.1 | 2025-11-24 | 32d | Sell 1× $672C exp 2025-12-26 @ $11.79 (δ 0.496) | UNKNOWN | rolled_up_and_out | −$498 | −$6884 |
| 55 | C16.2 | 2025-11-26 | 35d | Sell 1× $683C exp 2025-12-31 @ $10.43 (δ 0.497) | UNKNOWN | rolled_at_21_dte | −$7 | −$6892 |

_Chain labels: C1.0 = first trade in chain 1; C1.1 = first roll in chain 1 (same opening, rolled forward); etc._

**Walkthrough (showing detailed narrative for select trades):**

**Trade 1 — 2023-02-01**
- Spot at entry: $410.80
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $413 call expiring 2023-03-03 for $7.56 (IV 17.1%, delta 0.495, 30d to expiry, strike 0.5% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $9.78 on 2023-02-02 to roll up-and-out. Buyback cost: $222/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-222

**Trade 2 — 2023-02-02**
- Spot at entry: $416.78
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $420 call expiring 2023-03-10 for $7.00 (IV 14.2%, delta 0.480, 36d to expiry, strike 0.8% OTM)
- Outcome: Option mid fell to $2.34 (≤ 50% of entry mid $7.00) on 2023-02-16. Trader closed at 50% profit. Kept $466 of $700 entry premium.
- Cumulative P&L (option leg, all trades to date): $245

**Trade 3 — 2023-03-09**
- Spot at entry: $391.56
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $395 call expiring 2023-04-14 for $8.31 (IV 18.1%, delta 0.482, 36d to expiry, strike 0.9% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $11.20 on 2023-03-21 to roll up-and-out. Buyback cost: $289/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-44

**Trade 4 — 2023-03-21**
- Spot at entry: $398.91
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $402 call expiring 2023-04-21 for $8.02 (IV 19.0%, delta 0.484, 31d to expiry, strike 0.8% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $12.00 on 2023-03-31. Net on this leg: −$399. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $-443

**Trade 5 — 2023-03-31**
- Spot at entry: $409.39
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $412 call expiring 2023-05-05 for $8.29 (IV 17.1%, delta 0.498, 35d to expiry, strike 0.6% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $6.84 on 2023-04-14. Net on this leg: $146. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $-297

**Trade 6 — 2023-04-14**
- Spot at entry: $412.46
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $415 call expiring 2023-05-19 for $7.34 (IV 15.1%, delta 0.497, 35d to expiry, strike 0.6% OTM)
- Outcome: Option mid fell to $3.55 (≤ 50% of entry mid $7.34) on 2023-04-25. Trader closed at 50% profit. Kept $379 of $734 entry premium.
- Cumulative P&L (option leg, all trades to date): $82

**Trade 7 — 2023-04-28**
- Spot at entry: $415.93
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $419 call expiring 2023-06-02 for $6.18 (IV 13.2%, delta 0.482, 35d to expiry, strike 0.7% OTM)
- Outcome: Option mid fell to $3.02 (≤ 50% of entry mid $6.18) on 2023-05-03. Trader closed at 50% profit. Kept $316 of $618 entry premium.
- Cumulative P&L (option leg, all trades to date): $398

**Trade 8 — 2023-10-12**
- Spot at entry: $433.66
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $437 call expiring 2023-11-17 for $7.36 (IV 14.2%, delta 0.487, 36d to expiry, strike 0.8% OTM)
- Outcome: Option mid fell to $2.46 (≤ 50% of entry mid $7.36) on 2023-10-20. Trader closed at 50% profit. Kept $490 of $736 entry premium.
- Cumulative P&L (option leg, all trades to date): $888

**Trade 52 — 2025-10-27**
- Spot at entry: $685.24
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $689 call expiring 2025-11-28 for $9.86 (IV 13.2%, delta 0.489, 32d to expiry, strike 0.5% OTM)
- Outcome: Option mid fell to $4.88 (≤ 50% of entry mid $9.86) on 2025-11-04. Trader closed at 50% profit. Kept $498 of $986 entry premium.
- Cumulative P&L (option leg, all trades to date): $-5,659

**Trade 53 — 2025-11-20**
- Spot at entry: $652.53
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $657 call expiring 2025-12-26 for $14.87 (IV 19.0%, delta 0.492, 36d to expiry, strike 0.7% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $22.14 on 2025-11-24 to roll up-and-out. Buyback cost: $727/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-6,386

**Trade 54 — 2025-11-24**
- Spot at entry: $668.73
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $672 call expiring 2025-12-26 for $11.79 (IV 15.1%, delta 0.496, 32d to expiry, strike 0.5% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $16.77 on 2025-11-26 to roll up-and-out. Buyback cost: $498/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-6,884

**Trade 55 — 2025-11-26**
- Spot at entry: $679.68
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $683 call expiring 2025-12-31 for $10.43 (IV 13.2%, delta 0.497, 35d to expiry, strike 0.5% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $10.50 on 2025-12-10. Net on this leg: −$7. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $-6,892

**Cadence totals:**

- Total trades (legs): 55  ·  Chains (independent openings): 16  ·  Avg chain length: 3.44
- Expired worthless: 0 (0.0%)
- Closed early at 50% profit: 15 (27.3%)
- Rolled up-and-out (ITM, > 21 DTE): 32 (58.2%)
- Rolled at 21 DTE (defensive, at-risk): 8 (14.5%)
- Assigned (held to expiry, ITM, no roll fired): 0 (0.0%)
- Total capped upside (from assignments): $0
- **Option-leg P&L (sum of trade pnls): $-6,892**

_Note: option-leg P&L is the sum of per-trade pnls. Strategy total P&L (in BACKTEST_RESULTS_SPY.md) adds the underlying's price change × 100 over the window. Alpha = strategy P&L − buy-and-hold P&L._

### Unconditional (every 5 trading days, regardless of regime)

_132 trades total. Showing chronological ledger._

| # | Chain | Entry | DTE | Action | Regime | Outcome | Net $ | Cum $ |
|---|---|---|---|---|---|---|---|---|
| 1 | C1.0 | 2023-01-03 | 31d | Sell 1× $384C exp 2023-02-03 @ $8.68 (δ 0.484) | HOLD | rolled_up_and_out | −$303 | −$303 |
| 2 | C1.1 | 2023-01-06 | 35d | Sell 1× $391C exp 2023-02-10 @ $8.71 (δ 0.489) | UNKNOWN | rolled_up_and_out | −$381 | −$684 |
| 3 | C1.2 | 2023-01-11 | 30d | Sell 1× $398C exp 2023-02-10 @ $8.45 (δ 0.493) | UNKNOWN | closed_early_50pct | $507 | −$177 |
| 4 | C2.0 | 2023-01-25 | 37d | Sell 1× $403C exp 2023-03-03 @ $8.14 (δ 0.495) | AVOID | rolled_up_and_out | −$270 | −$448 |
| 5 | C2.1 | 2023-01-27 | 35d | Sell 1× $408C exp 2023-03-03 @ $7.86 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$283 | −$731 |
| 6 | C2.2 | 2023-02-01 | 30d | Sell 1× $413C exp 2023-03-03 @ $7.56 (δ 0.495) | SELL PREMIUM | rolled_up_and_out | −$222 | −$953 |
| 7 | C2.3 | 2023-02-02 | 36d | Sell 1× $420C exp 2023-03-10 @ $7.00 (δ 0.480) | UNKNOWN | closed_early_50pct | $466 | −$486 |
| 8 | C3.0 | 2023-02-23 | 36d | Sell 1× $404C exp 2023-03-31 @ $7.71 (δ 0.483) | HOLD | closed_early_50pct | $503 | $17 |
| 9 | C4.0 | 2023-03-09 | 36d | Sell 1× $395C exp 2023-04-14 @ $8.31 (δ 0.482) | SELL PREMIUM | rolled_up_and_out | −$289 | −$272 |
| 10 | C4.1 | 2023-03-21 | 31d | Sell 1× $402C exp 2023-04-21 @ $8.02 (δ 0.484) | UNKNOWN | rolled_at_21_dte | −$399 | −$671 |
| 11 | C4.2 | 2023-03-31 | 35d | Sell 1× $412C exp 2023-05-05 @ $8.29 (δ 0.498) | UNKNOWN | rolled_at_21_dte | $146 | −$525 |
| 12 | C4.3 | 2023-04-14 | 35d | Sell 1× $415C exp 2023-05-19 @ $7.34 (δ 0.497) | SELL PREMIUM | closed_early_50pct | $379 | −$146 |
| 13 | C5.0 | 2023-04-28 | 35d | Sell 1× $419C exp 2023-06-02 @ $6.18 (δ 0.482) | SELL PREMIUM | closed_early_50pct | $316 | $170 |
| 14 | C6.0 | 2023-05-05 | 35d | Sell 1× $416C exp 2023-06-09 @ $6.38 (δ 0.479) | HOLD | rolled_up_and_out | −$168 | $2 |
| 15 | C6.1 | 2023-05-18 | 36d | Sell 1× $422C exp 2023-06-23 @ $5.70 (δ 0.489) | UNKNOWN | closed_early_50pct | $310 | $311 |
| 16 | C7.0 | 2023-05-26 | 35d | Sell 1× $423C exp 2023-06-30 @ $5.94 (δ 0.484) | CAUTION | rolled_up_and_out | −$295 | $16 |
| 17 | C7.1 | 2023-06-02 | 35d | Sell 1× $431C exp 2023-07-07 @ $4.78 (δ 0.477) | UNKNOWN | rolled_up_and_out | −$201 | −$185 |
| 18 | C7.2 | 2023-06-12 | 32d | Sell 1× $436C exp 2023-07-14 @ $4.91 (δ 0.498) | AVOID | rolled_up_and_out | −$486 | −$671 |
| 19 | C7.3 | 2023-06-15 | 36d | Sell 1× $446C exp 2023-07-21 @ $4.76 (δ 0.470) | UNKNOWN | closed_early_50pct | $291 | −$380 |
| 20 | C8.0 | 2023-06-27 | 31d | Sell 1× $439C exp 2023-07-28 @ $5.22 (δ 0.480) | AVOID | rolled_up_and_out | −$389 | −$769 |
| 21 | C8.1 | 2023-06-30 | 35d | Sell 1× $446C exp 2023-08-04 @ $5.59 (δ 0.491) | UNKNOWN | rolled_up_and_out | −$237 | −$1006 |
| 22 | C8.2 | 2023-07-13 | 36d | Sell 1× $454C exp 2023-08-18 @ $5.09 (δ 0.453) | UNKNOWN | rolled_at_21_dte | −$225 | −$1231 |
| 23 | C8.3 | 2023-07-28 | 35d | Sell 1× $460C exp 2023-09-01 @ $5.94 (δ 0.489) | UNKNOWN | closed_early_50pct | $307 | −$924 |
| 24 | C9.0 | 2023-08-09 | 30d | Sell 1× $449C exp 2023-09-08 @ $6.55 (δ 0.480) | AVOID | closed_early_50pct | $376 | −$548 |
| 25 | C10.0 | 2023-08-16 | 30d | Sell 1× $442C exp 2023-09-15 @ $7.04 (δ 0.499) | AVOID | rolled_at_21_dte | $222 | −$327 |
| 26 | C10.1 | 2023-08-25 | 35d | Sell 1× $443C exp 2023-09-29 @ $6.05 (δ 0.489) | UNKNOWN | rolled_up_and_out | −$486 | −$813 |
| 27 | C10.2 | 2023-08-29 | 31d | Sell 1× $452C exp 2023-09-29 @ $5.17 (δ 0.482) | UNKNOWN | closed_early_50pct | $262 | −$550 |
| 28 | C11.0 | 2023-09-07 | 36d | Sell 1× $448C exp 2023-10-13 @ $5.87 (δ 0.499) | AVOID | rolled_up_and_out | −$155 | −$705 |
| 29 | C11.1 | 2023-09-14 | 36d | Sell 1× $453C exp 2023-10-20 @ $5.05 (δ 0.498) | HOLD | closed_early_50pct | $356 | −$350 |
| 30 | C12.0 | 2023-09-21 | 36d | Sell 1× $435C exp 2023-10-27 @ $7.25 (δ 0.481) | AVOID | closed_early_50pct | $469 | $119 |
| 31 | C13.0 | 2023-10-05 | 36d | Sell 1× $428C exp 2023-11-10 @ $8.07 (δ 0.496) | CAUTION | rolled_up_and_out | −$438 | −$319 |
| 32 | C13.1 | 2023-10-09 | 32d | Sell 1× $435C exp 2023-11-10 @ $7.70 (δ 0.496) | UNKNOWN | closed_early_50pct | $396 | $77 |
| 33 | C14.0 | 2023-10-19 | 36d | Sell 1× $430C exp 2023-11-24 @ $8.29 (δ 0.488) | HOLD | closed_early_50pct | $464 | $541 |
| 34 | C15.0 | 2023-10-26 | 36d | Sell 1× $416C exp 2023-12-01 @ $8.89 (δ 0.490) | SELL PREMIUM | rolled_up_and_out | −$134 | $407 |
| 35 | C15.1 | 2023-10-31 | 31d | Sell 1× $421C exp 2023-12-01 @ $7.24 (δ 0.491) | UNKNOWN | rolled_up_and_out | −$716 | −$309 |
| 36 | C15.2 | 2023-11-02 | 36d | Sell 1× $434C exp 2023-12-08 @ $6.73 (δ 0.487) | HOLD | rolled_up_and_out | −$288 | −$597 |
| 37 | C15.3 | 2023-11-07 | 31d | Sell 1× $440C exp 2023-12-08 @ $5.89 (δ 0.479) | UNKNOWN | rolled_up_and_out | −$694 | −$1291 |
| 38 | C15.4 | 2023-11-14 | 31d | Sell 1× $452C exp 2023-12-15 @ $5.58 (δ 0.476) | UNKNOWN | rolled_up_and_out | −$181 | −$1472 |
| 39 | C15.5 | 2023-11-20 | 32d | Sell 1× $457C exp 2023-12-22 @ $4.96 (δ 0.488) | UNKNOWN | rolled_at_21_dte | −$124 | −$1596 |
| 40 | C15.6 | 2023-12-01 | 35d | Sell 1× $462C exp 2024-01-05 @ $5.00 (δ 0.489) | CAUTION | rolled_up_and_out | −$526 | −$2122 |
| 41 | C15.7 | 2023-12-13 | 30d | Sell 1× $474C exp 2024-01-12 @ $4.01 (δ 0.454) | UNKNOWN | rolled_at_21_dte | −$159 | −$2280 |
| 42 | C15.8 | 2023-12-22 | 35d | Sell 1× $477C exp 2024-01-26 @ $6.03 (δ 0.485) | HOLD | closed_early_50pct | $351 | −$1929 |
| 43 | C16.0 | 2024-01-09 | 31d | Sell 1× $477C exp 2024-02-09 @ $5.55 (δ 0.482) | AVOID | rolled_at_21_dte | −$425 | −$2354 |
| 44 | C16.1 | 2024-01-19 | 35d | Sell 1× $486C exp 2024-02-23 @ $6.12 (δ 0.481) | UNKNOWN | rolled_up_and_out | −$394 | −$2749 |
| 45 | C16.2 | 2024-01-29 | 32d | Sell 1× $494C exp 2024-03-01 @ $6.15 (δ 0.496) | UNKNOWN | closed_early_50pct | $316 | −$2432 |
| 46 | C17.0 | 2024-02-06 | 31d | Sell 1× $497C exp 2024-03-08 @ $5.69 (δ 0.485) | AVOID | rolled_up_and_out | −$398 | −$2831 |
| 47 | C17.1 | 2024-02-09 | 35d | Sell 1× $505C exp 2024-03-15 @ $5.82 (δ 0.476) | UNKNOWN | rolled_at_21_dte | −$188 | −$3019 |
| 48 | C17.2 | 2024-02-23 | 34d | Sell 1× $511C exp 2024-03-28 @ $5.91 (δ 0.491) | UNKNOWN | rolled_at_21_dte | −$241 | −$3260 |
| 49 | C17.3 | 2024-03-07 | 36d | Sell 1× $518C exp 2024-04-12 @ $6.82 (δ 0.497) | UNKNOWN | rolled_up_and_out | −$245 | −$3504 |
| 50 | C17.4 | 2024-03-21 | 36d | Sell 1× $526C exp 2024-04-26 @ $6.83 (δ 0.485) | UNKNOWN | closed_early_50pct | $446 | −$3058 |
| 51 | C18.0 | 2024-04-04 | 36d | Sell 1× $517C exp 2024-05-10 @ $8.39 (δ 0.488) | HOLD | closed_early_50pct | $458 | −$2601 |
| 52 | C19.0 | 2024-04-18 | 36d | Sell 1× $503C exp 2024-05-24 @ $9.55 (δ 0.497) | HOLD | rolled_up_and_out | −$175 | −$2776 |
| 53 | C19.1 | 2024-04-23 | 31d | Sell 1× $509C exp 2024-05-24 @ $7.72 (δ 0.488) | UNKNOWN | rolled_at_21_dte | −$99 | −$2875 |
| 54 | C19.2 | 2024-05-03 | 35d | Sell 1× $515C exp 2024-06-07 @ $7.37 (δ 0.485) | UNKNOWN | rolled_up_and_out | −$396 | −$3271 |
| 55 | C19.3 | 2024-05-09 | 36d | Sell 1× $524C exp 2024-06-14 @ $7.14 (δ 0.486) | AVOID | rolled_up_and_out | −$414 | −$3685 |
| 56 | C19.4 | 2024-05-15 | 37d | Sell 1× $533C exp 2024-06-21 @ $6.32 (δ 0.497) | UNKNOWN | closed_early_50pct | $320 | −$3365 |
| 57 | C20.0 | 2024-05-31 | 35d | Sell 1× $531C exp 2024-07-05 @ $5.70 (δ 0.481) | AVOID | rolled_up_and_out | −$352 | −$3717 |
| 58 | C20.1 | 2024-06-05 | 37d | Sell 1× $538C exp 2024-07-12 @ $6.29 (δ 0.495) | UNKNOWN | rolled_up_and_out | −$243 | −$3961 |
| 59 | C20.2 | 2024-06-12 | 37d | Sell 1× $545C exp 2024-07-19 @ $5.71 (δ 0.486) | UNKNOWN | rolled_up_and_out | −$368 | −$4329 |
| 60 | C20.3 | 2024-06-18 | 31d | Sell 1× $555C exp 2024-07-19 @ $3.99 (δ 0.399) | UNKNOWN | closed_early_50pct | $216 | −$4113 |
| 61 | C21.0 | 2024-07-01 | 32d | Sell 1× $549C exp 2024-08-02 @ $6.22 (δ 0.480) | CAUTION | rolled_up_and_out | −$521 | −$4634 |
| 62 | C21.1 | 2024-07-05 | 35d | Sell 1× $558C exp 2024-08-09 @ $6.66 (δ 0.495) | UNKNOWN | rolled_up_and_out | −$374 | −$5008 |
| 63 | C21.2 | 2024-07-10 | 37d | Sell 1× $565C exp 2024-08-16 @ $7.24 (δ 0.493) | UNKNOWN | closed_early_50pct | $490 | −$4517 |
| 64 | C22.0 | 2024-07-23 | 31d | Sell 1× $557C exp 2024-08-23 @ $7.71 (δ 0.493) | HOLD | closed_early_50pct | $472 | −$4044 |
| 65 | C23.0 | 2024-07-30 | 31d | Sell 1× $545C exp 2024-08-30 @ $8.24 (δ 0.497) | SELL PREMIUM | rolled_up_and_out | −$678 | −$4722 |
| 66 | C23.1 | 2024-07-31 | 37d | Sell 1× $555C exp 2024-09-06 @ $9.62 (δ 0.490) | UNKNOWN | closed_early_50pct | $582 | −$4140 |
| 67 | C24.0 | 2024-08-06 | 31d | Sell 1× $526C exp 2024-09-06 @ $12.38 (δ 0.495) | SELL PREMIUM | rolled_up_and_out | −$372 | −$4512 |
| 68 | C24.1 | 2024-08-08 | 36d | Sell 1× $535C exp 2024-09-13 @ $11.86 (δ 0.493) | UNKNOWN | rolled_up_and_out | −$402 | −$4913 |
| 69 | C24.2 | 2024-08-13 | 31d | Sell 1× $546C exp 2024-09-13 @ $8.66 (δ 0.484) | AVOID | rolled_up_and_out | −$506 | −$5419 |
| 70 | C24.3 | 2024-08-15 | 36d | Sell 1× $557C exp 2024-09-20 @ $7.68 (δ 0.489) | UNKNOWN | rolled_up_and_out | −$432 | −$5852 |
| 71 | C24.4 | 2024-08-21 | 30d | Sell 1× $564C exp 2024-09-20 @ $7.54 (δ 0.488) | UNKNOWN | rolled_at_21_dte | $114 | −$5738 |
| 72 | C24.5 | 2024-08-30 | 35d | Sell 1× $567C exp 2024-10-04 @ $6.54 (δ 0.495) | UNKNOWN | closed_early_50pct | $335 | −$5402 |
| 73 | C25.0 | 2024-09-04 | 30d | Sell 1× $554C exp 2024-10-04 @ $8.55 (δ 0.497) | SELL PREMIUM | closed_early_50pct | $447 | −$4956 |
| 74 | C26.0 | 2024-09-11 | 37d | Sell 1× $558C exp 2024-10-18 @ $8.96 (δ 0.499) | CAUTION | rolled_up_and_out | −$346 | −$5302 |
| 75 | C26.1 | 2024-09-13 | 35d | Sell 1× $566C exp 2024-10-18 @ $7.48 (δ 0.484) | UNKNOWN | rolled_up_and_out | −$381 | −$5682 |
| 76 | C26.2 | 2024-09-19 | 36d | Sell 1× $575C exp 2024-10-25 @ $7.18 (δ 0.482) | UNKNOWN | rolled_at_21_dte | $25 | −$5657 |
| 77 | C26.3 | 2024-10-04 | 35d | Sell 1× $577C exp 2024-11-08 @ $10.58 (δ 0.491) | UNKNOWN | rolled_up_and_out | −$512 | −$6169 |
| 78 | C26.4 | 2024-10-14 | 32d | Sell 1× $588C exp 2024-11-15 @ $9.82 (δ 0.491) | UNKNOWN | rolled_at_21_dte | $444 | −$5726 |
| 79 | C26.5 | 2024-10-25 | 35d | Sell 1× $583C exp 2024-11-29 @ $10.36 (δ 0.491) | UNKNOWN | rolled_up_and_out | −$382 | −$6108 |
| 80 | C26.6 | 2024-11-06 | 37d | Sell 1× $595C exp 2024-12-13 @ $9.14 (δ 0.491) | AVOID | rolled_up_and_out | −$345 | −$6453 |
| 81 | C26.7 | 2024-11-08 | 35d | Sell 1× $602C exp 2024-12-13 @ $8.27 (δ 0.487) | UNKNOWN | closed_early_50pct | $578 | −$5874 |
| 82 | C27.0 | 2024-11-20 | 30d | Sell 1× $594C exp 2024-12-20 @ $8.40 (δ 0.485) | HOLD | rolled_up_and_out | −$224 | −$6099 |
| 83 | C27.1 | 2024-11-25 | 32d | Sell 1× $601C exp 2024-12-27 @ $6.70 (δ 0.483) | UNKNOWN | rolled_up_and_out | −$318 | −$6417 |
| 84 | C27.2 | 2024-12-04 | 30d | Sell 1× $611C exp 2025-01-03 @ $5.28 (δ 0.476) | UNKNOWN | closed_early_50pct | $313 | −$6104 |
| 85 | C28.0 | 2024-12-19 | 36d | Sell 1× $590C exp 2025-01-24 @ $11.00 (δ 0.491) | HOLD | rolled_up_and_out | −$328 | −$6432 |
| 86 | C28.1 | 2024-12-23 | 32d | Sell 1× $598C exp 2025-01-24 @ $9.22 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$200 | −$6632 |
| 87 | C28.2 | 2024-12-24 | 31d | Sell 1× $604C exp 2025-01-24 @ $7.25 (δ 0.495) | UNKNOWN | closed_early_50pct | $499 | −$6133 |
| 88 | C29.0 | 2025-01-06 | 32d | Sell 1× $599C exp 2025-02-07 @ $8.71 (δ 0.484) | HOLD | closed_early_50pct | $580 | −$5554 |
| 89 | C30.0 | 2025-01-14 | 31d | Sell 1× $585C exp 2025-02-14 @ $10.79 (δ 0.500) | AVOID | rolled_up_and_out | −$474 | −$6027 |
| 90 | C30.1 | 2025-01-15 | 37d | Sell 1× $596C exp 2025-02-21 @ $9.29 (δ 0.499) | UNKNOWN | rolled_up_and_out | −$532 | −$6560 |
| 91 | C30.2 | 2025-01-21 | 31d | Sell 1× $606C exp 2025-02-21 @ $8.04 (δ 0.494) | UNKNOWN | rolled_up_and_out | −$327 | −$6886 |
| 92 | C30.3 | 2025-01-23 | 36d | Sell 1× $613C exp 2025-02-28 @ $8.40 (δ 0.495) | UNKNOWN | closed_early_50pct | $501 | −$6386 |
| 93 | C31.0 | 2025-02-05 | 30d | Sell 1× $607C exp 2025-03-07 @ $8.62 (δ 0.497) | HOLD | rolled_at_21_dte | −$53 | −$6438 |
| 94 | C31.1 | 2025-02-14 | 35d | Sell 1× $613C exp 2025-03-21 @ $8.05 (δ 0.493) | UNKNOWN | closed_early_50pct | $446 | −$5992 |
| 95 | C32.0 | 2025-02-27 | 32d | Sell 1× $588C exp 2025-03-31 @ $10.97 (δ 0.499) | SELL PREMIUM | rolled_up_and_out | −$376 | −$6368 |
| 96 | C32.1 | 2025-02-28 | 35d | Sell 1× $598C exp 2025-04-04 @ $9.85 (δ 0.496) | UNKNOWN | closed_early_50pct | $526 | −$5842 |
| 97 | C33.0 | 2025-03-06 | 36d | Sell 1× $577C exp 2025-04-11 @ $13.68 (δ 0.492) | HOLD | closed_early_50pct | $759 | −$5083 |
| 98 | C34.0 | 2025-03-13 | 35d | Sell 1× $555C exp 2025-04-17 @ $14.14 (δ 0.500) | SELL PREMIUM | rolled_up_and_out | −$352 | −$5434 |
| 99 | C34.1 | 2025-03-14 | 34d | Sell 1× $566C exp 2025-04-17 @ $11.04 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$478 | −$5912 |
| 100 | C34.2 | 2025-03-24 | 32d | Sell 1× $577C exp 2025-04-25 @ $10.03 (δ 0.498) | UNKNOWN | closed_early_50pct | $706 | −$5206 |
| 101 | C35.0 | 2025-04-03 | 36d | Sell 1× $545C exp 2025-05-09 @ $13.89 (δ 0.459) | HOLD | closed_early_50pct | $792 | −$4415 |
| 102 | C36.0 | 2025-04-10 | 36d | Sell 1× $530C exp 2025-05-16 @ $21.09 (δ 0.500) | CAUTION | rolled_up_and_out | −$364 | −$4778 |
| 103 | C36.1 | 2025-04-11 | 35d | Sell 1× $539C exp 2025-05-16 @ $19.06 (δ 0.497) | UNKNOWN | closed_early_50pct | $1308 | −$3470 |
| 104 | C37.0 | 2025-04-25 | 35d | Sell 1× $555C exp 2025-05-30 @ $13.39 (δ 0.490) | HOLD | rolled_up_and_out | −$214 | −$3684 |
| 105 | C37.1 | 2025-05-01 | 36d | Sell 1× $562C exp 2025-06-06 @ $13.09 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$505 | −$4188 |
| 106 | C37.2 | 2025-05-02 | 35d | Sell 1× $571C exp 2025-06-06 @ $12.37 (δ 0.489) | AVOID | rolled_up_and_out | −$636 | −$4825 |
| 107 | C37.3 | 2025-05-12 | 32d | Sell 1× $586C exp 2025-06-13 @ $10.07 (δ 0.497) | UNKNOWN | rolled_up_and_out | −$387 | −$5212 |
| 108 | C37.4 | 2025-05-15 | 36d | Sell 1× $594C exp 2025-06-20 @ $9.84 (δ 0.494) | UNKNOWN | closed_early_50pct | $507 | −$4704 |
| 109 | C38.0 | 2025-05-23 | 35d | Sell 1× $583C exp 2025-06-27 @ $11.07 (δ 0.490) | HOLD | rolled_up_and_out | −$570 | −$5274 |
| 110 | C38.1 | 2025-05-27 | 34d | Sell 1× $595C exp 2025-06-30 @ $9.23 (δ 0.486) | UNKNOWN | rolled_up_and_out | −$123 | −$5396 |
| 111 | C38.2 | 2025-06-06 | 35d | Sell 1× $603C exp 2025-07-11 @ $8.68 (δ 0.484) | UNKNOWN | rolled_at_21_dte | $319 | −$5078 |
| 112 | C38.3 | 2025-06-20 | 35d | Sell 1× $598C exp 2025-07-25 @ $11.80 (δ 0.500) | UNKNOWN | rolled_up_and_out | −$591 | −$5669 |
| 113 | C38.4 | 2025-06-24 | 31d | Sell 1× $610C exp 2025-07-25 @ $9.21 (δ 0.493) | AVOID | rolled_up_and_out | −$388 | −$6056 |
| 114 | C38.5 | 2025-06-27 | 34d | Sell 1× $618C exp 2025-07-31 @ $9.46 (δ 0.498) | UNKNOWN | rolled_up_and_out | −$580 | −$6637 |
| 115 | C38.6 | 2025-07-03 | 36d | Sell 1× $629C exp 2025-08-08 @ $10.15 (δ 0.493) | UNKNOWN | rolled_at_21_dte | $227 | −$6410 |
| 116 | C38.7 | 2025-07-18 | 35d | Sell 1× $631C exp 2025-08-22 @ $9.99 (δ 0.496) | UNKNOWN | rolled_up_and_out | −$299 | −$6710 |
| 117 | C38.8 | 2025-07-23 | 37d | Sell 1× $640C exp 2025-08-29 @ $9.00 (δ 0.464) | HOLD | closed_early_50pct | $555 | −$6155 |
| 118 | C39.0 | 2025-08-06 | 30d | Sell 1× $636C exp 2025-09-05 @ $8.93 (δ 0.492) | HOLD | rolled_up_and_out | −$438 | −$6594 |
| 119 | C39.1 | 2025-08-12 | 31d | Sell 1× $646C exp 2025-09-12 @ $8.16 (δ 0.489) | UNKNOWN | rolled_at_21_dte | $88 | −$6506 |
| 120 | C39.2 | 2025-08-22 | 35d | Sell 1× $649C exp 2025-09-26 @ $7.63 (δ 0.487) | UNKNOWN | rolled_at_21_dte | $188 | −$6317 |
| 121 | C39.3 | 2025-09-05 | 35d | Sell 1× $651C exp 2025-10-10 @ $7.70 (δ 0.486) | UNKNOWN | rolled_up_and_out | −$546 | −$6864 |
| 122 | C39.4 | 2025-09-11 | 36d | Sell 1× $661C exp 2025-10-17 @ $8.32 (δ 0.496) | AVOID | rolled_up_and_out | −$548 | −$7411 |
| 123 | C39.5 | 2025-09-22 | 32d | Sell 1× $670C exp 2025-10-24 @ $9.57 (δ 0.495) | UNKNOWN | rolled_at_21_dte | $148 | −$7263 |
| 124 | C39.6 | 2025-10-03 | 35d | Sell 1× $672C exp 2025-11-07 @ $10.50 (δ 0.499) | UNKNOWN | closed_early_50pct | $584 | −$6679 |
| 125 | C40.0 | 2025-10-16 | 36d | Sell 1× $665C exp 2025-11-21 @ $14.19 (δ 0.494) | SELL PREMIUM | rolled_up_and_out | −$350 | −$7028 |
| 126 | C40.1 | 2025-10-20 | 32d | Sell 1× $675C exp 2025-11-21 @ $11.00 (δ 0.490) | UNKNOWN | rolled_up_and_out | −$684 | −$7713 |
| 127 | C40.2 | 2025-10-27 | 32d | Sell 1× $689C exp 2025-11-28 @ $9.86 (δ 0.489) | UNKNOWN | closed_early_50pct | $498 | −$7215 |
| 128 | C41.0 | 2025-11-06 | 36d | Sell 1× $674C exp 2025-12-12 @ $13.92 (δ 0.498) | CAUTION | rolled_up_and_out | −$467 | −$7682 |
| 129 | C41.1 | 2025-11-10 | 32d | Sell 1× $685C exp 2025-12-12 @ $11.39 (δ 0.493) | UNKNOWN | closed_early_50pct | $656 | −$7025 |
| 130 | C42.0 | 2025-11-20 | 36d | Sell 1× $657C exp 2025-12-26 @ $14.87 (δ 0.492) | SELL PREMIUM | rolled_up_and_out | −$727 | −$7752 |
| 131 | C42.1 | 2025-11-24 | 32d | Sell 1× $672C exp 2025-12-26 @ $11.79 (δ 0.496) | UNKNOWN | rolled_up_and_out | −$498 | −$8250 |
| 132 | C42.2 | 2025-11-26 | 35d | Sell 1× $683C exp 2025-12-31 @ $10.43 (δ 0.497) | UNKNOWN | rolled_at_21_dte | −$7 | −$8258 |

_Chain labels: C1.0 = first trade in chain 1; C1.1 = first roll in chain 1 (same opening, rolled forward); etc._

**Walkthrough (showing detailed narrative for select trades):**

**Trade 1 — 2023-01-03**
- Spot at entry: $380.82
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $384 call expiring 2023-02-03 for $8.68 (IV 22.0%, delta 0.484, 31d to expiry, strike 0.8% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $11.71 on 2023-01-06 to roll up-and-out. Buyback cost: $303/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-303

**Trade 2 — 2023-01-06**
- Spot at entry: $388.08
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $391 call expiring 2023-02-10 for $8.71 (IV 19.0%, delta 0.489, 35d to expiry, strike 0.8% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $12.52 on 2023-01-11 to roll up-and-out. Buyback cost: $381/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-684

**Trade 3 — 2023-01-11**
- Spot at entry: $395.52
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $398 call expiring 2023-02-10 for $8.45 (IV 20.0%, delta 0.493, 30d to expiry, strike 0.6% OTM)
- Outcome: Option mid fell to $3.38 (≤ 50% of entry mid $8.45) on 2023-01-19. Trader closed at 50% profit. Kept $507 of $844 entry premium.
- Cumulative P&L (option leg, all trades to date): $-177

**Trade 4 — 2023-01-25**
- Spot at entry: $400.35
- Regime context: `AVOID` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $403 call expiring 2023-03-03 for $8.14 (IV 17.1%, delta 0.495, 37d to expiry, strike 0.7% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $10.85 on 2023-01-27 to roll up-and-out. Buyback cost: $270/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-448

**Trade 5 — 2023-01-27**
- Spot at entry: $405.68
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $408 call expiring 2023-03-03 for $7.86 (IV 16.1%, delta 0.498, 35d to expiry, strike 0.6% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $10.69 on 2023-02-01 to roll up-and-out. Buyback cost: $283/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-731

**Trade 6 — 2023-02-01**
- Spot at entry: $410.80
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $413 call expiring 2023-03-03 for $7.56 (IV 17.1%, delta 0.495, 30d to expiry, strike 0.5% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $9.78 on 2023-02-02 to roll up-and-out. Buyback cost: $222/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-953

**Trade 7 — 2023-02-02**
- Spot at entry: $416.78
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $420 call expiring 2023-03-10 for $7.00 (IV 14.2%, delta 0.480, 36d to expiry, strike 0.8% OTM)
- Outcome: Option mid fell to $2.34 (≤ 50% of entry mid $7.00) on 2023-02-16. Trader closed at 50% profit. Kept $466 of $700 entry premium.
- Cumulative P&L (option leg, all trades to date): $-486

**Trade 8 — 2023-02-23**
- Spot at entry: $400.66
- Regime context: `HOLD` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $404 call expiring 2023-03-31 for $7.71 (IV 17.1%, delta 0.483, 36d to expiry, strike 0.8% OTM)
- Outcome: Option mid fell to $2.68 (≤ 50% of entry mid $7.71) on 2023-03-09. Trader closed at 50% profit. Kept $503 of $771 entry premium.
- Cumulative P&L (option leg, all trades to date): $17

**Trade 129 — 2025-11-10**
- Spot at entry: $681.44
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $685 call expiring 2025-12-12 for $11.39 (IV 15.1%, delta 0.493, 32d to expiry, strike 0.5% OTM)
- Outcome: Option mid fell to $4.83 (≤ 50% of entry mid $11.39) on 2025-11-17. Trader closed at 50% profit. Kept $656 of $1140 entry premium.
- Cumulative P&L (option leg, all trades to date): $-7,025

**Trade 130 — 2025-11-20**
- Spot at entry: $652.53
- Regime context: `SELL PREMIUM` (engine recommended entry)
- Action: Sell 1× SPY $657 call expiring 2025-12-26 for $14.87 (IV 19.0%, delta 0.492, 36d to expiry, strike 0.7% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $22.14 on 2025-11-24 to roll up-and-out. Buyback cost: $727/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-7,752

**Trade 131 — 2025-11-24**
- Spot at entry: $668.73
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $672 call expiring 2025-12-26 for $11.79 (IV 15.1%, delta 0.496, 32d to expiry, strike 0.5% OTM)
- Outcome: SPY breached strike with > 21 DTE remaining. Bought back at $16.77 on 2025-11-26 to roll up-and-out. Buyback cost: $498/contract above entry premium. New position opens same day at higher strike + further expiry.
- Cumulative P&L (option leg, all trades to date): $-8,250

**Trade 132 — 2025-11-26**
- Spot at entry: $679.68
- Regime context: `UNKNOWN` (engine did NOT recommend; trade only happens in unconditional cadence)
- Action: Sell 1× SPY $683 call expiring 2025-12-31 for $10.43 (IV 13.2%, delta 0.497, 35d to expiry, strike 0.5% OTM)
- Outcome: At 21 DTE with underlying within 3% of strike, defensive roll fired. Bought back at $10.50 on 2025-12-10. Net on this leg: −$7. New position opens same day at fresh expiry.
- Cumulative P&L (option leg, all trades to date): $-8,258

**Cadence totals:**

- Total trades (legs): 132  ·  Chains (independent openings): 42  ·  Avg chain length: 3.14
- Expired worthless: 0 (0.0%)
- Closed early at 50% profit: 41 (31.1%)
- Rolled up-and-out (ITM, > 21 DTE): 71 (53.8%)
- Rolled at 21 DTE (defensive, at-risk): 20 (15.2%)
- Assigned (held to expiry, ITM, no roll fired): 0 (0.0%)
- Total capped upside (from assignments): $0
- **Option-leg P&L (sum of trade pnls): $-8,258**

_Note: option-leg P&L is the sum of per-trade pnls. Strategy total P&L (in BACKTEST_RESULTS_SPY.md) adds the underlying's price change × 100 over the window. Alpha = strategy P&L − buy-and-hold P&L._

---
