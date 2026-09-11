/**
 * What the NP7 Performance Team role can and cannot reach.
 *
 * Christian Skodde and Tammo Andersch are being invited into NP7 Performance
 * and must not be able to enter anything else. This asserts that as a property
 * rather than a hope: every admin section is tried, and the ones that are not
 * theirs must refuse.
 *
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-performance-team.mts
 */
import { createClient } from "@supabase/supabase-js";
import { SECTIONS, effectiveCanAccess, effectiveCanWrite, effectiveCanSeeField,
         effectiveCanEnterWorld, type EffectiveAccess, type RoleAccess } from "@/lib/access";
import { moneyWorlds, permittedWorlds } from "@/lib/finance/guard";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }) as any;
let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { pass++; } else { console.log(`  ✗ ${n}${got !== undefined ? `  ${JSON.stringify(got)}` : ""}`); fail++; }
};

const { data: roles } = await db.from("team_roles").select("id,name,access");
const role = roles.find((r: { name: string }) => r.name === "NP7 Performance Team");
if (!role) { console.log("  ✗ the NP7 Performance Team role does not exist"); process.exit(1); }
const eff: EffectiveAccess = { kind: "role", access: role.access as RoleAccess };

// ── the whole admin, section by section ─────────────────────────────────────
const reach: string[] = [], refuse: string[] = [];
for (const sec of SECTIONS) {
  const path = sec.paths[0];
  if (path.startsWith("/api/")) continue;
  (effectiveCanAccess(eff, path) ? reach : refuse).push(`${sec.label} (${sec.key})`);
}
console.log(`\n  REACHES ${reach.length} sections\n`);
for (const r of reach.sort()) console.log(`    ${r}`);
console.log(`\n  REFUSED ${refuse.length} sections\n`);
for (const r of refuse.sort()) console.log(`    ${r}`);

// ── the things that must never be true ──────────────────────────────────────
console.log("\n  Assertions\n");
check("cannot enter the Experience world", !effectiveCanEnterWorld(eff, "experience"));
check("can enter the Hardware world", effectiveCanEnterWorld(eff, "hardware"));
for (const p of ["/admin/team", "/admin/roles"]) {
  check(`refused ${p}`, !effectiveCanAccess(eff, p));
  check(`cannot write ${p}`, !effectiveCanWrite(eff, p));
}
check("refused the Experience budget", !effectiveCanAccess(eff, "/admin/experience/finance"));
check("cannot write the Experience budget", !effectiveCanWrite(eff, "/admin/experience/finance"));
check("reaches the Performance budget", effectiveCanAccess(eff, "/admin/performance/finance"));
check("can edit the Performance budget", effectiveCanWrite(eff, "/admin/performance/finance"));
for (const p of ["/admin/bookings", "/admin/contacts", "/admin/payments", "/admin/documents",
                 "/admin/exp-costs", "/admin/editions", "/admin/hotels", "/admin/campaigns",
                 "/admin/bank", "/admin/vendors", "/admin/guest-reviews", "/admin/surveys"])
  check(`refused ${p}`, !effectiveCanAccess(eff, p));
check("sees Performance money", effectiveCanSeeField(eff, "money", "hardware"));
check("cannot see Experience money", !effectiveCanSeeField(eff, "money", "experience"));
check("cannot see Experience costs", !effectiveCanSeeField(eff, "costs", "experience"));
check("cannot see Experience contact details", !effectiveCanSeeField(eff, "contact_pii", "experience"));
check("the finance API gives them hardware alone", JSON.stringify(moneyWorlds(eff)) === '["hardware"]', moneyWorlds(eff));
check("they may enter hardware alone", JSON.stringify(permittedWorlds(eff)) === '["hardware"]', permittedWorlds(eff));

// ── and nobody else picked up the budget by accident ────────────────────────
for (const r of roles) {
  const a = r.access as RoleAccess;
  if (!a?.worlds) continue;                                   // tier roles see everything by design
  const other: EffectiveAccess = { kind: "role", access: a };
  const grant = (a.sections ?? {})["finance"] ?? "none";
  if (grant === "none") {
    check(`${r.name} has no finance grant, so no budget`,
          !effectiveCanAccess(other, "/admin/performance/finance")
          && !effectiveCanAccess(other, "/admin/experience/finance"));
  }
  if (!a.worlds.includes("experience"))
    check(`${r.name} cannot open the Experience budget`, !effectiveCanAccess(other, "/admin/experience/finance"));
  if (!a.worlds.includes("hardware"))
    check(`${r.name} cannot open the Performance budget`, !effectiveCanAccess(other, "/admin/performance/finance"));
}

console.log(`  ${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
