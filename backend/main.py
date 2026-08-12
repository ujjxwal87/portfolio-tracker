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
                "SELECT id, name, phone, email, joining_date, cash_balance, created_at, updated_at "
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


# ── Daily price history (for period-boundary unrealized valuation) ─────────────

@app.get("/api/prices/history")
def get_price_history(symbols: str, start: str = "2026-01-01"):
    """Returns daily closing prices per symbol: {sym: {'YYYY-MM-DD': close}}."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    try:
        start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    except ValueError:
        start_dt = datetime(2026, 1, 1, tzinfo=timezone.utc)
    p1 = int(start_dt.timestamp())
    p2 = int(datetime.now(tz=timezone.utc).timestamp())

    def fetch(sym: str):
        r = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}.NS",
            params={"period1": p1, "period2": p2, "interval": "1d"},
            headers=_YF_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()["chart"]["result"][0]
        timestamps = data.get("timestamp", [])
        closes = data["indicators"]["quote"][0].get("close", [])
        daily = {
            datetime.utcfromtimestamp(ts).date().isoformat(): round(float(c), 2)
            for ts, c in zip(timestamps, closes) if c is not None
        }
        return sym, daily

    result = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch, s): s for s in symbol_list}
        for f in as_completed(futures):
            try:
                sym, daily = f.result()
                result[sym] = daily
            except Exception as e:
                logger.warning(f"History fetch failed for {futures[f]}: {e}")
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


# ── Cash flows + money-weighted Nifty benchmark ────────────────────────────────

class CashFlowCreate(BaseModel):
    client_id: str
    date: date
    amount: float  # positive = deposit, negative = withdrawal
    broker: Optional[str] = None
    ref_id: Optional[str] = None
    notes: Optional[str] = None


@app.get("/api/cash-flows")
def list_cash_flows(client_id: Optional[str] = None):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            if client_id:
                cur.execute(
                    "SELECT * FROM portfolio_tracker.cash_flows WHERE client_id=%s ORDER BY date",
                    (client_id,),
                )
            else:
                cur.execute("SELECT * FROM portfolio_tracker.cash_flows ORDER BY date")
            return cur.fetchall()


@app.post("/api/cash-flows", status_code=201)
def create_cash_flow(body: CashFlowCreate):
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO portfolio_tracker.cash_flows (client_id,date,amount,broker,ref_id,notes) "
                "VALUES (%s,%s,%s,%s,%s,%s) RETURNING *",
                (body.client_id, body.date, body.amount, body.broker, body.ref_id, body.notes),
            )
            return cur.fetchone()


@app.delete("/api/cash-flows/{flow_id}", status_code=204)
def delete_cash_flow(flow_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM portfolio_tracker.cash_flows WHERE id=%s", (flow_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Cash flow not found")
    return None


def _nifty_daily(start: str = "2026-01-01"):
    s = int(datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    e = int(datetime.now(tz=timezone.utc).timestamp())
    r = requests.get(
        "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI",
        params={"period1": s, "period2": e, "interval": "1d"},
        headers=_YF_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    d = r.json()["chart"]["result"][0]
    out = {}
    for ts, close in zip(d.get("timestamp", []), d["indicators"]["quote"][0].get("close", [])):
        if close is not None:
            out[datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")] = round(close, 2)
    return dict(sorted(out.items()))


@app.get("/api/nifty/daily")
def get_nifty_daily(start: str = "2026-01-01"):
    return _nifty_daily(start)


def _level_on_or_after(series, day):
    """Money added on a holiday can only be invested on the next trading day."""
    for d in series:
        if d >= day:
            return d, series[d]
    return None, None


def _xirr(flows):
    if len(flows) < 2:
        return None
    d0 = min(f[0] for f in flows)
    def npv(rate):
        return sum(a / (1.0 + rate) ** ((d - d0).days / 365.0) for d, a in flows)
    lo, hi = -0.9999, 100.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(300):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return round((lo + hi) / 2 * 100, 2)


@app.get("/api/benchmark")
def get_benchmark(client_id: str, portfolio_value: Optional[float] = None):
    """What the client's own deposits would be worth had each gone into Nifty 50 that day."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT date, amount FROM portfolio_tracker.cash_flows WHERE client_id=%s ORDER BY date",
                (client_id,),
            )
            flows = cur.fetchall()
    if not flows:
        raise HTTPException(400, "No cash flows recorded for this client")

    series = _nifty_daily(min(f["date"] for f in flows).strftime("%Y-%m-%d"))
    if not series:
        raise HTTPException(502, "Nifty data unavailable")
    latest_day, latest_level = list(series.items())[-1]

    units, legs = 0.0, []
    for f in flows:
        day = f["date"].strftime("%Y-%m-%d")
        used_day, level = _level_on_or_after(series, day)
        if level is None:
            continue
        amt = float(f["amount"])
        u = amt / level
        units += u
        legs.append({
            "date": day, "amount": amt, "priced_on": used_day,
            "nifty_level": level, "units": round(u, 6),
            "deferred": used_day != day,
        })

    net_invested = sum(float(f["amount"]) for f in flows)
    bench_value = round(units * latest_level, 2)
    xirr_flows = [(f["date"], -float(f["amount"])) for f in flows]
    end = datetime.strptime(latest_day, "%Y-%m-%d").date()

    result = {
        "client_id": client_id,
        "net_invested": round(net_invested, 2),
        "as_of": latest_day,
        "nifty_now": latest_level,
        "benchmark_value": bench_value,
        "benchmark_gain": round(bench_value - net_invested, 2),
        "benchmark_return_pct": round((bench_value - net_invested) / net_invested * 100, 2) if net_invested else None,
        "benchmark_xirr_pct": _xirr(xirr_flows + [(end, bench_value)]),
        "legs": legs,
    }
    if portfolio_value is not None:
        result["portfolio_value"] = round(portfolio_value, 2)
        result["portfolio_gain"] = round(portfolio_value - net_invested, 2)
        result["portfolio_return_pct"] = (
            round((portfolio_value - net_invested) / net_invested * 100, 2) if net_invested else None
        )
        result["portfolio_xirr_pct"] = _xirr(xirr_flows + [(end, portfolio_value)])
        if result["portfolio_return_pct"] is not None and result["benchmark_return_pct"] is not None:
            result["alpha_pct_pp"] = round(result["portfolio_return_pct"] - result["benchmark_return_pct"], 2)
        if result["portfolio_xirr_pct"] is not None and result["benchmark_xirr_pct"] is not None:
            result["alpha_xirr_pp"] = round(result["portfolio_xirr_pct"] - result["benchmark_xirr_pct"], 2)
    return result


