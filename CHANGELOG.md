# Changelog

All notable changes to Harvest are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
