/**
 * Costs: where a line belongs, whether its money is real, and whether every
 * reader still adds up to the same euro.
 *
 * Migration 240 gave a cost a scope (edition · experience_year · year ·
 * general) and a derived state (Expected · Real · Recorded by hand), and the
 * bank page can now place a debit on a cost line. Three things can go wrong
 * from here, and each one moves a P&L or a VAT figure without failing a type
 * check:
 *
 *   ONE   a row whose columns contradict its scope, or a broader scope with
 *         no reason, or a general cost sorted as a Reisevorleistung. The
 *         database refuses all of these; this file proves the live rows obey
 *         them, so a reader may trust the scope column.
 *   TWO   money placed beyond what a debit holds, or a payment attached for
 *         more than it is. Either would count a euro twice.
 *   THREE the P&L rule, the § 25 record and the cost ledger disagreeing about
 *         what a line is worth. They all import costMoney(); this checks the
 *         margin record's buckets against an independent sum over the raw
 *         rows, per edition, using the exact rule the P&L route has always
 *         used (attached money, then the typed actual, then the estimate).
 *
 * Read-only. Writes nothing.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-costs.mts
 */
import { createClient } from "@supabase/supabase-js";
import { validateScope, costMoney, suggestMarginClass, describeScope } from "@/lib/finance/costs";
import { buildCostWrite } from "@/lib/finance/cost-write";
import { suggestCostsForDebit, type CostCandidate } from "@/lib/bank/cost-match";
import { isCostDebit } from "@/lib/bank/costs";
import { costBucketsByEdition } from "@/lib/lexoffice/margin";
import { sectionForPath, SECTION_EXPOSES, isOwnerOnlyPath } from "@/lib/access";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; }
  else { console.log(`  ✗ ${n}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ED = "11111111-1111-4111-8111-111111111111";
const EX = "22222222-2222-4222-8222-222222222222";

console.log("\n── ONE · scope: what a form may say, and what the database will take ──────");
{
  const a = validateScope({ scope: "edition" });
  check("an edition cost without an edition is refused", !a.ok);
  const b = validateScope({ scope: "edition", edition_id: ED });
  check("an edition cost needs only its edition; year and reason are cleared", b.ok && b.row.year === null && b.row.scope_reason === null, b);
  const c = validateScope({ scope: "experience_year", experience_id: EX, year: 2027 });
  check("broader than one trip without a reason is refused", !c.ok);
  const d = validateScope({ scope: "experience_year", experience_id: EX, scope_reason: "one flight, three weeks" });
  check("shared across an experience needs its year", !d.ok);
  const e = validateScope({ scope: "experience_year", experience_id: EX, year: 2027, scope_reason: "one flight, three weeks" });
  check("experience_year: experience + year + reason, no edition", e.ok && e.row.edition_id === null && e.row.year === 2027, e);
  const f = validateScope({ scope: "year", scope_reason: "season gear" });
  check("a yearly cost needs its year", !f.ok);
  const g = validateScope({ scope: "year", year: 2027, experience_id: EX, scope_reason: "season gear" });
  check("a yearly cost drops any experience it was handed", g.ok && g.row.experience_id === null, g);
  const h = validateScope({ scope: "general", scope_reason: "the accountant" });
  check("general: nothing set but the reason", h.ok && h.row.edition_id === null && h.row.experience_id === null && h.row.year === null, h);
  const i = validateScope({ scope: "year", year: 1999, scope_reason: "x" });
  check("a year outside 2000..2100 is refused", !i.ok);
  const j = validateScope({ scope: "nonsense", edition_id: ED });
  check("an unknown scope falls back to edition rather than failing open", j.ok && j.row.scope === "edition", j);
}

console.log("\n── ONE · the write path refuses what the CHECKs refuse, in sentences ──────");
{
  const a = buildCostWrite({ item: "Accountant", scope: "general", scope_reason: "belongs to nobody", margin_class: "travel_input" }, null);
  check("a general cost cannot be a Reisevorleistung", !a.ok && /Reisevorleistung/.test(a.ok ? "" : a.error), a);
  const b = buildCostWrite({ item: "Hotel", edition_id: ED, estimated_amount: "1200.5", foo: "bar" }, null);
  check("a new edition line lands as scope=edition", b.ok && b.row.scope === "edition" && b.row.edition_id === ED, b);
  check("…and an unknown key never becomes a column write", b.ok && !("foo" in b.row));
  check("…and the estimate is a rounded number", b.ok && b.row.estimated_amount === 1200.5);
  const c = buildCostWrite({ item: "Hotel", edition_id: ED, actual_amount: 900, actual_provenance: "off_bank" }, null);
  check("an off-bank actual without a note is refused", !c.ok);
  const d = buildCostWrite({ item: "Hotel", edition_id: ED, actual_amount: 900, actual_provenance: "off_bank", actual_note: "Nico's card" }, null);
  check("an off-bank actual with its note is accepted", d.ok && d.row.actual_provenance === "off_bank", d);
  const e = buildCostWrite({ item: "Hotel", edition_id: ED, actual_amount: 900, actual_provenance: "bank" }, null);
  check("bank-backed money cannot be typed, only attached", !e.ok);
  const existing = { scope: "edition", edition_id: ED, experience_id: EX, year: null, scope_reason: null, actual_amount: null, actual_provenance: null, actual_note: null, margin_class: null };
  const f = buildCostWrite({ estimated_amount: 50 }, existing);
  check("a partial edit does not have to restate where the cost belongs", f.ok && !("scope" in f.row) && f.row.estimated_amount === 50, f);
  const g = buildCostWrite({ scope: "general", scope_reason: "office" }, existing);
  check("moving a line to general clears edition, experience and year", g.ok && g.row.edition_id === null && g.row.experience_id === null && g.row.year === null, g);
  const h = buildCostWrite({ edition_id: null }, existing);
  check("clearing the edition alone (the old experience-wide gesture) is refused", !h.ok);
}

console.log("\n── the money: attached, then typed, then estimated ──────");
{
  const est = costMoney({ estimated_amount: 100, actual_amount: null });
  check("only an estimate: expected, worth 100, 100 open", est.state === "expected" && est.value === 100 && est.open === 100, est);
  const hand = costMoney({ estimated_amount: 100, actual_amount: 80, actual_provenance: "unverified" });
  check("a typed actual: hand, worth 80, 80 open", hand.state === "hand" && hand.value === 80 && hand.open === 80 && hand.provenance === "unverified", hand);
  const real = costMoney({ estimated_amount: 100, actual_amount: 80, actual_provenance: "unverified" }, 50, 50);
  check("a bank debit attached: real, worth what is attached, the rest open", real.state === "real" && real.value === 50 && real.open === 30, real);
  const typedPay = costMoney({ estimated_amount: 100, actual_amount: null }, 50, 0);
  check("a typed payment attached is hand, not real", typedPay.state === "hand" && typedPay.value === 50, typedPay);
  const over = costMoney({ estimated_amount: 100, actual_amount: null }, 130, 130);
  check("attached beyond the estimate leaves nothing open", over.open === 0 && over.value === 130, over);
  const zero = costMoney({ estimated_amount: 500, actual_amount: 0, status: "estimate" });
  check("a typed zero on an estimate still counts as zero (no amount changes) but is flagged", zero.value === 0 && zero.zeroActualOnEstimate, zero);
  check("describeScope reads like a person", describeScope({ scope: "experience_year", year: 2027, experienceTitle: "NP7 Experience Alaçatı" }) === "Alaçatı · 2027"
    && describeScope({ scope: "general" }) === "General"
    && describeScope({ scope: "edition", experienceTitle: "NP7 Experience Bonaire", editionLabel: "Week I", editionYear: 2026 }) === "Bonaire · Week I · 2026");
}

console.log("\n── the § 25 rule from page 8, as a suggestion ──────");
{
  const s = (item: string, scope = "edition", notes: string | null = null) => suggestMarginClass(item, notes, scope)?.cls ?? null;
  check("a guest hotel is a Reisevorleistung", s("Hotel Normal Room") === "travel_input");
  check("the guests' shuttle is a Reisevorleistung", s("Daily shuttle hotel <-> windsurf center") === "travel_input");
  check("a coach bought in is a Reisevorleistung", s("External Coach - Femke") === "travel_input");
  check("Nico's own flight is Eigenleistung", s("Flights Nico (own)") === "own_service");
  check("the team's accommodation is Eigenleistung, own markers first", s("Team accommodation") === "own_service");
  check("camera work is Eigenleistung", s("Camera (incl. flight)") === "own_service");
  check("staff hours on a trip are Eigenleistung", s("Labour — Simona (2026-09)") === "own_service");
  check("administrative hours are Gemeinkosten, whichever letter case", s("Overhead Labour (2026-03)") === "overhead");
  check("software is Gemeinkosten", s("Notion subscription") === "overhead");
  check("a general cost is never a Reisevorleistung, even a hotel", s("Hotel", "general") !== "travel_input");
  check("a bare fee is not a bank charge (a coach fee is a coach)", s("Coach fee") === "travel_input");
  check("something the rule cannot place is left unsorted, not guessed", s("Lycra") === null);
}

console.log("\n── TWO · which cost line did this debit pay for? ──────");
{
  const cand = (over: Partial<CostCandidate>): CostCandidate => ({
    costId: "c-" + Math.random().toString(36).slice(2, 8), item: "External Coach - Femke", notes: null,
    scope: "edition", scopeLabel: "Bonaire · Week I · 2026", editionId: "e1", editionLabel: "Week I",
    experienceId: "x1", experienceTitle: "NP7 Experience Bonaire", place: "Bonaire", year: 2026,
    dateStart: "2026-11-30", dateEnd: "2026-12-06", status: "confirmed", marginClass: null, unplanned: false,
    estimated: 840, actual: null, attached: 0, open: 840, state: "expected", knownCounterparties: [],
    ...over,
  });
  const debit = (over: Partial<Parameters<typeof suggestCostsForDebit>[0]>) => ({
    amount: -840, currency: "EUR", counterparty: "SPARKASSE HOLSTEIN", reference: null, label: "transfer", bookedOn: "2026-11-02", ...over,
  });
  // The three-coaches case: the amount alone must never decide.
  const three = [cand({ editionId: "e1", editionLabel: "Week I" }), cand({ editionId: "e2", editionLabel: "Week II" }), cand({ editionId: "e3", editionLabel: "Week III" })];
  check("three lines at €840 and a nameless €840 debit: no suggestion at all", suggestCostsForDebit(debit({}), three).length === 0);
  const one = suggestCostsForDebit(debit({}), [three[0], cand({ estimated: 550, open: 550 })]);
  check("exactly one open line at this amount: offered, as 'possible' only", one.length === 1 && one[0].confidence === "possible" && one[0].candidate.costId === three[0].costId, one.map((m) => m.confidence));
  const named = suggestCostsForDebit(debit({ counterparty: "Femke van der Veen" }), three);
  check("a payee named in the line identifies it, on every week that names her", named.length === 3 && named.every((m) => m.reasons.some((r) => /Names/.test(r))), named.map((m) => m.reasons));
  const known = suggestCostsForDebit(debit({ counterparty: "Femke van der Veen" }), [three[0], cand({ editionId: "e2", editionLabel: "Week II", knownCounterparties: ["Femke van der Veen"] })]);
  check("a payee allocated to a trip before ranks that trip first", known[0]?.candidate.editionId === "e2", known.map((m) => [m.candidate.editionId, m.score]));
  const hotel = suggestCostsForDebit(
    debit({ amount: -3405, counterparty: "HOTEL PLAYA SUR TENERI", label: "card" }),
    [cand({ item: "Hotel", experienceTitle: "NP7 Experience Tenerife", place: "Tenerife", estimated: 7500.05, open: 3405, dateStart: "2026-02-14", dateEnd: "2026-02-21", scopeLabel: "Tenerife · 2026" })],
  );
  check("a card slip's truncated TENERI meets Tenerife", hotel.length === 1 && hotel[0].reasons.some((r) => /teneri/i.test(r)), hotel.map((m) => m.reasons));
  check("…and the suggested amount is exactly what the line still expects", hotel[0]?.suggestedAmount === 3405);
  const partial = suggestCostsForDebit(debit({ amount: -500, counterparty: "Femke van der Veen" }), [three[0]]);
  check("a debit smaller than the line places only itself and says what stays open", partial[0]?.suggestedAmount === 500 && partial[0].reasons.some((r) => /stay open/.test(r)), partial[0]);
  check("a cancelled line is never suggested", suggestCostsForDebit(debit({ counterparty: "Femke" }), [cand({ status: "cancelled" })]).length === 0);
  check("a line with nothing open is never suggested", suggestCostsForDebit(debit({ counterparty: "Femke" }), [cand({ open: 0, attached: 840 })]).length === 0);
  check("there is no auto-match on the debit side: a person allocates", !("autoMatchable" in (await import("@/lib/bank/cost-match"))));
  check("money in is never a cost", !isCostDebit({ amount: 2445, kind: "income" }));
  check("a Stripe payout is never a cost", !isCostDebit({ amount: -900, kind: "payout" }));
  check("an expense, a fee and an unknown debit can be", isCostDebit({ amount: -10, kind: "expense" }) && isCostDebit({ amount: -1, kind: "fee" }) && isCostDebit({ amount: -5, kind: "unknown" }));
  check("a debit set aside is out", !isCostDebit({ amount: -10, kind: "expense", ignored_at: "2026-09-01" }));
}

console.log("\n── the gates: every new path is claimed, and exposes money and costs ──────");
{
  for (const p of ["/api/admin/exp-costs/classify", "/api/admin/exp-costs/consequence", "/api/admin/exp-costs", "/admin/exp-costs"]) {
    const sec = sectionForPath(p);
    check(`${p} → exp_costs, exposing money + costs`, sec?.key === "exp_costs" && (SECTION_EXPOSES.exp_costs ?? []).includes("money") && (SECTION_EXPOSES.exp_costs ?? []).includes("costs"), sec?.key);
  }
  for (const p of ["/api/admin/bank/transactions", "/api/admin/bank/some-id", "/admin/bank"]) {
    const sec = sectionForPath(p);
    check(`${p} → bank, exposing money + costs`, sec?.key === "bank" && (SECTION_EXPOSES.bank ?? []).includes("money") && (SECTION_EXPOSES.bank ?? []).includes("costs"), sec?.key);
  }
  check("the cost routes stay owner-only for the legacy tiers", isOwnerOnlyPath("/api/admin/exp-costs/classify") && isOwnerOnlyPath("/admin/exp-costs") && isOwnerOnlyPath("/api/admin/bank/x"));
}

console.log("\n── ONE · the live rows obey the scope rules ──────");
type Row = {
  id: string; item: string; scope: string; edition_id: string | null; experience_id: string | null; year: number | null;
  scope_reason: string | null; status: string | null; estimated_amount: number | null; actual_amount: number | null;
  actual_provenance: string | null; actual_note: string | null; margin_class: string | null;
  exp_editions: { experience_id: string | null; year: number | null } | null;
};
const { data: rowsRaw, error: rowsErr } = await db.from("exp_costs").select("id, item, scope, edition_id, experience_id, year, scope_reason, status, estimated_amount, actual_amount, actual_provenance, actual_note, margin_class, exp_editions(experience_id, year)");
check("exp_costs reads with the 240 columns", !rowsErr, rowsErr?.message);
const rows = (rowsRaw ?? []) as Row[];
{
  const derived = (c: Row) => c.edition_id ? "edition" : c.experience_id ? "experience_year" : c.year != null ? "year" : "general";
  const wrongScope = rows.filter((c) => c.scope !== derived(c)
    || (c.scope === "edition" && (!c.experience_id || c.year != null))
    || (c.scope === "experience_year" && c.year == null)
    || (c.scope === "year" && c.experience_id));
  check(`every row's scope is exactly what its columns say (${rows.length} rows)`, wrongScope.length === 0, wrongScope.map((c) => c.item));
  const noReason = rows.filter((c) => c.scope !== "edition" && !(c.scope_reason ?? "").trim());
  check("every cost broader than one trip carries its reason", noReason.length === 0, noReason.map((c) => c.item));
  const staleReason = rows.filter((c) => c.scope === "edition" && c.scope_reason);
  check("no edition cost carries a stale reason", staleReason.length === 0, staleReason.length);
  const generalTravel = rows.filter((c) => c.scope === "general" && c.margin_class === "travel_input");
  check("no general cost is a Reisevorleistung", generalTravel.length === 0, generalTravel.map((c) => c.item));
  const wrongExp = rows.filter((c) => c.scope === "edition" && c.exp_editions && c.exp_editions.experience_id && c.experience_id !== c.exp_editions.experience_id);
  check("every edition cost carries its edition's own experience", wrongExp.length === 0, wrongExp.map((c) => c.item));
  const provMismatch = rows.filter((c) => (c.actual_amount === null) !== (c.actual_provenance === null));
  check("a typed actual always has a provenance, an untyped one never does", provMismatch.length === 0, provMismatch.map((c) => c.item));
  const badProv = rows.filter((c) => c.actual_provenance && !["off_bank", "unverified"].includes(c.actual_provenance));
  check("bank-backed money is never stored as a typed provenance", badProv.length === 0, badProv.map((c) => c.actual_provenance));
  const offBankNoNote = rows.filter((c) => c.actual_provenance === "off_bank" && !(c.actual_note ?? "").trim());
  check("every off-bank actual says where the number comes from", offBankNoNote.length === 0, offBankNoNote.map((c) => c.item));
  const badYear = rows.filter((c) => c.year != null && (c.year < 2000 || c.year > 2100));
  check("no year outside 2000..2100", badYear.length === 0);
  const staffUnsorted = rows.filter((c) => c.margin_class === null && /^(labour|overhead labour)/i.test(c.item));
  check("staff time sorts itself (migration 242)", staffUnsorted.length === 0, staffUnsorted.map((c) => c.item));
  const byScope: Record<string, number> = {};
  for (const c of rows) byScope[c.scope] = (byScope[c.scope] ?? 0) + 1;
  const byProv: Record<string, number> = {};
  for (const c of rows) byProv[c.actual_provenance ?? "none"] = (byProv[c.actual_provenance ?? "none"] ?? 0) + 1;
  console.log(`  · scopes ${JSON.stringify(byScope)} · typed actuals ${JSON.stringify(byProv)} · ${rows.filter((c) => c.margin_class === null && c.status !== "cancelled").length} still unsorted for § 25`);
}

console.log("\n── TWO · nothing is placed beyond what a payment or a debit holds ──────");
type Cpa = { cost_id: string; payment_id: string; amount: number | null; exp_payments: { id: string; amount: number | null; direction: string | null; provenance: string | null; bank_transaction_id: string | null } | null };
const { data: cpaRaw } = await db.from("exp_cost_payment_allocations").select("cost_id, payment_id, amount, exp_payments(id, amount, direction, provenance, bank_transaction_id)");
const cpa = (cpaRaw ?? []) as Cpa[];
{
  const perPayment = new Map<string, { used: number; amount: number }>();
  for (const a of cpa) {
    const cur = perPayment.get(a.payment_id) ?? { used: 0, amount: Number(a.exp_payments?.amount) || 0 };
    cur.used = r2(cur.used + (Number(a.amount) || 0));
    perPayment.set(a.payment_id, cur);
  }
  const overPay = [...perPayment.entries()].filter(([, v]) => v.used > v.amount + 0.01);
  check(`no payment is attached for more than it is (${cpa.length} attachments)`, overPay.length === 0, overPay);
  const notCost = cpa.filter((a) => a.exp_payments && a.exp_payments.direction !== "cost");
  check("only cost payments are attached to cost lines", notCost.length === 0, notCost.length);
  const bankNoTx = cpa.filter((a) => a.exp_payments?.provenance === "bank" && !a.exp_payments.bank_transaction_id);
  check("every attached bank-backed payment names its bank movement", bankNoTx.length === 0, bankNoTx.length);
  const negative = cpa.filter((a) => (Number(a.amount) || 0) <= 0);
  check("every attachment is a positive amount", negative.length === 0, negative.length);
}
type CostPay = { id: string; amount: number | null; date: string | null; received_at: string | null; created_at: string | null; provenance: string; bank_transaction_id: string | null; bank_transactions: { amount: number | null; kind: string | null } | null };
const { data: cpsRaw } = await db.from("exp_payments").select("id, amount, date, received_at, created_at, provenance, bank_transaction_id, bank_transactions(amount, kind)").eq("direction", "cost");
const cps = (cpsRaw ?? []) as CostPay[];
{
  const perTx = new Map<string, { placed: number; debit: number }>();
  for (const p of cps) {
    if (!p.bank_transaction_id) continue;
    const cur = perTx.get(p.bank_transaction_id) ?? { placed: 0, debit: Math.abs(Number(p.bank_transactions?.amount) || 0) };
    cur.placed = r2(cur.placed + (Number(p.amount) || 0));
    perTx.set(p.bank_transaction_id, cur);
  }
  const overDebit = [...perTx.entries()].filter(([, v]) => v.placed > v.debit + 0.01);
  check(`no debit is placed beyond what left the account (${perTx.size} debits placed)`, overDebit.length === 0, overDebit);
  const bankNoTx = cps.filter((p) => p.provenance === "bank" && !p.bank_transaction_id);
  check("every bank-backed cost payment names its movement", bankNoTx.length === 0, bankNoTx.length);
  const wrongKind = cps.filter((p) => p.bank_transactions && !["expense", "fee", "unknown"].includes(p.bank_transactions.kind ?? ""));
  check("a payout or an own transfer is never booked as a cost", wrongKind.length === 0, wrongKind.length);
  const day = (p: CostPay) => (p.date ?? p.received_at ?? p.created_at ?? "").slice(0, 10);
  const preCutover = cps.filter((p) => day(p) && day(p) < "2026-08-04" && p.provenance !== "bank" && p.provenance !== "legacy");
  check("cost money from before the 2026-08-04 cutover is legacy, not a to-do (migration 239)", preCutover.length === 0, preCutover.map((p) => [day(p), p.provenance]));
  const orphan = cps.filter((p) => p.provenance === "bank" && !cpa.some((a) => a.payment_id === p.id));
  check("no bank-backed cost payment is attached to nothing", orphan.length === 0, orphan.map((p) => p.id));
}

console.log("\n── THREE · the readers agree, per edition, to the cent ──────");
{
  const attached = new Map<string, { attached: number; bank: number }>();
  for (const a of cpa) {
    const cur = attached.get(a.cost_id) ?? { attached: 0, bank: 0 };
    cur.attached = r2(cur.attached + (Number(a.amount) || 0));
    if (a.exp_payments?.provenance === "bank") cur.bank = r2(cur.bank + (Number(a.amount) || 0));
    attached.set(a.cost_id, cur);
  }
  const { data: splitsRaw } = await db.from("exp_cost_allocations").select("cost_id, edition_id, percent");
  const splits = (splitsRaw ?? []) as { cost_id: string; edition_id: string; percent: number | null }[];
  const splitIds = new Set(splits.map((s) => s.cost_id));
  const editionIds = [...new Set([...rows.map((c) => c.edition_id).filter(Boolean) as string[], ...splits.map((s) => s.edition_id)])];

  // The margin record's buckets, from the code the § 25 page and the
  // consequence panel run.
  const buckets = await costBucketsByEdition(db, editionIds);

  // An independent sum: the exact rule /api/admin/editions/[id]/pnl has
  // always used, written out again here rather than imported.
  const oldRule = (c: Row) => {
    const paid = attached.get(c.id)?.attached ?? 0;
    if (paid > 0) return paid;
    return c.actual_amount != null ? Number(c.actual_amount) : Number(c.estimated_amount) || 0;
  };
  // And the ledger's rule, through costMoney(), which every page imports.
  const ledgerRule = (c: Row) => {
    const a = attached.get(c.id) ?? { attached: 0, bank: 0 };
    return costMoney(c, a.attached, a.bank).value;
  };
  const byId = new Map(rows.map((c) => [c.id, c]));
  let disagree = 0, checked = 0, travelOnGeneral = 0;
  for (const id of editionIds) {
    const b = buckets.get(id);
    const recordTotal = r2((b?.travelInput ?? 0) + (b?.ownService ?? 0) + (b?.overhead ?? 0) + (b?.unclassified ?? 0));
    let pnl = 0, ledger = 0;
    for (const c of rows) {
      if (c.edition_id !== id || c.status === "cancelled" || splitIds.has(c.id)) continue;
      pnl += oldRule(c); ledger += ledgerRule(c);
    }
    for (const s of splits) {
      if (s.edition_id !== id) continue;
      const c = byId.get(s.cost_id);
      if (!c || c.status === "cancelled") continue;
      pnl += oldRule(c) * (Number(s.percent) || 0) / 100;
      ledger += ledgerRule(c) * (Number(s.percent) || 0) / 100;
    }
    checked++;
    if (Math.abs(r2(pnl) - recordTotal) > 0.01 || Math.abs(r2(ledger) - recordTotal) > 0.01) {
      disagree++;
      console.log(`    · ${id}: P&L rule ${r2(pnl)} · ledger ${r2(ledger)} · margin record ${recordTotal}`);
    }
  }
  check(`the P&L rule, the cost ledger and the § 25 buckets agree on every edition (${checked} editions)`, disagree === 0, disagree);
  const stranded = rows.filter((c) => c.scope !== "edition" && c.margin_class === "travel_input" && c.status !== "cancelled" && !splitIds.has(c.id));
  for (const c of stranded) if (c.scope === "general") travelOnGeneral++;
  check("a Reisevorleistung off any trip is never silently spread: only a % split reaches an edition", travelOnGeneral === 0);
  console.log(`  · ${stranded.length} travel input(s) sit on a broader scope without a split; the § 25 record lists them as unassigned rather than dropping them`);
  const general = rows.filter((c) => c.scope === "general" || c.scope === "year");
  check("no general or yearly cost carries an edition, so no trip P&L can absorb it", general.every((c) => !c.edition_id));
  const sumEst = r2(rows.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0));
  const sumAct = r2(rows.reduce((s, c) => s + (Number(c.actual_amount) || 0), 0));
  console.log(`  · Σ estimated ${sumEst} · Σ typed actual ${sumAct} · ${rows.length} lines (2026-09-12 after 240 + 242: 114486.71 · 38353.71 · 244)`);
}

console.log(`\n${fail === 0 ? "ALL GREEN" : "✗"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
