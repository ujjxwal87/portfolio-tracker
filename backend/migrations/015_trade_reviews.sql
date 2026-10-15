-- One row per closed FIFO match (a buy_trade_id + sell_trade_id pair), holding the admin's
-- trade-retrospect journal entry for it: plan vs actual, setup/strategy, emotion, discipline,
-- mistakes, lesson, and an optional chart screenshot.
--
-- chart_url stores a base64 data: URI directly in Postgres rather than a path/object-storage
-- URL — the backend runs on a Render free instance whose filesystem is wiped on every redeploy,
-- so anything written to local disk would be lost; the database is the only thing that persists.
CREATE TABLE IF NOT EXISTS portfolio_tracker.trade_reviews (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    buy_trade_id   UUID          NOT NULL REFERENCES portfolio_tracker.trades(id) ON DELETE CASCADE,
    sell_trade_id  UUID          NOT NULL REFERENCES portfolio_tracker.trades(id) ON DELETE CASCADE,
    strategy       TEXT,
    planned_entry  NUMERIC(15,2),
    planned_sl     NUMERIC(15,2),
    planned_target NUMERIC(15,2),
    followed_plan  BOOLEAN,
    entry_reason   TEXT,
    exit_reason    TEXT,
    emotion        TEXT,
    discipline     SMALLINT CHECK (discipline BETWEEN 1 AND 5),
    mistakes       TEXT[] NOT NULL DEFAULT '{}',
    lesson         TEXT,
    chart_url      TEXT,
    reviewed       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (buy_trade_id, sell_trade_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_reviews_sell ON portfolio_tracker.trade_reviews (sell_trade_id);
