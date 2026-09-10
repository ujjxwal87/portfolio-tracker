"""Password hashing, JWT issue/verify, and the FastAPI dependencies that enforce roles.

Three roles. `admin` sees the clients IT OWNS — there is more than one advisor now, and they
are peers, so an admin is scoped to its own book exactly as a client is scoped to itself;
`client` sees only the rows belonging to its own client_id; `guest` sees the demo slice. Tokens are self-contained — role and client_id ride inside the JWT, so authorizing
a request needs no database round trip.
"""
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from db import get_db

log = logging.getLogger("auth")

# Two clocks: a sliding idle window, and a hard cap since the original login that no amount
# of activity extends. A token older than REFRESH_AFTER is swapped for a fresh one mid-request.
IDLE_TTL_MINUTES = int(os.getenv("JWT_IDLE_MINUTES", "120"))
ABSOLUTE_TTL_DAYS = int(os.getenv("JWT_ABSOLUTE_DAYS", "7"))
REFRESH_AFTER_MINUTES = int(os.getenv("JWT_REFRESH_AFTER_MINUTES", "15"))
REFRESH_HEADER = "X-Refresh-Token"
ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 8

_secret = os.getenv("JWT_SECRET")
if not _secret:
    # Ephemeral secret keeps local dev working; every restart invalidates old tokens.
    _secret = secrets.token_urlsafe(48)
    log.warning("JWT_SECRET is not set — using a random per-process secret. Set it in production.")
JWT_SECRET = _secret

_bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    id: str
    username: str
    role: str
    client_id: Optional[str] = None
    name: Optional[str] = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_guest(self) -> bool:
        return self.role == "guest"


# ── passwords ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


_WORDS = ["tiger", "mango", "river", "amber", "delta", "olive", "cobra", "pearl", "zebra", "linen"]


