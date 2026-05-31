-- Migration 003: IV snapshots + IV universe (PIPE-036)
-- Run in Supabase SQL Editor → New query

-- Daily ATM IV snapshots per ticker. Primary key dedupes intra-day duplicates.
CREATE TABLE IF NOT EXISTS iv_snapshots (
    ticker        TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    atm_iv        NUMERIC(7,4) NOT NULL,
    PRIMARY KEY (ticker, snapshot_date)
);

CREATE INDEX IF NOT EXISTS iv_snapshots_ticker_date_idx
    ON iv_snapshots (ticker, snapshot_date DESC);

-- Universe of tickers the nightly CRON should snapshot. Pre-seeded from
-- backend/universe.py (sp500_top100 + dow30 + nasdaq100 + top_etfs). User-queried
-- tickers outside the curated list are auto-inserted with source='on_demand'.
CREATE TABLE IF NOT EXISTS iv_universe (
    ticker            TEXT PRIMARY KEY,
    source            TEXT NOT NULL,
    added_at          TIMESTAMPTZ DEFAULT NOW(),
    last_snapshot_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS iv_universe_source_idx ON iv_universe (source);

-- Service role can read/write (backend uses service key, bypasses RLS — but
-- enabling RLS is defense-in-depth for the rare case someone points the
-- anon key at these tables).
ALTER TABLE iv_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE iv_universe  ENABLE ROW LEVEL SECURITY;
