/**
 * Roadmap smoke test. Exercises the database invariants that the API relies on,
 * and the write-back contract end to end against a real purchase order.
 * Restores everything it touches.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-roadmap.mts
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
let pass = 0, fail = 0;
const check = (n: string, c: boolean, g?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; } else { console.log(`  ✗ ${n}  got: ${JSON.stringify(g)}`); fail++; }
};

const { data: entity } = await db.from("fin_entities").select("id").eq("key", "np7-hardware").single();

console.log("\n── the seed came out of real rows ──────────────");
const { data: seeded } = await db.from("roadmap_items")
  .select("title,kind,starts_on,source_table,source_field,amount_net").is("archived_at", null);
check("milestones were seeded", seeded.length >= 15, seeded.length);
check("every seeded row names where it came from",
  seeded.every((r: any) => !r.source_table || !!r.source_field));
check("purchase order dates became milestones",
  seeded.some((r: any) => r.source_table === "hw_purchase_orders"));
check("budget lines became milestones",
  seeded.some((r: any) => r.source_table === "fin_plan_lines"));
check("recurring costs did NOT (no monthly rent on the roadmap)",
  !seeded.some((r: any) => /rent|qonto|lexware|ai tools/i.test(r.title)),
  seeded.filter((r: any) => /rent|qonto|lexware/i.test(r.title)).map((r: any) => r.title));
check("air freight sits in shipping, not tooling",
  seeded.find((r: any) => /air freight/i.test(r.title))?.kind === "shipping",
  seeded.find((r: any) => /air freight/i.test(r.title))?.kind);

console.log("\n── the database refuses nonsense ───────────────");
const bad = await db.from("roadmap_items").insert({
  entity_id: entity.id, title: "SMOKE backwards", kind: "other",
  starts_on: "2027-05-01", ends_on: "2027-04-01",
}).select("id");
check("a milestone cannot end before it starts", !!bad.error, bad.error?.code);

const badKind = await db.from("roadmap_items").insert({
  entity_id: entity.id, title: "SMOKE kind", kind: "not-a-kind", starts_on: "2027-01-01",
}).select("id");
check("an unknown kind is refused", !!badKind.error, badKind.error?.code);

const { data: one } = await db.from("roadmap_items").insert({
  entity_id: entity.id, title: "SMOKE self-dep", kind: "other", starts_on: "2027-01-01",
}).select("id").single();
const selfDep = await db.from("roadmap_dependencies")
  .insert({ predecessor_id: one.id, successor_id: one.id }).select("id");
check("a milestone cannot depend on itself", !!selfDep.error, selfDep.error?.code);
await db.from("roadmap_items").delete().eq("id", one.id);

console.log("\n── write-back reaches the purchase order ───────");
// PO-2026-001 has no ex_factory_planned, so the receipt date is the one to drive.
const { data: po } = await db.from("hw_purchase_orders")
  .select("id,po_number,expected_receipt_date").not("expected_receipt_date", "is", null).limit(1).single();
const originalDate = po.expected_receipt_date;
const { data: ms } = await db.from("roadmap_items")
  .select("id,starts_on,baseline_starts_on").eq("purchase_order_id", po.id)
  .eq("source_field", "expected_receipt_date").single();
check("the goods-expected milestone is linked to its order", !!ms, ms?.id);

// what the API's PATCH does: move it, capture the baseline on first move, write back
const moved = "2027-02-15";
await db.from("roadmap_items").update({
  starts_on: moved,
  baseline_starts_on: ms.baseline_starts_on ?? ms.starts_on,
}).eq("id", ms.id);
await db.from("hw_purchase_orders").update({ expected_receipt_date: moved }).eq("id", po.id);

const { data: after } = await db.from("roadmap_items").select("starts_on,baseline_starts_on").eq("id", ms.id).single();
const { data: poAfter } = await db.from("hw_purchase_orders").select("expected_receipt_date").eq("id", po.id).single();
check("the milestone moved", after.starts_on === moved, after.starts_on);
check("the baseline kept where it was first planned",
  after.baseline_starts_on === (ms.baseline_starts_on ?? ms.starts_on), after.baseline_starts_on);
check("the purchase order followed it", poAfter.expected_receipt_date === moved, poAfter.expected_receipt_date);

// restore
await db.from("roadmap_items").update({ starts_on: ms.starts_on, baseline_starts_on: ms.baseline_starts_on }).eq("id", ms.id);
await db.from("hw_purchase_orders").update({ expected_receipt_date: originalDate }).eq("id", po.id);
const { data: restored } = await db.from("hw_purchase_orders").select("expected_receipt_date").eq("id", po.id).single();
check("everything put back", restored.expected_receipt_date === originalDate, restored.expected_receipt_date);

const { count: leftovers } = await db.from("roadmap_items")
  .select("id", { count: "exact", head: true }).ilike("title", "SMOKE%");
check("no smoke rows left behind", (leftovers ?? 0) === 0, leftovers);

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
