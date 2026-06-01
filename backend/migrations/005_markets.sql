-- Migration 005: S&P 500 Markets data (PIPE-MARKETS-01)
-- Run in Supabase SQL Editor → New query
--
-- Powers the Markets tab: market-cap-weighted S&P 500 volume composite,
-- per-ticker volume series, and SPY/QQQ overlay. All tables are global
-- (no user_id) — RLS is enabled for defense-in-depth but no policies
-- are needed since only the service-role backend touches them.

-- ── S&P 500 historical membership ─────────────────────────────────────────────
-- Source: github.com/fja05680/sp500 (CSV, refreshed weekly).
-- A ticker can have multiple rows if it has been added/removed multiple times.
CREATE TABLE IF NOT EXISTS sp500_membership (
    ticker      TEXT NOT NULL,
    added_at    DATE NOT NULL,
    removed_at  DATE,                          -- NULL = currently in index
    name        TEXT,
    PRIMARY KEY (ticker, added_at)
);

CREATE INDEX IF NOT EXISTS sp500_membership_active_idx
    ON sp500_membership (ticker) WHERE removed_at IS NULL;

ALTER TABLE sp500_membership ENABLE ROW LEVEL SECURITY;

-- ── Daily per-ticker snapshot ─────────────────────────────────────────────────
-- One row per ticker per trading day. `in_index` flags whether the ticker
-- was an S&P 500 member on that date (drives the historical Pareto-80 set).
-- `shares_out` is step-filled from quarterly filings (yfinance get_shares_full).
CREATE TABLE IF NOT EXISTS sp500_daily (
    ticker       TEXT NOT NULL,
    date         DATE NOT NULL,
    close        NUMERIC(14,4),
    volume       BIGINT,
    shares_out   BIGINT,
    market_cap   NUMERIC(20,2),                -- close * shares_out
    in_index     BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS sp500_daily_date_idx
    ON sp500_daily (date);
CREATE INDEX IF NOT EXISTS sp500_daily_inindex_date_idx
    ON sp500_daily (date, in_index) WHERE in_index;
CREATE INDEX IF NOT EXISTS sp500_daily_ticker_date_idx
    ON sp500_daily (ticker, date DESC);

ALTER TABLE sp500_daily ENABLE ROW LEVEL SECURITY;

-- ── Pre-computed Pareto-80 composite ──────────────────────────────────────────
-- One row per trading day. `pareto_tickers` is the set of tickers that, sorted
-- by market cap descending, cumulatively account for ≥ 80% of total S&P 500
-- market cap on that date. `weighted_volume` is the cap-weighted volume across
-- that set: Σ (volume_i × market_cap_i) / Σ market_cap_i.
CREATE TABLE IF NOT EXISTS sp500_composite_daily (
    date              DATE PRIMARY KEY,
    pareto_tickers    TEXT[] NOT NULL,
    ticker_count      INTEGER NOT NULL,
    total_market_cap  NUMERIC(20,2) NOT NULL,
    pareto_market_cap NUMERIC(20,2) NOT NULL,
    weighted_volume   NUMERIC(20,2) NOT NULL,
    total_volume      BIGINT NOT NULL          -- raw sum of all in-index members
);

CREATE INDEX IF NOT EXISTS sp500_composite_daily_date_idx
    ON sp500_composite_daily (date DESC);

ALTER TABLE sp500_composite_daily ENABLE ROW LEVEL SECURITY;

-- ── ETF reference series (SPY, QQQ) ───────────────────────────────────────────
-- Plotted alongside the composite as overlays.
CREATE TABLE IF NOT EXISTS etf_daily (
    ticker  TEXT NOT NULL,
    date    DATE NOT NULL,
    close   NUMERIC(14,4),
    volume  BIGINT,
    PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS etf_daily_date_idx
    ON etf_daily (date);

ALTER TABLE etf_daily ENABLE ROW LEVEL SECURITY;
