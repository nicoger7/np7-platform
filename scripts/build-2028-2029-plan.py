#!/usr/bin/env python3
"""
The 2028 and 2029 plans, from the business plan's own Business Case.

Neither year existed. The budget stopped at 2027, so the growth and scale years
the whole investment case rests on were nowhere in the system.

Every figure here is read out of NP7_Business_Plan_2026_2029-v2-6.xlsx rather
than invented: revenue per range from the Business Case sheet, cost of goods
likewise, overhead and development line by line, and unit counts from Sales
Units so the P&L can turn stock into a cost of sale.

Four things are NOT simply copied, because they are what we have learned since
the sheet was written:

1. Croatia is not assumed. The sheet's personnel growth carries an own-factory
   plan; Nico's position on 2026-09-06 is that it depends on cashflow and that
   until then production stays in China. So the escalation above the 2027 run
   rate is a separate line marked `possible`, which the budget can switch off
   in one click to see the year without it.

2. Tammo Andersch is tranche 1 only, so the 2028 funding is Christian's
   tranche 3 of 37.500 alone, not two investors' 75.000.

3. Units are carried on the revenue and stock lines, so cost of sales works.
   Without them the P&L reports a profit with the boards left out of it.

4. Board moulds are not bought at all. The sheet has NP7 paying 50.000 in 2028
   and 40.000 in 2029 for them, but the boards are made in China and that
   factory owns the moulds. Both figures sit in the budget as switched off
   lines, so they cost nothing and are one click from coming back.

   The fin moulds at Proceed ARE NP7's, and stay. Nico put them at 40.000
   rather than the sheet's 60.000. They still run through development rather
   than being capitalised, which the 03.09 Anmerkungen calls wrong and which it
   still is.

Run: python3 scripts/build-2028-2029-plan.py [--apply]
"""
import json, os, sys, zipfile, urllib.request, urllib.error
from xml.etree import ElementTree as ET

APPLY = "--apply" in sys.argv
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
XLSX = "/Users/nicolasprien/Documents/Claude/Projects/NP7 Hardware GmbH/NP7_Business_Plan_2026_2029-v2-6.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403"


def rest(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:500]}")


def sheet(name):
    z = zipfile.ZipFile(XLSX)
    shared = [''.join(t.text or '' for t in si.iter(f"{NS}t"))
              for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si")]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = {s.get("name"): s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
           for s in wb.findall(f".//{NS}sheet")}[name]
    tgt = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}[rid]
    ws = ET.fromstring(z.read("xl/" + tgt.lstrip("/")))
    out = {}
    for c in ws.iter(f"{NS}c"):
        v = c.find(f"{NS}v")
        if v is None: continue
        out[c.get("r")] = shared[int(v.text)] if c.get("t") == "s" else v.text
    return out


BC = sheet("Business Case")
SU = sheet("Sales Units")
num = lambda cells, ref: float(cells.get(ref) or 0)

# ── The one assumption that is not settled ───────────────────────────────────
# Nico, 2026-09-06: "mostly direct and also retail. the mix is not clear yet."
#
# The sheet buries its own answer inside blended revenue totals, which is how it
# came to disagree with the 2027 plan without anyone noticing. So the split is a
# number here instead, applied to the real per-model prices out of the Margins
# sheet, and every board line is written twice: what retailers pay NP7, and what
# customers pay NP7 direct. Change DIRECT_SHARE and re-run to see another mix.
#
# 65% is "mostly direct" read literally. It is an assumption, and the lines say
# so; it is not a finding.
DIRECT_SHARE = 0.65

# [PLAN] the business plan's own Cashflow weights, same as the 2027 builder used.
REVENUE_W = [0, .05, .12, .15, .12, .15, .12, .08, .06, .08, .05, .02]
COST_W    = [.08, .08, .10, .08, .08, .10, .08, .08, .08, .08, .08, .08]
GOODS_W   = [0, .25, .25, 0, 0, .25, .25, 0, 0, 0, 0, 0]   # two runs a year once the range is established
FEE = 0.09

def spread(total, weights):
    parts = [round(total * w, 2) for w in weights]
    drift = round(total - sum(parts), 2)
    if drift:
        i = max(range(12), key=lambda k: weights[k])
        parts[i] = round(parts[i] + drift, 2)
    return parts

# Business Case column per year, and Sales Units "Tot Sold" column per year.
COL = {2028: "D", 2029: "E"}
SOLD = {2028: "O", 2029: "V"}
# Sales Units rows: boards 3-18, fins 22-23.
BOARD_ROWS = {"Slalom": [3, 4, 5, 12, 13, 14, 18], "Freerace": [6, 7, 8, 9, 15, 16],
              "Freeride": [10, 11, 17]}
FIN_ROWS = {"Rockstar fin": [22], "B-Line fin": [23]}

