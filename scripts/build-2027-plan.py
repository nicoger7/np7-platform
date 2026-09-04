#!/usr/bin/env python3
"""
Map out the whole of 2027 for NP7 Hardware.

Sources, so every number can be traced:
  [NICO]  told me 2026-09-04: 350 boards, 400 Rockstar fins, 400 B-Line fins;
          slalom honeycomb ~650 FOB China; Rockstar made in Germany at Proceed;
          B-Line made in China; new moulds + multitools in February.
  [PLAN]  NP7_Business_Plan_2026_2029-v2-6, 2027 column: overheads 183,000,
          board development 80,800, fin development 10,000, and the monthly
          seasonality weights from its own Cashflow sheet.
  [DERIV] arithmetic on the two above, marked in the note on every line.
  [ASSUM] my assumption, flagged in the note, for the numbers Nico does not
          have yet (B-Line selling price, the two fin production costs).

Run with --apply to write.
"""
import os, sys, json, urllib.request, urllib.parse

APPLY = "--apply" in sys.argv
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def rest(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw.strip() else []

YEAR = 2027
# [PLAN] the business plan's own Cashflow sheet weights, so the shape of the
# year is Nico's rather than mine.
REVENUE_W = [0, .05, .12, .15, .12, .15, .12, .08, .06, .08, .05, .02]
COST_W    = [.08, .08, .10, .08, .08, .10, .08, .08, .08, .08, .08, .08]
GOODS_W   = [0, 0, .30, .20, 0, .30, .20, 0, 0, 0, 0, 0]

BOARDS, ROCKSTAR, BLINE = 350, 400, 400
BOARD_PRICE   = 2015    # [PLAN] cost plan assumption, blended net per board
BOARD_LANDED  = 826     # [DERIV] 650 FOB + 3.7% duty + ~152 freight/clearance
ROCKSTAR_PRICE = 400    # [PLAN] cost plan: 400 net per fin
BLINE_PRICE   = 200     # [ASSUM] B-Line is the value line; plan's freerace fin sits 175-202
ROCKSTAR_COST = 180     # [ASSUM] plan's fin production cost; German build may run higher
BLINE_COST    = 107     # [ASSUM] 90 production + 17 freight/duty, plan's freight figure
FEE = 0.09              # [PLAN] 9% payment and fulfilment fee on net sales

def spread(total, weights):
    """Whole cents, with the rounding drift pushed into the largest month so the
       twelve parts always add back to the total."""
    parts = [round(total * w, 2) for w in weights]
    drift = round(total - sum(parts), 2)
    if drift:
        i = max(range(12), key=lambda k: weights[k])
        parts[i] = round(parts[i] + drift, 2)
    return parts

board_rev   = BOARDS * BOARD_PRICE
rock_rev    = ROCKSTAR * ROCKSTAR_PRICE
bline_rev   = BLINE * BLINE_PRICE
net_sales   = board_rev + rock_rev + bline_rev

LINES = [
    # label, category key, cost object, weights, total, quantity, source note
    ("Board sales", "rev-hardware-d2c", "Boards", REVENUE_W, board_rev, BOARDS,
     "[NICO] 350 boards year one x [PLAN] 2,015 EUR net each."),
    ("Rockstar fin sales", "rev-hardware-d2c", "Rockstar fin", REVENUE_W, rock_rev, ROCKSTAR,
     "[NICO] 400 Rockstar fins x [PLAN] 400 EUR net each."),
    ("B-Line fin sales", "rev-hardware-d2c", "B-Line fin", REVENUE_W, bline_rev, BLINE,
     "[NICO] 400 B-Line fins x [ASSUM] 200 EUR net. Price not yet set."),

    ("Boards, landed cost", "cost-goods", "Boards", GOODS_W, BOARDS * BOARD_LANDED, BOARDS,
     "[DERIV] 350 x 826. 650 FOB China + 3.7% duty + ~152 freight and clearance."),
    ("Rockstar fins, production", "cost-goods", "Rockstar fin", GOODS_W, ROCKSTAR * ROCKSTAR_COST, ROCKSTAR,
     "[ASSUM] 400 x 180. Made in Germany at Proceed; German build may run higher."),
    ("B-Line fins, landed cost", "cost-goods", "B-Line fin", GOODS_W, BLINE * BLINE_COST, BLINE,
     "[ASSUM] 400 x 107. Made in China; quantities and prices not yet agreed."),
    ("Payment and fulfilment fee", "cost-fulfilment", "Company", REVENUE_W, round(net_sales * FEE, 2), None,
     "[PLAN] 9% on net sales."),

    # [PLAN] the 2027 column of the business plan, unchanged
    ("CEO / factory lead salary", "cost-personnel", "Company", COST_W, 48000, None, "[PLAN] 2027 column."),
    ("Nico sponsor replacement fee", "cost-freelance", "Company", COST_W, 40000, None, "[PLAN] 2027 column."),
    ("Developer / shaper", "cost-rnd", "Boards", COST_W, 25000, None, "[PLAN] 2027 column."),
    ("Additional personnel", "cost-personnel", "Company", COST_W, 24000, None, "[PLAN] 2027 column."),
    ("Accounting and bookkeeping", "cost-legal", "Company", COST_W, 8000, None, "[PLAN] 2027 column."),
    ("Sales and partnership travel", "cost-travel", "Company", COST_W, 15000, None, "[PLAN] 2027 column."),
    ("Website and hosting", "cost-software", "Company", COST_W, 2000, None, "[PLAN] 2027 column."),
    ("Marketing materials", "cost-marketing", "Company", COST_W, 3000, None, "[PLAN] 2027 column."),
    ("Insurance", "cost-insurance", "Company", COST_W, 3000, None, "[PLAN] 2027 column."),
    ("Miscellaneous and legal", "cost-legal", "Company", COST_W, 3000, None, "[PLAN] 2027 column."),
    ("Lars Wichmann, media", "cost-personnel", "Company", COST_W, 12000, None, "[PLAN] 2027 column."),

    ("Board development", "cost-rnd", "Boards", COST_W, 20800, None,
     "[PLAN] 2027 board development 80,800 less the 60,000 of moulds, which are their own line."),
    ("Fin development", "cost-rnd", "Fins", COST_W, 10000, None, "[PLAN] 2027 column."),
]

# February gets its own single-month line: the scale-up Nico named.
FEB_ONLY = [
    ("Moulds and multitools, German factory", "cost-rnd", "Rockstar fin", 60000, 2,
     "[NICO] scale-up in February once 50-100 fins are sold. [PLAN] 2027 moulds budget."),
]

ent = rest("GET", "fin_entities?select=id,name&key=eq.np7-hardware")[0]
cats = {c["key"]: c for c in rest("GET", "fin_categories?select=id,key,name,pnl_group")}
objs = {o["name"]: o for o in rest("GET", f"fin_cost_objects?select=id,name&entity_id=eq.{ent['id']}&archived_at=is.null")}

missing = [k for _, k, *_ in [(l[0], l[1]) for l in LINES] if k not in cats]
if missing: print("unknown categories:", missing); sys.exit(1)

rows = []
for label, cat, obj, weights, total, qty, note in LINES:
    for i, amount in enumerate(spread(total, weights)):
        if not amount: continue
        rows.append(dict(label=label, cat=cat, obj=obj, month=i + 1, amount=amount,
                         # quantity goes on the LAST month with money, never on every
                         # one, or the year would sell 350 boards twelve times over
                         qty=None, note=note))
    if qty:
        last = max(i for i, a in enumerate(spread(total, weights)) if a)
        for r in rows:
            if r["label"] == label and r["month"] == last + 1: r["qty"] = qty
for label, cat, obj, total, month, note in FEB_ONLY:
    rows.append(dict(label=label, cat=cat, obj=obj, month=month, amount=total, qty=None, note=note))

rev = sum(r["amount"] for r in rows if cats[r["cat"]]["pnl_group"] == "revenue")
cost = sum(r["amount"] for r in rows if cats[r["cat"]]["pnl_group"] != "revenue")
print(f"\nNP7 Hardware · Plan {YEAR}   {len(rows)} lines")
print(f"  revenue      {rev:>14,.2f}")
print(f"  costs        {cost:>14,.2f}")
print(f"  result       {rev - cost:>14,.2f}\n")
seen = {}
for r in rows: seen.setdefault((r["label"], r["obj"]), []).append(r["amount"])
for (label, obj), amts in seen.items():
    print(f"  {label[:38]:40} {obj[:14]:16} {sum(amts):>12,.0f}  over {len(amts)} month(s)")

if not APPLY:
    print("\nDRY RUN. Re-run with --apply to write.")
    sys.exit(0)

NAME = f"Plan {YEAR} · full year"
existing = rest("GET", f"fin_plans?select=id&entity_id=eq.{ent['id']}&year=eq.{YEAR}"
                       f"&name=eq.{urllib.parse.quote(NAME)}")
if existing:
    plan_id = existing[0]["id"]
    rest("DELETE", f"fin_plan_lines?plan_id=eq.{plan_id}")
    print(f"reusing plan {plan_id}, cleared its lines")
else:
    plan = rest("POST", "fin_plans", {
        "entity_id": ent["id"], "year": YEAR, "name": NAME, "status": "active",
        "note": "Whole of 2027. Built from the business plan's 2027 column and its own seasonality, "
                "adjusted for Nico's 2026-09-04 volumes and the 650 EUR honeycomb board price.",
    }, prefer="return=representation")[0]
    plan_id = plan["id"]
    rest("PATCH", f"fin_plans?entity_id=eq.{ent['id']}&year=eq.{YEAR}&status=eq.active&id=neq.{plan_id}",
         {"status": "archived"})
    print(f"created plan {plan_id} and archived the previous 2027 plan")

payload = [{
    "plan_id": plan_id, "category_id": cats[r["cat"]]["id"], "label": r["label"],
    "month": f"{YEAR}-{r['month']:02d}-01", "amount_net": r["amount"],
    "quantity": r["qty"], "confidence": "expected", "note": r["note"],
} for r in rows]
for i in range(0, len(payload), 100):
    rest("POST", "fin_plan_lines", payload[i:i + 100])

made = rest("GET", f"fin_plan_lines?select=id,label&plan_id=eq.{plan_id}")
by_label = {}
for l in made: by_label.setdefault(l["label"], []).append(l["id"])
allocs = []
for label, ids in by_label.items():
    obj_name = next(r["obj"] for r in rows if r["label"] == label)
    o = objs.get(obj_name)
    if not o: continue
    allocs += [{"plan_line_id": i, "cost_object_id": o["id"], "share": 100} for i in ids]
for i in range(0, len(allocs), 100):
    rest("POST", "fin_line_objects", allocs[i:i + 100])

print(f"wrote {len(payload)} lines and {len(allocs)} allocations")
