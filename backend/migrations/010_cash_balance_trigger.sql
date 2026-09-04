-- cash_balance has always been a value someone had to remember to update by hand -- the Dhan
-- ledger sync sets it, but the app's own "+ Add trade" button, every other import script, and
-- any direct SQL fix never touched it. Every trade or deposit added any other way left it stale
-- from that point on (Ramesh Raj's read 2,241.90 against a true 23,783.20 after his last few
-- trades went in). A trigger closes this for good: it fires no matter which of those paths wrote
-- the row, so cash_balance can no longer drift out of sync with trades + cash_flows.
CREATE OR REPLACE FUNCTION portfolio_tracker.apply_trade_cash_delta()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance +
            CASE WHEN NEW.type = 'BUY' THEN -NEW.quantity * NEW.price ELSE NEW.quantity * NEW.price END
            WHERE id = NEW.client_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance
            - CASE WHEN OLD.type = 'BUY' THEN -OLD.quantity * OLD.price ELSE OLD.quantity * OLD.price END
            WHERE id = OLD.client_id;
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance +
            CASE WHEN NEW.type = 'BUY' THEN -NEW.quantity * NEW.price ELSE NEW.quantity * NEW.price END
            WHERE id = NEW.client_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance
            - CASE WHEN OLD.type = 'BUY' THEN -OLD.quantity * OLD.price ELSE OLD.quantity * OLD.price END
            WHERE id = OLD.client_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION portfolio_tracker.apply_cash_flow_delta()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance + NEW.amount WHERE id = NEW.client_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance - OLD.amount WHERE id = OLD.client_id;
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance + NEW.amount WHERE id = NEW.client_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE portfolio_tracker.clients SET cash_balance = cash_balance - OLD.amount WHERE id = OLD.client_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_cash_delta ON portfolio_tracker.trades;
CREATE TRIGGER trg_trades_cash_delta
    AFTER INSERT OR UPDATE OR DELETE ON portfolio_tracker.trades
    FOR EACH ROW EXECUTE FUNCTION portfolio_tracker.apply_trade_cash_delta();

DROP TRIGGER IF EXISTS trg_cash_flows_cash_delta ON portfolio_tracker.cash_flows;
CREATE TRIGGER trg_cash_flows_cash_delta
    AFTER INSERT OR UPDATE OR DELETE ON portfolio_tracker.cash_flows
    FOR EACH ROW EXECUTE FUNCTION portfolio_tracker.apply_cash_flow_delta();
