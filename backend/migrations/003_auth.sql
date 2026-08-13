-- Login accounts for the admin and for each client. Kept separate from clients so both roles
-- share one login path and a client row can exist before it has credentials.
CREATE TABLE IF NOT EXISTS portfolio_tracker.app_users (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username             TEXT        NOT NULL,
    password_hash        TEXT        NOT NULL,
    role                 TEXT        NOT NULL CHECK (role IN ('admin', 'client')),
    client_id            UUID        REFERENCES portfolio_tracker.clients(id) ON DELETE CASCADE,
    must_change_password BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at        TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_users_role_client CHECK (
        (role = 'client' AND client_id IS NOT NULL) OR
        (role = 'admin'  AND client_id IS NULL)
    )
);

-- Usernames are matched case-insensitively, so uniqueness must be too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username ON portfolio_tracker.app_users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_client ON portfolio_tracker.app_users (client_id)
    WHERE client_id IS NOT NULL;
