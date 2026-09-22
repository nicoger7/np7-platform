#!/usr/bin/env python3
"""Bring the hardware budget in line with the factory quote of 18.09.2026.

Three things the budget still had wrong after John quoted USD 700 FOB for a
finished slalom:

1. Board cost. The plan carried the old Cobra-era landed cost (about 910 / 656 /
   559 a board). The quote lands at 698 / 571 / 476, and the boards that go to
   worldwide dealers never enter Europe at all, so those units cost FOB only:
   no freight, no duty, no inland transport.

2. Employer social charges. Neither the business plan nor the budget ever
   carried them. Gross pay without the Arbeitgeberanteil is not what a person
   costs.

3. The pre-order discount. Riders who put a deposit down in the autumn get 10%,
   which is the price of not needing a bank line.

Everything else in the plan stays untouched. Dry run by default.

Run: python3 scripts/apply-factory-quote.py [--apply]
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
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method, headers=head,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400])
        raise


def page(path):
    out, off = [], 0
    while True:
        chunk = rest(f"{path}&limit=1000&offset={off}")
        out += chunk
        if len(chunk) < 1000:
            return out
        off += 1000


# ── the quote, and what a board costs once it is here ──────────────────────
FX = 1.16                 # EUR/USD, ECB reference, September 2026
DUTY = 0.037              # EU import duty on the FOB value
FREIGHT = 5000 / 80       # sea freight and broker, per board in a 20ft container
INLAND = 10.0
FOB_USD = {"slalom": 700, "freerace": 558, "freeride": 451}   # slalom quoted, others scaled 0.797 / 0.644

fob = {k: v / FX for k, v in FOB_USD.items()}
landed = {k: v + FREIGHT + INLAND + v * DUTY for k, v in fob.items()}

# units by channel, from the plan's own revenue lines
UNITS = {
    2027: {"slalom": (63.6, 25.43, 47.67), "freerace": (136.4, 54.57, 102.33), "freeride": (0, 0, 0)},
    2028: {"slalom": (120.93, 48.37, 90.67), "freerace": (228.37, 91.35, 171.26), "freeride": (94.88, 37.95, 71.15)},
    2029: {"slalom": (261.4, 104.55, 196.05), "freerace": (500.93, 200.37, 375.67), "freeride": (211.63, 84.65, 158.74)},
}
LABEL = {"slalom": "Slalom boards, landed cost",
         "freerace": "Freerace boards, landed cost",
         "freeride": "Freeride boards, landed cost"}

# new lines the budget never had
SOCIAL = {2027: 12600, 2028: 21630, 2029: 35280}      # 21% on gross pay of 60k / 103k / 168k
DISCOUNT = {2027: 18858, 2028: 27289, 2029: 45386}    # 10% on 100 / 150 / 250 pre-ordered boards

cats = {c["name"]: c for c in page("fin_categories?select=*&order=sort")}
plans = {p["year"]: p for p in rest("fin_plans?select=*")
         if p["entity_id"] == HW and p["status"] == "active" and p["year"] in (2027, 2028, 2029)}
lines = page("fin_plan_lines?select=*&order=month")
by_plan = {}
for ln in lines:
    by_plan.setdefault(ln["plan_id"], []).append(ln)

print(f"Landed cost per board:  slalom {landed['slalom']:.0f}   freerace {landed['freerace']:.0f}   "
      f"freeride {landed['freeride']:.0f}")
print(f"Worldwide dealers pay ex works, so those units cost FOB only: "
      f"{fob['slalom']:.0f} / {fob['freerace']:.0f} / {fob['freeride']:.0f}\n")

patches, inserts = [], []
for year, plan in sorted(plans.items()):
    rows = by_plan.get(plan["id"], [])
    print(f"── {year} " + "─" * 60)
    for key, label in LABEL.items():
        mine = [r for r in rows if r["label"] == label]
        if not mine:
            continue
        old = sum(float(r["amount_net"] or 0) for r in mine)
        d, eu, ww = UNITS[year][key]
        new = (d + eu) * landed[key] + ww * fob[key]
        if old <= 0:
            continue
        factor = new / old
        print(f"  {label:34} {old:>10,.0f} → {new:>10,.0f}   ({old/(d+eu+ww):.0f} → {new/(d+eu+ww):.0f} a board)")
        for r in mine:
            patches.append((r["id"], round(float(r["amount_net"] or 0) * factor, 2)))
    sal = cats["Salaries and social charges"]["id"]
    ful = cats["Fulfilment and 3PL"]["id"]
    print(f"  {'Employer social charges (new)':34} {'':>10} → {SOCIAL[year]:>10,.0f}")
    print(f"  {'Pre-order discount (new)':34} {'':>10} → {DISCOUNT[year]:>10,.0f}")
    existing = {r["label"] for r in rows}
    for m in range(1, 13):
        if "Employer social charges" not in existing:
            inserts.append({"plan_id": plan["id"], "category_id": sal, "label": "Employer social charges",
                            "month": f"{year}-{m:02d}-01", "amount_net": round(SOCIAL[year] / 12, 2),
                            "confidence": "likely", "included": True})
    if "Pre-order discount" not in existing:
        inserts.append({"plan_id": plan["id"], "category_id": ful, "label": "Pre-order discount",
                        "month": f"{year}-03-01", "amount_net": DISCOUNT[year], "confidence": "likely",
                        "included": True})

print(f"\n{len(patches)} existing rows to re-price, {len(inserts)} new rows to add.")
if not APPLY:
    print("Dry run. Nothing written. Add --apply to write it.")
    sys.exit(0)

if "--inserts-only" not in sys.argv:
    for pid, amount in patches:
        rest(f"fin_plan_lines?id=eq.{pid}", "PATCH", {"amount_net": amount}, prefer="return=minimal")
for chunk in [inserts[i:i + 100] for i in range(0, len(inserts), 100)]:
    rest("fin_plan_lines", "POST", chunk, prefer="return=minimal")
print("applied.")
