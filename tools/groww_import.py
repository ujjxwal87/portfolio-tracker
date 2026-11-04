"""Pull TODAY's trades from the Groww trading API and reconcile them into portfolio_tracker.

    export GROWW_ACCESS_TOKEN=...
    python tools/groww_import.py --client "Om Gunjal"
    ... then add --apply to write.

IMPORTANT — this API cannot backfill. /v1/order/list returns "the history of orders executed
for the day" with no date parameters, and trades are only reachable per order id. So this is a
DAILY capture job: whatever it does not collect on the day is not retrievable later, and that
date has to come from the Groww P&L xlsx instead (see scratch/diff_groww.py).

Tokens expire daily at 06:00. Groww also gates API keys on whitelisted static IPs, so this must
run from the whitelisted host — a dynamic-IP machine fails every endpoint once the address
rotates (the same trap Upstox's UDAPI1221 sets).

Trades are merged per (symbol, date, direction) at a weighted-average price, the convention the
rest of this DB uses.
"""
import argparse, collections, json, os, sys, datetime
import requests, psycopg2
from dotenv import load_dotenv

BASE = "https://api.groww.in/v1"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
DUMP = os.path.join(ROOT, "scratch")
os.makedirs(DUMP, exist_ok=True)
load_dotenv(os.path.join(ROOT, "backend", ".env"))


def api(path, token, **params):
    r = requests.get(f"{BASE}{path}", timeout=30, params=params,
                     headers={"Authorization": f"Bearer {token}",
                              "Accept": "application/json"})
    if r.status_code == 401:
        sys.exit("401 from Groww — token expired (they die at 06:00) or wrong account.")
    if r.status_code == 403:
        sys.exit("403 from Groww — this host's IP is probably not whitelisted on the API key.")
    if not r.ok:
        sys.exit(f"{r.status_code} from {path}: {r.text[:300]}")
    return r.json()


def fetch_orders(token, segment="CASH"):
    """Every order for the CURRENT day — the only window this API offers."""
    out, page = [], 0
    while True:
        body = api("/order/list", token, segment=segment, page=page, page_size=50)
        rows = body.get("payload", {}).get("order_list") or body.get("order_list") or []
        if not rows:
            break
        out.extend(rows)
        print(f"  orders page {page}: {len(rows)}")
        page += 1
        if page > 100:
            sys.exit("runaway pagination — stopping at page 100")
    return out


def fetch_trades(token, orders, segment="CASH"):
    """Fills per order. An order can produce several trades, so this is the grain that
    matches a tradebook; the order itself is not."""
    fills = []
    for o in orders:
        oid = o.get("groww_order_id")
        if not oid:
            continue
        body = api(f"/order/trades/{oid}", token, segment=segment, page=0, page_size=50)
        rows = body.get("payload", {}).get("trade_list") or body.get("trade_list") or []
        fills.extend(rows)
    return fills


def merge(fills):
    """Fill grain -> one row per (symbol, date, direction) at a weighted-average price."""
    agg = collections.defaultdict(lambda: {"qty": 0, "value": 0.0})
    for f in fills:
        if (f.get("trade_status") or "").upper() in ("REJECTED", "CANCELLED", "FAILED"):
            continue
        sym = (f.get("trading_symbol") or f.get("symbol") or "").strip().upper()
        side = (f.get("transaction_type") or "").strip().upper()
        qty = int(f.get("quantity") or 0)
        px = float(f.get("price") or 0)
        day = str(f.get("trade_date_time") or f.get("created_at") or "")[:10]
        if not (sym and side in ("BUY", "SELL") and qty and day):
            print(f"  ! skipping unresolvable fill: {json.dumps(f)[:200]}")
            continue
        a = agg[(sym, day, side)]
        a["qty"] += qty
        a["value"] += qty * px
    return {k: {"qty": v["qty"], "price": round(v["value"] / v["qty"], 4)}
            for k, v in agg.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--segment", default="CASH")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    token = os.getenv("GROWW_ACCESS_TOKEN")
    if not token:
        sys.exit("set GROWW_ACCESS_TOKEN")

    c = psycopg2.connect(host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
                         dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
                         password=os.getenv("DB_PASSWORD"), sslmode="require")
    cur = c.cursor()
    cur.execute("select id from portfolio_tracker.clients where name=%s", (args.client,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"no client named {args.client!r}")
    cid = row[0]

    print(f"Fetching Groww orders for today ({datetime.date.today()}) …")
    orders = fetch_orders(token, args.segment)
    print(f"{len(orders)} orders")
    fills = fetch_trades(token, orders, args.segment)
    print(f"{len(fills)} fills")
    raw = os.path.join(DUMP, f"groww_raw_{args.client.split()[0].lower()}.json")
    json.dump({"orders": orders, "fills": fills}, open(raw, "w"), indent=2)
    print(f"raw saved -> {raw}")

    merged = merge(fills)
    print(f"\n{len(merged)} merged (symbol, date, side) rows\n")

    days = sorted({k[1] for k in merged}) or [str(datetime.date.today())]
    cur.execute("""select stock_symbol, date, type, quantity, price from portfolio_tracker.trades
                   where client_id=%s and date between %s and %s""", (cid, days[0], days[-1]))
    existing = {(s, d.isoformat(), t): {"qty": q, "price": float(p)}
                for s, d, t, q, p in cur.fetchall()}

    new, match, conflict = [], [], []
    for k, v in sorted(merged.items()):
        e = existing.get(k)
        if not e:
            new.append((k, v))
        elif e["qty"] == v["qty"] and abs(e["qty"] * e["price"] - v["qty"] * v["price"]) < 1.0:
            match.append((k, v))
        else:
            conflict.append((k, v, e))

    for k, v in new:
        print(f"  NEW      {k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    for k, v in match:
        print(f"  already  {k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    for k, v, e in conflict:
        print(f"  CONFLICT {k[1]} {k[0]:12s} {k[2]:4s} groww {v['qty']}@{v['price']} "
              f"| db {e['qty']}@{e['price']}")

    if conflict:
        print("\nCONFLICTS PRESENT — resolve before applying. Nothing written.")
        return
    if not args.apply:
        print(f"\n[DRY RUN] {len(new)} row(s) would be inserted. Re-run with --apply.")
        return

    n = 0
    for (sym, day, side), v in new:
        cur.execute("""INSERT INTO portfolio_tracker.trades
            (client_id, stock_symbol, type, quantity, price, date, broker, notes)
            VALUES (%s,%s,%s,%s,%s,%s,'Groww','from Groww API')
            ON CONFLICT (client_id, broker, stock_symbol, date, type)
            WHERE broker IS NOT NULL DO NOTHING""",
            (cid, sym, side, v["qty"], v["price"], day))
        n += cur.rowcount
    c.commit()
    print(f"\ninserted {n} rows")


if __name__ == "__main__":
    main()
