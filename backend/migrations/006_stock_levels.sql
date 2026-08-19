-- Stop-loss / target levels per SYMBOL, not per client and not per trade.
--
-- They live here because Dhan cannot supply them: the levels are drawn on the TradingView chart at
-- tv.dhan.co as a long-position annotation, and chart drawings are not exposed by any DhanHQ v2
-- endpoint (orders, super orders, forever/GTT, positions and holdings are the whole surface). Only
-- levels placed as real Super or Forever orders are readable — these are not, so they are typed in.
--
-- Keyed by symbol alone because a level is a PRICE, and the same idea runs in every client account:
-- clients enter at different prices and so carry different risk/reward, but the stop and the target
-- are the same number for all of them. Per-client overrides would be a second, nullable-keyed table.
CREATE TABLE IF NOT EXISTS portfolio_tracker.stock_levels (
    stock_symbol TEXT          PRIMARY KEY,
    stop_loss    NUMERIC(14,4),
    target       NUMERIC(14,4),
    notes        TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- A row with neither level is noise, so require at least one.
    CONSTRAINT stock_levels_one_level CHECK (stop_loss IS NOT NULL OR target IS NOT NULL),
    -- Every position in this book is long, so a target below its stop is a data-entry slip.
    CONSTRAINT stock_levels_ordered CHECK (
        stop_loss IS NULL OR target IS NULL OR target > stop_loss)
);
