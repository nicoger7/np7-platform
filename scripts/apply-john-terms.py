#!/usr/bin/env python3
"""Re-time the board purchases in the hardware budget to John's payment terms.

John, 23.09.2026: "50% deposit due when all the order details are confirmed to
start production ... The remaining 50% balance is due prior to shipping the
finished goods. Shipping terms generally are: Ex BSW China Factory."

The budget still pays boards the old way: 30% of a 161,000 first run in
December 2026, then the landed cost of each season in March, April, June and
July as the boards sell. On John's terms a season's run is paid

  November of the year before   50% of the ex-works price (the dealer window
                                closes 31 October, the order goes in)
  January                       the other 50%, before the boards ship
  February                      freight, duty and China origin costs

The totals per season stay what the plan already says; only the months move,
and the old board lines are switched off (included = false), not deleted, so
the history of what was planned stays readable.

Dry run by default. Run: python3 scripts/apply-john-terms.py [--apply]
"""
import json
import sys
import urllib.error
import urllib.request

APPLY = "--apply" in sys.argv
HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403"

env = {}
for line in open(".env.local"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def rest(path, method="GET", body=None, prefer=None):
    head = dict(HEAD)
    if prefer:
        head["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method, headers=head,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400])
        raise


# ── what a board costs, split into the factory price and the rest ──────────
FX = 1.16
DUTY = 0.037
FREIGHT = (5000 + 600) / 80          # sea freight + broker + China origin (ex works), per board
INLAND = 10.0
EXW_USD = {"slalom": 700, "freerace": 558, "freeride": 451}
exw = {k: v / FX for k, v in EXW_USD.items()}
extra = {k: FREIGHT + INLAND + v * DUTY for k, v in exw.items()}   # only for boards that come to Europe

# units by channel (direct, European dealers, worldwide dealers) and 5% carry-over
# stock on the European side, as in the business plan's Sales Units sheet
UNITS = {
    2027: {"slalom": (64, 25, 48), "freerace": (136, 55, 102), "freeride": (0, 0, 0)},
    2028: {"slalom": (121, 48, 91), "freerace": (228, 91, 171), "freeride": (95, 38, 71)},
    2029: {"slalom": (261, 105, 196), "freerace": (501, 200, 376), "freeride": (212, 85, 159)},
}
CARRY = 1.05


def run(year):
    price = rest_ = 0.0
    for k, (d, eu, ww) in UNITS[year].items():
        europe = (d + eu) * CARRY
        price += (europe + ww) * exw[k]
        rest_ += europe * extra[k]
    return round(price), round(rest_)


plans = {p["year"]: p for p in rest("fin_plans?select=*")
         if p["entity_id"] == HW and p["status"] == "active" and p["year"] in (2026, 2027, 2028, 2029)}
cats = {c["name"]: c for c in rest("fin_categories?select=*")}
goods = cats["Goods purchased (hardware)"]["id"]
ids = ",".join(p["id"] for p in plans.values())
lines = rest(f"fin_plan_lines?select=*&plan_id=in.({ids})&limit=3000")
old = [ln for ln in lines if ln["included"] and (
    ln["label"].endswith("boards, landed cost") or ln["label"] == "Deposit - paid in December")]

new = []
for year in (2027, 2028, 2029):
    price, rest_ = run(year)
    deposit, balance = round(price * 0.5), price - round(price * 0.5)
    before = plans[year - 1]
    new += [
        {"plan_id": before["id"], "month": f"{year - 1}-11-01", "label": f"Boards {year} run: 50% deposit to the factory", "amount_net": deposit},
        {"plan_id": plans[year]["id"], "month": f"{year}-01-01", "label": f"Boards {year} run: 50% balance before shipping", "amount_net": balance},
        {"plan_id": plans[year]["id"], "month": f"{year}-02-01", "label": f"Boards {year} run: freight, duty and China origin", "amount_net": rest_},
    ]
for n in new:
    n.update({"category_id": goods, "confidence": "likely", "included": True,
              "note": "[JOHN 2026-09-23] 50% with the confirmed order, 50% before shipping, ex works. Re-timed by scripts/apply-john-terms.py."})

year_of = {p["id"]: y for y, p in plans.items()}
print("Switched off (included = false):")
for y in (2026, 2027, 2028, 2029):
    mine = [ln for ln in old if year_of[ln["plan_id"]] == y]
    if mine:
        print(f"  {y}: {len(mine):>2} lines, {sum(float(ln['amount_net']) for ln in mine):>10,.0f}")
print("\nAdded:")
for n in new:
    print(f"  {n['month'][:7]}  {n['label']:52} {n['amount_net']:>10,.0f}")
print(f"\nOld board spend {sum(float(ln['amount_net']) for ln in old):,.0f}  →  new {sum(n['amount_net'] for n in new):,.0f}")

if not APPLY:
    print("\nDry run. Nothing written. Add --apply to write it.")
    sys.exit(0)

for ln in old:
    rest(f"fin_plan_lines?id=eq.{ln['id']}", "PATCH", {"included": False}, prefer="return=minimal")
rest("fin_plan_lines", "POST", new, prefer="return=minimal")
print("applied.")
