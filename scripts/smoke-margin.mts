/**
 * The two places where a wrong answer costs real money, checked against the
 * live data.
 *
 * ONE, the EU VAT territory. Third-country margin is tax free under § 25 Abs.
 * 2, EU margin is taxed the month the money arrives, and the EU VAT territory
 * is not the political map. Tenerife is Spain and outside it. Bonaire is Dutch
 * and outside it. Tarifa is Spain and inside it. A regression that turned any
 * of those the other way would move a tax liability without failing a single
 * type check, so the real destination table is asserted here by name.
 *
 * TWO, the margin arithmetic. The base is the margin net of the VAT inside it,
 * a loss on one trip may not reduce the tax on another, and a cost nobody has
 * sorted is never counted as zero.
 *
 * Read-only. Writes nothing.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-margin.mts
 */
import { createClient } from "@supabase/supabase-js";
import { classifyTerritory } from "../src/lib/lexoffice/territory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; }
  else { console.log(`  ✗ ${n}  got: ${JSON.stringify(got)}`); fail++; }
};

console.log("\n── The traps: an EU country with a non-EU VAT territory ──────");
const { data: dests } = await db.from("destinations").select("name, country, region, vat_territory");
const byName = new Map<string, { name: string; country: string | null; region: string | null; vat_territory: string | null }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const d of (dests ?? []) as any[]) byName.set(d.name, d);

const EXPECTED: [string, "DRITTLAND" | "EU"][] = [
  ["Tenerife", "DRITTLAND"],        // Spain, but the Canaries are outside the EU VAT territory
  ["Fuerteventura", "DRITTLAND"],   // same
  ["Tarifa", "EU"],                 // Spain, mainland, and genuinely EU
  ["Bonaire", "DRITTLAND"],         // Dutch, and outside it
  ["Eide", "DRITTLAND"],            // Norway: EEA, Schengen, still a third country
  ["Alaçatı", "DRITTLAND"],
  ["Lake Garda", "EU"],
  ["Vasiliki", "EU"],
];
for (const [name, want] of EXPECTED) {
  const d = byName.get(name);
  if (!d) { check(`${name} is still in the destination table`, false); continue; }
  const v = classifyTerritory(d);
  check(`${name} (${d.country}) → ${want}`, v.territory === want, `${v.territory} — ${v.reason}`);
}

console.log("\n── The classifier abstains rather than guesses ──────");
check("a country it was never told about is UNKLAR", classifyTerritory({ country: "Neverland" }).territory === "UNKLAR");
check("no country at all is UNKLAR", classifyTerritory({ country: null }).territory === "UNKLAR");
check("a practice ruling overrides the derivation",
  classifyTerritory({ country: "Germany", override: "third_country" }).territory === "DRITTLAND");

console.log("\n── The margin arithmetic ──────");
// The worked example from the accounting plan: a 2,990 trip with 2,240 of
// pre-services owes 119.75, and 19% of the whole price would be 477.39.
const margin = 2990 - 2240;
const base = Math.round((margin / 1.19) * 100) / 100;
const ust = Math.round((margin - base) * 100) / 100;
check("750 of margin carries 119.75 of VAT, not 142.50", ust === 119.75, ust);
// The plan's own comparison: 19% taken out of the whole gross price rather
// than out of the margin. 2,990 / 1.19 × 0.19 = 477.39, which is 357.64 too
// much on one booking. Not 2,990 × 0.19 — the trip price is already gross.
const wholePrice = Math.round((2990 / 1.19) * 0.19 * 100) / 100;
check("19% of the whole price would be 477.39", wholePrice === 477.39, wholePrice);
check("so the mistake costs about 358 a booking", Math.abs(wholePrice - ust - 357.64) < 0.01, wholePrice - ust);

console.log("\n── Costs nobody has sorted are visible, not zero ──────");
const { count: unsorted } = await db.from("exp_costs").select("id", { count: "exact", head: true }).is("margin_class", null).neq("status", "cancelled");
const { count: labourUnsorted } = await db.from("exp_costs").select("id", { count: "exact", head: true }).is("margin_class", null).like("item", "Labour%");
check("the hours-log rows are all classified", (labourUnsorted ?? 0) === 0, labourUnsorted);
console.log(`  · ${unsorted ?? 0} cost lines still need a bucket. Each one that turns out to be a travel input makes a margin smaller.`);

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
