-- Stop-loss per BUY, not just per symbol (stock_levels). Two positions in the same stock can be
-- worked with different stops, and a single symbol-level stop sits above the older lot's entry,
-- so that lot fell back to the flat 1% rule. The risk-capital ledger now reads this column first
-- and only falls back to the symbol's level when it is NULL (every existing row stays NULL).
ALTER TABLE portfolio_tracker.trades ADD COLUMN IF NOT EXISTS stop_loss NUMERIC(14,4);
