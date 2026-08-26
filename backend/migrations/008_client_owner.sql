-- Two advisor books in one app.
--
-- Until now "admin" meant one person and every client belonged to them implicitly. A second admin
-- (Jayesh) needs his own book: his clients, his trades, invisible to the first admin and vice
-- versa. So a client now names the admin who owns it, and every admin-scoped read and write
-- filters on that. The two admins are peers — neither can see the other's clients.
--
-- Backfill points every existing client at the original admin, which is what they were.
ALTER TABLE portfolio_tracker.clients
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES portfolio_tracker.app_users(id);

UPDATE portfolio_tracker.clients
   SET owner_id = (SELECT id FROM portfolio_tracker.app_users
                    WHERE role = 'admin' ORDER BY created_at LIMIT 1)
 WHERE owner_id IS NULL;

ALTER TABLE portfolio_tracker.clients ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_owner ON portfolio_tracker.clients (owner_id);

-- A shared level (client_id IS NULL) was global, so one admin's stop on a symbol would silently
-- become the other's. Shared rows now belong to an admin too; per-client rows take their owner
-- from the client, so they need no column of their own.
ALTER TABLE portfolio_tracker.stock_levels
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES portfolio_tracker.app_users(id);

UPDATE portfolio_tracker.stock_levels
   SET owner_id = (SELECT id FROM portfolio_tracker.app_users
                    WHERE role = 'admin' ORDER BY created_at LIMIT 1)
 WHERE owner_id IS NULL AND client_id IS NULL;

-- The shared row is unique per (admin, symbol) now, not per symbol.
DROP INDEX IF EXISTS portfolio_tracker.uq_stock_levels_shared;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_levels_shared
    ON portfolio_tracker.stock_levels (owner_id, stock_symbol) WHERE client_id IS NULL;
