-- Lumpsum moves into (or out of) a client's swing-trading capital, independent of any single
-- trade. The risk-capital ledger (see 013_trade_capital.sql and capitalLedger in App.jsx) treats
-- these exactly like a BUY/SELL row when it walks a client's history chronologically: an
-- adjustment just adds `amount` to whatever capital was running at that date, no risk/pnl math.
CREATE TABLE IF NOT EXISTS portfolio_tracker.capital_adjustments (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID          NOT NULL REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE,
    date        DATE          NOT NULL,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
    notes       TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_adjustments_client_date
    ON portfolio_tracker.capital_adjustments (client_id, date);
