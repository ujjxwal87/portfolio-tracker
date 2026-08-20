"""Reconcile a Groww "Stocks P&L Report" .xlsx into portfolio_tracker.

  python tools/groww_import.py --client "Om Gunjal" --file <report.xlsx>
  ... then add --apply to write.

Groww has no historical trade API — its /v1/order/list is today-only and its trade endpoint needs an
order id from that same day — so the P&L report is the only way to get past fills. Hence a file
importer rather than an API puller like dhan_import.py.

The report is LOT-level: the "Realised trades" section carries a buy leg AND a sell leg per matched
lot; "Unrealised trades" carries buy legs only. Lots are merged to one row per (symbol, date,
direction) at a weighted-average price — the convention the rest of this DB uses — then diffed
against what is already stored. Only genuinely new rows are inserted: this NEVER deletes, unlike the
original scratch/insert_om_trades.py, because Om's book carries hand-verified corrections that a
delete-and-reload would silently discard.

Groww names stocks, it does not ticker them, so names resolve through scratch/symbol_map.json. An
unmapped name that survives the join cutoff is a hard error — guessing a ticker would file a trade
against the wrong company.
"""
import argparse, collections, datetime, json, os, sys
import openpyxl, psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
load_dotenv(os.path.join(ROOT, "backend", ".env"))
# Tracked alongside this file: the importer is useless without it, and scratch/ is git-ignored.
# Public reference data only — company name, ISIN, NSE ticker. Falls back to the older scratch copy
# so the pre-existing one-off scripts that read it keep working.
SYMBOL_MAP = next(p for p in (os.path.join(HERE, "symbol_map.json"),
                              os.path.join(ROOT, "scratch", "symbol_map.json"))
                  if os.path.exists(p))

# Lots bought before a client joined are untracked, so their disposals must be too — importing a
# sell whose buy we never held drives the position negative. Same rule the first Om load used
# (scratch/insert_om_trades.py): a hard cutoff, plus the few positions that were taken over.
JOIN_RULES = {
    "Om Gunjal": {
        "cutoff": datetime.date(2026, 3, 9),
        # Bought before the cutoff but managed from the start, so they ARE tracked.
        "carried_over": {"ANANT RAJ LIMITED", "BHARAT ELECTRONICS LTD", "KRISHANA PHOSCHEM LIMITED"},
        "carried_over_from": datetime.date(2026, 2, 3),
    },
}


def _date(s):
    d, m, y = s.split("-")
    return datetime.date(int(y), int(m), int(d))


def parse_report(path):
    """(realised, unrealised) lot rows from the Trade Level sheet, as raw tuples."""
    ws = openpyxl.load_workbook(path, data_only=True)["Trade Level"]
    mode, realised, unrealised = None, [], []
    for row in ws.iter_rows(values_only=True):
        if row[0] == "Realised trades":
            mode = "r"
            continue
        if row[0] == "Unrealised trades":
            mode = "u"
            continue
        # A lot row has a numeric quantity and a dd-mm-yyyy buy date; headers and the
        # summary/charges block above do not.
        if not isinstance(row[2], (int, float)):
            continue
        if not isinstance(row[3], str) or "-" not in row[3]:
            continue
        (realised if mode == "r" else unrealised).append(row)
    return realised, unrealised


def tracked(name, buy_date, rules):
    """Whether a lot bought on `buy_date` is one this client's book tracks."""
    if not rules:
        return True
    if buy_date >= rules["cutoff"]:
        return True
    return name in rules["carried_over"] and buy_date >= rules["carried_over_from"]


