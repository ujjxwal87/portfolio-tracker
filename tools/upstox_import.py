"""Pull equity trade history from Upstox and reconcile it into portfolio_tracker.

  export UPSTOX_ACCESS_TOKEN=...        # the one-year Analytics Token
  python tools/upstox_import.py --client "Jayesh Chopra"
  ... then add --apply to write.

Upstox exposes no raw tradebook to this token. What it does expose is the TRADE-WISE P&L
report — one row per FIFO-matched lot, carrying buy_date/buy_average and sell_date/sell_average.
So the buy and sell legs are RECONSTRUCTED from those lots and merged per (symbol, date, side) at
a weighted-average price, which is the convention the rest of this DB already uses.

Two consequences worth knowing:
  • Only CLOSED lots appear. Anything still held is invisible here — it comes from the holdings
    endpoint instead, which this script reports but does not import (a holding has no buy price
    history beyond its average, so it would fabricate a single synthetic buy).
  • A partially-sold buy contributes only the sold part. The net-quantity check below catches it:
    every symbol must net to zero against the holdings endpoint, or something is missing.

The Analytics Token only reaches this API from the STATIC IP configured on the Upstox account
(Apps -> My Apps -> Static IPs). From anywhere else every call returns UDAPI1221.
"""
import argparse, collections, datetime, gzip, io, json, os, sys
import requests, psycopg2
from dotenv import load_dotenv

BASE = "https://api.upstox.com/v2"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
DUMP = os.path.join(ROOT, "scratch", "upstox")
os.makedirs(DUMP, exist_ok=True)
load_dotenv(os.path.join(ROOT, "backend", ".env"))

# Indian financial years to sweep, oldest first. Cheap: the metadata call reports a count before
# any data is pulled, so empty years cost one request each.
FINANCIAL_YEARS = ["2021", "2122", "2223", "2324", "2425", "2526", "2627"]

# ISINs the P&L report still names by their PRE-SPLIT value — a face-value split mints a new ISIN,
# and the historical rows keep the old one, so the instrument master can't resolve them. Mapped by
# hand to the current symbol. Prices/quantities stay AS TRADED: every one of these is a closed
# position, so the split never has to be applied for the P&L to be right.
ISIN_ALIASES = {
    "INE249Z01012": "MAZDOCK",     # -> INE249Z01020
    "INE258A01016": "BEML",        # -> INE258A01024
    "INE732I01013": "ANGELONE",    # -> INE732I01021
}

# Delisted / suspended, so absent from both live instrument masters. Closed positions only.
ISIN_DELISTED = {
    "INE274G01010": "DHANI",       # Dhani Services, now Indiabulls Securities
    "INE591Q01016": "SUUMAYA",     # Suumaya Industries
}


