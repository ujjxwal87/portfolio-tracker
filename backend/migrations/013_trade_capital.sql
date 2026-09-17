-- Manual risk-capital ledger anchor, one column, almost always NULL.
--
-- Only the current-most-recent trade for a client ever needs a value typed in — everything after
-- it is computed forward in the frontend (resolvePortfolio's FIFO matches already carry what's
-- needed): a BUY cuts a risk slice from the anchor (stop-loss distance × qty if a stop is set,
-- else a flat 1%), a SELL gives back the slice it closed plus the realized P&L. Setting capital
-- on a later row moves the anchor there instead — nothing is ever computed past the newest
-- explicit value. Never computed server-side: this column stores only what a person typed in.
ALTER TABLE portfolio_tracker.trades ADD COLUMN IF NOT EXISTS capital NUMERIC(14,2);
