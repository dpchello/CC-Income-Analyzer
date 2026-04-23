-- Harvest — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Service role key bypasses RLS; the backend uses explicit user_id filters on every query.

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    tier        TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users USING (id = current_setting('app.current_user_id', TRUE)::UUID);

-- ── Subscriptions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    status                  TEXT NOT NULL DEFAULT 'active',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner ON subscriptions USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- ── Usage logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    log_date    DATE NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, action, log_date)
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_logs_owner ON usage_logs USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- ── Portfolios ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    archived        BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY portfolios_owner ON portfolios USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS portfolios_user_id ON portfolios (user_id);

-- ── Positions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id        UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    ticker              TEXT NOT NULL DEFAULT 'SPY',
    type                TEXT NOT NULL DEFAULT 'short_call',
    strike              FLOAT,
    expiry              DATE,
    contracts           INTEGER,
    sell_price          FLOAT,
    premium_collected   FLOAT,
    open_date           DATE,
    close_date          DATE,
    close_price         FLOAT,
    status              TEXT NOT NULL DEFAULT 'open',
    notes               TEXT,
    final_pnl           FLOAT,
    open_signal         JSONB,
    close_signal        JSONB,
    -- SnapTrade import fields
    snaptrade_id        TEXT,
    snaptrade_account_id TEXT,
    snaptrade_raw       JSONB,
    harvest_category    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY positions_owner ON positions USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS positions_user_id       ON positions (user_id);
CREATE INDEX IF NOT EXISTS positions_portfolio_id  ON positions (portfolio_id);
CREATE INDEX IF NOT EXISTS positions_status        ON positions (status);

-- ── Holdings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id        UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    ticker              TEXT NOT NULL,
    shares              FLOAT NOT NULL,
    avg_cost            FLOAT,
    purchase_date       DATE,
    -- SnapTrade import fields
    snaptrade_id        TEXT,
    snaptrade_account_id TEXT,
    snaptrade_raw       JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY holdings_owner ON holdings USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS holdings_user_id       ON holdings (user_id);
CREATE INDEX IF NOT EXISTS holdings_portfolio_id  ON holdings (portfolio_id);

-- ── SnapTrade credentials ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snaptrade_credentials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snaptrade_user_id   TEXT NOT NULL,
    user_secret         TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE snaptrade_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY snaptrade_credentials_owner ON snaptrade_credentials
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- ── SnapTrade connections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snaptrade_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id   TEXT NOT NULL,
    brokerage_name  TEXT,
    status          TEXT NOT NULL DEFAULT 'ACTIVE',
    last_synced     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, connection_id)
);

ALTER TABLE snaptrade_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY snaptrade_connections_owner ON snaptrade_connections
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS snaptrade_connections_user_id ON snaptrade_connections (user_id);

-- ── SnapTrade raw imports ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snaptrade_raw_imports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  TEXT NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_json    JSONB NOT NULL
);

ALTER TABLE snaptrade_raw_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY snaptrade_raw_imports_owner ON snaptrade_raw_imports
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS snaptrade_raw_imports_user_id ON snaptrade_raw_imports (user_id);
