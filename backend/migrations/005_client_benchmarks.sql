-- Per-client benchmark selection. Nifty 50 is always compared and is NOT stored here — it is the
-- constant every client is measured against. This column holds only the ADDITIONAL benchmarks a
-- given client should see, so an empty array means "Nifty only", which is the previous behaviour.
ALTER TABLE portfolio_tracker.clients
    ADD COLUMN IF NOT EXISTS benchmark_keys TEXT[] NOT NULL DEFAULT '{}';
