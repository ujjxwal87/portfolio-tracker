"""Pull trades (and ledger) from DhanHQ v2 and reconcile them into portfolio_tracker.

  export DHAN_ACCESS_TOKEN=...
  python scratch/dhan_import.py --client "Sohil Monpara" --from 2026-01-01 --to 2026-08-15
  ... then add --apply to write.

Trades are merged per (symbol, date, direction) at a weighted-average price, which is the
convention the rest of this DB already uses. Ledger rows are only dumped for inspection —
cash_flows is not written automatically because the ledger's narration taxonomy needs eyeballing
once per broker before it can be trusted (see the Groww recipe in the broker-API notes).
"""
import argparse, collections, json, os, sys, datetime
import requests, psycopg2
from dotenv import load_dotenv

BASE = "https://api.dhan.co/v2"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
# Raw pulls and the scrip master are client data / bulk, so they go to git-ignored scratch/,
# never next to this file (tools/ is tracked).
DUMP = os.path.join(ROOT, "scratch")
os.makedirs(DUMP, exist_ok=True)
load_dotenv(os.path.join(ROOT, "backend", ".env"))


def api(path, token):
    r = requests.get(f"{BASE}{path}", timeout=30,
                     headers={"access-token": token, "Accept": "application/json"})
    if r.status_code == 401:
        sys.exit("401 from Dhan — token expired (they last 24h) or wrong account.")
    if not r.ok:
        sys.exit(f"{r.status_code} from {path}: {r.text[:300]}")
    body = r.json()
    if isinstance(body, dict) and body.get("errorType"):
        sys.exit(f"Dhan error on {path}: {body}")
    return body


# Dhan reports history as-traded and books splits/allotments as separate ₹0 credits (securityId 0,
# so they never resolve to a symbol and are dropped). We store the split-ADJUSTED view instead, to
# match how Groww reports and how KRISHANA is already held. Each ratio below was verified against
# its own ₹0 credit row: credit == holding * (ratio - 1).
CORP_ACTIONS = {
    "Sohil Monpara": {
        # symbol, effective date, ratio — buys BEFORE this date get qty*ratio, price/ratio
        "splits": [("GROWWGOLD", "2026-02-06", 10),   # credit 675 on 75 held
                   ("GROWWSLVR", "2026-02-06", 10),   # credit 324 on 36 held
                   ("KRISHANA",  "2026-07-03", 5)],   # credit 460 on 115 held
        # ₹0 credits that are really allotments, priced at their true cost basis
        "inject": [("SBIFUNDS", "2026-07-20", "BUY", 26, 574.0),   # IPO price, per Om's + Deepmala's reports
                   ("ARDEE",    "2026-08-11", "BUY", 281, 53.0)],  # IPO allotment, price per user
        # Bought 2025-09-18, before he joined — the pre-joining holding is untracked, so its
        # disposal is too. Without this the sell reimports and the position goes to -5.
        "exclude": ["XPROINDIA"],
    },
}


def apply_corp_actions(merged, cfg):
    if not cfg:
        return merged, []
    notes = []
    for sym, eff, ratio in cfg.get("splits", []):
        for (s, d, side) in [k for k in merged if k[0] == sym and k[1] < eff]:
            v = merged[(s, d, side)]
            before = f"{v['qty']}@{v['price']}"
            v["qty"] *= ratio
            v["price"] = round(v["price"] / ratio, 4)
            notes.append(f"split {sym} 1:{ratio} — {d} {side} {before} -> {v['qty']}@{v['price']}")
    for sym, d, side, qty, px in cfg.get("inject", []):
        merged[(sym, d, side)] = {"qty": qty, "price": px, "isin": None}
        notes.append(f"injected {sym} {d} {side} {qty}@{px} (₹0 credit given its true cost)")
    for sym in cfg.get("exclude", []):
        for k in [k for k in merged if k[0] == sym]:
            del merged[k]
            notes.append(f"excluded {sym} {k[1]} {k[2]} — awaiting cost basis")
    return merged, notes


SCRIP_URL = "https://images.dhan.co/api-data/api-scrip-master.csv"
SCRIP_CSV = os.path.join(DUMP, "dhan_scrip_master.csv")


