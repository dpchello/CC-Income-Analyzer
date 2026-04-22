-- Migration 002: brokerage-scoped portfolios
-- Run in Supabase SQL Editor → New query

ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS starred                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS brokerage_connection_id TEXT;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS snaptrade_account_id    TEXT;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS brokerage_name          TEXT;

-- Unique index prevents duplicate portfolios for the same SnapTrade account
CREATE UNIQUE INDEX IF NOT EXISTS portfolios_snaptrade_account
    ON portfolios (user_id, snaptrade_account_id)
    WHERE snaptrade_account_id IS NOT NULL;
