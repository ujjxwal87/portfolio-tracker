"""Admin CLI for login accounts. Run from backend/ with the venv active.

    python manage_users.py migrate
    python manage_users.py list
    python manage_users.py create-admin <username> [password]
    python manage_users.py create-client <client-name-or-uuid> <username> [password]
    python manage_users.py reset <username> [password]

Omit the password and a readable temporary one is generated and printed. Accounts always
start with must_change_password = TRUE, so the holder is forced to set their own at login.
"""
import sys
from pathlib import Path

from auth import hash_password, temp_password
from db import get_db


def migrate():
    sql = (Path(__file__).parent / "migrations" / "003_auth.sql").read_text()
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(sql)
    print("003_auth.sql applied")


def list_users():
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT u.username, u.role, c.name, u.must_change_password, u.last_login_at
                 FROM portfolio_tracker.app_users u
                 LEFT JOIN portfolio_tracker.clients c ON c.id = u.client_id
                ORDER BY u.role, u.username"""
        )
        rows = cur.fetchall()
    if not rows:
        print("no accounts yet")
        return
    for username, role, name, must_change, last_login in rows:
        flags = " [must change password]" if must_change else ""
        seen = last_login.strftime("%Y-%m-%d %H:%M") if last_login else "never"
        print(f"{username:<20} {role:<7} {name or '—':<20} last login: {seen}{flags}")


def _insert(username: str, plain: str, role: str, client_id):
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO portfolio_tracker.app_users (username, password_hash, role, client_id)
               VALUES (%s, %s, %s, %s)""",
            (username, hash_password(plain), role, client_id),
        )


def resolve_client(ref: str):
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM portfolio_tracker.clients WHERE id::text = %s OR LOWER(name) = LOWER(%s)",
            (ref, ref),
        )
        rows = cur.fetchall()
    if not rows:
        sys.exit(f"no client matching {ref!r}")
    if len(rows) > 1:
        sys.exit(f"{ref!r} matches {len(rows)} clients — pass the UUID instead")
    return rows[0]


def create_admin(username: str, plain: str):
    _insert(username, plain, "admin", None)
    print(f"admin {username} created — temporary password: {plain}")


def create_client(ref: str, username: str, plain: str):
    client_id, name = resolve_client(ref)
    _insert(username, plain, "client", client_id)
    print(f"client login {username} created for {name} — temporary password: {plain}")


def reset(username: str, plain: str):
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE portfolio_tracker.app_users
                  SET password_hash = %s, must_change_password = TRUE, updated_at = NOW()
                WHERE LOWER(username) = LOWER(%s)""",
            (hash_password(plain), username),
        )
        if cur.rowcount == 0:
            sys.exit(f"no account named {username!r}")
    print(f"{username} reset — temporary password: {plain}")


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd, rest = argv[0], argv[1:]
    if cmd == "migrate":
        migrate()
    elif cmd == "list":
        list_users()
    elif cmd == "create-admin" and len(rest) in (1, 2):
        create_admin(rest[0], rest[1] if len(rest) > 1 else temp_password())
    elif cmd == "create-client" and len(rest) in (2, 3):
        create_client(rest[0], rest[1], rest[2] if len(rest) > 2 else temp_password())
    elif cmd == "reset" and len(rest) in (1, 2):
        reset(rest[0], rest[1] if len(rest) > 1 else temp_password())
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
