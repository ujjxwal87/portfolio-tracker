-- Idle cash sitting in the broker account. Part of portfolio value, so it belongs in the
-- benchmark comparison; it cannot be derived reliably when a client's trades are incomplete.
ALTER TABLE portfolio_tracker.clients
    ADD COLUMN IF NOT EXISTS cash_balance NUMERIC(16,2) NOT NULL DEFAULT 0;
