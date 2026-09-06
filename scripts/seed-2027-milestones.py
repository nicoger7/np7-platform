#!/usr/bin/env python3
"""
Fill the May-to-November hole in the 2027 roadmap.

Two kinds of milestone go in.

The sales checkpoints are not chosen by feel. The 2027 plan already says how
revenue is spread across the year, and units are assumed to follow revenue, so
"200 boards sold" lands on the day the plan's own cumulative curve crosses 200.
Change the plan and re-run this and the checkpoints move with it.

The development milestones are a proposal, not a derivation. Nothing in the
database knows when the 2028 prototypes get ordered, so these are placed where
they have to be to make a 2028 season, and they are on the roadmap precisely so
they can be dragged to where they really belong.

Idempotent: it removes what it wrote last time before writing again.
Run: python3 scripts/seed-2027-milestones.py [--apply]
"""
import json, os, sys, urllib.request, urllib.parse, urllib.error, datetime, collections

BASE = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
APPLY = "--apply" in sys.argv
TAG = "seeded:2027-milestones"          # how a row made here is recognised later

ENTITY = "14f6046f-b6f9-4210-89ee-3dd82ca38403"          # NP7 Performance
OBJ = {
    "Boards":        "dd65f701-334a-45b1-b295-b6ad2550ff22",
    "Slalom":        "ddd6bb61-4969-4bea-9b1e-5dc1b05c68dc",
    "Freerace":      "c2306b56-4068-464f-b350-2b474cb15aa5",
    "Freeride":      "5ec97ecf-9280-4a7f-b6d7-43b2837a95f2",
    "Slalom fins":   "3459d179-8d2b-4f71-a0df-bb36640a3ac7",
    "Rockstar fin":  "992de87b-e7e5-4c80-a227-9d0ca2a3aa65",
    "Freerace fins": "ee8b71e9-60c4-4384-861b-43af0423c4a4",
    "B-Line fin":    "f7cea015-846c-439d-98bf-3244c1676eed",
}


def req(method, path, body=None):
    r = urllib.request.Request(BASE + path, method=method,
                               headers={**HEAD, "Prefer": "return=representation"},
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        # PostgREST says exactly what it disliked, and it is always worth reading.
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:600]}")


def revenue_curve():
    """Share of 2027 revenue falling in each month, from the plan itself."""
    plans = [p for p in req("GET", "/fin_plans?select=id,year,status")
             if p["year"] == 2027 and p["status"] == "active"]
    ids = ",".join(p["id"] for p in plans)
    cats = {c["id"]: c for c in req("GET", "/fin_categories?select=id,pnl_group")}
    lines = req("GET", f"/fin_plan_lines?select=month,amount_net,category_id&plan_id=in.({ids})&limit=3000")
    by = collections.defaultdict(float)
    for l in lines:
        if (cats.get(l["category_id"]) or {}).get("pnl_group") != "revenue":
            continue
        by[str(l["month"])[:7]] += float(l["amount_net"] or 0)
    total = sum(by.values())
    if total <= 0:
        raise SystemExit("The 2027 plan has no revenue, so there is no curve to follow.")
    return [by.get(f"2027-{m:02d}", 0.0) / total for m in range(1, 13)]


def crossing_date(curve, target, of_total):
    """The day the cumulative curve first reaches `target` out of `of_total`."""
    want = target / of_total
    run = 0.0
    for i, share in enumerate(curve):
        if run + share >= want and share > 0:
            frac = (want - run) / share                     # how far into the month
            days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]
            day = max(1, min(days, round(frac * days) or 1))
            return datetime.date(2027, i + 1, day).isoformat()
        run += share
    return "2027-12-15"


