CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS portfolio_tracker;

CREATE TABLE IF NOT EXISTS portfolio_tracker.clients (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT        NOT NULL,
    phone        TEXT,
    email        TEXT,
    joining_date DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_tracker.trades (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     UUID        NOT NULL REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE,
    stock_symbol  TEXT        NOT NULL,
    type          TEXT        NOT NULL CHECK (type IN ('BUY', 'SELL')),
    quantity      INTEGER     NOT NULL,
    price         NUMERIC(14,4) NOT NULL,
    date          DATE        NOT NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_client_id    ON portfolio_tracker.trades(client_id);
CREATE INDEX IF NOT EXISTS idx_trades_stock_symbol ON portfolio_tracker.trades(stock_symbol);
CREATE INDEX IF NOT EXISTS idx_trades_date         ON portfolio_tracker.trades(date);

-- See migrations/001_broker_and_cashflows.sql
ALTER TABLE portfolio_tracker.trades ADD COLUMN IF NOT EXISTS broker TEXT;

-- See migrations/013_trade_capital.sql
ALTER TABLE portfolio_tracker.trades ADD COLUMN IF NOT EXISTS capital NUMERIC(14,2);

-- See migrations/014_capital_adjustments.sql
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_trades_natural_key
    ON portfolio_tracker.trades (client_id, broker, stock_symbol, date, type)
    WHERE broker IS NOT NULL;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_flows_ref
    ON portfolio_tracker.cash_flows (broker, ref_id)
    WHERE ref_id IS NOT NULL;

-- See migrations/015_trade_reviews.sql
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
