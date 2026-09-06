#!/usr/bin/env python3
"""
One pricing basis for every year, stated out loud.

Board revenue was a single blended number per year, and the blends disagreed:
2.015 per board in 2027 against roughly 1.243 in 2028. Nobody could see it,
because a blend hides both the price and the mix inside one figure.

Now every board range is two lines. What a customer pays NP7 direct, and what a
retailer pays NP7. Two constants set the whole model:

  SLALOM_RRP        what a Slalom sells for        [NICO 2026-09-06] 2.800 incl VAT
  DIRECT_SHARE      how much is sold direct        [NICO 2026-09-06] 70%
  RETAILER_MARGIN   what the shop keeps            [NICO 2026-09-06] 38%
  VAT               German GmbH                    19%

Everything is derived from the price on the shelf, because that is the number
Nico actually knows. Take VAT off it to get what NP7 books selling direct; take
the retailer's 40% off that to get what NP7 books selling through a shop.

Two things this corrects.

The plan assumed a Slalom at 3.091 incl VAT and the real price is 2.800, so the
sheet's whole price list is 9.4% high. Every other model is scaled by the same
factor until Nico confirms it individually.

And the sheet's "NP7 Revenue Direct" column is already net of the fulfiller
fee, while the budget charges a 9% payment and fulfilment line as well. The fee
was coming off twice. Revenue is the ex-VAT shelf price now, and the fee is
deducted once, in the one place it belongs.

Those two errors were pulling in opposite directions and very nearly cancelled,
which is exactly why neither was visible.

Direct prices are the Margins sheet's per-model figures, treated as net. Nico
thinks 2.325 for a Slalom may be "a touch lower" in reality; when that number
firms up it is one edit here.

Run: python3 scripts/reprice-boards.py [--apply]
"""
import json, os, sys, zipfile, urllib.request, urllib.error, collections
from xml.etree import ElementTree as ET

APPLY = "--apply" in sys.argv
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
XLSX = "/Users/nicolasprien/Documents/Claude/Projects/NP7 Hardware GmbH/NP7_Business_Plan_2026_2029-v2-6.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403"

# What a board costs on the shelf, including VAT. Nico's own figures, 2026-09-06.
# A range not listed here keeps the business plan's price and says so, rather
# than being scaled off another range: the two prices we do know are 9.4% and
# 1.5% below the sheet, so there is no factor to borrow.
RRP_INCL_VAT = {
    "Slalom":   2800.0,
    "Freerace": 1970.0,
    # Nico: "under 1800 for freeride ideally". The business plan already sat at
    # 1.794, so this is a rounder shelf price at the same level rather than a
    # change of plan. Freeride does not sell until 2028.
    "Freeride": 1790.0,
}
DIRECT_SHARE = 0.70
RETAILER_MARGIN = 0.38
VAT = 0.19
# Nico, 2026-09-06: "europe shops we import to europe and deliver to shops.
# worldwide shops they arrange shipping from china."
#
# So only the European half of wholesale costs NP7 any outbound freight. A shop
# outside Europe collects in China and pays its own way, which also means NP7
# never lands those boards and never pays the import on them.
EUROPE_SHARE_OF_WHOLESALE = 0.70   # [ASSUM] not confirmed
REVENUE_W = [0, .05, .12, .15, .12, .15, .12, .08, .06, .08, .05, .02]
FEE = 0.09


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
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:400]}")


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
        if v is not None: out[c.get("r")] = shared[int(v.text)] if c.get("t") == "s" else v.text
    return out


M, SU = sheet("Margins"), sheet("Sales Units")
num = lambda d, r: float(d.get(r) or 0)
RANGES = {"Slalom": ["Slalom 63", "Slalom 67", "Slalom 72", "Slalom 77", "Slalom 82", "Slalom 85", "Slalom Foil 85"],
          "Freerace": ["Freerace 100", "Freerace 110", "Freerace 120", "Freerace 130", "Freerace 145", "Freerace 155"],
          "Freeride": ["Freeride 120", "Freeride 130", "Freeride 140"]}
# Column O is the shelf price including VAT. Where Nico has given a real price
# for a range, the whole range moves onto it, keeping the sheet's own premium
# for the odd model out (the foil board is dearer than the other Slaloms and
# should stay dearer).
BASE_MODEL = {"Slalom": "Slalom 63", "Freerace": "Freerace 110", "Freeride": "Freeride 130"}
sheet_rrp = {}
for r in range(3, 19):
    nm = M.get(f"A{r}")
    if nm: sheet_rrp[nm] = num(M, f"O{r}")