# Overhead and development, straight off the sheet.
OVERHEAD = [("CEO / factory lead salary", 25, "cost-personnel"),
            ("Nico sponsor replacement fee", 26, "cost-personnel"),
            ("Developer / shaper", 27, "cost-rnd"),
            ("Additional personnel", 28, "cost-personnel"),
            ("Accounting and bookkeeping", 29, "cost-legal"),
            ("Sales and partnership travel", 30, "cost-travel"),
            ("Website and hosting", 31, "cost-software"),
            ("Marketing materials", 32, "cost-marketing"),
            ("Insurance", 33, "cost-insurance"),
            ("Miscellaneous and legal", 34, "cost-legal"),
            ("Lars Wichmann, media", 35, "cost-personnel")]
DEV = [("Slalom range development", 38, "Slalom"), ("Freerace and freeride development", 39, "Freerace"),
       ("Packaging and accessories", 40, "Boards"), ("Marketing samples", 41, "Boards"),
       # No board moulds while the boards are made in China: that factory owns
       # them. [NICO 2026-09-06] Only tooling NP7 owns belongs in the plan, which
       # today is the fin moulds at Proceed. The figure is parked as a switched
       # off line in the budget rather than lost, in case production moves in house.
       ("Pre-production samples", 43, "Boards"),
       ("Graphics and design", 44, "Boards")]

cats = {c["key"]: c for c in rest("GET", "fin_categories?select=id,key,name,pnl_group")}
objs = {o["name"]: o for o in rest("GET", f"fin_cost_objects?select=id,name&entity_id=eq.{HW}")}


def build(year):
    col, sold = COL[year], SOLD[year]
    units = {}
    for rng, rows in BOARD_ROWS.items():
        units[rng] = sum(num(SU, f"{sold}{r}") for r in rows)
    for fin, rows in FIN_ROWS.items():
        units[fin] = sum(num(SU, f"{sold}{r}") for r in rows)

    # Board revenue is rebuilt from per-model prices and the stated mix, rather
    # than taken as the sheet's blend, so the assumption is on screen.
    MG = sheet("Margins")
    price = {}
    for r in range(3, 19):
        nm = MG.get(f"A{r}")
        if nm: price[nm] = (num(MG, f"E{r}"), num(MG, f"I{r}"))   # retail, direct
    def range_of(nm):
        for rng, rows in BOARD_ROWS.items():
            if any(SU.get(f"A{r}") == nm for r in rows): return rng
        return None
    split = {rng: [0.0, 0.0] for rng in BOARD_ROWS}
    for r in range(3, 19):
        nm = SU.get(f"A{r}")
        u = num(SU, f"{sold}{r}")
        if not nm or not u or nm not in price: continue
        rng = range_of(nm)
        if not rng: continue
        retail, direct = price[nm]
        split[rng][0] += u * (1 - DIRECT_SHARE) * retail
        split[rng][1] += u * DIRECT_SHARE * direct

    rev = {"Rockstar fin": num(BC, f"{col}10") + num(BC, f"{col}11"),
           "B-Line fin": num(BC, f"{col}12") + num(BC, f"{col}13")}
    for rng in BOARD_ROWS:
        rev[rng] = round(split[rng][0] + split[rng][1], 2)
    cogs = {"Slalom": num(BC, f"{col}17"), "Freerace": num(BC, f"{col}18"),
            "Freeride": num(BC, f"{col}19"),
            "Rockstar fin": num(BC, f"{col}20"), "B-Line fin": num(BC, f"{col}21")}

    lines = []
    def add(label, catkey, obj, weights, total, qty, note, confidence="expected"):
        if round(total, 2) == 0: return
        for i, amt in enumerate(spread(total, weights)):
            if amt == 0: continue
            lines.append({"category_id": cats[catkey]["id"], "label": label,
                          "month": f"{year}-{i+1:02d}-01", "amount_net": amt,
                          "quantity": round(qty * weights[i], 2) if qty else 0,
                          "confidence": confidence, "note": note, "_obj": obj})

    for rng in ("Slalom", "Freerace", "Freeride"):
        retail_rev, direct_rev = round(split[rng][0], 2), round(split[rng][1], 2)
        add(f"{rng} boards, direct", "rev-hardware-d2c", rng, REVENUE_W, direct_rev,
            units[rng] * DIRECT_SHARE,
            f"[ASSUM] {DIRECT_SHARE*100:.0f}% of {units[rng]:,.0f} {rng} boards sold direct, at the "
            f"Margins sheet's own per-model direct price. The mix is not settled.")
        add(f"{rng} boards, wholesale", "rev-hardware-b2b", rng, REVENUE_W, retail_rev,
            units[rng] * (1 - DIRECT_SHARE),
            f"[ASSUM] the other {100-DIRECT_SHARE*100:.0f}%, at what a retailer pays NP7.")
        add(f"{rng} boards, landed cost", "cost-goods", rng, GOODS_W, cogs[rng], units[rng],
            f"[PLAN] Business Case {year} cost of goods. Made in China; Croatia is not assumed.")
    for fin in ("Rockstar fin", "B-Line fin"):
        src = "Slalom" if fin == "Rockstar fin" else "Freerace"
        add(f"{fin} sales", "rev-hardware-d2c", fin, REVENUE_W, rev[fin], units[fin],
            f"[PLAN] Business Case {year} 'Fins - {src}', mapped to {fin}.")
        add(f"{fin}, production", "cost-goods", fin, GOODS_W, cogs[fin], units[fin],
            f"[PLAN] Business Case {year} 'Fins - {src}' cost of goods.")

    net_sales = sum(rev.values())
    add("Payment and fulfilment fee", "cost-fulfilment", "Company", REVENUE_W, round(net_sales * FEE, 2), 0,
        f"[PLAN] 9% of {net_sales:,.0f} net sales, as 2026 and 2027.")

    # Overhead, held at the 2027 run rate. What the sheet adds on top of that is
    # growth that mostly presumes an own factory, so it is a separate switchable line.
    prev = COL[2028] if year == 2029 else "C"
    for label, row, catkey in OVERHEAD:
        base = min(num(BC, f"{col}{row}"), num(BC, f"{prev}{row}"))
        extra = num(BC, f"{col}{row}") - base
        add(label, catkey, "Company", COST_W, base, 0,
            f"[PLAN] Business Case {year}, held at the {'2028' if year == 2029 else '2027'} level.")
        if extra > 0:
            add(f"{label}, growth step", catkey, "Company", COST_W, extra, 0,
                "[NICO 2026-09-06] The sheet's increase assumes scaling up, which depends on cashflow "
                "and on whether the Croatian factory happens. Untick to see the year without it.",
                confidence="possible")

    for label, row, obj in DEV:
        add(label, "cost-rnd", obj, COST_W, num(BC, f"{col}{row}"), 0,
            f"[PLAN] Business Case {year}."
            + (" Moulds run through development rather than being capitalised, which the 03.09 "
               "Anmerkungen flags as wrong; left as the sheet has it so the two can be compared."
               if label == "Moulds" else ""))

    if year == 2028:
        lines.append({"category_id": cats["fin-investment"]["id"],
                      "label": "Christian Skodde - tranche 3", "month": "2028-01-01",
                      "amount_net": 37500, "quantity": 0, "confidence": "possible",
                      "note": "[NICO 2026-09-04] 15% growth reserve, called only if 2027 milestones are met. "
                              "Christian alone: Tammo Andersch committed to tranche 1 only.",
                      "_obj": "Company"})
    return lines, rev, cogs, units


