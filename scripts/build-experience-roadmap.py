#!/usr/bin/env python3
"""
Give NP7 Experience a roadmap, and lanes to put it in.

The Experience roadmap was empty, and it had no cost objects either, so even a
milestone would have had nowhere to sit. Three things, in order, all read from
the trips that already exist:

1. Cost objects. One per destination, with each edition beneath it. That is
   what the lanes are drawn from, and it is also what makes "what did Bonaire
   cost and earn" a question the budget can answer at all.

2. Allocations. Every seeded plan line already names its edition, so each one
   is attached to that edition's object at 100%. Nothing is guessed.

3. Milestones. The trip itself, the day the balance falls due, and the day free
   cancellation ends. The first is draggable and writes back to the edition, so
   moving a trip here moves the trip.

The payment dates are computed from the packages, not invented:
final_days_before and deposit_refund_days are already on every package, and the
longest of them across an edition is the one that binds.

Run: python3 scripts/build-experience-roadmap.py [--apply]
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse, datetime, collections

BASE = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEAD = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
APPLY = "--apply" in sys.argv
TAG = "read from the edition"


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


def minus_days(iso, n):
    return (datetime.date.fromisoformat(iso[:10]) - datetime.timedelta(days=int(n))).isoformat()


def main():
    entity = [e for e in req("GET", "/fin_entities?select=id,key,name,division") if e["division"] == "experience"][0]
    eid = entity["id"]

    eds = [e for e in req("GET", "/exp_editions?select=id,label,year,date_start,date_end,status,archived_at,"
                                 "experience_id,launch_price_until,public_from,max_spots,exp_experiences(title)&limit=300")
           if not e.get("archived_at") and e.get("date_start")]
    pkgs = collections.defaultdict(list)
    for p in req("GET", "/exp_packages?select=id,edition_id,final_days_before,deposit_refund_days,archived_at&limit=1000"):
        if not p.get("archived_at"):
            pkgs[p["edition_id"]].append(p)

    # ── 1. cost objects: destination, then the editions under it ────────────
    have = {o["name"]: o for o in req("GET", f"/fin_cost_objects?select=id,name,kind,parent_id&entity_id=eq.{eid}")}
    destinations, edition_objects = {}, {}
    for e in eds:
        dest = (e.get("exp_experiences") or {}).get("title") or "Other trips"
        destinations.setdefault(dest, []).append(e)

    new_objects, sort = [], 10
    for dest, group in sorted(destinations.items()):
        if dest not in have:
            new_objects.append({"entity_id": eid, "kind": "range", "name": dest, "parent_id": None, "sort": sort})
        sort += 1
        for e in sorted(group, key=lambda x: x["date_start"]):
            label = f"{dest} {e['date_start'][:7]}"
            if label not in have:
                new_objects.append({"entity_id": eid, "kind": "edition", "name": label,
                                    "parent_id": None, "sort": sort, "_parent_name": dest})
            edition_objects[e["id"]] = label
            sort += 1

    print(f"NP7 Experience\n\n  {len(eds)} live editions across {len(destinations)} destinations")
    print(f"  cost objects to create: {len(new_objects)} ({len(have)} already exist)")
    for o in new_objects[:6]:
        print(f"    {o['kind']:8} {o['name']}")
    if len(new_objects) > 6:
        print(f"    … and {len(new_objects)-6} more")

    # ── 3. milestones ───────────────────────────────────────────────────────
    items = []
    for e in eds:
        dest = (e.get("exp_experiences") or {}).get("title") or "Trip"
        ps = pkgs.get(e["id"], [])
        # The longest notice period across the packages is the one that binds.
        final_days = max([int(p["final_days_before"]) for p in ps if p.get("final_days_before")] or [0])
        refund_days = max([int(p["deposit_refund_days"]) for p in ps if p.get("deposit_refund_days")] or [0])

        items.append({
            "title": f"{dest} · {e['date_start'][:10]}", "kind": "trip",
            "starts_on": e["date_start"], "ends_on": e.get("date_end"),
            "edition_id": e["id"], "source_table": "exp_editions", "source_field": "date_start",
            # 'committed' is the roadmap's word for a date that is no longer
            # provisional, and a published trip is exactly that: it is on sale.
            "status": "committed" if e["status"] == "published" else "planned",
            "note": f"{TAG}. Dragging it moves the trip.",
        })
        if final_days:
            items.append({
                "title": f"{dest} · balance due", "kind": "revenue",
                "starts_on": minus_days(e["date_start"], final_days), "ends_on": None,
                "edition_id": e["id"], "source_table": None, "source_field": None, "status": "planned",
                "note": f"{TAG}: {final_days} days before departure, the longest notice any package asks for",
            })
        if refund_days:
            items.append({
                "title": f"{dest} · free cancellation ends", "kind": "legal",
                "starts_on": minus_days(e["date_start"], refund_days), "ends_on": None,
                "edition_id": e["id"], "source_table": None, "source_field": None, "status": "planned",
                "note": f"{TAG}: after this a cancellation costs us the deposit",
            })
        if e.get("launch_price_until"):
            items.append({
                "title": f"{dest} · launch price ends", "kind": "launch",
                "starts_on": e["launch_price_until"], "ends_on": None,
                "edition_id": e["id"], "source_table": None, "source_field": None, "status": "planned",
                "note": f"{TAG}: launch_price_until",
            })
        if e.get("public_from"):
            items.append({
                "title": f"{dest} · goes on sale", "kind": "launch",
                "starts_on": e["public_from"], "ends_on": None,
                "edition_id": e["id"], "source_table": None, "source_field": None, "status": "planned",
                "note": f"{TAG}: public_from",
            })

    bykind = collections.Counter(i["kind"] for i in items)
    byyear = collections.Counter(i["starts_on"][:4] for i in items)
    print(f"\n  {len(items)} milestones: {dict(bykind)}")
    print(f"  by year: {dict(sorted(byyear.items()))}")
    for i in sorted(items, key=lambda x: x["starts_on"])[:10]:
        print(f"    {i['starts_on']}  {i['kind']:8} {i['title']}")
    if len(items) > 10:
        print(f"    … and {len(items)-10} more")

    if not APPLY:
        print("\nDry run. Re-run with --apply to write.")
        return

    # objects, parents second so the parent id exists
    made = {}
    for o in [x for x in new_objects if "_parent_name" not in x]:
        made[o["name"]] = req("POST", "/fin_cost_objects", o)[0]
    lookup = {**{k: v for k, v in have.items()}, **made}
    for o in [x for x in new_objects if "_parent_name" in x]:
        parent = lookup.get(o.pop("_parent_name"))
        o["parent_id"] = parent["id"] if parent else None
        made[o["name"]] = req("POST", "/fin_cost_objects", o)[0]
    lookup = {**have, **made}
    print(f"\ncreated {len(made)} cost objects")

    # ── 2. allocations: every line that names an edition ────────────────────
    plans = req("GET", f"/fin_plans?select=id&entity_id=eq.{eid}")
    plan_ids = ",".join(p["id"] for p in plans)
    lines = req("GET", f"/fin_plan_lines?select=id,edition_id&plan_id=in.({plan_ids})&limit=3000")
    existing_links = {l["plan_line_id"] for l in
                      req("GET", "/fin_line_objects?select=plan_line_id&limit=5000")}
    allocs = []
    for l in lines:
        if l["id"] in existing_links or not l.get("edition_id"):
            continue
        name = edition_objects.get(l["edition_id"])
        obj = lookup.get(name) if name else None
        if obj:
            allocs.append({"plan_line_id": l["id"], "cost_object_id": obj["id"], "share": 100})
    for i in range(0, len(allocs), 200):
        req("POST", "/fin_line_objects", allocs[i:i + 200])
    print(f"allocated {len(allocs)} budget lines to the trip they belong to")

    # milestones, replacing whatever this script wrote last time
    old = req("GET", f"/roadmap_items?select=id&entity_id=eq.{eid}&note=ilike."
              + urllib.parse.quote(f"%{TAG}%"))
    for o in old:
        req("DELETE", f"/roadmap_items?id=eq.{o['id']}")
    for i in items:
        i["entity_id"] = eid
        i["baseline_starts_on"] = i["starts_on"]
        i["baseline_ends_on"] = i.get("ends_on")
        name = edition_objects.get(i["edition_id"])
        obj = lookup.get(name) if name else None
        i["cost_object_id"] = obj["id"] if obj else None
    for i in range(0, len(items), 100):
        req("POST", "/roadmap_items", items[i:i + 100])
    print(f"removed {len(old)} old milestones, inserted {len(items)}")


main()