direct_price, wholesale_price, priced_from = {}, {}, {}
for rng, models in RANGES.items():
    base = sheet_rrp.get(BASE_MODEL[rng], 0)
    told = RRP_INCL_VAT.get(rng)
    factor = (told / base) if (told and base) else 1.0
    for m in models:
        if m not in sheet_rrp: continue
        rrp = sheet_rrp[m] * factor
        net = rrp / (1 + VAT)
        direct_price[m] = round(net, 2)
        wholesale_price[m] = round(net * (1 - RETAILER_MARGIN), 2)
        priced_from[m] = ("Nico" if told else "business plan", rrp)
sold_col = {2027: "H", 2028: "O", 2029: "V"}
units = {y: {} for y in sold_col}
for r in range(3, 19):
    nm = SU.get(f"A{r}")
    if not nm: continue
    for y, col in sold_col.items(): units[y][nm] = num(SU, f"{col}{r}")

# 2027 sells 350 boards, not the sheet's 412: Nico's own figure. The MIX is the
# sheet's; the VOLUME is his.
ACTUAL_BOARDS = {2027: 350}

def spread(total, weights):
    parts = [round(total * w, 2) for w in weights]
    drift = round(total - sum(parts), 2)
    if drift: parts[max(range(12), key=lambda k: weights[k])] += drift
    return [round(p, 2) for p in parts]

cats = {c["key"]: c for c in rest("GET", "fin_categories?select=id,key,pnl_group")}
objs = {o["name"]: o for o in rest("GET", f"fin_cost_objects?select=id,name&entity_id=eq.{HW}")}

