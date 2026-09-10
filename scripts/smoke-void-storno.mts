/**
 * Void vs Storno, checked against the live books.
 *
 * "Didn't we say we get rid of void?" is really two questions, and only the
 * database answers the first one: WHAT are the cancelled invoices? Voiding a
 * pro-forma is routine bookkeeping. Voiding a numbered tax invoice is only
 * defensible while nobody has it — after that the correction is a Storno.
 *
 * So this asserts the things that have to be true for every cancelled tax
 * invoice standing in the books right now, and names the ones that fall short
 * instead of quietly passing.
 *
 * Read-only. Writes nothing.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-void-storno.mts
 */
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; }
  else { console.log(`  ✗ ${n}  got: ${JSON.stringify(got)}`); fail++; }
};

const TAX_TYPES = ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice", "credit_note"];

type Doc = {
  id: string; type: string; invoice_number: string | null; amount: number | null;
  status: string; sent_at: string | null; paid_at: string | null; booking_id: string | null;
  created_at: string; division: string; meta: Record<string, unknown> | null;
};

const { data: all } = await db.from("documents").select("*").order("created_at");
const docs: Doc[] = all ?? [];
const tax = docs.filter((d) => TAX_TYPES.includes(d.type) && !String(d.invoice_number ?? "").startsWith("PF-"));
const voidTax = tax.filter((d) => d.status === "void");
const voidPf = docs.filter((d) => d.status === "void" && !tax.includes(d));

console.log("\n── what is actually cancelled ──────────────────");
console.log(`  ${docs.length} documents · ${tax.length} tax invoices · ${voidTax.length} cancelled tax invoices · ${voidPf.length} cancelled pro-formas/confirmations`);
console.log(`  cancelled tax invoices total ${voidTax.reduce((s, d) => s + Number(d.amount ?? 0), 0).toFixed(2)} EUR`);

console.log("\n── every cancelled tax invoice is a Fehldruck, not a reversal ──");
// The one fact that makes a void legitimate: the customer never got it. A sent
// invoice lives in their books too, where a flag flipped here reaches nobody.
check("none of them was ever sent", voidTax.every((d) => !d.sent_at),
  voidTax.filter((d) => d.sent_at).map((d) => d.invoice_number));
check("none of them was marked paid", voidTax.every((d) => !d.paid_at),
  voidTax.filter((d) => d.paid_at).map((d) => d.invoice_number));

const { data: pays } = await db.from("exp_payments").select("id, amount, document_id").not("document_id", "is", null);
const voidIds = new Set(voidTax.map((d) => d.id));
const strandedMoney = (pays ?? []).filter((p: { document_id: string }) => voidIds.has(p.document_id));
check("no payment is allocated to a cancelled invoice", strandedMoney.length === 0, strandedMoney);

console.log("\n── the sequence still tells the whole story ──────");
// Per division + year, NOT per prefix: NP7 renamed mid-2026, so SCXP and NP7-XP
// share one counter and grouping by prefix would invent a hole.
const groups = new Map<string, number[]>();
for (const d of tax) {
  const m = /-(\d{4})-(\d+)$/.exec(d.invoice_number ?? "");
  if (!m) continue;
  const key = `${d.division}:${m[1]}`;
  groups.set(key, [...(groups.get(key) ?? []), Number(m[2])]);
}
for (const [key, nums] of groups) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) if (!sorted.includes(i)) missing.push(i);
  check(`${key}: ${sorted[0]}…${sorted[sorted.length - 1]} has no gaps`, missing.length === 0, missing);
}
const { data: counter } = await db.from("invoice_counters").select("*");
for (const c of counter ?? []) {
  const highest = Math.max(0, ...(groups.get(`${c.division}:${c.year}`) ?? [0]));
  check(`${c.division} ${c.year}: counter (${c.last_number}) is not behind the highest issued number (${highest})`,
    Number(c.last_number) >= highest);
}

console.log("\n── a cancelled number has to say why ────────────");
/*
 * The route stamps `voided_at` alongside `void_reason`, so a row carrying one
 * and not the other would mean the guard was bypassed. The rows cancelled
 * BEFORE the guard existed carry neither: they are backlog, not a regression,
 * and filling them in is a data decision for Nico, not something a smoke test
 * gets to do. They are listed, with the invoice that replaced each one, so the
 * answer to "why is 0004 gone?" is at least on a screen somewhere.
 */
const meta = (d: Doc) => (d.meta ?? {}) as { void_reason?: string; voided_at?: string };
const cancelledByRoute = voidTax.filter((d) => meta(d).voided_at);
check("every cancellation this route recorded carries its reason",
  cancelledByRoute.every((d) => !!meta(d).void_reason),
  cancelledByRoute.filter((d) => !meta(d).void_reason).map((d) => d.invoice_number));

const noReason = voidTax.filter((d) => !meta(d).void_reason);
console.log(`  · ${noReason.length} of ${voidTax.length} predate the rule and explain themselves nowhere:`);
for (const d of noReason) {
  const sameBooking = tax.filter((x) => x.booking_id === d.booking_id && x.status === "issued");
  console.log(`      ${d.invoice_number}  ${d.type.padEnd(20)} ${Number(d.amount).toFixed(2).padStart(8)}  replaced by: ${sameBooking.map((x) => x.invoice_number).join(", ") || "nothing"}`);
}

console.log("\n── Storno covers every kind of tax invoice ──────");
// A credit note could not correct an add-on invoice: the type list left it out,
// so NP7-XP-2026-0015 had no correction at all once it was sent.
const src = await import("node:fs").then((fs) => fs.readFileSync("src/lib/invoices/generate.ts", "utf8"));
const typeList = /if \(!\[([^\]]*)\]\.includes\(o\.type\)\)/.exec(src)?.[1] ?? "";
for (const t of ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice"]) {
  check(`generateCreditNote accepts ${t}`, typeList.includes(t), typeList);
}
check("generateCreditNote still refuses a pro-forma", !typeList.includes("proforma_invoice"));

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