def main():
    curve = revenue_curve()

    rows = []
    # ── sales checkpoints, placed by the plan's own curve ────────────────────
    for obj, total, label, marks in [
        ("Boards", 430, "boards sold", (100, 200, 300, 430)),
        ("Rockstar fin", 400, "Rockstar fins sold", (200, 300)),
        ("B-Line fin", 400, "B-Line fins sold", (100, 200, 300)),
    ]:
        for n in marks:
            rows.append({
                "title": f"{n} {label}", "kind": "revenue",
                "starts_on": crossing_date(curve, n, total),
                "cost_object_id": OBJ[obj],
                "target_quantity": n, "target_metric": "units_sold",
                "note": f"{TAG} · where the 2027 plan's revenue curve reaches {n} of {total}",
            })

    # ── the second run the plan already pays for ────────────────────────────
    # June and July carry 121,170 and 80,780 of stock spend. Something has to be
    # happening to cause that, and until now nothing on the roadmap said what.
    rows += [
        {"title": "Second production run ex factory", "kind": "production", "starts_on": "2027-06-01",
         "cost_object_id": OBJ["Boards"],
         "note": f"{TAG} · the plan spends 121.170 EUR on stock this month"},
        {"title": "Second batch balance and freight", "kind": "shipping", "starts_on": "2027-07-01",
         "cost_object_id": OBJ["Boards"],
         "note": f"{TAG} · the plan spends 80.780 EUR on stock this month"},
    ]

    # ── making the 2028 range, which is what the second half of a year is for ─
    rows += [
        {"title": "Freerace carbon prototypes ordered", "kind": "tooling", "starts_on": "2027-05-15",
         "cost_object_id": OBJ["Freerace"], "note": f"{TAG} · carbon construction, first shapes"},
        {"title": "Slalom 2028 shapes frozen", "kind": "tooling", "starts_on": "2027-06-15",
         "cost_object_id": OBJ["Slalom"], "note": f"{TAG} · locks the moulds for the 2028 run"},
        {"title": "Freerace carbon prototypes on the water", "kind": "production", "starts_on": "2027-07-15",
         "cost_object_id": OBJ["Freerace"], "note": f"{TAG} · test window before the 2028 order"},
        {"title": "Freeride prototypes ordered", "kind": "tooling", "starts_on": "2027-08-15",
         "cost_object_id": OBJ["Freeride"], "note": f"{TAG} · the range with no product yet"},
        {"title": "Slalom fin samples from Proceed", "kind": "tooling", "starts_on": "2027-09-15",
         "cost_object_id": OBJ["Slalom fins"], "note": f"{TAG} · German factory, after the Rockstar scale-up"},
        {"title": "Freerace fin samples", "kind": "tooling", "starts_on": "2027-10-15",
         "cost_object_id": OBJ["Freerace fins"], "note": f"{TAG} · pairs with the carbon Freerace boards"},
        {"title": "2028 pre-production samples approved", "kind": "production", "starts_on": "2027-11-01",
         "cost_object_id": OBJ["Boards"], "note": f"{TAG} · gate before committing the 2028 order"},
        {"title": "2028 season order placed, deposit", "kind": "production", "starts_on": "2027-11-15",
         "cost_object_id": OBJ["Boards"], "note": f"{TAG} · a repeat run needs ordering this early to land for spring"},
    ]

    # A bulk insert needs every object to carry the same keys, so the rows that
    # are not sales targets say so explicitly rather than staying silent.
    for r in rows:
        r["entity_id"] = ENTITY
        r["status"] = "planned"
        # Its own baseline from birth, so a later drag shows as slippage.
        r["baseline_starts_on"] = r["starts_on"]
        r.setdefault("target_quantity", None)
        r.setdefault("target_metric", None)

    months = collections.Counter(r["starts_on"][:7] for r in rows)
    print(f"{len(rows)} milestones")
    for r in sorted(rows, key=lambda x: x["starts_on"]):
        print(f"  {r['starts_on']}  {r['kind']:11} {r['title']}")
    empty = [f"2027-{m:02d}" for m in range(1, 13) if f"2027-{m:02d}" not in months]
    print(f"\nmonths this fills: {', '.join(sorted(months))}")
    print(f"months it does not touch: {', '.join(empty) or 'none'}")

    if not APPLY:
        print("\nDry run. Re-run with --apply to write.")
        return

    existing = req("GET", "/roadmap_items?select=id,note&note=ilike." + urllib.parse.quote(f"%{TAG}%"))
    for e in existing:
        req("DELETE", f"/roadmap_items?id=eq.{e['id']}")
    print(f"\nremoved {len(existing)} from the previous run")
    req("POST", "/roadmap_items", rows)
    print(f"inserted {len(rows)}")


main()
