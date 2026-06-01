# Trading Environment — Tab Mockup

> A single-glance answer to: **"Is the market friendly to selling covered calls right now —
> and how has it been trending?"**

---

## 1. Concept

Reframe the existing **Signal Tracker** tab as **Trading Environment** — same underlying
6-factor engine (`backend/signals.py`), but restructured around three questions a SPY holder
actually asks:

1. **Right now:** What kind of environment am I in? (single score + plain-English label)
2. **The trend:** Has it been getting better or worse the last 30/90 days?
3. **What it means:** Should I be opening, holding, closing, or waiting?

The math doesn't change. What changes is the surface: lead with a hero gauge, anchor it
in time, and tie it to action. Keep the factor cards as a drill-down, not the headline.

**Routing:** New nav entry "Trading Environment" replaces "Signal Tracker". Existing
`/api/signals` endpoint reused as-is for the live read; one new endpoint
`/api/signals/history?days=90` for the time series (a daily cron snapshot — see §7).

---

## 2. Page wireframe

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Trading Environment                                          Updated 9:42 AM EST  │
│  How friendly the market is to selling covered calls today.                        │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│   ┌──────────────────────────┐   ┌────────────────────────────────────────────┐   │
│   │                          │   │  Good time to harvest premium              │   │
│   │       ╭─────────╮        │   │  ───────────────────────────────────────   │   │
│   │      ╱   72     ╲       │   │  Five of seven signals are aligned. Option │   │
│   │     │   ──────   │       │   │  premiums are elevated, the trend is mild, │   │
│   │     │   /100     │       │   │  and volatility is stable.                 │   │
│   │      ╲          ╱        │   │                                            │   │
│   │       ╰────────╯         │   │  → If you have shares without active calls │   │
│   │     environment score    │   │    on them, this is a green-light week.    │   │
│   │     ▲ +14 from last week │   │  → If you have open calls inside 21 DTE,   │   │
│   │                          │   │    consider rolling to keep the income     │   │
│   │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  │   │    coming.                                 │   │
│   │  AVOID  CAREFUL  GO       │   │                                            │   │
│   │                          │   │  [ Open the screener →  ]                  │   │
│   └──────────────────────────┘   └────────────────────────────────────────────┘   │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│  How it's been trending                                          [30d] 90d  1y    │
│                                                                                    │
│   100 ┤                                                            ╱─╮              │
│       │                                              ╭───╮       ╱   ╰─ NOW (72)   │
│    75 ┤━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯   ╰──╮  ╱      "GO" zone    │
│       │  ╭╮                       ╭──╮                     ╰─╯                    │
│    50 ┤━━╯╰━━━━━━━━━━━━━━━━━━━━━╱━━━━╲━━━━━━━━━━━━━━━━━━━━━━━━━━  CAREFUL zone   │
│       │      ╰╮         ╭───╯         ╰──╮                                        │
│    25 ┤━━━━━━━━╲───────╯                  ╲─━━━━━━━━━━━━━━━━━━━━  AVOID zone      │
│       │         ╰──╮  ╱                                                           │
│     0 ┤───────────────────────────────────────────────────────────────────────    │
│        Jan 25      Feb 8       Feb 22      Mar 8       Mar 22     Apr 5    Apr 25 │
│                                                                                    │
│   Hover any day → tooltip with score, regime, factor highlights, and SPY price.   │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│  Why we're at 72 today                                              [show all]    │
│                                                                                    │
│   ┌────────────────┬────────────────┬────────────────┬────────────────┐           │
│   │ Option Price   │ Volatility     │ Volatility     │ Market Trend   │           │
│   │ Level          │ Level          │ Stability      │                │           │
│   │                │                │                │                │           │
│   │     +3         │     +2         │     +1         │     +1         │           │
│   │  IV Rank 78    │  VIX 22.4      │  VVIX 84       │  +0.8% / mo    │           │
│   │  ▓▓▓▓▓░░░      │  ▓▓▓▓░░░░      │  ▓▓░░░░░░      │  ▓▓░░░░░░      │           │
│   │  Strong sell   │  Sweet spot    │  Stable        │  Mild uptrend  │           │
│   └────────────────┴────────────────┴────────────────┴────────────────┘           │
│                                                                                    │
│   ┌────────────────┬────────────────┬────────────────┐                            │
│   │ Interest       │ Yield Curve    │ Recovery Mode  │                            │
│   │ Rates (10y)    │                │                │                            │
│   │                │                │                │                            │
│   │     +1         │     −1         │      0         │                            │
│   │  TNX 4.18%     │  Inverted      │  Not active    │                            │
│   │  ▓▓░░░░░░      │  ░░░░▓▓░░      │  ░░░░░░░░      │                            │
│   │  Falling       │  Tie-breaker   │  No bounce     │                            │
│   └────────────────┴────────────────┴────────────────┘                            │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│  What it's been like to be in a "GO" environment                                   │
│                                                                                    │
│   In the last 12 months, the market spent 38% of days in the GO zone. During      │
│   those days, SPY 30-DTE 2% OTM calls paid an average of $3.10 per contract.      │
│   Today's equivalent: ~$3.50.                                                     │
│                                                                                    │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│  On the radar                                                                      │
│                                                                                    │
│   • FOMC decision  ·  Wed May 7  ·  could shift volatility sharply                 │
│   • SPY ex-div     ·  Fri Jun 20 ·  collect dividend before any roll               │
│   • Earnings season ends ·  May 12                                                 │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The score itself (0–100)

