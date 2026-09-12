-- Trade vs investment, decided when the position is OPENED.
--
-- The label lives on the BUY leg only. A SELL inherits from whichever lot it closes (FIFO, the
-- same matching the portfolio resolver already does), so a position can never be half-trade and
-- half-investment, and there is no second decision to get wrong at exit time. SELL rows therefore
-- keep the default and nothing ever reads their value.
--
-- Everything already in the book becomes a trade, which is what the win-rate and risk/reward
-- numbers have been measuring all along -- so those figures do not move until something is
-- deliberately reclassified.
ALTER TABLE portfolio_tracker.trades
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'trade';

ALTER TABLE portfolio_tracker.trades DROP CONSTRAINT IF EXISTS trades_kind_check;
ALTER TABLE portfolio_tracker.trades
    ADD CONSTRAINT trades_kind_check CHECK (kind IN ('trade', 'investment'));

CREATE INDEX IF NOT EXISTS idx_trades_kind ON portfolio_tracker.trades (client_id, kind);
