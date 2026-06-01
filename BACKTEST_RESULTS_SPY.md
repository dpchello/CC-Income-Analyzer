# SPY backtest results — all 5 strategies, multiple lookbacks

_Generated: 2026-04-26 14:57:40 UTC (rebuilt from persisted runs)_

**Source:** real DuckDB chains (backend/data/options.duckdb), mid-fill model.
**Cadence:** entry every 5 trading days.
**Active management:** 50%-profit close + ITM roll up-and-out + 21-DTE defensive roll.
**Coverage:** SPY 2008-01-02 → 2025-12-12.

**Alpha definition:** strategy total P&L − buy-and-hold total P&L. Reported in dollars and as % of starting capital (100 × initial spot).

---

# 2008-2010 (GFC acute)
**Window:** 2008-01-02 → 2010-12-31 (3.0y)

## WHEEL

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 108 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 48 (44.4%) |
| Rolled up-and-out | 36 (33.3%) |
| Rolled at 21 DTE | 24 (22.2%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $226 (2.2% of cost basis) |
| Avg annualized yield | 24.8% |
| Worst single trade P&L | -$290 |
| **Strategy total P&L** | **-$412** (-2.84% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$1,506** (10.39% of starting capital) |
| Final equity (100 sh) | $14,081 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -0.71% (vs B&H -2.98%) |
| Annualized vol (strategy) | 17.09% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.24 (vs B&H -0.29) |
| Max drawdown | $5,851 (38.82%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.75 |
| Downside capture | 0.71 |
| Worst 3-month window | 2008-01..2008-03 (0.0% max profit on 10 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 72 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 26 (36.1%) |
| Rolled up-and-out | 25 (34.7%) |
| Rolled at 21 DTE | 21 (29.2%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $190 (1.8% of cost basis) |
| Avg annualized yield | 20.7% |
| Worst single trade P&L | -$340 |
| **Strategy total P&L** | **-$1,994** (-13.76% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **-$76** (-0.52% of starting capital) |
| Final equity (100 sh) | $12,499 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -3.77% (vs B&H -2.98%) |
| Annualized vol (strategy) | 18.81% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.38 (vs B&H -0.29) |
| Max drawdown | $6,677 (46.07%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.81 |
| Downside capture | 0.87 |
| Worst 3-month window | 2008-01..2008-04 (0.0% max profit on 7 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -4.08 pts
- Alpha lift ($):        -$1,582
- Alpha lift (%):        -10.91%
- Sharpe lift:           -0.14
- Strategy P&L delta:    -$1,582

---

## INCOME

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 1 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 1 (100.0%) |
| Rolled up-and-out | 0 (0.0%) |
| Rolled at 21 DTE | 0 (0.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $277 (2.5% of cost basis) |
| Avg annualized yield | 56.5% |
| Worst single trade P&L | $192 |
| **Strategy total P&L** | **-$1,726** (-11.91% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$192** (1.32% of starting capital) |
| Final equity (100 sh) | $12,767 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -2.48% (vs B&H -2.98%) |
| Annualized vol (strategy) | 21.29% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.27 (vs B&H -0.29) |
| Max drawdown | $7,490 (51.68%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.98 |
| Downside capture | 0.97 |

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## SAFE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 12 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 9 (75.0%) |
| Rolled up-and-out | 1 (8.3%) |
| Rolled at 21 DTE | 2 (16.7%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $130 (1.3% of cost basis) |
| Avg annualized yield | 10.7% |
| Worst single trade P&L | -$214 |
| **Strategy total P&L** | **-$1,498** (-10.34% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$420** (2.90% of starting capital) |
| Final equity (100 sh) | $12,995 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -1.89% (vs B&H -2.98%) |
| Annualized vol (strategy) | 20.18% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.26 (vs B&H -0.29) |
| Max drawdown | $7,214 (49.77%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.93 |
| Downside capture | 0.91 |
| Worst 3-month window | 2008-09..2008-11 (0.0% max profit on 5 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 2 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 0 (0.0%) |
| Rolled up-and-out | 1 (50.0%) |
| Rolled at 21 DTE | 1 (50.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $96 (0.9% of cost basis) |
| Avg annualized yield | 8.5% |
| Worst single trade P&L | -$214 |
| **Strategy total P&L** | **-$2,220** (-15.32% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **-$302** (-2.09% of starting capital) |
| Final equity (100 sh) | $12,272 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -3.79% (vs B&H -2.98%) |
| Annualized vol (strategy) | 21.85% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.33 (vs B&H -0.29) |
| Max drawdown | $7,682 (53.00%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.98 |
| Downside capture | 1.01 |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -2.18 pts
- Alpha lift ($):        -$722
- Alpha lift (%):        -4.99%
- Sharpe lift:           -0.07
- Strategy P&L delta:    -$722

---

## WATCH

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 89 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 31 (34.8%) |
| Rolled up-and-out | 42 (47.2%) |
| Rolled at 21 DTE | 16 (18.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $291 (2.9% of cost basis) |
| Avg annualized yield | 32.1% |
| Worst single trade P&L | -$565 |
| **Strategy total P&L** | **-$1,416** (-9.77% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$502** (3.46% of starting capital) |
| Final equity (100 sh) | $13,076 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -3.26% (vs B&H -2.98%) |
| Annualized vol (strategy) | 19.96% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.33 (vs B&H -0.29) |
| Max drawdown | $6,556 (43.65%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.82 |
| Downside capture | 0.85 |
| Worst 3-month window | 2008-01..2008-03 (0.0% max profit on 11 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 59 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 17 (28.8%) |
| Rolled up-and-out | 29 (49.2%) |
| Rolled at 21 DTE | 13 (22.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $240 (2.3% of cost basis) |
| Avg annualized yield | 26.0% |
| Worst single trade P&L | -$340 |
| **Strategy total P&L** | **-$1,985** (-13.70% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **-$67** (-0.46% of starting capital) |
| Final equity (100 sh) | $12,508 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -3.81% (vs B&H -2.98%) |
| Annualized vol (strategy) | 19.19% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.37 (vs B&H -0.29) |
| Max drawdown | $6,573 (45.35%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.83 |
| Downside capture | 0.89 |
| Worst 3-month window | 2008-01..2008-04 (0.0% max profit on 7 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -6.11 pts
- Alpha lift ($):        -$568
- Alpha lift (%):        -3.92%
- Sharpe lift:           -0.04
- Strategy P&L delta:    -$568

---

## CONSERVATIVE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 52 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 21 (40.4%) |
| Rolled up-and-out | 22 (42.3%) |
| Rolled at 21 DTE | 9 (17.3%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $262 (2.6% of cost basis) |
| Avg annualized yield | 27.7% |
| Worst single trade P&L | -$202 |
| **Strategy total P&L** | **-$785** (-5.42% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$1,133** (7.82% of starting capital) |
| Final equity (100 sh) | $13,708 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -1.04% (vs B&H -2.98%) |
| Annualized vol (strategy) | 19.06% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.23 (vs B&H -0.29) |
| Max drawdown | $6,380 (42.97%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.86 |
| Downside capture | 0.83 |
| Worst 3-month window | 2008-01..2008-03 (0.0% max profit on 7 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 32 |
| Starting capital (100 sh) | $14,493 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 12 (37.5%) |
| Rolled up-and-out | 13 (40.6%) |
| Rolled at 21 DTE | 7 (21.9%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $227 (2.1% of cost basis) |
| Avg annualized yield | 22.8% |
| Worst single trade P&L | -$340 |
| **Strategy total P&L** | **-$1,834** (-12.66% of starting capital) |
| Buy-and-hold total P&L | -$1,918 (-13.23% of starting capital) |
| **Alpha vs buy-and-hold** | **$84** (0.58% of starting capital) |
| Final equity (100 sh) | $12,658 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | -2.76% (vs B&H -2.98%) |
| Annualized vol (strategy) | 20.71% (vs B&H 22.00%) |
| Sharpe (rf=3.36%) | -0.30 (vs B&H -0.29) |
| Max drawdown | $7,185 (49.58%) — vs B&H $7,682 (53.00%) |
| Upside capture | 0.93 |
| Downside capture | 0.94 |
| Worst 3-month window | 2008-02..2008-05 (0.0% max profit on 8 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -4.95 pts
- Alpha lift ($):        -$1,050
- Alpha lift (%):        -7.24%
- Sharpe lift:           -0.06
- Strategy P&L delta:    -$1,050

---

# 2011-2017 (recovery + low-vol bull)
**Window:** 2011-01-03 → 2017-12-31 (7.0y)

## WHEEL

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 231 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 113 (48.9%) |
| Rolled up-and-out | 38 (16.5%) |
| Rolled at 21 DTE | 80 (34.6%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $114 (0.6% of cost basis) |
| Avg annualized yield | 7.0% |
| Worst single trade P&L | -$373 |
| **Strategy total P&L** | **$11,461** (90.21% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **-$2,520** (-19.83% of starting capital) |
| Final equity (100 sh) | $24,166 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 9.54% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.40% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 0.78 (vs B&H 0.82) |
| Max drawdown | $2,611 (18.88%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.86 |
| Downside capture | 0.86 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 4 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 196 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 99 (50.5%) |
| Rolled up-and-out | 22 (11.2%) |
| Rolled at 21 DTE | 75 (38.3%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $105 (0.6% of cost basis) |
| Avg annualized yield | 6.3% |
| Worst single trade P&L | -$252 |
| **Strategy total P&L** | **$14,198** (111.76% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **$218** (1.71% of starting capital) |
| Final equity (100 sh) | $26,904 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 11.25% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.29% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 0.97 (vs B&H 0.82) |
| Max drawdown | $2,822 (17.39%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.88 |
| Downside capture | 0.74 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 5 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.65 pts
- Alpha lift ($):        $2,738
- Alpha lift (%):        21.54%
- Sharpe lift:           +0.19
- Strategy P&L delta:    $2,738

---

## INCOME

**Unconditional cadence** — 0 qualifying trades (filters excluded all entries).

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## SAFE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 8 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 3 (37.5%) |
| Rolled up-and-out | 3 (37.5%) |
| Rolled at 21 DTE | 2 (25.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $140 (1.1% of cost basis) |
| Avg annualized yield | 9.6% |
| Worst single trade P&L | -$340 |
| **Strategy total P&L** | **$13,170** (103.66% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **-$812** (-6.39% of starting capital) |
| Final equity (100 sh) | $25,874 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 10.63% (vs B&H 11.12%) |
| Annualized vol (strategy) | 11.01% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 0.76 (vs B&H 0.82) |
| Max drawdown | $3,064 (19.33%) — vs B&H $3,064 (19.42%) |
| Upside capture | 1.00 |
| Downside capture | 1.05 |
| Worst 3-month window | 2011-03..2011-09 (0.0% max profit on 4 trades) |

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## WATCH

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 193 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 84 (43.5%) |
| Rolled up-and-out | 41 (21.2%) |
| Rolled at 21 DTE | 68 (35.2%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $145 (0.8% of cost basis) |
| Avg annualized yield | 8.5% |
| Worst single trade P&L | -$272 |
| **Strategy total P&L** | **$14,736** (115.99% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **$755** (5.94% of starting capital) |
| Final equity (100 sh) | $27,441 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 11.61% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.15% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 1.02 (vs B&H 0.82) |
| Max drawdown | $2,543 (18.33%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.87 |
| Downside capture | 0.68 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 4 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 186 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 81 (43.5%) |
| Rolled up-and-out | 39 (21.0%) |
| Rolled at 21 DTE | 66 (35.5%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $144 (0.8% of cost basis) |
| Avg annualized yield | 8.4% |
| Worst single trade P&L | -$272 |
| **Strategy total P&L** | **$15,010** (118.14% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **$1,029** (8.10% of starting capital) |
| Final equity (100 sh) | $27,715 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 11.77% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.29% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 1.02 (vs B&H 0.82) |
| Max drawdown | $2,543 (18.33%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.88 |
| Downside capture | 0.69 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 4 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.09 pts
- Alpha lift ($):        $274
- Alpha lift (%):        2.16%
- Sharpe lift:           +0.00
- Strategy P&L delta:    $274

---

## CONSERVATIVE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 170 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 86 (50.6%) |
| Rolled up-and-out | 21 (12.4%) |
| Rolled at 21 DTE | 63 (37.1%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $97 (0.5% of cost basis) |
| Avg annualized yield | 5.4% |
| Worst single trade P&L | -$268 |
| **Strategy total P&L** | **$13,212** (103.99% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **-$768** (-6.05% of starting capital) |
| Final equity (100 sh) | $25,918 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 10.64% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.85% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 0.85 (vs B&H 0.82) |
| Max drawdown | $2,684 (18.87%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.89 |
| Downside capture | 0.82 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 3 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 163 |
| Starting capital (100 sh) | $12,705 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 87 (53.4%) |
| Rolled up-and-out | 20 (12.3%) |
| Rolled at 21 DTE | 56 (34.4%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $95 (0.5% of cost basis) |
| Avg annualized yield | 5.3% |
| Worst single trade P&L | -$264 |
| **Strategy total P&L** | **$13,880** (109.24% of starting capital) |
| Buy-and-hold total P&L | $13,981 (110.04% of starting capital) |
| **Alpha vs buy-and-hold** | **-$102** (-0.80% of starting capital) |
| Final equity (100 sh) | $26,584 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 11.05% (vs B&H 11.12%) |
| Annualized vol (strategy) | 9.97% (vs B&H 10.86%) |
| Sharpe (rf=2.24%) | 0.88 (vs B&H 0.82) |
| Max drawdown | $2,747 (18.87%) — vs B&H $3,064 (19.42%) |
| Upside capture | 0.91 |
| Downside capture | 0.82 |
| Worst 3-month window | 2011-01..2011-03 (0.0% max profit on 3 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.10 pts
- Alpha lift ($):        $667
- Alpha lift (%):        5.25%
- Sharpe lift:           +0.03
- Strategy P&L delta:    $667

---

# 2018-2022 (Volmageddon, COVID, Ukraine)
**Window:** 2018-01-02 → 2022-12-31 (5.0y)

## WHEEL

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 191 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 98 (51.3%) |
| Rolled up-and-out | 31 (16.2%) |
| Rolled at 21 DTE | 62 (32.5%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $286 (0.8% of cost basis) |
| Avg annualized yield | 9.3% |
| Worst single trade P&L | -$1,652 |
| **Strategy total P&L** | **$6,882** (25.61% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$4,484** (-16.68% of starting capital) |
| Final equity (100 sh) | $33,760 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 4.23% (vs B&H 6.40%) |
| Annualized vol (strategy) | 19.32% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.11 (vs B&H 0.23) |
| Max drawdown | $10,788 (34.87%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.97 |
| Downside capture | 1.05 |
| Worst 3-month window | 2018-01..2018-03 (0.0% max profit on 13 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 119 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 53 (44.5%) |
| Rolled up-and-out | 18 (15.1%) |
| Rolled at 21 DTE | 48 (40.3%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $220 (0.6% of cost basis) |
| Avg annualized yield | 7.2% |
| Worst single trade P&L | -$896 |
| **Strategy total P&L** | **$7,308** (27.19% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$4,058** (-15.10% of starting capital) |
| Final equity (100 sh) | $34,184 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 4.49% (vs B&H 6.40%) |
| Annualized vol (strategy) | 19.15% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.13 (vs B&H 0.23) |
| Max drawdown | $12,106 (35.42%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.95 |
| Downside capture | 1.02 |
| Worst 3-month window | 2018-01..2018-04 (0.0% max profit on 10 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -2.07 pts
- Alpha lift ($):        $425
- Alpha lift (%):        1.58%
- Sharpe lift:           +0.02
- Strategy P&L delta:    $425

---

## INCOME

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 4 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 2 (50.0%) |
| Rolled up-and-out | 1 (25.0%) |
| Rolled at 21 DTE | 1 (25.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $822 (3.3% of cost basis) |
| Avg annualized yield | 49.7% |
| Worst single trade P&L | -$978 |
| **Strategy total P&L** | **$10,864** (40.42% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$502** (-1.87% of starting capital) |
| Final equity (100 sh) | $37,742 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 6.11% (vs B&H 6.40%) |
| Annualized vol (strategy) | 19.30% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.21 (vs B&H 0.23) |
| Max drawdown | $12,115 (32.42%) — vs B&H $12,115 (34.10%) |
| Upside capture | 1.01 |
| Downside capture | 1.02 |

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## SAFE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 31 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 19 (61.3%) |
| Rolled up-and-out | 10 (32.3%) |
| Rolled at 21 DTE | 2 (6.5%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $383 (1.1% of cost basis) |
| Avg annualized yield | 9.8% |
| Worst single trade P&L | -$1,170 |
| **Strategy total P&L** | **$7,791** (28.99% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$3,575** (-13.30% of starting capital) |
| Final equity (100 sh) | $34,668 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 4.30% (vs B&H 6.40%) |
| Annualized vol (strategy) | 17.75% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.13 (vs B&H 0.23) |
| Max drawdown | $12,552 (32.43%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.94 |
| Downside capture | 1.01 |
| Worst 3-month window | 2018-12..2020-03 (0.0% max profit on 5 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 3 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 1 (33.3%) |
| Rolled up-and-out | 2 (66.7%) |
| Rolled at 21 DTE | 0 (0.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $340 (1.0% of cost basis) |
| Avg annualized yield | 8.6% |
| Worst single trade P&L | -$833 |
| **Strategy total P&L** | **$9,944** (37.00% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$1,422** (-5.29% of starting capital) |
| Final equity (100 sh) | $36,820 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 5.58% (vs B&H 6.40%) |
| Annualized vol (strategy) | 19.27% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.18 (vs B&H 0.23) |
| Max drawdown | $12,918 (34.10%) — vs B&H $12,115 (34.10%) |
| Upside capture | 1.01 |
| Downside capture | 1.04 |
| Worst 3-month window | 2020-09..2022-07 (0.0% max profit on 3 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -1.20 pts
- Alpha lift ($):        $2,152
- Alpha lift (%):        8.01%
- Sharpe lift:           +0.06
- Strategy P&L delta:    $2,152

---

## WATCH

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 103 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 43 (41.7%) |
| Rolled up-and-out | 23 (22.3%) |
| Rolled at 21 DTE | 37 (35.9%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $272 (0.8% of cost basis) |
| Avg annualized yield | 8.9% |
| Worst single trade P&L | -$534 |
| **Strategy total P&L** | **$9,894** (36.81% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$1,472** (-5.48% of starting capital) |
| Final equity (100 sh) | $36,770 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 6.07% (vs B&H 6.40%) |
| Annualized vol (strategy) | 18.74% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.21 (vs B&H 0.23) |
| Max drawdown | $11,215 (35.05%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.97 |
| Downside capture | 0.98 |
| Worst 3-month window | 2018-01..2018-03 (0.0% max profit on 9 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 89 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 35 (39.3%) |
| Rolled up-and-out | 17 (19.1%) |
| Rolled at 21 DTE | 37 (41.6%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $261 (0.8% of cost basis) |
| Avg annualized yield | 8.8% |
| Worst single trade P&L | -$421 |
| **Strategy total P&L** | **$9,902** (36.84% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$1,464** (-5.45% of starting capital) |
| Final equity (100 sh) | $36,780 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 6.07% (vs B&H 6.40%) |
| Annualized vol (strategy) | 18.67% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.21 (vs B&H 0.23) |
| Max drawdown | $11,488 (35.10%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.96 |
| Downside capture | 0.97 |
| Worst 3-month window | 2018-01..2018-04 (0.0% max profit on 7 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.20 pts
- Alpha lift ($):        $9
- Alpha lift (%):        0.03%
- Sharpe lift:           +0.00
- Strategy P&L delta:    $9

---

## CONSERVATIVE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 92 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 48 (52.2%) |
| Rolled up-and-out | 7 (7.6%) |
| Rolled at 21 DTE | 37 (40.2%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $175 (0.5% of cost basis) |
| Avg annualized yield | 5.3% |
| Worst single trade P&L | -$660 |
| **Strategy total P&L** | **$10,624** (39.53% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$742** (-2.76% of starting capital) |
| Final equity (100 sh) | $37,501 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 6.59% (vs B&H 6.40%) |
| Annualized vol (strategy) | 18.59% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.24 (vs B&H 0.23) |
| Max drawdown | $11,492 (34.58%) — vs B&H $12,115 (34.10%) |
| Upside capture | 0.98 |
| Downside capture | 0.97 |
| Worst 3-month window | 2018-01..2018-03 (0.0% max profit on 7 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 82 |
| Starting capital (100 sh) | $26,877 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 41 (50.0%) |
| Rolled up-and-out | 7 (8.5%) |
| Rolled at 21 DTE | 34 (41.5%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $165 (0.5% of cost basis) |
| Avg annualized yield | 5.1% |
| Worst single trade P&L | -$660 |
| **Strategy total P&L** | **$9,214** (34.28% of starting capital) |
| Buy-and-hold total P&L | $11,366 (42.29% of starting capital) |
| **Alpha vs buy-and-hold** | **-$2,152** (-8.01% of starting capital) |
| Final equity (100 sh) | $36,091 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 5.76% (vs B&H 6.40%) |
| Annualized vol (strategy) | 19.22% (vs B&H 18.86%) |
| Sharpe (rf=2.06%) | 0.19 (vs B&H 0.23) |
| Max drawdown | $11,709 (34.95%) — vs B&H $12,115 (34.10%) |
| Upside capture | 1.00 |
| Downside capture | 1.03 |
| Worst 3-month window | 2018-01..2018-04 (0.0% max profit on 6 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.20 pts
- Alpha lift ($):        -$1,410
- Alpha lift (%):        -5.25%
- Sharpe lift:           -0.05
- Strategy P&L delta:    -$1,410

---

# 2023-2025 partial (AI bull tape)
**Window:** 2023-01-02 → 2025-12-12 (2.9y)

## WHEEL

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 99 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 50 (50.5%) |
| Rolled up-and-out | 17 (17.2%) |
| Rolled at 21 DTE | 32 (32.3%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $385 (0.7% of cost basis) |
| Avg annualized yield | 8.0% |
| Worst single trade P&L | -$914 |
| **Strategy total P&L** | **$26,102** (68.54% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **-$3,992** (-10.48% of starting capital) |
| Final equity (100 sh) | $64,184 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 17.76% (vs B&H 19.40%) |
| Annualized vol (strategy) | 9.55% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.43 (vs B&H 1.29) |
| Max drawdown | $10,538 (18.14%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.83 |
| Downside capture | 0.68 |
| Worst 3-month window | 2023-01..2023-03 (0.0% max profit on 9 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 87 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 44 (50.6%) |
| Rolled up-and-out | 11 (12.6%) |
| Rolled at 21 DTE | 32 (36.8%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $357 (0.7% of cost basis) |
| Avg annualized yield | 7.5% |
| Worst single trade P&L | -$888 |
| **Strategy total P&L** | **$29,238** (76.78% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **-$856** (-2.25% of starting capital) |
| Final equity (100 sh) | $67,320 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 19.70% (vs B&H 19.40%) |
| Annualized vol (strategy) | 9.80% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.59 (vs B&H 1.29) |
| Max drawdown | $10,791 (17.84%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.91 |
| Downside capture | 0.73 |
| Worst 3-month window | 2023-01..2023-04 (0.0% max profit on 9 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.53 pts
- Alpha lift ($):        $3,136
- Alpha lift (%):        8.23%
- Sharpe lift:           +0.16
- Strategy P&L delta:    $3,136

---

## INCOME

**Unconditional cadence** — 0 qualifying trades (filters excluded all entries).

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## SAFE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 3 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 2 (66.7%) |
| Rolled up-and-out | 1 (33.3%) |
| Rolled at 21 DTE | 0 (0.0%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $594 (1.1% of cost basis) |
| Avg annualized yield | 9.5% |
| Worst single trade P&L | -$1,414 |
| **Strategy total P&L** | **$29,333** (77.03% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **-$761** (-2.00% of starting capital) |
| Final equity (100 sh) | $67,415 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 18.94% (vs B&H 19.40%) |
| Annualized vol (strategy) | 11.49% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.29 (vs B&H 1.29) |
| Max drawdown | $11,350 (18.52%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.97 |
| Downside capture | 0.96 |

**Regime-gated cadence** — 0 qualifying trades (filters excluded all entries).

---

## WATCH

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 75 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 34 (45.3%) |
| Rolled up-and-out | 15 (20.0%) |
| Rolled at 21 DTE | 26 (34.7%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $490 (0.9% of cost basis) |
| Avg annualized yield | 10.0% |
| Worst single trade P&L | -$819 |
| **Strategy total P&L** | **$29,199** (76.67% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **-$895** (-2.35% of starting capital) |
| Final equity (100 sh) | $67,281 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 18.86% (vs B&H 19.40%) |
| Annualized vol (strategy) | 9.97% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.48 (vs B&H 1.29) |
| Max drawdown | $11,301 (18.69%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.88 |
| Downside capture | 0.70 |
| Worst 3-month window | 2023-04..2023-06 (0.0% max profit on 8 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 74 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 34 (45.9%) |
| Rolled up-and-out | 14 (18.9%) |
| Rolled at 21 DTE | 26 (35.1%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $488 (0.9% of cost basis) |
| Avg annualized yield | 10.0% |
| Worst single trade P&L | -$819 |
| **Strategy total P&L** | **$30,239** (79.40% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **$145** (0.38% of starting capital) |
| Final equity (100 sh) | $68,321 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 19.49% (vs B&H 19.40%) |
| Annualized vol (strategy) | 10.07% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.52 (vs B&H 1.29) |
| Max drawdown | $11,301 (18.37%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.90 |
| Downside capture | 0.70 |
| Worst 3-month window | 2023-04..2023-06 (0.0% max profit on 8 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.02 pts
- Alpha lift ($):        $1,040
- Alpha lift (%):        2.73%
- Sharpe lift:           +0.05
- Strategy P&L delta:    $1,040

---

## CONSERVATIVE

**Unconditional cadence**

| | |
|---|---|
| Trades simulated | 76 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 45 (59.2%) |
| Rolled up-and-out | 7 (9.2%) |
| Rolled at 21 DTE | 24 (31.6%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $331 (0.6% of cost basis) |
| Avg annualized yield | 6.4% |
| Worst single trade P&L | -$751 |
| **Strategy total P&L** | **$29,566** (77.64% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **-$528** (-1.39% of starting capital) |
| Final equity (100 sh) | $67,648 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 19.08% (vs B&H 19.40%) |
| Annualized vol (strategy) | 10.15% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.47 (vs B&H 1.29) |
| Max drawdown | $10,866 (18.23%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.89 |
| Downside capture | 0.73 |
| Worst 3-month window | 2023-02..2023-05 (0.0% max profit on 7 trades) |

**Regime-gated cadence**

| | |
|---|---|
| Trades simulated | 73 |
| Starting capital (100 sh) | $38,082 |
| **Trades expiring worthless** | **0** (0.0%) |
| Closed early at 50% profit | 45 (61.6%) |
| Rolled up-and-out | 8 (11.0%) |
| Rolled at 21 DTE | 20 (27.4%) |
| Assigned | 0 (0.0%) |
| Avg premium per trade | $330 (0.6% of cost basis) |
| Avg annualized yield | 6.3% |
| Worst single trade P&L | -$720 |
| **Strategy total P&L** | **$30,123** (79.10% of starting capital) |
| Buy-and-hold total P&L | $30,094 (79.02% of starting capital) |
| **Alpha vs buy-and-hold** | **$29** (0.08% of starting capital) |
| Final equity (100 sh) | $68,205 |
| Assignment opportunity cost | $0 |
| CAGR (strategy) | 19.42% (vs B&H 19.40%) |
| Annualized vol (strategy) | 10.30% (vs B&H 11.81%) |
| Sharpe (rf=4.15%) | 1.48 (vs B&H 1.29) |
| Max drawdown | $10,866 (18.06%) — vs B&H $11,645 (19.00%) |
| Upside capture | 0.91 |
| Downside capture | 0.74 |
| Worst 3-month window | 2023-04..2023-06 (0.0% max profit on 10 trades) |

**Engine edge — regime-gated minus unconditional**
_(this is a cadence-vs-cadence delta, NOT alpha. Alpha is always strategy vs buy-and-hold above.)_

- Max profit rate delta: +0.000
- Avg ann yield delta:   -0.04 pts
- Alpha lift ($):        $558
- Alpha lift (%):        1.47%
- Sharpe lift:           +0.01
- Strategy P&L delta:    $558

---
