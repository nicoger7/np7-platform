#!/usr/bin/env python3
"""
The mailbox and the domains, which were in nobody's budget.

NP7 needs a general address for sign-ups. performance@np-seven.com, a real
Google mailbox, because the old hardware@ was configured in code as the sender
for the shop with no inbox behind it: anybody replying to an order confirmation
would have been answered by a bounce.

Two costs follow and neither was planned for.

A mailbox is a Google Workspace seat. A GROUP or an ALIAS on the same domain
costs nothing and would receive mail perfectly well; a seat is only needed for
its own Gmail, Drive and Calendar, and for sending natively from Google. Nico
asked for a mailbox, so a seat is what is budgeted, and the note says the free
route exists in case that changes.

Domains were never in the plan either, though NP7 has been paying for them all
along.

Both figures are assumptions, marked [ASSUM], and both are small enough that
being 30% out changes nothing. They are here so the plan stops pretending the
company runs on no overhead at all.

Run: python3 scripts/add-inbox-domain-costs.py [--apply]
"""
import json, os, sys, urllib.request, urllib.error

APPLY = "--apply" in sys.argv
URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403"
SOFTWARE = "719cd2c5-fea6-4966-a57c-30a415e91504"
COMPANY = "730ffb4d-54c8-4313-bae0-4e1fecc164fa"

# [ASSUM] Google Workspace Business Starter, one seat. Around 7 EUR a month in
# Germany; the exact figure moves with the plan and the VAT treatment.
SEAT_PER_MONTH = 7.0
# [ASSUM] np-seven.com plus the handful NP7 already holds. A .com is about 13 a
# year and a .de about 10, so five domains is roughly 60.
DOMAINS_PER_YEAR = 60.0


def rest(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}\n{e.read().decode()[:400]}")


plans = [p for p in rest("GET", f"fin_plans?select=id,name,year,status&entity_id=eq.{HW}")
         if p["status"] == "active"]
rows, total = [], 0.0
for plan in sorted(plans, key=lambda p: p["year"]):
    year = plan["year"]
    months = sorted({str(l["month"])[:7] for l in
                     rest("GET", f"fin_plan_lines?select=month&plan_id=eq.{plan['id']}&limit=1000")})
    if not months: continue
    have = {l["label"] for l in rest("GET", f"fin_plan_lines?select=label&plan_id=eq.{plan['id']}&limit=1000")}

    if "Google Workspace, performance inbox" not in have:
        for m in months:
            rows.append({"plan_id": plan["id"], "category_id": SOFTWARE,
                         "label": "Google Workspace, performance inbox",
                         "month": f"{m}-01", "amount_net": SEAT_PER_MONTH, "quantity": 0,
                         "confidence": "expected",
                         "note": f"[ASSUM] one Google Workspace seat for performance@np-seven.com at "
                                 f"{SEAT_PER_MONTH:.0f} a month. A group or an alias on the same domain "
                                 f"would receive mail for nothing; a seat buys its own Gmail, Drive and "
                                 f"calendar, and the ability to send natively from Google."})
        total += SEAT_PER_MONTH * len(months)

    if "Domains" not in have:
        # A domain is billed once a year, so it sits in one month rather than
        # being smeared across twelve.
        billing = months[0] if year == 2026 else f"{year}-01"
        share = DOMAINS_PER_YEAR * (len(months) / 12)
        rows.append({"plan_id": plan["id"], "category_id": SOFTWARE, "label": "Domains",
                     "month": f"{billing}-01", "amount_net": round(share, 2), "quantity": 0,
                     "confidence": "expected",
                     "note": f"[ASSUM] np-seven.com and the others NP7 holds, about "
                             f"{DOMAINS_PER_YEAR:.0f} a year. Renewed annually, so it sits in one month."})
        total += round(share, 2)

    print(f"  {plan['name']:12} {len(months):>2} months")

print(f"\n  {len(rows)} lines, {total:,.2f} in total across every year")
for label in ("Google Workspace, performance inbox", "Domains"):
    per = {}
    for r in rows:
        if r["label"] != label: continue
        y = r["month"][:4]; per[y] = per.get(y, 0) + r["amount_net"]
    print(f"    {label:38} " + "  ".join(f"{y} {v:,.0f}" for y, v in sorted(per.items())))

if not APPLY:
    print("\nDry run. Re-run with --apply to write.")
else:
    made = rest("POST", "fin_plan_lines", rows, prefer="return=representation")
    rest("POST", "fin_line_objects",
         [{"plan_line_id": m["id"], "cost_object_id": COMPANY, "share": 100} for m in made])
    print(f"\n  written: {len(made)} lines, allocated to Company")
