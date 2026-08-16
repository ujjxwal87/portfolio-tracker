import os
import threading
import psycopg2
import psycopg2.extras
import psycopg2.pool
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

# The DB is Supabase in ap-northeast-2; a fresh TCP+TLS handshake from here costs ~0.8s while the
# query itself is ~0.25s. Opening a connection per request meant several handshakes per page load
# and a multi-second wait before anything rendered. The pool keeps them warm instead.
_pool = None
_lock = threading.Lock()
# psycopg2's pool RAISES "connection pool exhausted" rather than waiting, which turns a burst of
# concurrent requests into 500s. The semaphore makes callers queue for a slot instead.
_MAX = int(os.getenv("DB_POOL_MAX", 10))
_slots = threading.BoundedSemaphore(_MAX)


def _dsn():
    return dict(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSLMODE", "prefer"),
        connect_timeout=10,
        # Supabase's pooler drops idle connections; without keepalives a pooled handle can look
        # fine and then fail on first use.
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
    )


def _get_pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    int(os.getenv("DB_POOL_MIN", 1)),
                    _MAX,
                    **_dsn(),
                )
    return _pool


@contextmanager
def get_db():
    pool = _get_pool()
    _slots.acquire()          # wait for a free slot rather than erroring out
    try:
        conn = pool.getconn()
    except Exception:
        _slots.release()
        raise
    bad = False
    try:
        # A handle that has been sitting idle may already be dead. Prove it before handing it out.
        if conn.closed:
            raise psycopg2.OperationalError("pooled connection closed")
        conn.autocommit = False
        yield conn
        conn.commit()
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        bad = True
        raise
    except Exception:
        try:
            conn.rollback()
        except Exception:
            bad = True
        raise
    finally:
        try:
            pool.putconn(conn, close=bad)
        except Exception:
            pass
        _slots.release()
