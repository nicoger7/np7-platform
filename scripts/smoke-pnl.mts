/**
 * The P&L, and the one thing it used to get wrong.
 *
 * buildBoard was never handed an inventory or a financing category by any test,
 * which is precisely why nobody noticed that stock never became a cost. A plan
 * that bought 350 boards and sold 350 boards reported its profit with the
 * boards left out of it, overstating the 2027 result by 403.900 EUR.
 *
 * These checks exercise the case directly, then re-run the real plan so the
 * number on the dashboard is the number this file asserts.
 *
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-pnl.mts
 */
import { createClient } from "@supabase/supabase-js";
import { buildBoard, monthDate, PLAN_LINE_COLUMNS, type BoardCategory } from "@/lib/finance/board";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
) as any;

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};
const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2 });

const CATS: BoardCategory[] = [
  { id: "rev", key: "rev", name: "Sales", kind: "revenue", sort: 1, division: null, pnl_group: "revenue" },
  { id: "inv", key: "inv", name: "Goods purchased", kind: "cost", sort: 2, division: null, pnl_group: "inventory" },
  { id: "cog", key: "cog", name: "Fulfilment", kind: "cost", sort: 3, division: null, pnl_group: "cogs" },
  { id: "opx", key: "opx", name: "Salaries", kind: "cost", sort: 4, division: null, pnl_group: "opex" },
  { id: "fin", key: "fin", name: "Investor tranche", kind: "revenue", sort: 5, division: null, pnl_group: "financing" },
];

type L = { id: string; category_id: string; label: string; month: string;
           amount_net: number; quantity: number | null;
           edition_id: null; vendor_id: null; confidence: string; included: boolean };
let n = 0;
const mk = (cat: string, label: string, month: number, amount: number, qty: number | null = null): L => ({
  id: `l${++n}`, category_id: cat, label, month: monthDate(2031, month),
  amount_net: amount, quantity: qty, edition_id: null, vendor_id: null,
  confidence: "expected", included: true,
});

const board = (lines: L[], opening = 0) => buildBoard({
  entity: null, plan: null, year: 2031, categories: CATS,
  lines: lines as never, allocations: [], actuals: [], allocatedActualIds: new Set(),
  editionLabels: new Map(), vendorNames: new Map(), openingBalance: opening,
}).pnlPlanned;

console.log("\nStock that sells is a cost\n");
const sold = board([
  mk("rev", "Board sales", 6, 100_000, 100),
  mk("inv", "Boards, landed", 3, 60_000, 100),
  mk("opx", "Salaries", 1, 10_000),
]);
check("cost of sales is the stock that sold", sold.costOfSales.total === 60_000, sold.costOfSales.total);
check("nothing is left in stock", sold.closingStock.total === 0, sold.closingStock.total);
check("the result carries the goods", sold.result.total === 30_000, sold.result.total);
check("gross profit is revenue less the goods", sold.grossProfit.total === 40_000, sold.grossProfit.total);
check("the margin is real and stated", sold.grossMarginPct === 40, sold.grossMarginPct);
check("cash still sees the stock in the month it was paid for",
      sold.cashMovement.byMonth[2] === -60_000, sold.cashMovement.byMonth[2]);
check("...and the cost lands in the month of the sale",
      sold.costOfSales.byMonth[5] === 60_000 && sold.costOfSales.byMonth[2] === 0,
      sold.costOfSales.byMonth);
check("over the year, cash and result agree when nothing is left over",
      sold.cashMovement.total === sold.result.total, [sold.cashMovement.total, sold.result.total]);

console.log("\nStock that has not sold is not a cost\n");
const stocked = board([
  mk("inv", "Boards, landed", 11, 60_000, 100),
  mk("opx", "Salaries", 1, 10_000),
]);
check("no sale, no cost of sales", stocked.costOfSales.total === 0, stocked.costOfSales.total);
check("it is all still stock", stocked.closingStock.total === 60_000, stocked.closingStock.total);
check("the result is only the overheads", stocked.result.total === -10_000, stocked.result.total);
check("cash is down by the stock as well", stocked.cashMovement.total === -70_000, stocked.cashMovement.total);
check("no revenue means no margin to quote", stocked.grossMarginPct === null);

console.log("\nSelling half of what was bought\n");
const half = board([
  mk("rev", "Board sales", 6, 50_000, 50),
  mk("inv", "Boards, landed", 3, 60_000, 100),
]);
check("half the stock becomes a cost", half.costOfSales.total === 30_000, half.costOfSales.total);
check("half of it is still stock", half.closingStock.total === 30_000, half.closingStock.total);
check("the result is the half that sold", half.result.total === 20_000, half.result.total);
check("cash is worse than the result, because the whole container was paid for",
      half.cashMovement.total === -10_000, half.cashMovement.total);

console.log("\nNo unit counts, no claim\n");
const blind = board([
  mk("rev", "Sales", 6, 100_000),
  mk("inv", "Goods", 3, 60_000),
]);
check("without counts nothing is assumed sold", blind.costOfSales.total === 0, blind.costOfSales.total);
check("which is the conservative answer, not the flattering one",
      blind.result.total === 100_000 && blind.closingStock.total === 60_000, blind.result.total);

