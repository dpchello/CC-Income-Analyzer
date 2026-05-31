-- ── 004_autobot.sql ──────────────────────────────────────────────────────────
-- Auto-trade simulation bot support.
--
-- Adds two columns to `positions`:
--   roll_of_position_id  — when a position was opened as a roll, points to
--                          the closed position it replaced. NULL for fresh opens.
--   simulated            — true for autobot-written positions. Lets us filter
--                          live vs. simulated trades in queries.
--
-- Idempotent: re-runnable without error.

ALTER TABLE positions
    ADD COLUMN IF NOT EXISTS roll_of_position_id UUID
        REFERENCES positions(id) ON DELETE SET NULL;

ALTER TABLE positions
    ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS positions_roll_chain ON positions (roll_of_position_id);
CREATE INDEX IF NOT EXISTS positions_simulated   ON positions (simulated) WHERE simulated = TRUE;
