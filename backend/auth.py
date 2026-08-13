"""Password hashing, JWT issue/verify, and the FastAPI dependencies that enforce roles.

Two roles. `admin` (you) sees everything; `client` sees only the rows belonging to its own
client_id. Tokens are self-contained — role and client_id ride inside the JWT, so authorizing
a request needs no database round trip.
"""
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from db import get_db

log = logging.getLogger("auth")

TOKEN_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "12"))
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

def create_token(user_id: str, role: str, client_id, username: str, name) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "cid": str(client_id) if client_id else None,
        "usr": username,
        "nm": name,
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, {"WWW-Authenticate": "Bearer"})


# ── dependencies ───────────────────────────────────────────────────────────────

def current_user(
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
    return CurrentUser(
        id=payload["sub"],
        username=payload.get("usr", ""),
        role=payload.get("role", "client"),
        client_id=payload.get("cid"),
        name=payload.get("nm"),
    )


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user


def scope_client_id(user: CurrentUser, requested: Optional[str]) -> Optional[str]:
    """Resolve which client_id a request may read.

    Admin gets whatever it asked for (None = all clients). A client is pinned to its own
    id, and asking for someone else's is a 403 rather than a silent rewrite.
    """
    if user.is_admin:
        return requested
    if requested and requested != user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your data")
    return user.client_id


# ── account lookup ─────────────────────────────────────────────────────────────

def fetch_account(username: str) -> Optional[dict]:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT u.id, u.username, u.password_hash, u.role, u.client_id,
                      u.must_change_password, c.name
                 FROM portfolio_tracker.app_users u
                 LEFT JOIN portfolio_tracker.clients c ON c.id = u.client_id
                WHERE LOWER(u.username) = LOWER(%s)""",
            (username,),
        )
        row = cur.fetchone()
    if not row:
        return None
    keys = ["id", "username", "password_hash", "role", "client_id", "must_change_password", "name"]
    account = dict(zip(keys, row))
    account["id"] = str(account["id"])
    account["client_id"] = str(account["client_id"]) if account["client_id"] else None
    return account


def fetch_account_by_id(user_id: str) -> Optional[dict]:
    with get_db() as conn, conn.cursor() as cur:
        cur.execute("SELECT username FROM portfolio_tracker.app_users WHERE id = %s", (user_id,))
        row = cur.fetchone()
    return fetch_account(row[0]) if row else None


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
