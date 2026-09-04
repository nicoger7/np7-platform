#!/usr/bin/env python3
"""
Split the board budget across the models it is actually made of.

The 2027 plan carries one line: 350 boards, 705.250 EUR, allocated to "Boards".
Filter the budget to Slalom and it answers zero, which is true of the data and
useless as an answer.

The business plan already knows the mix, so nothing here is invented. It reads
the 2027 sold and produced units per model from the Sales Units sheet, and the
cost and the two selling prices per model from the Margins sheet.

The two shares come out different, and that difference is the point:

  revenue share   direct units x direct price + retail units x retailer price
  cost share      produced units x landed cost

Slalom is under a third of the units and well over a third of the money,
because a Slalom board sells for 2.325 EUR and a Freerace for 1.504. Splitting
either one by unit count would quietly move money between the two ranges.

The plan's own totals are never touched. Only the shares come from the sheet,
so the 350 boards and the 705.250 EUR stay exactly as they are.

Run: python3 scripts/allocate-board-models.py [--apply]
"""
import json, os, sys, zipfile, urllib.request, urllib.error, collections
from xml.etree import ElementTree as ET

BASE = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
APPLY = "--apply" in sys.argv
PLAN = "/Users/nicolasprien/Documents/Claude/Projects/NP7 Hardware GmbH/NP7_Business_Plan_2026_2029-v2-6.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def req(method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method,
                               headers={**HEAD, "Prefer": "return=representation"},
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:600]}")


def sheet(name):
    """One worksheet as {cell ref: value}."""
    z = zipfile.ZipFile(PLAN)
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
        if v is None:
            continue
        out[c.get("r")] = shared[int(v.text)] if c.get("t") == "s" else v.text
    return out


def rows_by_name(cells, first, last):
    """Row number for each product name in column A."""
    return {cells[f"A{r}"]: r for r in range(first, last + 1) if f"A{r}" in cells}


def main():
    units = sheet("Sales Units")
    marg = sheet("Margins")
    u_row = rows_by_name(units, 3, 18)
    m_row = rows_by_name(marg, 3, 18)

    def f(cells, ref):
        try: return float(cells.get(ref) or 0)
        except ValueError: return 0.0

    models = []
    for name, ur in u_row.items():
        if name not in m_row:
            continue
        mr = m_row[name]
        sold_direct, sold_retail = f(units, f"F{ur}"), f(units, f"G{ur}")
        produced = f(units, f"E{ur}")
        cost = f(marg, f"D{mr}")                 # production + import, landed
        price_retail = f(marg, f"E{mr}")         # what the retailer pays NP7
        price_direct = f(marg, f"I{mr}")         # what a customer pays NP7
        revenue = sold_direct * price_direct + sold_retail * price_retail
        cogs = produced * cost
        if revenue == 0 and cogs == 0:
            continue                             # not sold in 2027
        models.append({"name": name, "sold": sold_direct + sold_retail, "produced": produced,
                       "revenue": revenue, "cogs": cogs})

    rev_total = sum(m["revenue"] for m in models)
    cogs_total = sum(m["cogs"] for m in models)
    unit_total = sum(m["sold"] for m in models)
    print(f"{len(models)} models sell in 2027, {unit_total:,.0f} boards in the business plan\n")
    print(f"  {'model':16} {'units':>6} {'unit %':>8} {'revenue %':>10} {'cost %':>8}")
    for m in sorted(models, key=lambda x: -x["revenue"]):
        print(f"  {m['name']:16} {m['sold']:>6,.0f} {m['sold']/unit_total*100:>7.1f}% "
              f"{m['revenue']/rev_total*100:>9.2f}% {m['cogs']/cogs_total*100:>7.2f}%")
    byrange = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    for m in models:
        rng = m["name"].split()[0]
        byrange[rng][0] += m["sold"]; byrange[rng][1] += m["revenue"]; byrange[rng][2] += m["cogs"]
    print(f"\n  {'range':16} {'units':>6} {'unit %':>8} {'revenue %':>10} {'cost %':>8}")
    for rng, (u, r, c) in sorted(byrange.items(), key=lambda x: -x[1][1]):
        print(f"  {rng:16} {u:>6,.0f} {u/unit_total*100:>7.1f}% {r/rev_total*100:>9.2f}% {c/cogs_total*100:>7.2f}%")

    # ── map model names onto the cost objects ────────────────────────────────
    objs = req("GET", "/fin_cost_objects?select=id,name,kind,parent_id&limit=200")
    by_name = {o["name"]: o for o in objs}
    missing = [m["name"] for m in models if m["name"] not in by_name]
    if missing:
        raise SystemExit(f"No cost object for: {missing}. Create them before allocating.")

    # ── which plan lines currently sit on "Boards" ───────────────────────────
    boards = by_name["Boards"]["id"]
    cats = {c["id"]: c for c in req("GET", "/fin_categories?select=id,name,pnl_group")}
    plans = [p for p in req("GET", "/fin_plans?select=id,name,year,status") if p["status"] == "active"]
    plan_ids = {p["id"] for p in plans}
    links = req("GET", f"/fin_line_objects?select=id,plan_line_id,cost_object_id,share&cost_object_id=eq.{boards}&limit=2000")
    line_ids = [l["plan_line_id"] for l in links]
    lines = {l["id"]: l for l in req("GET", "/fin_plan_lines?select=id,label,month,amount_net,category_id,plan_id&limit=3000")
             if l["id"] in set(line_ids) and l["plan_id"] in plan_ids}
    print(f"\n{len(lines)} plan lines are allocated wholesale to Boards")

    def driver_for(line):
        g = (cats.get(line["category_id"]) or {}).get("pnl_group")
        # Revenue follows price. Stock follows what it costs to make. Development
        # is neither, so it follows the revenue it is spent to earn.
        return "cogs" if g in ("cogs", "inventory") else "revenue"

    new_links, per_line = [], []
    for lid, line in lines.items():
        drv = driver_for(line)
        total = rev_total if drv == "revenue" else cogs_total
        for m in models:
            share = round(m[drv] / total * 100, 4)
            if share <= 0:
                continue
            new_links.append({"plan_line_id": lid, "cost_object_id": by_name[m["name"]]["id"], "share": share})
        per_line.append((line["label"], drv))
    kinds = collections.Counter(f"{lab} · {d}" for lab, d in per_line)
    print("  split by:")
    for k, n in sorted(kinds.items()):
        print(f"    {n:3d} x {k}")
    print(f"\n  {len(links)} wholesale links become {len(new_links)} per-model links")

    if not APPLY:
        print("\nDry run. Re-run with --apply to write.")
        return
    for l in links:
        req("DELETE", f"/fin_line_objects?id=eq.{l['id']}")
    for i in range(0, len(new_links), 200):
        req("POST", "/fin_line_objects", new_links[i:i + 200])
    print(f"\nreplaced {len(links)} with {len(new_links)}")


main()
