-- Tracks the last time a client's trades were reconciled against a real broker source (Dhan
-- token, Zerodha tradebook CSV, or Groww P&L excel) — independent of whether that check found
-- anything new to insert. Without this, "no new trades" and "never checked" look identical: a
-- client stuck at their last real trade date for months could mean either.
ALTER TABLE portfolio_tracker.clients
    ADD COLUMN IF NOT EXISTS trades_synced_at TIMESTAMPTZ;
