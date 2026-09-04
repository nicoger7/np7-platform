#!/usr/bin/env python3
"""
Give NP7 Experience a budget, built from the trips it is already running.

Experience had no plan at all, so its budget page was empty while 8 editions,
26 recorded costs and a full package catalogue sat one table away. This seeds
the plan ONCE from that catalogue. After it exists it is authored like any
other plan: this is a starting point, not a sync, and re-running it replaces
only the lines it made.

Revenue is the average package price times the spots on offer. That reads
optimistic and is not: across 2026 the editions ran at 144% of max_spots, so
full occupancy is the conservative end of what actually happens. Editions with
no priced package forecast nothing, and the script says which they are rather
than inventing a number for them.

Money arrives before the trip does. Half is booked three months ahead and half
in the month of the trip, which is roughly how the deposit-and-balance plan
behaves; both halves are clamped into the year being planned.

Costs are the real exp_costs rows for the year, in their own months.

Run: python3 scripts/build-experience-plan.py [--year 2027] [--apply]
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse, collections, datetime

BASE = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
APPLY = "--apply" in sys.argv
YEAR = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else 2027
TAG = "seeded from the edition catalogue"


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


def month_of(iso, offset=0):
    """First of the month, `offset` months away, or None if it leaves the year."""
    y, m = int(iso[:4]), int(iso[5:7])
    m += offset
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-01" if y == YEAR else None


def main():
    entity = [e for e in req("GET", "/fin_entities?select=id,key,name,division") if e["division"] == "experience"][0]
    cats = {c["name"]: c for c in req("GET", "/fin_categories?select=id,key,name,kind,pnl_group,division")}
    rev_cat = cats["Experience revenue"]["id"]
    cogs_cat = cats["Reisevorleistungen (hotels, centers, transfers)"]["id"]

    eds = req("GET", "/exp_editions?select=id,label,year,date_start,status,archived_at,max_spots,exp_experiences(title)&limit=300")
    live = [e for e in eds if not e.get("archived_at") and e.get("year") == YEAR and e.get("date_start")]
    pkgs = collections.defaultdict(list)
    for p in req("GET", "/exp_packages?select=id,edition_id,price,archived_at&limit=1000"):
        if not p.get("archived_at") and p.get("price"):
            pkgs[p["edition_id"]].append(float(p["price"]))

    lines, unpriced = [], []
    for e in sorted(live, key=lambda x: x["date_start"]):
        title = (e.get("exp_experiences") or {}).get("title") or e.get("label") or "Trip"
        prices = pkgs.get(e["id"], [])
        spots = int(e.get("max_spots") or 0)
        if not prices or not spots:
            unpriced.append((e["date_start"], title, spots, len(prices)))
            continue
        revenue = round(sum(prices) / len(prices) * spots, 2)
        # half three months ahead, half in the month of the trip
        for offset, part in ((-3, 0.5), (0, 0.5)):
            m = month_of(e["date_start"], offset)
            if not m:
                continue
            lines.append({
                "category_id": rev_cat, "label": f"{title} · {e['date_start'][:10]}",
                "month": m, "amount_net": round(revenue * part, 2), "quantity": spots * part,
                "edition_id": e["id"], "confidence": "expected",
                "note": f"{TAG}: {len(prices)} packages averaging "
                        f"{sum(prices)/len(prices):,.0f} EUR across {spots} spots",
            })

    costs = req("GET", "/exp_costs?select=id,item,estimated_amount,actual_amount,date,edition_id&limit=3000")
    start = {e["id"]: e.get("date_start") for e in eds}
    for c in costs:
        when = c.get("date") or start.get(c.get("edition_id"))
        if not when or not str(when).startswith(str(YEAR)):
            continue
        amount = float(c.get("actual_amount") or 0) or float(c.get("estimated_amount") or 0)
        if amount == 0:
            continue
        lines.append({
            "category_id": cogs_cat, "label": c.get("item") or "Trip cost",
            "month": f"{str(when)[:7]}-01", "amount_net": round(amount, 2), "quantity": 0,
            "edition_id": c.get("edition_id"), "confidence": "expected",
            "note": f"{TAG}: exp_costs {c['id'][:8]}",
        })

    rev = sum(l["amount_net"] for l in lines if l["category_id"] == rev_cat)
    cog = sum(l["amount_net"] for l in lines if l["category_id"] == cogs_cat)
    print(f"NP7 Experience {YEAR}\n")
    print(f"  {len(live)} live editions, {len(live) - len(unpriced)} of them priced")
    print(f"  revenue  {rev:>10,.0f}  across {sum(1 for l in lines if l['category_id']==rev_cat)} lines")
    print(f"  costs    {cog:>10,.0f}  across {sum(1 for l in lines if l['category_id']==cogs_cat)} lines")
    print(f"  result   {rev-cog:>10,.0f}")
    if unpriced:
        print(f"\n  {len(unpriced)} editions forecast nothing, because they have no priced package:")
        for d, t, s, n in unpriced:
            print(f"    {d}  {t[:34]:36} {s} spots, {n} packages")
    bym = collections.defaultdict(float)
    for l in lines:
        bym[l["month"][:7]] += l["amount_net"] if l["category_id"] == rev_cat else -l["amount_net"]
    print("\n  net by month:")
    for m in sorted(bym):
        print(f"    {m}  {bym[m]:>10,.0f}")

    if not APPLY:
        print("\nDry run. Re-run with --apply to write.")
        return

    existing = req("GET", f"/fin_plans?select=id,name&entity_id=eq.{entity['id']}&year=eq.{YEAR}")
    if existing:
        plan = existing[0]
        old = req("GET", "/fin_plan_lines?select=id,note&plan_id=eq." + plan["id"]
                  + "&note=ilike." + urllib.parse.quote(f"%{TAG}%"))
        for o in old:
            req("DELETE", f"/fin_plan_lines?id=eq.{o['id']}")
        print(f"\nreusing plan {plan['name']}, removed {len(old)} previously seeded lines")
    else:
        plan = req("POST", "/fin_plans", {
            "entity_id": entity["id"], "name": f"Plan {YEAR}", "year": YEAR, "status": "active",
            "note": "Started from the edition catalogue. Edit freely: it is a forecast, not a mirror.",
        })[0]
        print(f"\ncreated plan {plan['name']}")

    for l in lines:
        l["plan_id"] = plan["id"]
        l.setdefault("vendor_id", None)
    for i in range(0, len(lines), 200):
        req("POST", "/fin_plan_lines", lines[i:i + 200])
    print(f"inserted {len(lines)} lines")


main()