def security_map():
    """(exchange, securityId) -> NSE/BSE trading symbol.

    The tradebook does NOT return a trading symbol despite what the docs list — only
    securityId, isin and a display-name customSymbol ("Hindustan Aeronautics"). The scrip
    master is the only way to get the ticker the rest of this DB is keyed on.
    """
    if not os.path.exists(SCRIP_CSV):
        print("downloading Dhan scrip master (~26 MB, one-off)…")
        r = requests.get(SCRIP_URL, timeout=180)
        r.raise_for_status()
        open(SCRIP_CSV, "wb").write(r.content)
    import csv
    m = {}
    with open(SCRIP_CSV, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            if row.get("SEM_SEGMENT") != "E":
                continue
            m[(row["SEM_EXM_EXCH_ID"], row["SEM_SMST_SECURITY_ID"])] = row["SEM_TRADING_SYMBOL"].strip().upper()
    return m


def fetch_trades(token, frm, to):
    """Walk the paginated tradebook until a page comes back empty."""
    out, page = [], 0
    while True:
        rows = api(f"/trades/{frm}/{to}/{page}", token)
        if not rows:
            break
        out.extend(rows)
        print(f"  page {page}: {len(rows)} fills")
        page += 1
        if page > 200:
            sys.exit("runaway pagination — stopping at page 200")
    return out


def merge(fills, sec2sym=None):
    """Fill-grain -> one row per (symbol, date, direction) at weighted-average price.

    Derivatives are dropped: this schema stores stock_symbol/qty/price only and cannot
    represent a strike, expiry or option type, so folding them in would be silently wrong.
    """
    sec2sym = sec2sym or {}
    agg = collections.defaultdict(lambda: {"qty": 0, "value": 0.0, "isin": None})
    derivs = []
    for f in fills:
        if (f.get("instrument") or "").upper() != "EQUITY":
            derivs.append(f)
            continue
        seg = (f.get("exchangeSegment") or "").split("_")[0]
        sym = sec2sym.get((seg, str(f.get("securityId"))), "")
        if not sym:
            sym = (f.get("tradingSymbol") or "").strip().upper()
        side = (f.get("transactionType") or "").strip().upper()
        qty = int(f.get("tradedQuantity") or 0)
        px = float(f.get("tradedPrice") or 0)
        day = str(f.get("exchangeTime") or "")[:10].replace("/", "-")
        if not (sym and side in ("BUY", "SELL") and qty and day):
            print(f"  ! skipping unresolvable fill: {json.dumps(f)[:200]}")
            continue
        a = agg[(sym, day, side)]
        a["qty"] += qty
        a["value"] += qty * px
        a["isin"] = f.get("isin") or a["isin"]
    if derivs:
        print(f"  ! {len(derivs)} derivative fills EXCLUDED (equity-only schema):")
        for d in derivs:
            print(f"      {str(d.get('exchangeTime'))[:10]} {d.get('customSymbol')} "
                  f"{d.get('transactionType')} qty={d.get('tradedQuantity')} @ {d.get('tradedPrice')}")
    return {k: {"qty": v["qty"], "price": round(v["value"] / v["qty"], 4), "isin": v["isin"]}
            for k, v in agg.items()}


# Ledger narration taxonomy. Everything not listed here (Trades Executed, DP/DDPI/Bank charges,
# OPENING/CLOSING BALANCE) is deliberately ignored: settlements are not capital movements, and
# charges are already netted into the running balance we take as cash_balance.
DEPOSITS = {"Funds Deposited"}
WITHDRAWALS = {
    "Funds Withdrawal",       # "Money withdrawn to your Bank Account"
    "Monthly Settlement",     # broker sweeping idle funds back to the bank account
    "Quarterly Settlement",   # same sweep on the quarterly cycle
}


def import_ledger(cur, cid, rows, apply_it):
    """Write Funds Deposited / Monthly Settlement to cash_flows, and set cash_balance.

    Refuses to write unless the running-balance chain reconciles end to end — that check is
    what proves the pull is complete rather than merely plausible.
    """
    moves = [r for r in reversed(rows) if r["narration"] not in ("OPENING BALANCE", "CLOSING BALANCE")]
    bal = 0.0
    for r in moves:
        bal += float(r["credit"]) - float(r["debit"])
        if abs(bal - float(r["runbal"])) > 0.01:
            print(f"  LEDGER CHAIN BROKEN at {r['voucherdate']} {r['narration']}: "
                  f"computed {bal:.2f} vs {r['runbal']} — refusing to write")
            return
    print(f"  ledger chain reconciles across {len(moves)} rows; closing balance {bal:,.2f}")

    flows = []
    for r in moves:
        n = r["narration"]
        if n in DEPOSITS:
            amt = float(r["credit"])
        elif n in WITHDRAWALS:
            amt = -float(r["debit"])
        else:
            continue
        d = datetime.datetime.strptime(r["voucherdate"], "%b %d, %Y").date().isoformat()
        flows.append((d, amt, r.get("vouchernumber"), n))

    print(f"  {len(flows)} capital movements:")
    for d, amt, ref, n in flows:
        print(f"      {d}  {amt:>12,.2f}  {n}")
    print(f"  net capital in: {sum(f[1] for f in flows):,.2f}")

    if not apply_it:
        print("  [DRY RUN] cash_flows not written")
        return
    n_ins = 0
    for d, amt, ref, note in flows:
        cur.execute("""INSERT INTO portfolio_tracker.cash_flows
            (client_id, date, amount, broker, ref_id, notes)
            VALUES (%s,%s,%s,'Dhan',%s,%s)
            ON CONFLICT (broker, ref_id) WHERE ref_id IS NOT NULL DO NOTHING""",
            (cid, d, amt, ref, note))
        n_ins += cur.rowcount
    cur.execute("update portfolio_tracker.clients set cash_balance=%s, updated_at=NOW() where id=%s",
                (round(bal, 2), cid))
    print(f"  inserted {n_ins} cash flows; cash_balance set to {bal:,.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--from", dest="frm", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--ledger", action="store_true", help="also import deposits/withdrawals into cash_flows")
    args = ap.parse_args()

    token = os.getenv("DHAN_ACCESS_TOKEN")
    if not token:
        sys.exit("set DHAN_ACCESS_TOKEN")

    c = psycopg2.connect(host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
                         dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
                         password=os.getenv("DB_PASSWORD"), sslmode="require")
    cur = c.cursor()
    cur.execute("select id from portfolio_tracker.clients where name=%s", (args.client,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"no client named {args.client!r}")
    cid = row[0]

    print(f"Fetching Dhan trades {args.frm} → {args.to} …")
    fills = fetch_trades(token, args.frm, args.to)
    print(f"{len(fills)} fills\n")
    raw = os.path.join(DUMP, f"dhan_raw_{args.client.split()[0].lower()}.json")
    json.dump(fills, open(raw, "w"), indent=2)
    print(f"raw fills saved -> {raw}")

    merged = merge(fills, security_map())
    merged, notes = apply_corp_actions(merged, CORP_ACTIONS.get(args.client))
    if notes:
        print("\n  corporate-action adjustments:")
        for n in notes:
            print(f"      {n}")
    print(f"\n{len(merged)} merged (symbol, date, side) rows\n")

    # What the DB already holds for this client over the same window.
    cur.execute("""select stock_symbol, date, type, quantity, price, broker
                   from portfolio_tracker.trades
                   where client_id=%s and date between %s and %s""", (cid, args.frm, args.to))
    existing = {}
    for s, d, t, q, p, b in cur.fetchall():
        existing[(s, d.isoformat(), t)] = {"qty": q, "price": float(p), "broker": b}

    new, match, conflict = [], [], []
    for k, v in sorted(merged.items()):
        e = existing.get(k)
        if not e:
            new.append((k, v))
        # Same qty and the total consideration agrees to within a rupee => the same trade,
        # just a rounded price. A real discrepancy moves the value by far more than that.
        elif e["qty"] == v["qty"] and abs(e["qty"] * e["price"] - v["qty"] * v["price"]) < 1.0:
            match.append((k, v, e))
        else:
            conflict.append((k, v, e))
    only_db = [(k, v) for k, v in sorted(existing.items()) if k not in merged]

    def show(title, items, fmt):
        print(f"--- {title}: {len(items)} ---")
        for it in items:
            print("   " + fmt(*it))
        print()

    show("NEW (not in DB) — would insert", new,
         lambda k, v: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    show("ALREADY IN DB, identical", match,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']} (broker={e['broker']})")
    show("CONFLICT — same key, different numbers", conflict,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} dhan qty={v['qty']}@{v['price']} | db qty={e['qty']}@{e['price']}")
    show("IN DB, absent from Dhan", only_db,
         lambda k, v: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']} (broker={v['broker']})")

    try:
        led = api(f"/ledger?from-date={args.frm}&to-date={args.to}", token)
        lp = os.path.join(DUMP, f"dhan_ledger_{args.client.split()[0].lower()}.json")
        json.dump(led, open(lp, "w"), indent=2)
        print(f"ledger: {len(led)} rows saved -> {lp}")
        if args.ledger:
            import_ledger(cur, cid, led, args.apply)
            if args.apply:
                c.commit()
        else:
            print("  (pass --ledger to import deposits/withdrawals)")
    except SystemExit as e:
        print(f"ledger fetch skipped: {e}")

    if conflict:
        print("\nCONFLICTS PRESENT — resolve these before applying. Nothing written.")
        return
    if not args.apply:
        print("\n[DRY RUN] re-run with --apply to insert the NEW rows.")
        return

    n = 0
    for (sym, day, side), v in new:
        cur.execute("""INSERT INTO portfolio_tracker.trades
            (client_id, stock_symbol, type, quantity, price, date, broker, notes)
            VALUES (%s,%s,%s,%s,%s,%s,'Dhan','from Dhan API')
            ON CONFLICT (client_id, broker, stock_symbol, date, type)
            WHERE broker IS NOT NULL DO NOTHING""",
            (cid, sym, side, v["qty"], v["price"], day))
        n += cur.rowcount
    c.commit()
    print(f"\ninserted {n} rows")


if __name__ == "__main__":
    main()