The existing engine returns `total_score` in the range **−14 … +14**. Rescale linearly:

```
environment_score = round( (total_score + 14) / 28 * 100 )
```

| Engine score | 0–100 | Zone     | Plain-English label                |
|--------------|-------|----------|------------------------------------|
| +6 to +14    | 71–100| **GO**       | Good time to harvest premium       |
| +1 to +5     | 54–70 | **CAREFUL**  | Mixed — hold what you've got       |
| −5 to 0      | 32–53 | **CAREFUL**  | Be careful — risk is rising        |
| −14 to −6    | 0–31  | **AVOID**    | Not a good time — sit this one out |

The hero number is the percentile, not the engine score — easier for a non-trader to read.
Color: gold gauge fill, green text only when the bottom line is "money positive."

**No new factor weights, no new model.** Same scoring, prettier surface.

---

## 4. The trend chart

A 90-day line chart of `environment_score`, rendered with Visx (already in use for other
charts). Three colored bands behind the line for AVOID / CAREFUL / GO zones so the eye
reads "we just crossed back into green" without thinking.

**Data source:** new daily cron job `backend/cron/snapshot_signals.py` calls
`SignalEngine.analyze()` once after 4 PM ET market close, persists `(date, total_score,
environment_score, regime, factor_scores_json)` to a new table `signal_snapshots`. We
already have the cron infra (`backend/cron/`), the data fetcher, and an analogous
precedent in `migrations/003_iv_snapshots.sql`.

**Backfill:** On migration, run the engine against 90 days of cached `data_fetcher`
history once to seed the chart. After that it's a 1-row-per-day insert.

Hover tooltip: date · score · regime label · the 1–2 factors that moved most that day
vs. the day before · SPY close.

---

## 5. The "what this means for me" panel

Pulled directly from the regime label and the user's portfolio state:

| Regime  | Has shares without calls            | Has open calls inside 21 DTE        |
|---------|-------------------------------------|-------------------------------------|
| GO      | "Green-light week to open"          | "Roll to keep income coming"        |
| CAREFUL | "If you open, go further OTM"       | "Decide before you hit gamma zone"  |
| AVOID   | "Sit on shares — don't add calls"   | "Close or roll high — protect upside"|

These hooks reuse existing CTA targets:
- "Open the screener" → `navigate('Screener')` with regime preset
- "Review open calls" → `navigate('Portfolios')` with the 21-DTE filter on
- "Close / roll" → `navigate('Recommendations')`

No new business logic — this panel is a join between `signalData.regime` and a 3-state
read of the user's `positions` array (already in `App.jsx` state).

---

## 6. Historical context callout

One sentence, computed from the snapshot history:

> *"In the last 12 months, the market spent **38%** of days in the GO zone. During those
> days, SPY 30-DTE 2% OTM calls paid an average of **$3.10** per contract. Today's
> equivalent: **~$3.50**."*

This is the single most underused piece of context the engine doesn't expose today.
It turns "the score is 72" into "you're in the top 38% of days for income — and the
income is real." Computed nightly off the snapshot table — no live-path cost.

---

## 7. New vs. reused

| Item                                | Reused                            | New                                   |
|-------------------------------------|-----------------------------------|---------------------------------------|
| 7-factor scoring                    | `signals.py`                      | —                                     |
| Live `/api/signals`                 | yes                               | —                                     |
| Factor cards                        | `SignalTracker.jsx` factor card   | restyled as a drill-down grid          |
| Macro calendar                      | `macro_calendar.py`               | surface in "On the radar" panel       |
| Hero gauge (0–100)                  | —                                 | new component, Visx arc                |
| Time-series chart                   | —                                 | new component, Visx line + bands       |
| Historical band table               | —                                 | nightly aggregation off snapshots      |
| `/api/signals/history?days=N`       | —                                 | new endpoint                           |
| `signal_snapshots` table            | —                                 | new migration `004_signal_snapshots`   |
| Daily snapshot cron                 | `backend/cron/` infra             | new `snapshot_signals.py` script       |

---

## 8. Open questions for review

1. **Replace or alongside?** Lean: **replace** Signal Tracker. The factor cards live on
   inside this page as a drill-down — nothing is lost.
2. **Pro gating?** The hero gauge + current label stays free (it's the elevator pitch
   for the whole product). The 90-day trend chart and historical band ("38% of days,
   $3.10 avg premium") feel Pro-tier — same gating model as the Execution Scorecard.
3. **Mobile layout?** Hero stacks above narrative; chart shrinks to 30 days; factor
   grid becomes 2 columns. No new logic, just CSS.
4. **Score psychology:** 72/100 reads better than +5/+14 to a non-trader, but some
   users will want to see the raw engine score. Add a small toggle in the header?
