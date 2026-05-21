import logging
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_db

load_dotenv()

app = FastAPI(title="Portfolio Tracker API")

_origins = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    joining_date: Optional[date] = None


class TradeCreate(BaseModel):
    client_id: str
    stock_symbol: str
    type: str  # BUY | SELL
    quantity: int
    price: float
    date: date
    notes: Optional[str] = None


# ── Clients ────────────────────────────────────────────────────────────────────

@app.get("/api/clients")
def list_clients():
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, phone, email, joining_date, created_at, updated_at "
                "FROM portfolio_tracker.clients ORDER BY created_at DESC"
            )
            return cur.fetchall()


@app.post("/api/clients", status_code=201)
def create_client(body: ClientCreate):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO portfolio_tracker.clients (name, phone, email, joining_date) "
                "VALUES (%s, %s, %s, %s) RETURNING id, name, phone, email, joining_date, created_at, updated_at",
                (body.name, body.phone, body.email, body.joining_date),
            )
            return cur.fetchone()


@app.put("/api/clients/{client_id}")
def update_client(client_id: str, body: ClientCreate):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE portfolio_tracker.clients "
                "SET name=%s, phone=%s, email=%s, joining_date=%s, updated_at=NOW() "
                "WHERE id=%s RETURNING id, name, phone, email, joining_date, created_at, updated_at",
                (body.name, body.phone, body.email, body.joining_date, client_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Client not found")
            return row


@app.delete("/api/clients/{client_id}", status_code=204)
def delete_client(client_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM portfolio_tracker.clients WHERE id=%s", (client_id,)
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Client not found")


# ── Trades ─────────────────────────────────────────────────────────────────────

@app.get("/api/trades")
def list_trades():
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT t.id, t.client_id, c.name AS client_name,
                       t.stock_symbol, t.type, t.quantity, t.price,
                       t.date, t.notes, t.created_at, t.updated_at
                FROM portfolio_tracker.trades t
                JOIN portfolio_tracker.clients c ON t.client_id = c.id
                ORDER BY t.date ASC, t.created_at ASC
                """
            )
            return cur.fetchall()


@app.post("/api/trades", status_code=201)
def create_trade(body: TradeCreate):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO portfolio_tracker.trades
                    (client_id, stock_symbol, type, quantity, price, date, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    body.client_id,
                    body.stock_symbol.upper(),
                    body.type,
                    body.quantity,
                    body.price,
                    body.date,
                    body.notes,
                ),
            )
            new_id = cur.fetchone()["id"]
            cur.execute(
                """
                SELECT t.id, t.client_id, c.name AS client_name,
                       t.stock_symbol, t.type, t.quantity, t.price,
                       t.date, t.notes, t.created_at, t.updated_at
                FROM portfolio_tracker.trades t
                JOIN portfolio_tracker.clients c ON t.client_id = c.id
                WHERE t.id = %s
                """,
                (new_id,),
            )
            return cur.fetchone()


@app.put("/api/trades/{trade_id}")
def update_trade(trade_id: str, body: TradeCreate):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE portfolio_tracker.trades
                SET client_id=%s, stock_symbol=%s, type=%s, quantity=%s,
                    price=%s, date=%s, notes=%s, updated_at=NOW()
                WHERE id=%s
                RETURNING id
                """,
                (
                    body.client_id,
                    body.stock_symbol.upper(),
                    body.type,
                    body.quantity,
                    body.price,
                    body.date,
                    body.notes,
                    trade_id,
                ),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Trade not found")
            cur.execute(
                """
                SELECT t.id, t.client_id, c.name AS client_name,
                       t.stock_symbol, t.type, t.quantity, t.price,
                       t.date, t.notes, t.created_at, t.updated_at
                FROM portfolio_tracker.trades t
                JOIN portfolio_tracker.clients c ON t.client_id = c.id
                WHERE t.id = %s
                """,
                (row["id"],),
            )
            return cur.fetchone()


@app.delete("/api/trades/{trade_id}", status_code=204)
def delete_trade(trade_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM portfolio_tracker.trades WHERE id=%s", (trade_id,)
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Trade not found")


_YF_HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def _fetch_one_price(sym: str):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS"
    r = requests.get(url, headers=_YF_HEADERS, timeout=8)
    r.raise_for_status()
    price = r.json()["chart"]["result"][0]["meta"]["regularMarketPrice"]
    return sym, round(float(price), 2)


# ── Live prices (Yahoo Finance v8 chart API — free, no key needed) ─────────────

@app.get("/api/prices")
def get_prices(symbols: str):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    prices = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(_fetch_one_price, s): s for s in symbol_list}
        for future in as_completed(futures):
            try:
                sym, price = future.result()
                prices[sym] = price
            except Exception as e:
                logger.warning(f"Price fetch failed for {futures[future]}: {e}")
    return prices


# ── Monthly first-trading-day prices for portfolio stocks ──────────────────────

@app.get("/api/prices/monthly")
def get_monthly_prices(symbols: str):
    """Returns the closing price on the first trading day of each month from Jan 2026."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    start = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())
    end   = int(datetime.now(tz=timezone.utc).timestamp())

    def fetch_monthly(sym: str):
        r = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS",
            params={"period1": start, "period2": end, "interval": "1d"},
            headers=_YF_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()["chart"]["result"][0]
        timestamps = data.get("timestamp", [])
        closes = data["indicators"]["quote"][0].get("close", [])
        daily = {
            datetime.utcfromtimestamp(ts).date(): round(float(c), 2)
            for ts, c in zip(timestamps, closes) if c is not None
        }
        monthly = {}
        year, month = 2026, 1
        now_date = datetime.now(tz=timezone.utc).date()
        while date(year, month, 1) <= now_date:
            label = datetime(year, month, 1).strftime("%b %y")
            for day in range(1, 8):
                try:
                    d = date(year, month, day)
                    if d in daily:
                        monthly[label] = daily[d]
                        break
                except ValueError:
                    break
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        return sym, monthly

    result = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch_monthly, s): s for s in symbol_list}
        for f in as_completed(futures):
            try:
                sym, monthly = f.result()
                result[sym] = monthly
            except Exception as e:
                logger.warning(f"Monthly price fetch failed for {futures[f]}: {e}")
    return result


# ── Nifty 50 monthly data (Yahoo Finance — from Jan 2026) ──────────────────────

@app.get("/api/nifty")
def get_nifty():
    start = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())
    end   = int(datetime.now(tz=timezone.utc).timestamp())
    r = requests.get(
        "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI",
        params={"period1": start, "period2": end, "interval": "1mo"},
        headers=_YF_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()["chart"]["result"][0]
    timestamps = data.get("timestamp", [])
    closes = data["indicators"]["quote"][0].get("close", [])
    result = []
    for ts, close in zip(timestamps, closes):
        if close is not None:
            dt = datetime.utcfromtimestamp(ts)
            if dt.year >= 2026:
                result.append({"month": dt.strftime("%b %y"), "value": round(close, 2)})
    return result


# ── Stock symbol autocomplete (Yahoo Finance search — free, no key needed) ─────

@app.get("/api/stocks/search")
def search_stocks(q: str = ""):
    if not q or len(q) < 1:
        return []
    try:
        resp = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": q, "lang": "en-US", "region": "IN", "quotesCount": 10, "newsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        results = []
        for quote in resp.json().get("quotes", []):
            symbol = quote.get("symbol", "")
            if symbol.endswith(".NS"):
                nse_symbol = symbol[:-3]
                name = quote.get("shortname") or quote.get("longname") or nse_symbol
                results.append({"symbol": nse_symbol, "name": name})
        return results[:10]
    except Exception as e:
        logger.error(f"Stock search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
