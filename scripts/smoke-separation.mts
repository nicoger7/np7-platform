/**
 * Are NP7 Performance and NP7 Experience actually separated?
 *
 * Not a unit test of one function: a walk through every layer where the two
 * could leak into each other, using the real role and the real data.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-separation.mts
 */
import { createClient } from "@supabase/supabase-js";
import { SECTIONS, effectiveCanAccess, effectiveCanWrite, effectiveCanEnterWorld,
         normalizeAccess, type EffectiveAccess } from "@/lib/access";
import { entitiesForWorld } from "@/lib/finance/board";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
let pass = 0, fail = 0;
const check = (n: string, c: boolean, g?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; } else { console.log(`  ✗ ${n}  got: ${JSON.stringify(g)}`); fail++; }
};

const { data: role } = await db.from("team_roles").select("name,access").eq("name", "NP7 Performance Team").single();
const perf: EffectiveAccess = { kind: "role", access: normalizeAccess(role.access) };

console.log("\n── the Performance role cannot enter Experience ─");
check("may enter hardware", effectiveCanEnterWorld(perf, "hardware"));
check("may NOT enter experience", !effectiveCanEnterWorld(perf, "experience"));
check("may NOT enter analytics", !effectiveCanEnterWorld(perf, "analytics"));

console.log("\n── nor reach an Experience page ────────────────");
const expPages = ["/admin/bookings", "/admin/contacts", "/admin/payments", "/admin/documents",
                  "/admin/exp-costs", "/admin/experiences", "/admin/members", "/admin/vendors"];
for (const p of expPages) check(`blocked: ${p}`, !effectiveCanAccess(perf, p));
check("blocked from the team page", !effectiveCanAccess(perf, "/admin/team"));
check("blocked from roles", !effectiveCanAccess(perf, "/admin/roles"));
check("blocked from writing to a booking", !effectiveCanWrite(perf, "/api/admin/bookings"));

console.log("\n── but reaches everything of its own ───────────");
for (const s of SECTIONS.filter((s) => s.world === "hardware"))
  check(`reaches ${s.label}`, effectiveCanAccess(perf, s.paths[0]));
check("reaches its own budget", effectiveCanAccess(perf, "/admin/finance"));
check("may edit its own budget", effectiveCanWrite(perf, "/api/admin/finance/lines"));

console.log("\n── and the budget it reaches is its own ────────");
const { data: entities } = await db.from("fin_entities").select("id,key,name,division").order("sort") as { data: any[] };
const inHw: any[] = entitiesForWorld(entities, "hardware");
const inExp: any[] = entitiesForWorld(entities, "experience");
check("hardware world offers exactly one company", inHw.length === 1 && inHw[0].key === "np7-hardware", inHw.map((e:any)=>e.key));
check("and it is NP7 Performance", inHw[0].name === "NP7 Performance", inHw[0].name);
check("experience world offers exactly NP7 Experience", inExp.length === 1 && inExp[0].key === "np7-experience", inExp.map((e:any)=>e.key));
check("no company appears in both", !inHw.some((h:any) => inExp.some((e:any) => e.id === h.id)));

console.log("\n── the data underneath does not mix ────────────");
const hwId = inHw[0].id, expId = inExp[0].id;
for (const [table, col] of [["fin_plans","entity_id"], ["fin_cost_objects","entity_id"], ["fin_actuals","entity_id"]] as const) {
  const { data: rows } = await db.from(table).select(`id,${col}`);
  const crossed = rows.filter((r: any) => r[col] && r[col] !== hwId && r[col] !== expId);
  check(`${table} rows all belong to one of the two`, crossed.length === 0, crossed.length);
}
const { data: hwPlans } = await db.from("fin_plans").select("id").eq("entity_id", hwId);
const { data: expPlans } = await db.from("fin_plans").select("id").eq("entity_id", expId);
check("Performance has plans of its own", hwPlans.length > 0, hwPlans.length);
check("Experience has plans of its own", expPlans.length > 0, expPlans.length);
// The separation that matters is not that one side is empty, it is that no
// single plan is reachable from both. Experience having a budget of its own is
// the point; sharing one would be the failure.
check("no plan belongs to both companies",
      !hwPlans.some((h: any) => expPlans.some((e: any) => e.id === h.id)));
const { data: allPlanLines } = await db.from("fin_plan_lines").select("id,plan_id");
const hwPlanIds = new Set(hwPlans.map((p: any) => p.id));
const expPlanIds = new Set(expPlans.map((p: any) => p.id));
const orphanLines = allPlanLines.filter((l: any) => !hwPlanIds.has(l.plan_id) && !expPlanIds.has(l.plan_id));
check("every budget line hangs off one company's plan", orphanLines.length === 0, orphanLines.length);
// An Experience line pointing at a Performance product, or the reverse, would
// put one company's costs on the other's board however well the ids separate.
const { data: xLinks } = await db.from("fin_line_objects").select("plan_line_id,cost_object_id");
const { data: xObjs } = await db.from("fin_cost_objects").select("id,entity_id");
const objEntity = new Map(xObjs.map((o: any) => [o.id, o.entity_id]));
const linePlan = new Map(allPlanLines.map((l: any) => [l.id, l.plan_id]));
const crossedAlloc = xLinks.filter((a: any) => {
  const planId = linePlan.get(a.plan_line_id);
  const side = hwPlanIds.has(planId) ? hwId : expPlanIds.has(planId) ? expId : null;
  return side != null && objEntity.get(a.cost_object_id) !== side;
});
check("no line is allocated to the other company's cost object", crossedAlloc.length === 0, crossedAlloc.length);

const { data: cats } = await db.from("fin_categories").select("key,division");
const hwOnly = cats.filter((c: any) => c.division === "hardware").map((c: any) => c.key);
const expOnly = cats.filter((c: any) => c.division === "experience").map((c: any) => c.key);
check("no category claims both divisions", !hwOnly.some((k: string) => expOnly.includes(k)));
check("Reisevorleistungen is Experience only", expOnly.includes("cost-travel-input"), expOnly);
check("goods and freight are Performance only",
  hwOnly.includes("cost-goods") && hwOnly.includes("cost-freight"), hwOnly);

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
