/**
 * Budget smoke test. Creates its own plan, exercises the same writes the routes
 * make, checks buildBoard's arithmetic, then deletes everything it created.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json <this file>
 */
import { createClient } from "@supabase/supabase-js";
import { buildBoard, entitiesForWorld, rowKey, monthDate, r2 } from "@/lib/finance/board";
import { buildObjectTree, flattenTree, type Contribution } from "@/lib/finance/objects";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
) as any;

const YEAR = 2031; // far future, so nothing collides with real planning
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};

async function main() {
  console.log("\n── setup ───────────────────────────────────────");
  const { data: entity } = await db.from("fin_entities").select("*").eq("key", "np7-experience").single();
  check("entity np7-experience exists", !!entity, entity?.name);

  const { data: cats } = await db.from("fin_categories").select("*").order("sort");
  const hotel = cats.find((c: any) => c.key === "cost-travel-input");
  const rent = cats.find((c: any) => c.key === "cost-rent");
  const revExp = cats.find((c: any) => c.key === "rev-experience");
  check("seeded categories present", !!hotel && !!rent && !!revExp);

  const { data: plan, error: planErr } = await db.from("fin_plans")
    .insert({ entity_id: entity.id, year: YEAR, name: `SMOKE ${YEAR}`, status: "draft" })
    .select("*").single();
  check("plan created", !planErr, planErr?.message);

  console.log("\n── plan lines ──────────────────────────────────");
  // A trip cost in one month, rent across all twelve, revenue in two months.
  const lines = [
    { plan_id: plan.id, category_id: hotel.id, label: "Hotel Sorobon Wk I", month: monthDate(YEAR, 3), amount_net: 8000 },
    ...Array.from({ length: 12 }, (_, i) => ({
      plan_id: plan.id, category_id: rent.id, label: "Office rent", month: monthDate(YEAR, i + 1), amount_net: 900,
    })),
    { plan_id: plan.id, category_id: revExp.id, label: "Bonaire Wk I", month: monthDate(YEAR, 3), amount_net: 24000 },
    { plan_id: plan.id, category_id: revExp.id, label: "Bonaire Wk I", month: monthDate(YEAR, 4), amount_net: 6000 },
  ];
  const { data: inserted, error: lineErr } = await db.from("fin_plan_lines").insert(lines).select("*");
  check("15 plan lines inserted", !lineErr && inserted.length === 15, lineErr?.message ?? inserted?.length);

  const marchHotel = inserted.find((l: any) => l.label === "Hotel Sorobon Wk I");

  console.log("\n── the actual, over budget ─────────────────────");
  const { data: actual, error: actErr } = await db.from("fin_actuals").insert({
    entity_id: entity.id, category_id: hotel.id, description: "SMOKE Sorobon invoice",
    amount_net: 8340, amount_vat: 0, incurred_on: `${YEAR}-03-14`, source_kind: "manual",
  }).select("*").single();
  check("actual recorded", !actErr, actErr?.message);

  const { error: allocErr } = await db.from("fin_actual_allocations")
    .insert({ actual_id: actual.id, plan_line_id: marchHotel.id, amount: 8340 });
  check("attached to the March line", !allocErr, allocErr?.message);

  // An unplanned cost, which should surface rather than vanish.
  const { data: orphan } = await db.from("fin_actuals").insert({
    entity_id: entity.id, category_id: rent.id, description: "SMOKE surprise bill",
    amount_net: 450, incurred_on: `${YEAR}-06-02`, source_kind: "manual",
  }).select("*").single();

  console.log("\n── board arithmetic ────────────────────────────");
  const { data: allLines } = await db.from("fin_plan_lines")
    .select("id,category_id,label,month,amount_net,edition_id,vendor_id,confidence").eq("plan_id", plan.id);
  const { data: allocs } = await db.from("fin_actual_allocations")
    .select("plan_line_id,amount,actual_id").in("plan_line_id", allLines.map((l: any) => l.id));
  const { data: actuals } = await db.from("fin_actuals")
    .select("id,description,amount_net,incurred_on,category_id,vendor_id")
    .eq("entity_id", entity.id).gte("incurred_on", `${YEAR}-01-01`).lte("incurred_on", `${YEAR}-12-31`);

  const board = buildBoard({
    entity, plan, year: YEAR, categories: cats,
    lines: allLines, allocations: allocs, actuals,
    allocatedActualIds: new Set(allocs.map((a: any) => a.actual_id)),
    editionLabels: new Map(), vendorNames: new Map(),
  });

  check("cost planned total = 8000 + 12x900 = 18800", board.totals.costPlannedTotal === 18800, board.totals.costPlannedTotal);
  check("revenue planned total = 30000", board.totals.revenuePlannedTotal === 30000, board.totals.revenuePlannedTotal);
  check("net planned = 11200", board.totals.netPlannedTotal === 11200, board.totals.netPlannedTotal);
  check("cost actual total = 8340", board.totals.costActualTotal === 8340, board.totals.costActualTotal);

  const marchIdx = 2;
  check("March cost planned = 8900 (hotel + rent)", board.totals.costPlanned[marchIdx] === 8900, board.totals.costPlanned[marchIdx]);
  check("March cost actual = 8340", board.totals.costActual[marchIdx] === 8340, board.totals.costActual[marchIdx]);
  check("net actual in March = -8340 (no revenue booked)", board.totals.netActual[marchIdx] === -8340, board.totals.netActual[marchIdx]);

  const rentGroup = board.cost.find((g) => g.category?.key === "cost-rent");
  check("rent is ONE row across 12 months", rentGroup?.rows.length === 1, rentGroup?.rows.length);
  check("rent row totals 10800", rentGroup?.rows[0].plannedTotal === 10800, rentGroup?.rows[0].plannedTotal);

  const revGroup = board.revenue.find((g) => g.category?.key === "rev-experience");
  check("revenue row merges its two months", revGroup?.rows.length === 1, revGroup?.rows.length);
  check("revenue row totals 30000", revGroup?.rows[0].plannedTotal === 30000, revGroup?.rows[0].plannedTotal);

  const hotelRow = board.cost.find((g) => g.category?.key === "cost-travel-input")?.rows[0];
  check("hotel row shows the 340 overrun", hotelRow?.actualTotal === 8340 && hotelRow?.plannedTotal === 8000,
    { planned: hotelRow?.plannedTotal, actual: hotelRow?.actualTotal });

  check("the unplanned bill is surfaced", board.unallocated.length === 1 && board.unallocated[0].amount === 450,
    board.unallocated.map((u) => u.description));
  check("the attached bill is NOT in unallocated",
    !board.unallocated.some((u) => u.description === "SMOKE Sorobon invoice"));

  console.log("\n── the P&L the business plan reports ───────────");
  const P = board.pnlPlanned;
  check("revenue 30,000", P.revenue.total === 30000, P.revenue.total);
  check("cost of goods 8,000 (Reisevorleistungen, not overhead)", P.cogs.total === 8000, P.cogs.total);
  check("gross profit 22,000", P.grossProfit.total === 22000, P.grossProfit.total);
  check("gross margin 73.3%", P.grossMarginPct === 73.3, P.grossMarginPct);
  check("operating costs 10,800 (rent x12)", P.opex.total === 10800, P.opex.total);
  check("development 0", P.development.total === 0, P.development.total);
  check("total costs 18,800", P.totalCosts.total === 18800, P.totalCosts.total);
  check("result before tax 11,200", P.result.total === 11200, P.result.total);
  check("net margin 37.3%", P.netMarginPct === 37.3, P.netMarginPct);

  // running position: rent only until March, then the trip lands
  check("running position Feb = -1,800", P.accumulated[1] === -1800, P.accumulated[1]);
  check("running position Mar = 13,300", P.accumulated[2] === 13300, P.accumulated[2]);
  check("running position Dec = the year's result", P.accumulated[11] === P.result.total, P.accumulated[11]);
  check("lowest point = -1,800, which is what the year needs funding for",
    P.lowestPoint === -1800, P.lowestPoint);
  check("an over-budget actual shows in the actual P&L", board.pnlActual.cogs.total === 8340,
    board.pnlActual.cogs.total);

  console.log("\n── experience and hardware are separated ───────");
  // Replicates the board route's category filter: a division's own categories
  // plus the shared ones, never the other side's.
  const scoped = (division: string) =>
    cats.filter((c: any) => c.division === null || c.division === division).map((c: any) => c.key);
  const expCats = scoped("experience");
  const hwCats = scoped("hardware");
  check("Experience sees Reisevorleistungen", expCats.includes("cost-travel-input"));
  check("Experience does NOT see 3PL or goods",
    !expCats.includes("cost-fulfilment") && !expCats.includes("cost-goods"));
  check("Hardware sees goods and freight",
    hwCats.includes("cost-goods") && hwCats.includes("cost-freight"));
  check("Hardware does NOT see Reisevorleistungen or coaches",
    !hwCats.includes("cost-travel-input") && !hwCats.includes("cost-coaches"));
  check("both still share rent, salaries and bank fees",
    ["cost-rent", "cost-personnel", "cost-bank"].every((k) => expCats.includes(k) && hwCats.includes(k)));

  const { data: ents } = await db.from("fin_entities").select("key,division").order("sort");
  check("an entity exists for each side",
    ents.some((e: any) => e.division === "experience") && ents.some((e: any) => e.division === "hardware"),
    ents.map((e: any) => `${e.key}:${e.division}`));

  const inExp = entitiesForWorld(ents, "experience").map((e: any) => e.key);
  const inHw = entitiesForWorld(ents, "hardware").map((e: any) => e.key);
  check("Experience world offers only NP7 Experience",
    inExp.length === 1 && inExp[0] === "np7-experience", inExp);
  check("Hardware world offers only NP7 Hardware",
    inHw.length === 1 && inHw[0] === "np7-hardware", inHw);
  check("the holding is not a budgetable entity",
    !ents.some((e: any) => e.key === "np7-gmbh") && ents.length === 2, ents.map((e: any) => e.key));
  check("a world with no company gets nothing, not everything",
    entitiesForWorld([{ division: "experience" }], "hardware").length === 0);
  check("an unknown world still sees everything", entitiesForWorld(ents, null).length === ents.length);

  console.log("\n── per unit: bought and sold are counted apart ──");
  // 100 bought at 10 each, but only 40 sold at 25. One quantity column averaged
  // across both sides would make each figure wrong.
  const objs = [{ id: "o1", name: "Range", kind: "range", parent_id: null, sort: 1 }];
  const contribs: Contribution[] = [
    { objectId: "o1", group: "inventory", amount: 1000, quantity: 100 },
    { objectId: "o1", group: "revenue", amount: 1000, quantity: 40 },
    { objectId: "o1", group: "opex", amount: 500 },   // no units, and never per unit
  ];
  const node = buildObjectTree(objs, contribs)[0];
  check("units bought 100", node.total.unitsBought === 100, node.total.unitsBought);
  check("units sold 40, not folded into bought", node.total.unitsSold === 40, node.total.unitsSold);
  check("unit cost 10 = landed / bought", node.total.unitCost === 10, node.total.unitCost);
  check("unit revenue 25 = revenue / sold", node.total.unitRevenue === 25, node.total.unitRevenue);
  check("unit margin 15", node.total.unitMargin === 15, node.total.unitMargin);
  check("overheads stay out of the unit cost", node.total.opex === 500 && node.total.unitCost === 10);

  const noUnits = buildObjectTree(objs, [{ objectId: "o1", group: "inventory", amount: 900 }])[0];
  check("no quantity means no invented unit cost", noUnits.total.unitCost === null, noUnits.total.unitCost);

  // a child rolls its units up into the parent
  const nested = buildObjectTree(
    [...objs, { id: "o2", name: "Size", kind: "size", parent_id: "o1", sort: 2 }],
    [{ objectId: "o2", group: "inventory", amount: 400, quantity: 40 },
     { objectId: "o1", group: "inventory", amount: 600, quantity: 60 }],
  );
  check("units roll up to the parent", nested[0].total.unitsBought === 100, nested[0].total.unitsBought);
  check("the parent's own count excludes the child", nested[0].own.unitsBought === 60, nested[0].own.unitsBought);
  check("flattenTree lists parent before child",
    flattenTree(nested).map((n) => n.name).join(">") === "Range>Size", flattenTree(nested).map((n) => n.name));

  console.log("\n── row identity ────────────────────────────────");
  check("same label + different edition = different rows",
    rowKey({ category_id: "c", label: "Hotel", edition_id: "e1", vendor_id: null }) !==
    rowKey({ category_id: "c", label: "Hotel", edition_id: "e2", vendor_id: null }));
  check("label case does not fork a row",
    rowKey({ category_id: "c", label: "Hotel", edition_id: null, vendor_id: null }) ===
    rowKey({ category_id: "c", label: "hotel ", edition_id: null, vendor_id: null }));
  check("r2 rounds money, not floats", r2(0.1 + 0.2) === 0.3, r2(0.1 + 0.2));

  console.log("\n── cleanup ─────────────────────────────────────");
  await db.from("fin_actuals").delete().in("id", [actual.id, orphan.id]);
  await db.from("fin_plans").delete().eq("id", plan.id);
  const { count: leftLines } = await db.from("fin_plan_lines")
    .select("id", { count: "exact", head: true }).eq("plan_id", plan.id);
  const { count: leftPlans } = await db.from("fin_plans")
    .select("id", { count: "exact", head: true }).eq("year", YEAR);
  check("plan lines cascaded away", (leftLines ?? 0) === 0, leftLines);
  check("no smoke plans left behind", (leftPlans ?? 0) === 0, leftPlans);

  console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
