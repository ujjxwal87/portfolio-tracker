-- Our own capital sits in the same book as the clients'.
--
-- Ujjawal's and his mother's accounts are tracked here like any other client, but their profit is
-- not advisory performance — it is house money. Rolling it into the "All clients" dashboard
-- inflates the book we report on. So a client can be flagged as own money: the dashboard's
-- all-clients aggregate skips those rows, while Portfolio and Trades still show them under "All"
-- (the question there is "where do we hold this?", which includes our own accounts).
--
-- Picking a flagged client by name still shows their full figures everywhere.
ALTER TABLE portfolio_tracker.clients
    ADD COLUMN IF NOT EXISTS is_own_money BOOLEAN NOT NULL DEFAULT FALSE;
