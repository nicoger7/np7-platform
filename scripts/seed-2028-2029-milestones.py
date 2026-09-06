#!/usr/bin/env python3
"""
The roadmap for 2028 and 2029.

Both years have a full budget and nothing on the timeline, so the plan says what
they cost and nothing says what happens in them.

Nothing here is invented. Three kinds of milestone, all read out of data that
already exists:

  new models   a model whose unit count goes from zero to something is a launch,
               and the business plan's Sales Units sheet knows exactly which
               ones and when. That is where 2028's Freeride range and 2029's
               range expansion come from.

  sales        placed where the plan's own revenue curve crosses a round
               number, the same way the 2027 checkpoints were. Change the plan
               and re-run and they move with it.

  money        Christian's tranche 3, and the stock runs the budget already pays
               for.

Idempotent: it removes what it wrote last time before writing again.
Run: python3 scripts/seed-2028-2029-milestones.py [--apply]
"""
import json, os, sys, zipfile, urllib.request, urllib.error, urllib.parse, datetime, collections
from xml.etree import ElementTree as ET

APPLY = "--apply" in sys.argv
BASE = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
XLSX = "/Users/nicolasprien/Documents/Claude/Projects/NP7 Hardware GmbH/NP7_Business_Plan_2026_2029-v2-6.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403"
TAG = "seeded:2028-2029-milestones"

OBJ = {"Boards": "dd65f701-334a-45b1-b295-b6ad2550ff22",
       "Slalom": "ddd6bb61-4969-4bea-9b1e-5dc1b05c68dc",
       "Freerace": "c2306b56-4068-464f-b350-2b474cb15aa5",
       "Freeride": "5ec97ecf-9280-4a7f-b6d7-43b2837a95f2",
       "Rockstar fin": "992de87b-e7e5-4c80-a227-9d0ca2a3aa65",
       "B-Line fin": "f7cea015-846c-439d-98bf-3244c1676eed",
       "Company": "730ffb4d-54c8-4313-bae0-4e1fecc164fa"}
RANGE_OF = {"Slalom": "Slalom", "Freerace": "Freerace", "Freeride": "Freeride"}


def req(method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method,
                               headers={**HEAD, "Prefer": "return=representation"},
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:400]}")


def sales_units():
    z = zipfile.ZipFile(XLSX)
    sh = [''.join(t.text or '' for t in si.iter(f"{NS}t"))
          for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si")]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = {s.get("name"): s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
           for s in wb.findall(f".//{NS}sheet")}["Sales Units"]
    tgt = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}[rid]
    ws = ET.fromstring(z.read("xl/" + tgt.lstrip("/")))
    c = {}
    for cell in ws.iter(f"{NS}c"):
        v = cell.find(f"{NS}v")
        if v is not None:
            c[cell.get("r")] = sh[int(v.text)] if cell.get("t") == "s" else v.text
    return c


SU = sales_units()
num = lambda r: float(SU.get(r) or 0)
SOLD = {2027: "H", 2028: "O", 2029: "V"}


def revenue_curve(year):
    """Share of the year's revenue per month, from the plan itself."""
    plans = [p for p in req("GET", f"/fin_plans?select=id,year,status&entity_id=eq.{HW}")
             if p["year"] == year and p["status"] == "active"]
    if not plans: return None
    cats = {c["id"]: c for c in req("GET", "/fin_categories?select=id,pnl_group")}
    lines = req("GET", f"/fin_plan_lines?select=month,amount_net,category_id&plan_id=eq.{plans[0]['id']}&limit=2000")
    by = collections.defaultdict(float)
    for l in lines:
        if (cats.get(l["category_id"]) or {}).get("pnl_group") == "revenue":
            by[str(l["month"])[:7]] += float(l["amount_net"] or 0)
    total = sum(by.values())
    if total <= 0: return None
    return [by.get(f"{year}-{m:02d}", 0.0) / total for m in range(1, 13)]


def crossing(curve, year, target, of_total):
    want, run = target / of_total, 0.0
    for i, share in enumerate(curve):
        if run + share >= want and share > 0:
            days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]
            day = max(1, min(days, round((want - run) / share * days) or 1))
            return datetime.date(year, i + 1, day).isoformat()
        run += share
    return f"{year}-12-15"