console.log("\nFinancing is never earned\n");
const funded = board([
  mk("rev", "Sales", 6, 100_000, 100),
  mk("inv", "Goods", 3, 60_000, 100),
  mk("fin", "Investor tranche", 2, 200_000),
], 5_000);
check("funding stays out of the result", funded.result.total === 40_000, funded.result.total);
check("funding is in the cash", funded.cashMovement.total === 240_000, funded.cashMovement.total);
check("the running position starts from the opening balance",
      funded.accumulated[11] === 245_000, funded.accumulated[11]);
check("funding is out of the margin too", funded.grossMarginPct === 40, funded.grossMarginPct);

console.log("\nExcluded rows still count for nothing\n");
const withOff = board([
  mk("rev", "Sales", 6, 100_000, 100),
  mk("inv", "Goods", 3, 60_000, 100),
  { ...mk("inv", "Cancelled order", 4, 999_000, 500), included: false },
]);
check("an excluded line changes neither cost of sales nor sell-through",
      withOff.costOfSales.total === 60_000 && withOff.result.total === 40_000, withOff.costOfSales.total);

console.log("\nThe real 2027 plan\n");
const HW = "14f6046f-b6f9-4210-89ee-3dd82ca38403";
const [{ data: ents }, { data: cats }, { data: plans }] = await Promise.all([
  db.from("fin_entities").select("id,key,name,role,division,status,active_from,legal_name,own_entity_from,note"),
  db.from("fin_categories").select("id,key,name,kind,sort,division,pnl_group"),
  db.from("fin_plans").select("id,entity_id,name,year,status,note").eq("entity_id", HW).eq("year", 2027).eq("status", "active"),
]);
const plan = plans?.[0];
if (!plan) {
  check("the 2027 Performance plan exists", false);
} else {
  // The SAME columns the route asks for. Asking for more here is how the last
  // bug hid: the test saw quantity, production did not.
  const { data: lines } = await db.from("fin_plan_lines")
    .select(PLAN_LINE_COLUMNS)
    .eq("plan_id", plan.id);
  const p = buildBoard({
    entity: ents.find((e: { id: string }) => e.id === HW), plan, year: 2027, categories: cats,
    lines, allocations: [], actuals: [], allocatedActualIds: new Set(),
    editionLabels: new Map(), vendorNames: new Map(), openingBalance: 0,
  }).pnlPlanned;
  console.log(`    revenue ${eur(p.revenue.total)} · stock ${eur(p.inventory.total)} · cost of sales ${eur(p.costOfSales.total)}`);
  console.log(`    result ${eur(p.result.total)} · cash ${eur(p.cashMovement.total)} · closing stock ${eur(p.closingStock.total)}`);
  check("350 boards bought and 350 sold, so the stock is entirely a cost",
        p.costOfSales.total === p.inventory.total, [p.costOfSales.total, p.inventory.total]);
  check("nothing is left in stock at the end of the year", p.closingStock.total === 0, p.closingStock.total);
  check("the result is the business plan's own 182k, not 586k",
        Math.abs(p.result.total - 182_477.5) < 1, p.result.total);
  // Funding is money in that was never earned, so it moves the bank and never
  // the result. Stating it this way holds whether or not a tranche is planned.
  check("cash exceeds the result by exactly the funding, and by nothing else",
        Math.abs((p.cashMovement.total - p.financing.total) - p.result.total) < 1,
        [p.cashMovement.total, p.financing.total, p.result.total]);
  check("funding is not in the result", Math.abs(p.result.total - 182_477.5) < 1, p.result.total);
  check("a margin can finally be quoted", p.grossMarginPct !== null, p.grossMarginPct);
  console.log(`    gross margin ${p.grossMarginPct}% · result ${eur(p.result.total)}`);

  /* The column list is load-bearing, so prove it rather than trust it. Strip
     quantity, as the route used to, and the answer silently reverts to the
     wrong one. Anyone who removes it from PLAN_LINE_COLUMNS fails here. */
  check("PLAN_LINE_COLUMNS carries quantity", PLAN_LINE_COLUMNS.includes("quantity"));
  const stripped = (lines as Record<string, unknown>[]).map((l) => {
    const rest = { ...l }; delete rest.quantity; return rest;
  });
  const blind = buildBoard({
    entity: ents.find((e: { id: string }) => e.id === HW), plan, year: 2027, categories: cats,
    lines: stripped as never, allocations: [], actuals: [], allocatedActualIds: new Set(),
    editionLabels: new Map(), vendorNames: new Map(), openingBalance: 0,
  }).pnlPlanned;
  check("without quantity the P&L reverts to the wrong answer, which is why it must be queried",
        blind.costOfSales.total === 0 && Math.abs(blind.result.total - p.result.total) > 400_000,
        [blind.result.total, p.result.total]);
}

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
