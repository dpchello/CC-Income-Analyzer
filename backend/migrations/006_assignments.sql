-- Harvest — PIPE-040 · Assignment tracking
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Service role key bypasses RLS; the backend uses explicit user_id filters on every query.
-- Safe to re-run (IF NOT EXISTS guards throughout).

-- ── positions.close_reason ────────────────────────────────────────────────────
-- How a closed position ended: 'bought_back' | 'assigned' | 'expired' | 'rolled'.
-- NULL for pre-existing closed positions (treated as 'bought_back' in the UI).
ALTER TABLE positions ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- ── Assignment events ─────────────────────────────────────────────────────────
-- One row per assignment of an option position. Records the share movement and a
-- tax-ready cost-basis snapshot at the moment of assignment.
CREATE TABLE IF NOT EXISTS assignment_events (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position_id          UUID REFERENCES positions(id) ON DELETE SET NULL,
    portfolio_id         UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    holding_id           UUID REFERENCES holdings(id) ON DELETE SET NULL,
    ticker               TEXT NOT NULL,
    direction            TEXT NOT NULL,          -- 'called_away' | 'put_to_user'
    contracts            INTEGER NOT NULL,
    shares               FLOAT NOT NULL,
    strike               FLOAT NOT NULL,
    premium_per_share    FLOAT,                  -- option sell_price (per share)
    premium_total        FLOAT,                  -- premium_per_share * shares
    cost_basis_per_share FLOAT,                  -- calls: relieved avg_cost; puts: strike - premium
    cost_basis_total     FLOAT,
    proceeds_total       FLOAT,                  -- calls: strike * shares; puts: NULL (acquisition)
    realized_gain        FLOAT,                  -- calls: proceeds - basis; puts: NULL
    acquired_date        DATE,                   -- shares' original purchase date (calls) / assignment date (puts)
    assignment_date      DATE NOT NULL,
    term                 TEXT,                   -- 'short' | 'long' | 'mixed' | NULL (puts)
    basis_known          BOOLEAN NOT NULL DEFAULT TRUE,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assignment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignment_events_owner ON assignment_events
    USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);
CREATE INDEX IF NOT EXISTS assignment_events_user_id     ON assignment_events (user_id);
CREATE INDEX IF NOT EXISTS assignment_events_position_id ON assignment_events (position_id);
CREATE INDEX IF NOT EXISTS assignment_events_portfolio_id ON assignment_events (portfolio_id);