rows = []
for year in (2028, 2029):
    curve = revenue_curve(year)
    if not curve:
        print(f"{year}: no plan, skipped"); continue
    prev = SOLD[year - 1] if year - 1 in SOLD else None

    # ── models that start selling this year ─────────────────────────────────
    launches = collections.defaultdict(list)
    for r in range(3, 19):
        nm = SU.get(f"A{r}")
        if not nm: continue
        now, before = num(f"{SOLD[year]}{r}"), (num(f"{prev}{r}") if prev else 0)
        if now > 0 and before == 0:
            rng = next((k for k in RANGE_OF if nm.startswith(k)), None)
            if rng: launches[rng].append((nm, now))
    for rng, models in launches.items():
        names = ", ".join(m for m, _ in sorted(models))
        total = sum(u for _, u in models)
        rows.append({"title": f"{rng} launches: {names}" if len(models) < 4 else f"{rng} range expands, {len(models)} new sizes",
                     "kind": "production", "starts_on": f"{year}-02-15",
                     "cost_object_id": OBJ[rng], "target_quantity": int(total), "target_metric": "units_sold",
                     "note": f"{TAG} · the business plan has these selling from {year} and not before, "
                             f"{total:,.0f} units in the first year."})
        rows.append({"title": f"{rng} moulds and samples for the new sizes", "kind": "tooling",
                     "starts_on": f"{year-1}-09-15", "cost_object_id": OBJ[rng],
                     "target_quantity": None, "target_metric": None,
                     "note": f"{TAG} · has to land the autumn before, or the {year} season is missed."})

    # ── sales checkpoints, on the plan's own curve ──────────────────────────
    boards = sum(num(f"{SOLD[year]}{r}") for r in range(3, 19)
                 if SU.get(f"A{r}") and any(SU[f"A{r}"].startswith(k) for k in RANGE_OF))
    marks = [int(boards * f) for f in (0.25, 0.5, 0.75, 1.0)]
    for n in marks:
        rows.append({"title": f"{n:,} boards sold".replace(",", "."), "kind": "revenue",
                     "starts_on": crossing(curve, year, n, boards), "cost_object_id": OBJ["Boards"],
                     "target_quantity": n, "target_metric": "units_sold",
                     "note": f"{TAG} · where the {year} plan's revenue curve reaches {n:,.0f} of {boards:,.0f}."})
    fins = num(f"{SOLD[year]}22") + num(f"{SOLD[year]}23")
    for share, obj, row in ((0.5, "Rockstar fin", 22), (1.0, "Rockstar fin", 22),
                            (0.5, "B-Line fin", 23), (1.0, "B-Line fin", 23)):
        u = num(f"{SOLD[year]}{row}")
        if not u: continue
        n = int(u * share)
        rows.append({"title": f"{n:,} {'Rockstar' if row == 22 else 'B-Line'} fins sold".replace(",", "."),
                     "kind": "revenue", "starts_on": crossing(curve, year, n, u),
                     "cost_object_id": OBJ[obj], "target_quantity": n, "target_metric": "units_sold",
                     "note": f"{TAG} · {year} plan curve."})

    # ── the money ───────────────────────────────────────────────────────────
    if year == 2028:
        rows.append({"title": "Christian Skodde - tranche 3", "kind": "funding",
                     "starts_on": "2028-01-15", "cost_object_id": OBJ["Company"],
                     "target_quantity": None, "target_metric": None,
                     "note": f"{TAG} · 37.500 growth reserve, called only if the 2027 milestones are met. "
                             f"Christian alone; Tammo Andersch is tranche 1 only."})
    for label, month in (("Main production run ex factory", 2), ("Second run ex factory", 6)):
        rows.append({"title": f"{label}", "kind": "production", "starts_on": f"{year}-{month:02d}-01",
                     "cost_object_id": OBJ["Boards"], "target_quantity": None, "target_metric": None,
                     "note": f"{TAG} · the plan pays for stock in this month. Made in China; "
                             f"an own factory is not assumed."})

for r in rows:
    r["entity_id"] = HW
    r["status"] = "planned"
    r["baseline_starts_on"] = r["starts_on"]
    r["ends_on"] = None
    r["baseline_ends_on"] = None

by_year = collections.Counter(r["starts_on"][:4] for r in rows)
print(f"{len(rows)} milestones: {dict(sorted(by_year.items()))}\n")
for r in sorted(rows, key=lambda x: x["starts_on"]):
    q = f"  [{r['target_quantity']:,}]" if r.get("target_quantity") else ""
    print(f"  {r['starts_on']}  {r['kind']:11} {r['title'][:52]:54}{q}")

if not APPLY:
    print("\nDry run. Re-run with --apply to write.")
else:
    old = req("GET", "/roadmap_items?select=id&note=ilike." + urllib.parse.quote(f"%{TAG}%"))
    for o in old: req("DELETE", f"/roadmap_items?id=eq.{o['id']}")
    req("POST", "/roadmap_items", rows)
    print(f"\nremoved {len(old)}, inserted {len(rows)}")
