# Changelog

All notable changes to Harvest are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