def to_events(realised, unrealised, rules, name2sym):
    """Lot rows -> (symbol, date, side) -> {qty, value} legs, plus what was skipped and why."""
    agg = collections.defaultdict(lambda: {"qty": 0, "value": 0.0})
    skipped, unmapped = collections.Counter(), {}

    def add(name, isin, side, qty, price, day):
        sym = name2sym.get(name)
        if not sym:
            unmapped[name] = isin
            return
        a = agg[(sym, day.isoformat(), side)]
        a["qty"] += qty
        a["value"] += qty * float(price)

    for row in realised:
        name, isin, qty, bd = row[0], row[1], int(row[2]), _date(row[3])
        if not tracked(name, bd, rules):
            skipped[name] += 1
            continue
        add(name, isin, "BUY", qty, row[4], bd)
        add(name, isin, "SELL", qty, row[7], _date(row[6]))
    for row in unrealised:
        name, isin, qty, bd = row[0], row[1], int(row[2]), _date(row[3])
        if not tracked(name, bd, rules):
            skipped[name] += 1
            continue
        add(name, isin, "BUY", qty, row[4], bd)

    merged = {k: {"qty": v["qty"], "price": round(v["value"] / v["qty"], 4)}
              for k, v in agg.items() if v["qty"]}
    return merged, skipped, unmapped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--client", required=True)
    ap.add_argument("--file", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    name2sym = {n: v["symbol"] for n, v in json.load(open(SYMBOL_MAP)).items()}
    realised, unrealised = parse_report(args.file)
    print(f"report: {len(realised)} realised lots, {len(unrealised)} unrealised lots")

    rules = JOIN_RULES.get(args.client)
    merged, skipped, unmapped = to_events(realised, unrealised, rules, name2sym)
    if rules:
        print(f"join cutoff {rules['cutoff']}: skipped {sum(skipped.values())} pre-join lots across "
              f"{len(skipped)} name(s) — their disposals are untracked too")
    if unmapped:
        print(f"\n{len(unmapped)} NAME(S) WITH NO TICKER in scratch/symbol_map.json:")
        for n, isin in sorted(unmapped.items()):
            print(f"   {n}  ({isin})")
        sys.exit("Refusing to run — add these to symbol_map.json first (a guessed ticker files the "
                 "trade against the wrong company).")
    print(f"{len(merged)} merged (symbol, date, side) rows\n")

    conn = psycopg2.connect(host=os.getenv("DB_HOST"), port=os.getenv("DB_PORT"),
                            dbname=os.getenv("DB_NAME"), user=os.getenv("DB_USER"),
                            password=os.getenv("DB_PASSWORD"), sslmode="require")
    cur = conn.cursor()
    cur.execute("select id from portfolio_tracker.clients where name=%s", (args.client,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"no client named {args.client!r}")
    cid = row[0]

    cur.execute("""select stock_symbol, date, type, quantity, price, broker
                   from portfolio_tracker.trades where client_id=%s""", (cid,))
    existing = {(s, d.isoformat(), t): {"qty": q, "price": float(p), "broker": b}
                for s, d, t, q, p, b in cur.fetchall()}

    new, match, conflict = [], [], []
    for k, v in sorted(merged.items()):
        e = existing.get(k)
        if not e:
            new.append((k, v))
        # Same quantity and the total consideration agrees to within a rupee => the same trade at a
        # rounded price. A real discrepancy moves the value by far more.
        elif e["qty"] == v["qty"] and abs(e["qty"] * e["price"] - v["qty"] * v["price"]) < 1.0:
            match.append((k, v, e))
        else:
            conflict.append((k, v, e))
    # Rows the DB holds that this report doesn't mention. Expected, not an error: the report covers a
    # window, and anything sold before it opened is absent by construction.
    only_db = [(k, v) for k, v in sorted(existing.items()) if k not in merged]

    def show(title, items, fmt):
        print(f"--- {title}: {len(items)} ---")
        for it in items:
            print("   " + fmt(*it))
        print()

    show("NEW (not in DB) — would insert", new,
         lambda k, v: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    show("ALREADY IN DB, identical", match,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")
    show("CONFLICT — same key, different numbers", conflict,
         lambda k, v, e: f"{k[1]} {k[0]:12s} {k[2]:4s} report qty={v['qty']}@{v['price']} | "
                         f"db qty={e['qty']}@{e['price']}")
    show("IN DB, absent from this report (outside its window — left alone)", only_db,
         lambda k, v: f"{k[1]} {k[0]:12s} {k[2]:4s} qty={v['qty']} @ {v['price']}")

    if conflict:
        print("CONFLICTS PRESENT — resolve these before applying. Nothing written.")
        return
    if not args.apply:
        print("[DRY RUN] re-run with --apply to insert the NEW rows.")
        return

    n = 0
    for (sym, day, side), v in new:
        cur.execute("""INSERT INTO portfolio_tracker.trades
            (client_id, stock_symbol, type, quantity, price, date, broker, notes)
            VALUES (%s,%s,%s,%s,%s,%s,'Groww','from Groww P&L report')
            ON CONFLICT (client_id, broker, stock_symbol, date, type)
            WHERE broker IS NOT NULL DO NOTHING""",
            (cid, sym, side, v["qty"], v["price"], day))
        n += cur.rowcount
    conn.commit()
    print(f"inserted {n} rows")


if __name__ == "__main__":
    main()