@app.get("/api/benchmark/series")
def get_benchmark_series(client_id: str):
    """Daily curve of the Nifty-equivalent value, for plotting against the real portfolio."""
    with get_db() as conn:
        with conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT date, amount FROM portfolio_tracker.cash_flows WHERE client_id=%s ORDER BY date",
                (client_id,),
            )
            flows = cur.fetchall()
    if not flows:
        raise HTTPException(400, "No cash flows recorded for this client")

    series = _nifty_daily(min(f["date"] for f in flows).strftime("%Y-%m-%d"))
    if not series:
        raise HTTPException(502, "Nifty data unavailable")

    pending = {}
    for f in flows:
        used_day, level = _level_on_or_after(series, f["date"].strftime("%Y-%m-%d"))
        if level:
            pending.setdefault(used_day, []).append((float(f["amount"]), level))

    out, units, invested = [], 0.0, 0.0
    for day, close in series.items():
        for amt, lvl in pending.get(day, []):
            units += amt / lvl
            invested += amt
        if invested <= 0 and not out:
            continue
        value = units * close
        out.append({
            "date": day,
            "nifty_close": close,
            "invested": round(invested, 2),
            "benchmark_value": round(value, 2),
            "benchmark_return_pct": round((value - invested) / invested * 100, 2) if invested else None,
        })
    return out


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