for year in (2028, 2029):
    lines, rev, cogs, units = build(year)
    by = {}
    for l in lines:
        g = next(c["pnl_group"] for c in cats.values() if c["id"] == l["category_id"])
        by[g] = by.get(g, 0) + l["amount_net"]
    result = by.get("revenue", 0) - (by.get("cogs", 0) + by.get("inventory", 0) + by.get("opex", 0) + by.get("development", 0))
    print(f"\n{year}: {len(lines)} lines")
    for g in ("revenue", "cogs", "inventory", "opex", "development", "financing"):
        if by.get(g): print(f"    {g:12} {by[g]:>12,.0f}")
    print(f"    {'result':12} {result:>12,.0f}   (stock sold in-year, so it is all a cost)")
    print(f"    units: " + ", ".join(f"{k} {v:,.0f}" for k, v in units.items() if v))
    poss = sum(l["amount_net"] for l in lines if l["confidence"] == "possible")
    print(f"    of which marked possible and switchable: {poss:,.0f}")

    if not APPLY: continue
    old = [p for p in rest("GET", f"fin_plans?select=id,name&entity_id=eq.{HW}&year=eq.{year}")]
    for p in old: rest("DELETE", f"fin_plans?id=eq.{p['id']}")
    plan = rest("POST", "fin_plans", {"entity_id": HW, "name": f"Plan {year}", "year": year,
        "status": "active", "note": f"Built from the Business Case sheet of business plan v2.6, "
        f"with Croatia treated as uncertain and Tammo Andersch at tranche 1 only."},
        prefer="return=representation")[0]
    objmap = {}
    for l in lines:
        obj = l.pop("_obj"); l["plan_id"] = plan["id"]
        objmap[id(l)] = obj
    made = []
    for i in range(0, len(lines), 200):
        made += rest("POST", "fin_plan_lines", lines[i:i+200], prefer="return=representation")
    allocs = [{"plan_line_id": m["id"], "cost_object_id": objs[objmap[id(l)]]["id"], "share": 100}
              for m, l in zip(made, lines) if objmap[id(l)] in objs]
    for i in range(0, len(allocs), 200):
        rest("POST", "fin_line_objects", allocs[i:i+200])
    print(f"    written: plan {plan['name']}, {len(made)} lines, {len(allocs)} allocations")

if not APPLY:
    print("\nDry run. Re-run with --apply to write.")
