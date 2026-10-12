"""Import a Zerodha Console tradebook CSV into portfolio_tracker.

  python tools/zerodha_import.py --client "Tanishka Bansal" --csv "tradebook-POD865-EQ.csv"
  ... then add --apply to write.

Zerodha has no historical-tradebook API (their staff confirm back-office data is out of scope for
Kite Connect), so this file export is the only route. Console → Reports → Tradebook, 365 days max
per download — check the window covers the client's whole history, not just a recent slice.

Fills are merged per (symbol, date, direction) at a weighted-average price, matching the
convention the rest of this DB uses.
"""
import argparse, collections, csv, os, sys
import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
load_dotenv(os.path.join(ROOT, "backend", ".env"))
BROKER = "Zerodha"


def merge(path):
    agg = collections.defaultdict(lambda: {"qty": 0, "value": 0.0})
    skipped = []
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            seg = (r.get("segment") or "").strip().upper()
            if seg and seg != "EQ":          # equity-only schema; F&O has no home here
                skipped.append(r)
                continue
            sym = (r["symbol"] or "").strip().upper()
            side = {"buy": "BUY", "sell": "SELL"}.get((r["trade_type"] or "").strip().lower())
            qty = int(float(r["quantity"] or 0))
            px = float(r["price"] or 0)
            day = (r["trade_date"] or "").strip()[:10]
            if not (sym and side and qty and day):
                skipped.append(r)
                continue
            a = agg[(sym, day, side)]
            a["qty"] += qty
            a["value"] += qty * px
    return ({k: {"qty": v["qty"], "price": round(v["value"] / v["qty"], 4)} for k, v in agg.items()},
            skipped)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    merged, skipped = merge(args.csv)
    if skipped:
        print(f"  ! {len(skipped)} rows skipped (non-EQ or unparseable)")
    print(f"{len(merged)} merged (symbol, date, side) rows")
    days = sorted({k[1] for k in merged})
    if days:
        print(f"tradebook window: {days[0]} → {days[-1]}\n")

    c = psycopg2.connect(host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
                         dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
                         password=os.getenv("DB_PASSWORD"), sslmode="require")
    cur = c.cursor()
    cur.execute("select id from portfolio_tracker.clients where name=%s", (args.client,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"no client named {args.client!r}")
    cid = row[0]

    # A tradebook was actually pulled and parsed at this point, so this client has been checked
    # as of now — stamp it whether or not the diff below finds anything new. Otherwise "no new
    # trades" and "never checked" look identical from the clients table.
    cur.execute("update portfolio_tracker.clients set trades_synced_at=NOW() where id=%s", (cid,))
    c.commit()

    cur.execute("""select stock_symbol, date, type, quantity, price, broker
                   from portfolio_tracker.trades where client_id=%s""", (cid,))
    existing = {(s, d.isoformat(), t): {"qty": q, "price": float(p), "broker": b}
                for s, d, t, q, p, b in cur.fetchall()}

    new, match, conflict = [], [], []
    for k, v in sorted(merged.items()):
        e = existing.get(k)
        if not e:
            new.append((k, v))
        elif e["qty"] == v["qty"] and abs(e["qty"] * e["price"] - v["qty"] * v["price"]) < 1.0:
            match.append((k, v, e))
        else:
            conflict.append((k, v, e))

    def show(title, items, fmt):
        print(f"--- {title}: {len(items)} ---")
        for it in items:
            print("   " + fmt(*it))
        print()

    show("NEW — would insert", new,
         lambda k, v: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    show("ALREADY IN DB, identical", match,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']} (broker={e['broker']})")
    show("CONFLICT — same key, different numbers", conflict,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} csv {v['qty']}@{v['price']} | db {e['qty']}@{e['price']}")

    if conflict:
        print("CONFLICTS PRESENT — resolve before applying. Nothing written.")
        return
    if not args.apply:
        print("[DRY RUN] re-run with --apply to insert.")
        return

    n = 0
    for (sym, day, side), v in new:
        cur.execute("""INSERT INTO portfolio_tracker.trades
            (client_id, stock_symbol, type, quantity, price, date, broker, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'from Zerodha tradebook')
            ON CONFLICT (client_id, broker, stock_symbol, date, type)
            WHERE broker IS NOT NULL DO UPDATE SET
                quantity = EXCLUDED.quantity, price = EXCLUDED.price, notes = EXCLUDED.notes""",
            (cid, sym, side, v["qty"], v["price"], day, BROKER))
        n += cur.rowcount
    c.commit()
    print(f"inserted {n} rows")


if __name__ == "__main__":
    main()