for year in (2027, 2028, 2029):
    plans = rest("GET", f"fin_plans?select=id,name&entity_id=eq.{HW}&year=eq.{year}&status=eq.active")
    if not plans: print(f"\n{year}: no active plan"); continue
    plan = plans[0]
    sheet_total = sum(units[year].values())
    scale = (ACTUAL_BOARDS.get(year, sheet_total) / sheet_total) if sheet_total else 0

    new, summary = [], {}
    for rng, models in RANGES.items():
        u = sum(units[year].get(m, 0) for m in models) * scale
        if u <= 0: continue
        d_rev = sum(units[year].get(m, 0) * scale * DIRECT_SHARE * direct_price.get(m, 0) for m in models)
        w_rev = sum(units[year].get(m, 0) * scale * (1 - DIRECT_SHARE) * wholesale_price.get(m, 0)
                    for m in models)
        summary[rng] = (u, d_rev + w_rev)
        for label, catkey, total, qty, note in (
            (f"{rng} boards, direct", "rev-hardware-d2c", d_rev, u * DIRECT_SHARE,
             f"[NICO 2026-09-06] {DIRECT_SHARE*100:.0f}% of {u:,.0f} {rng} boards direct. Shelf price less "
             f"{VAT*100:.0f}% VAT; the 9% fee is a separate line and is not taken off twice."),
            (f"{rng} boards, wholesale", "rev-hardware-b2b", w_rev, u * (1 - DIRECT_SHARE),
             f"[NICO 2026-09-06] the other {(1-DIRECT_SHARE)*100:.0f}%, with the retailer keeping "
             f"{RETAILER_MARGIN*100:.0f}% of the same shelf price."),
        ):
            for i, amt in enumerate(spread(round(total, 2), REVENUE_W)):
                if amt == 0: continue
                new.append({"plan_id": plan["id"], "category_id": cats[catkey]["id"], "label": label,
                            "month": f"{year}-{i+1:02d}-01", "amount_net": amt,
                            "quantity": round(qty * REVENUE_W[i], 2), "confidence": "expected",
                            "note": note, "_obj": rng})

    # ── getting the board to the shop ────────────────────────────────────────
    # Dealers expect a delivered price, so NP7 quotes delivered and NP7 pays the
    # freight. The business plan assumed the opposite, ex works, which is why its
    # wholesale price is ~150 lower per board. Either the money comes off the
    # revenue or it goes on as a cost; it cannot be neither, and it was neither.
    # The per-board figure is the plan's own import cost, which is what it also
    # used as the retailer's landed adder.
    out_freight = 0.0
    for rng, models in RANGES.items():
        for m in models:
            u = units[year].get(m, 0) * scale * (1 - DIRECT_SHARE) * EUROPE_SHARE_OF_WHOLESALE
            out_freight += u * num(M, f"C{[r for r in range(3,19) if M.get(f'A{r}') == m][0]}")
    if out_freight > 0:
        for i, amt in enumerate(spread(round(out_freight, 2), REVENUE_W)):
            if amt == 0: continue
            new.append({"plan_id": plan["id"], "category_id": cats["cost-fulfilment"]["id"],
                        "label": "Outbound freight to retailers", "month": f"{year}-{i+1:02d}-01",
                        "amount_net": amt, "quantity": 0, "confidence": "expected",
                        "note": f"[NICO 2026-09-06] European shops only: NP7 imports and delivers to them, "
                                f"so NP7 pays this. Shops outside Europe collect in China and ship "
                                f"themselves. Assumes {EUROPE_SHARE_OF_WHOLESALE*100:.0f}% of wholesale is "
                                f"European, which is not confirmed.",
                        "_obj": "Company"})

    board_rev = sum(v[1] for v in summary.values())
    boards = sum(v[0] for v in summary.values())
    old = [l for l in rest("GET", f"fin_plan_lines?select=id,label,amount_net&plan_id=eq.{plan['id']}")
           if ("board" in l["label"].lower() or "outbound freight" in l["label"].lower())
           and "cost" not in l["label"].lower()
           and "landed" not in l["label"].lower() and "development" not in l["label"].lower()
           and "prototype" not in l["label"].lower() and "sample" not in l["label"].lower()]
    old_rev = sum(float(l["amount_net"]) for l in old)
    if year == 2027:
        print("\n  Shelf price to what NP7 books:\n")
        print(f"    {'model':16} {'RRP incl':>9} {'source':>14} {'direct':>9} {'wholesale':>10}")
        for rng, models in RANGES.items():
            for m in models:
                if m not in priced_from or not units[2028].get(m) and not units[2027].get(m): continue
                src, rrp = priced_from[m]
                print(f"    {m:16} {rrp:>9,.0f} {src:>14} {direct_price[m]:>9,.0f} {wholesale_price[m]:>10,.0f}")
    print(f"\n{year}: {boards:,.0f} boards")
    print(f"    was {old_rev:>12,.0f} across {len(old)} lines")
    print(f"    now {board_rev:>12,.0f} across {len(new)} lines   ({board_rev/boards:,.0f} per board)")
    print(f"    change {board_rev-old_rev:>+11,.0f}")
    for rng, (u, rev) in summary.items():
        print(f"      {rng:10} {u:>6,.0f} boards  {rev:>11,.0f}")

    if not APPLY: continue
    for l in old: rest("DELETE", f"fin_plan_lines?id=eq.{l['id']}")
    objmap = {}
    for l in new:
        objmap[id(l)] = l.pop("_obj")
    made = []
    for i in range(0, len(new), 200):
        made += rest("POST", "fin_plan_lines", new[i:i+200], prefer="return=representation")
    allocs = [{"plan_line_id": m["id"], "cost_object_id": objs[objmap[id(l)]]["id"], "share": 100}
              for m, l in zip(made, new)]
    for i in range(0, len(allocs), 200):
        rest("POST", "fin_line_objects", allocs[i:i+200])

    # the 9% fee follows net sales
    fee_lines = [l for l in rest("GET", f"fin_plan_lines?select=id,label,amount_net,month&plan_id=eq.{plan['id']}")
                 if "fulfilment" in l["label"].lower() or "fulfillment" in l["label"].lower()]
    all_rev = sum(float(l["amount_net"]) for l in rest("GET", f"fin_plan_lines?select=amount_net,category_id&plan_id=eq.{plan['id']}")
                  if any(c["id"] == l["category_id"] and c["pnl_group"] == "revenue" for c in cats.values()))
    want = round(all_rev * FEE, 2)
    have = sum(float(l["amount_net"]) for l in fee_lines)
    if fee_lines and abs(want - have) > 1:
        k = want / have
        for l in fee_lines:
            rest("PATCH", f"fin_plan_lines?id=eq.{l['id']}", {"amount_net": round(float(l["amount_net"]) * k, 2)})
        print(f"    fee rescaled {have:,.0f} -> {want:,.0f} (9% of {all_rev:,.0f})")
    print(f"    written: {len(made)} lines, {len(allocs)} allocations")

if not APPLY: print("\nDry run. Re-run with --apply to write.")
