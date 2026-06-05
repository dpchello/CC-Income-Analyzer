# Changelog

All notable changes to Harvest are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.4.0] - 2026-06-05

### Added
- **Replay the Open Interest chart day by day.** A history scrubber with a play
  button lets you watch how open interest built up across recent trading days.
  Every snapshot loads at once, so scrubbing and playback are instant — no lag
  between dates.
- **Gamma pins on the OI chart.** The chart now finds and marks the strikes price
  tends to gravitate toward into expiry: a gamma pin (the strike with the most
  dealer gamma to hedge) with a strength score, the max-pain level, and the
  call/put walls. Each has a plain-English tooltip.
- **"Last updated" label on the OI chart** showing the morning capture date and time.
- **In-app Restart Backend button** (Settings). Reloads the server to pick up
  updates or clear a stuck state, then reconnects on its own — no terminal needed.
- **Number of contracts column on Open Positions, and every column header now sorts**
  (click to sort, click again to reverse).
- **Pre-open snapshot scheduler** that captures the morning open-interest figure
  once per trading day, so the chart's data is consistent regardless of when you
  open the app.

### Changed
- **The OI chart is now a frozen morning snapshot.** Open interest, option prices,
  and the underlying price all reflect that morning's pull, so nothing drifts
  through the day. Open interest is a once-a-day figure anyway — settled overnight,
  published the next morning.
- **"Start Pro" now does something.** Until card checkout ships, it adds you to the
  Pro early-access list instead of being a button that did nothing.

### Fixed
- **Positions no longer show a fake "100% — Take Profit" when the price feed is down.**
  If the market-data provider can't return a live option price, positions now read
  "Price unavailable" instead of treating a failed fetch as a worthless option,
  which had made every position look fully profitable.
- **The OI chart no longer fails to load when the data feed returns a bad price.**
  A missing/NaN spot price was poisoning the whole chart response (NaN isn't valid
  JSON, so the browser rejected it). Non-finite values are now scrubbed to null.
- **Historical OI dates populate again.** Frozen-empty (zero open-interest) snapshots
  are dropped from the scrubber, so every date you can land on has real data.
- **Harvest.app desktop control panel: repaired a broken code signature.** The brand
  icon had been swapped in after signing, breaking the seal (which Gatekeeper can
  reject as "damaged"). Re-signed it, and added a build script so future rebuilds
  re-sign correctly.

## [0.3.3.0] - 2026-06-01

### Added
- **Put-side speculative dollars on the Open Interest chart.** In dollar mode you
  now see real put $ alongside call $, instead of the put side reading zero. The
  data was always there in the options feed, the app just wasn't pulling the put
  bid/ask, so put dollar values had nothing to compute from.

### Changed
- **OI dollar mode now measures time value, not total premium.** Bars show the
  speculative money still at stake (time value remaining × open interest), so deep
  in-the-money strikes no longer dominate the chart with intrinsic value that isn't
  really a bet on direction.
- **OI chart orientation flipped: calls grow up (green), puts grow down (red),** with
  the legend, tooltip, and totals footer relabeled to match.
- Stale OI snapshots captured before put quotes were available now self-heal — the
  next load backfills put values instead of showing zero for the rest of the day.

### Fixed
- Put dollar values that always rendered as zero because the chain fetcher discarded
  put bid/ask/lastPrice and kept only put open interest.

## [0.3.2.0] - 2026-06-01

### Added
- **Theta Left and Delta columns on the Open Positions table.** Each open
  position now shows, at a glance, the total time value still left to decay in
  your favor (in dollars) and its per-contract delta — colored by assignment
  risk — without having to expand the row.

### Changed
- **Income Earned now reflects net premium kept, not just gross premium.** The
  card on both a single portfolio and the All Portfolios view sums what you sold
  for less what you paid to buy back, across every position. Open positions
  still count their full premium (nothing bought back yet); closed positions
  reduce the figure by their buy-back cost, so it reads as realized income.

## [0.3.1.0] - 2026-06-01

### Fixed
- **OI chart rendered empty even with snapshots present.** yfinance reports
  `openInterest` as an end-of-day settlement figure, so an early fetch returns 0
  across every strike. The snapshot's first-write-wins rule then locked those
  zeros in for the whole day, so the chart plotted 120 strikes of zero. Now
  `record_chain_snapshot` self-heals: it overwrites a stored zero-OI snapshot
  when a fresh chain brings real OI. The "Capture today" button forces a full
  refresh (`force=True`). Re-captured today's data so the live chart shows real
  open interest immediately.

## [0.3.0.0] - 2026-06-01

### Added
- **Markets tab** published — the S&P 500 cap-weighted volume composite (with
  SPY/QQQ overlays) is now reachable from the sidebar. Backend + data pipeline
  were already running; only the nav wiring was missing.
- **Performance tab** published — historical backtests of each covered-call
  strategy on SPY (with and without Harvest's signal engine), replacing the
  placeholder screen.
- **OI chart: daily expiries** — the chart now shows day-by-day expiries for the
  next week (0–7 DTE) instead of only 21–60 DTE weeklies, via a dedicated
  `/api/oi/expiries` endpoint that doesn't affect the position-entry flow.
- **OI chart: "Capture today" button** — runs the snapshot ingestion for the
  near-term expiries on demand (`POST /api/oi/snapshot`) and refreshes the chart,
  so data can be seeded without waiting for the pre-market cron.

### Fixed
- **OI chart showed no data** — the snapshot store only held expired April/May
  expiries while the chart requested current ones. Ran the ingestion and pointed
  the chart at near-term dailies; data now populates.
- **Autobot email fragility** — the daily-summary cron depended on a gitignored
  file holding a hardcoded recipient. The recipient now comes from
  `AUTOBOT_EMAIL_TO` (in `.env`), the file is tracked again, and it skips sending
  if no recipient is configured.

## [Unreleased] - 2026-05-31

### Added
- **Open Interest history scrubber** — a date slider on the OI-by-strike chart
  that replays how open interest built up across the captured daily snapshots,
  with a `● LIVE` badge on today's reading. Switching expiry resets the
  scrubber to the latest snapshot.
- **Speculative-dollars view** — toggle the OI chart between raw open-interest
  counts and speculative dollars (open interest × mid price × 100) per strike,
  so you can see where the real money is parked. Put-side dollars show `n/a`
  because the data source provides put open interest but not put quotes.

### Fixed
- **OI chart restored** — `GET /api/oi/chain` was returning 500s because
  `oi_tracker.get_capture_dates`, `get_chain_at`, `maybe_run_daily_snapshot`,
  and the `SNAPSHOT_SENTINEL` constant had been lost in the earlier
  `git filter-repo` history scrub. All four are restored; the chart loads again
  and the daily snapshot guard no longer errors on every request.
- **Diverging-axis rendering** — call bars previously rendered off-screen
  because the chart negated call OI but used a `[0, max]` y-axis. The chart now
  shows puts above a centered zero line and calls below, matching the legend.

### Changed
- Daily OI snapshots (`oi_tracker.record_chain_snapshot`) now also record
  call/put mid prices, so the speculative-dollars view works across historical
  dates, not just the live session. Pre-existing snapshots without stored mids
  show $0 in the dollar view but remain fully usable in the open-interest view.