def temp_password() -> str:
    """Readable one-time password to hand over verbally or on chat."""
    return f"{secrets.choice(_WORDS)}-{secrets.choice(_WORDS)}-{secrets.randbelow(9000) + 1000}"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def validate_password(plain: str) -> None:
    if len(plain or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Password must be at least {MIN_PASSWORD_LENGTH} characters")


# ── tokens ─────────────────────────────────────────────────────────────────────

def password_version(account: dict) -> int:
    """Credential fingerprint. app_users.updated_at moves on every password write, so a
    token minted before a reset can be told apart from one minted after."""
    updated = account.get("updated_at")
    return int(updated.timestamp()) if updated else 0


def create_token(
    user_id: str, role: str, client_id, username: str, name, pv: int = 0, oat: Optional[int] = None
) -> str:
    now = datetime.now(timezone.utc)
    # Admin sessions never expire — neither clock applies (see the "oat" check below too).
    idle_ttl = timedelta(days=3650) if role == "admin" else timedelta(minutes=IDLE_TTL_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "cid": str(client_id) if client_id else None,
        "usr": username,
        "nm": name,
        "pv": pv,
        "oat": oat or int(now.timestamp()),  # original login; the absolute cap counts from here
        "iat": now,
        "exp": now + idle_ttl,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def token_for_account(account: dict, oat: Optional[int] = None) -> str:
    return create_token(
        account["id"],
        account["role"],
        account["client_id"],
        account["username"],
        account["name"],
        pv=password_version(account),
        oat=oat,
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, {"WWW-Authenticate": "Bearer"})


# ── dependencies ───────────────────────────────────────────────────────────────

def current_user(
    response: Response,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> CurrentUser:
    if creds is None:
        raise _unauthorized("Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Session expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid token")

    now = int(datetime.now(timezone.utc).timestamp())
    oat = int(payload.get("oat") or payload.get("iat") or now)
    if payload.get("role") != "admin" and now - oat > ABSOLUTE_TTL_DAYS * 86400:
        raise _unauthorized("Session expired")

    user = CurrentUser(
        id=payload["sub"],
        username=payload.get("usr", ""),
        role=payload.get("role", "client"),
        client_id=payload.get("cid"),
        name=payload.get("nm"),
    )

    # Slide the idle window forward. Re-minting is throttled so most requests stay DB-free;
    # the same lookup is what catches a password reset and ends the old session.
    if now - int(payload.get("iat") or now) >= REFRESH_AFTER_MINUTES * 60:
        account = fetch_account_by_id(user.id)
        if not account:
            raise _unauthorized("Account no longer exists")
        if password_version(account) != int(payload.get("pv") or 0):
            raise _unauthorized("Password changed — please sign in again")
        response.headers[REFRESH_HEADER] = token_for_account(account, oat=oat)

    return user


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user


def owns_client(user: CurrentUser, client_id: str) -> bool:
    """Is `client_id` in this admin's own book? False for anyone who is not an admin."""
    if not user.is_admin or not client_id:
        return False
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM portfolio_tracker.clients WHERE id = %s AND owner_id = %s",
                (client_id, user.id),
            )
            return cur.fetchone() is not None


def assert_owns_client(user: CurrentUser, client_id: str) -> None:
    """404, not 403, when the client belongs to the other advisor — a 403 would confirm the id
    exists, which is itself a leak between two books that must not know about each other."""
    if not owns_client(user, client_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")


def scope_client_id(
    user: CurrentUser, requested: Optional[str], guest_ids: Optional[list] = None
) -> Optional[str]:
    """Resolve which client_id a request may read.

    Admin gets whatever it asked for (None = all clients). A client is pinned to its own id.
    A guest may ask for any of the three demo clients but nothing else. Asking for someone
    else's id is a 403 rather than a silent rewrite.
    """
    if user.is_admin:
        if requested:
            assert_owns_client(user, requested)
        return requested
    if user.is_guest:
        allowed = guest_ids or []
        if requested is None:
            return None  # caller restricts to the demo set itself
        if requested not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not available on the demo login")
        return requested
    if requested and requested != user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your data")
    return user.client_id


# ── account lookup ─────────────────────────────────────────────────────────────

def fetch_account(username: str) -> Optional[dict]:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT u.id, u.username, u.password_hash, u.role, u.client_id,
                      u.must_change_password, c.name, u.updated_at
                 FROM portfolio_tracker.app_users u
                 LEFT JOIN portfolio_tracker.clients c ON c.id = u.client_id
                WHERE LOWER(u.username) = LOWER(%s)""",
            (username,),
        )
        row = cur.fetchone()
    if not row:
        return None
    keys = ["id", "username", "password_hash", "role", "client_id",
            "must_change_password", "name", "updated_at"]
    account = dict(zip(keys, row))
    account["id"] = str(account["id"])
    account["client_id"] = str(account["client_id"]) if account["client_id"] else None
    return account


# One query, not two. This runs on EVERY authenticated request, and the DB is a region away —
# the old username-then-refetch round trip doubled auth latency on every page load.
_ACCOUNT_COLS = ["id", "username", "password_hash", "role", "client_id",
                 "must_change_password", "name", "updated_at"]


def _row_to_account(row) -> dict:
    account = dict(zip(_ACCOUNT_COLS, row))
    account["id"] = str(account["id"])
    account["client_id"] = str(account["client_id"]) if account["client_id"] else None
    return account


def fetch_account_by_id(user_id: str) -> Optional[dict]:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT u.id, u.username, u.password_hash, u.role, u.client_id,
                      u.must_change_password, c.name, u.updated_at
                 FROM portfolio_tracker.app_users u
                 LEFT JOIN portfolio_tracker.clients c ON c.id = u.client_id
                WHERE u.id = %s""",
            (user_id,),
        )
        row = cur.fetchone()
    return _row_to_account(row) if row else None


def touch_last_login(user_id: str) -> None:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE portfolio_tracker.app_users SET last_login_at = NOW() WHERE id = %s",
            (user_id,),
        )


def set_password(user_id: str, plain: str, must_change: bool = False) -> None:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE portfolio_tracker.app_users
                  SET password_hash = %s, must_change_password = %s, updated_at = NOW()
                WHERE id = %s""",
            (hash_password(plain), must_change, user_id),
        )
