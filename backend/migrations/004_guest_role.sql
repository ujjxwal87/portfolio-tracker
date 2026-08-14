-- A shared demo login for pitching to prospects. Like admin it owns no client row; unlike admin
-- it can only read an anonymised slice of three real clients.
ALTER TABLE portfolio_tracker.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE portfolio_tracker.app_users
    ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'client', 'guest'));

ALTER TABLE portfolio_tracker.app_users DROP CONSTRAINT IF EXISTS app_users_role_client;
ALTER TABLE portfolio_tracker.app_users
    ADD CONSTRAINT app_users_role_client CHECK (
        (role = 'client' AND client_id IS NOT NULL) OR
        (role IN ('admin', 'guest') AND client_id IS NULL)
    );
