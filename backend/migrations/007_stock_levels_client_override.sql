-- Per-client override of a symbol's levels.
--
-- 006 keyed levels by symbol alone: one stop for an idea, shared by every client holding it. That
-- stays the default and the common case. This adds an optional client_id so ONE client can carry a
-- different stop on the same symbol without disturbing anyone else.
--
-- client_id IS NULL  -> the shared level for that symbol (what everybody gets)
-- client_id IS NOT NULL -> that client's override, which wins for them only
--
-- Two partial unique indexes rather than a primary key, because a PK cannot hold NULL and the NULL
-- row is precisely the one we must keep unique.
ALTER TABLE portfolio_tracker.stock_levels
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE;

ALTER TABLE portfolio_tracker.stock_levels DROP CONSTRAINT IF EXISTS stock_levels_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_levels_shared
    ON portfolio_tracker.stock_levels (stock_symbol) WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_levels_client
    ON portfolio_tracker.stock_levels (client_id, stock_symbol) WHERE client_id IS NOT NULL;