def api(path, token, params=None):
    r = requests.get(f"{BASE}{path}", timeout=60, params=params or {},
                     headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    body = r.json() if r.content else {}
    if isinstance(body, dict) and body.get("status") == "error":
        errs = body.get("errors") or [{}]
        code = errs[0].get("errorCode")
        if code == "UDAPI1221":
            sys.exit("UDAPI1221 — this machine's IP is not the static IP on the Upstox account.\n"
                     "Add it under Apps -> My Apps -> Static IPs, or run from the box that is.")
        sys.exit(f"Upstox error on {path}: {errs[0].get('message')} ({code})")
    if not r.ok:
        sys.exit(f"{r.status_code} from {path}: {r.text[:300]}")
    return body.get("data")


def isin_to_symbol():
    """{ISIN: NSE/BSE trading symbol} from Upstox's published instrument masters, NSE preferred."""
    out = {}
    for exchange in ("BSE", "NSE"):          # NSE second so it wins on overlap
        path = os.path.join(DUMP, f"{exchange}.json.gz")
        if not os.path.exists(path):
            r = requests.get("https://assets.upstox.com/market-quote/instruments/exchange/"
                             f"{exchange}.json.gz", timeout=120)
            r.raise_for_status()
            open(path, "wb").write(r.content)
        for i in json.load(gzip.open(path)):
            if i.get("isin") and i.get("trading_symbol"):
                out[i["isin"]] = i["trading_symbol"]
    return out


def fetch_pnl(token, segment="EQ"):
    """Every matched lot across all financial years, as returned (dd-mm-yyyy dates)."""
    rows = []
    for fy in FINANCIAL_YEARS:
        meta = api("/trade/profit-loss/metadata", token,
                   {"segment": segment, "financial_year": fy})
        n = (meta or {}).get("trades_count", 0)
        print(f"  FY{fy} {segment}: {n} matched lot(s)")
        if not n:
            continue
        rows += api("/trade/profit-loss/data", token,
                    {"segment": segment, "financial_year": fy,
                     "page_number": 1, "page_size": 5000}) or []
    return rows


def to_trades(rows, symbols):
    """Matched lots -> merged (symbol, date, side) trades at a weighted-average price."""
    agg, unresolved = collections.defaultdict(lambda: [0, 0.0]), set()
    for r in rows:
        isin = r["isin"]
        sym = ISIN_ALIASES.get(isin) or ISIN_DELISTED.get(isin) or symbols.get(isin)
        if not sym:
            unresolved.add((isin, r["scrip_name"]))
            continue
        qty = int(round(float(r["quantity"])))
        for side, dt, price in (("BUY", r["buy_date"], r["buy_average"]),
                                ("SELL", r["sell_date"], r["sell_average"])):
            day = datetime.datetime.strptime(dt, "%d-%m-%Y").date()
            slot = agg[(sym, day, side)]
            slot[0] += qty
            slot[1] += qty * float(price)
    trades = [{"symbol": s, "date": d, "type": side, "quantity": q,
               "price": round(amt / q, 4)}
              for (s, d, side), (q, amt) in agg.items() if q]
    trades.sort(key=lambda t: (t["date"], t["symbol"], t["type"]))
    return trades, sorted(unresolved)


def db():
    return psycopg2.connect(host=os.environ["DB_HOST"], port=os.environ["DB_PORT"],
                            dbname=os.environ["DB_NAME"], user=os.environ["DB_USER"],
                            password=os.environ["DB_PASSWORD"],
                            sslmode=os.environ.get("DB_SSLMODE", "require"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("UPSTOX_ACCESS_TOKEN")
    if not token:
        sys.exit("Set UPSTOX_ACCESS_TOKEN (the Analytics Token).")

    who = api("/user/profile", token)
    print(f"Upstox account: {who['user_name']} ({who['user_id']})\n")

    print("trade-wise P&L:")
    rows = fetch_pnl(token, "EQ")
    json.dump(rows, open(os.path.join(DUMP, "pnl_eq.json"), "w"), indent=1)

    # F&O is reported separately and this tracker has no derivatives model, so it is counted and
    # named but never imported — silently dropping it would misstate the account's activity.
    fo = sum((api("/trade/profit-loss/metadata", token,
                  {"segment": "FO", "financial_year": fy}) or {}).get("trades_count", 0)
             for fy in FINANCIAL_YEARS)

    holdings = api("/portfolio/long-term-holdings", token) or []
    trades, unresolved = to_trades(rows, isin_to_symbol())
    for isin, name in unresolved:
        print(f"  ! unresolvable ISIN, skipped: {isin} {name}")

    # Every symbol must net to what the holdings endpoint says it holds. A mismatch means a buy leg
    # is missing (a lot closed in a year this sweep did not cover), and the numbers would be wrong.
    held = {h["tradingsymbol"]: int(h["quantity"]) for h in holdings}
    net = collections.Counter()
    for t in trades:
        net[t["symbol"]] += t["quantity"] if t["type"] == "BUY" else -t["quantity"]
    drift = {s: (n, held.get(s, 0)) for s, n in net.items() if n != held.get(s, 0)}

    print(f"\n{len(rows)} matched lot(s) -> {len(trades)} merged trade row(s), "
          f"{len({t['symbol'] for t in trades})} symbol(s)")
    print(f"realized P&L per Upstox: {sum(r['sell_amount'] - r['buy_amount'] for r in rows):,.2f}")
    print(f"open holdings: {len(holdings)}" + (f" — {', '.join(held)}" if held else ""))
    if fo:
        print(f"F&O: {fo} matched lot(s) NOT imported (no derivatives model in this tracker)")
    if drift:
        print("\n! net quantity does not match holdings — buy legs may be missing:")
        for s, (n, h) in sorted(drift.items()):
            print(f"    {s:14} trades net {n:+d}, holdings say {h}")

    with db() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM portfolio_tracker.clients WHERE name = %s", (args.client,))
        row = cur.fetchone()
        if not row:
            sys.exit(f"No client named {args.client!r}.")
        cid = row[0]
        cur.execute("""SELECT stock_symbol, date, type, quantity, price
                         FROM portfolio_tracker.trades WHERE client_id = %s""", (cid,))
        have = {(s, d, t): (q, float(p)) for s, d, t, q, p in cur.fetchall()}

        new = [t for t in trades if (t["symbol"], t["date"], t["type"]) not in have]
        conflict = [(t, have[(t["symbol"], t["date"], t["type"])]) for t in trades
                    if (t["symbol"], t["date"], t["type"]) in have
                    and have[(t["symbol"], t["date"], t["type"])]
                    != (t["quantity"], round(t["price"], 4))]

        print(f"\n--- NEW (not in DB) — would insert: {len(new)} ---")
        for t in new[:20]:
            print(f"   {t['date']} {t['symbol']:14} {t['type']:4} qty={t['quantity']} @ {t['price']}")
        if len(new) > 20:
            print(f"   … and {len(new) - 20} more")
        print(f"--- ALREADY IN DB, identical: {len(trades) - len(new) - len(conflict)} ---")
        print(f"--- CONFLICT — same key, different numbers: {len(conflict)} ---")
        for t, (q, p) in conflict:
            print(f"   {t['date']} {t['symbol']:14} {t['type']:4} "
                  f"upstox qty={t['quantity']} @ {t['price']} | db qty={q} @ {p}")

        if not args.apply:
            print("\n[DRY RUN] re-run with --apply to insert the NEW rows.")
            return
        for t in new:
            cur.execute("""INSERT INTO portfolio_tracker.trades
                               (client_id, stock_symbol, type, quantity, price, date, broker)
                           VALUES (%s, %s, %s, %s, %s, %s, 'Upstox')""",
                        (cid, t["symbol"], t["type"], t["quantity"], t["price"], t["date"]))
        print(f"\ninserted {len(new)} rows")


if __name__ == "__main__":
    main()
