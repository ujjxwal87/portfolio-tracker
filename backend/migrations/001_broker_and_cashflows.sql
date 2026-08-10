-- Broker attribution on trades + client cash flows (for the money-weighted Nifty benchmark).
-- Additive and re-runnable: safe on the live database.

ALTER TABLE portfolio_tracker.trades ADD COLUMN IF NOT EXISTS broker TEXT;

-- Trades are stored merged-per-day (one row per symbol/date/direction, weighted-average price),
-- so this natural key is unique. Partial: legacy rows have broker NULL and stay exempt until backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trades_natural_key
    ON portfolio_tracker.trades (client_id, broker, stock_symbol, date, type)
    WHERE broker IS NOT NULL;

-- Money in/out of the broker account. Positive = deposit, negative = withdrawal.
-- Trades, brokerage and taxes do NOT belong here — only bank <-> broker transfers.
CREATE TABLE IF NOT EXISTS portfolio_tracker.cash_flows (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID          NOT NULL REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE,
    date        DATE          NOT NULL,
    amount      NUMERIC(16,2) NOT NULL CHECK (amount <> 0),
    broker      TEXT,
    ref_id      TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_flows_client_date ON portfolio_tracker.cash_flows (client_id, date);

-- Ledger entry id, where the broker gives one — makes re-importing a ledger idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flows_ref
    ON portfolio_tracker.cash_flows (broker, ref_id)
    WHERE ref_id IS NOT NULL;
