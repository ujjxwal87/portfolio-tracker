-- A trade's plan can now be journalled the moment it's entered, before any exit exists.
-- That entry-plan row has sell_trade_id NULL (one per buy lot). Once the lot is sold, the
-- frontend shows the plan merged into each exit's own review row (buy_trade_id, sell_trade_id).
ALTER TABLE portfolio_tracker.trade_reviews ALTER COLUMN sell_trade_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_reviews_open_plan
    ON portfolio_tracker.trade_reviews (buy_trade_id) WHERE sell_trade_id IS NULL;
