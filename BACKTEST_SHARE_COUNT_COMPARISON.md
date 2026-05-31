# Share-count sensitivity — SPY 2023-2025

Generated 2026-04-26 03:01:36 UTC

Each row is the same strategy + cadence run at a different share count.
`share_count` controls `max_concurrent_positions = floor(share_count / 100)`.
Alpha = strategy P&L − buy-and-hold P&L. Both scale with share count.

**Reading the table:** if alpha-as-% stays flat across share counts, the strategy
is already capturing all available alpha at 100 shares. If alpha-% grows with share
count, missed opportunities at 100 shares were leaving alpha on the table.

## WHEEL

### Cadence: regime_gated

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 0 | — | — | — | — | **—** | **—** |
| 500 | 5 | 0 | — | — | — | — | **—** | **—** |
| 1,000 | 10 | 0 | — | — | — | — | **—** | **—** |
| ∞ (unlimited) | 10000000 | 0 | — | — | — | — | **—** | **—** |

### Cadence: unconditional

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 3 | $30,718 | +80.66% | $30,094 | +79.02% | **$624** | **+1.64%** |
| 500 | 5 | 4 | $150,184 | +78.87% | $150,470 | +79.02% | **−$286** | **-0.15%** |
| 1,000 | 10 | 4 | $300,654 | +78.95% | $300,940 | +79.02% | **−$286** | **-0.07%** |
| ∞ (unlimited) | 10000000 | 4 | $300,939,999,714 | +79.02% | $300,940,000,000 | +79.02% | **−$286** | **-0.00%** |

---

## WATCH

### Cadence: regime_gated

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 15 | $27,272 | +71.62% | $30,094 | +79.02% | **−$2,822** | **-7.41%** |
| 500 | 5 | 16 | $148,044 | +77.75% | $150,470 | +79.02% | **−$2,426** | **-1.27%** |
| 1,000 | 10 | 16 | $298,514 | +78.39% | $300,940 | +79.02% | **−$2,426** | **-0.64%** |
| ∞ (unlimited) | 10000000 | 16 | $300,939,997,574 | +79.02% | $300,940,000,000 | +79.02% | **−$2,426** | **-0.00%** |

### Cadence: unconditional

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 32 | $25,815 | +67.79% | $30,094 | +79.02% | **−$4,279** | **-11.24%** |
| 500 | 5 | 58 | $144,602 | +75.94% | $150,470 | +79.02% | **−$5,868** | **-3.08%** |
| 1,000 | 10 | 58 | $295,072 | +77.48% | $300,940 | +79.02% | **−$5,868** | **-1.54%** |
| ∞ (unlimited) | 10000000 | 58 | $300,939,994,132 | +79.02% | $300,940,000,000 | +79.02% | **−$5,868** | **-0.00%** |

---

## CUSTOM

### Cadence: regime_gated

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 16 | $30,972 | +81.33% | $30,094 | +79.02% | **$878** | **+2.31%** |
| 500 | 5 | 19 | $150,558 | +79.07% | $150,470 | +79.02% | **$88** | **+0.05%** |
| 1,000 | 10 | 19 | $301,028 | +79.05% | $300,940 | +79.02% | **$88** | **+0.02%** |
| ∞ (unlimited) | 10000000 | 19 | $300,940,000,088 | +79.02% | $300,940,000,000 | +79.02% | **$88** | **+0.00%** |

### Cadence: unconditional

| Shares | Concurrent cap | Trade legs | Strategy P&L | Strategy return | B&H P&L | B&H return | **Alpha $** | **Alpha %** |
|---|---|---|---|---|---|---|---|---|
| 100 | 1 | 76 | $29,566 | +77.64% | $30,094 | +79.02% | **−$528** | **-1.39%** |
| 500 | 5 | 196 | $149,028 | +78.27% | $150,470 | +79.02% | **−$1,442** | **-0.76%** |
| 1,000 | 10 | 215 | $301,394 | +79.14% | $300,940 | +79.02% | **$454** | **+0.12%** |
| ∞ (unlimited) | 10000000 | 215 | $300,940,000,454 | +79.02% | $300,940,000,000 | +79.02% | **$454** | **+0.00%** |

---
