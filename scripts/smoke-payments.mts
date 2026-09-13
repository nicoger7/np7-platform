/**
 * Payments: one section, one feed, one back-door. Checked against the code
 * and the live books.
 *
 * Nico, 2026-09-13: "bank and payments are one thing basically. From now on
 * payments can pretty much only be via the bank (with that little back-door)."
 * This asserts what that turned into:
 *
 *   ONE    /admin/bank redirects, the nav has one entry, and the old free-form
 *          "New Payment" door is gone from the page and from the routes
 *   TWO    the feed and the booked rows are ONE section, `payments`: the
 *          manager tier is refused, the owner is not, a granular role can be
 *          given it (view reaches, edit writes), a role still saying `bank` is
 *          folded in, and the real roles in the database behave
 *   THREE  the live rows obey the labels: every off-bank row has its reason,
 *          every bank row names its movement, legacy rows are pre-switch and
 *          never in the to-match pile, no credit is allocated beyond what it
 *          holds, and the unverified queue lists neither legacy nor internal
 *          allocation rows
 *   FOUR   the pure rules: which credit a hand-typed row can be, what adoption
 *          refuses, and what the back-door accepts
 *
 * Read-only. Writes nothing.
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-payments.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  SECTIONS, SECTION_EXPOSES, sectionForPath, isOwnerOnlyPath, canAccess,
  effectiveCanAccess, effectiveCanWrite, normalizeAccess, builtinAccess, type EffectiveAccess,
} from "@/lib/access";
import {
  suggestTransactionsForPayment, adoptCheck, validateOffBank, isAllocationRef, loadUnverifiedQueue,
  type CreditLike, type PaymentLike,
} from "@/lib/bank/adopt";
import { OFF_BANK_METHODS, isOffBankMethod } from "@/lib/bank/off-bank-methods";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; }
  else { console.log(`  ✗ ${n}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const SWITCH = "2026-08-04";

console.log("\n── ONE · the redirect, the nav, the closed door ──────────────────────────");
{
  const redirect = readFileSync("src/app/admin/bank/page.tsx", "utf8");
  check("/admin/bank is a permanent redirect to /admin/payments", /permanentRedirect\("\/admin\/payments"\)/.test(redirect));
  check("…rendered on the server (no \"use client\")", !/use client/.test(redirect));
  const shell = readFileSync("src/app/admin/admin-shell.tsx", "utf8");
  check("the nav has no Bank entry any more", !/href: "\/admin\/bank"/.test(shell));
  check("…and exactly one Payments entry", (shell.match(/href: "\/admin\/payments"/g) ?? []).length === 1, (shell.match(/href: "\/admin\/payments"/g) ?? []).length);
  const page = readFileSync("src/app/admin/payments/page.tsx", "utf8");
  // The old page rendered a "New Payment" button and a free-form save; the
  // new one may MENTION the old door in a comment, it must not render it.
  check("the page renders no free-form New Payment button", !/>\s*New Payment\s*</.test(page) && !/startNew|emptyForm/.test(page) && /off-bank/i.test(page));
  const postAll = readFileSync("src/app/api/admin/payments/route.ts", "utf8");
  check("POST /api/admin/payments writes only through the off-bank door", /recordOffBankPayment/.test(postAll) && !/\.insert\(/.test(postAll));
  const postBooking = readFileSync("src/app/api/admin/bookings/[id]/payments/route.ts", "utf8");
  check("POST /api/admin/bookings/[id]/payments does too", /recordOffBankPayment/.test(postBooking) && !/\.insert\(/.test(postBooking));
  check("…and the in-booking connect goes through matchToInvoice", /matchToInvoice/.test(readFileSync("src/app/api/admin/bookings/[id]/payments/bank/route.ts", "utf8")));
}

console.log("\n── TWO · one section, `payments` ─────────────────────────────────────────");
{
  check("no section is keyed `bank` any more", !SECTIONS.some((s) => s.key === "bank"));
  const paths = ["/admin/bank", "/api/admin/bank/transactions", "/api/admin/bank/some-id", "/api/admin/bank/sync", "/admin/payments", "/api/admin/payments", "/api/admin/payments/some-id"];
  for (const p of paths) {
    const sec = sectionForPath(p);
    check(`${p} → payments`, sec?.key === "payments", sec?.key);
    check(`${p} is owner-only for the legacy tiers`, isOwnerOnlyPath(p));
    check(`${p}: manager tier refused`, !canAccess("manager", p));
    check(`${p}: owner allowed`, canAccess("owner", p));
  }
  check("the section exposes money AND costs (the feed shows what NP7 pays out)",
    (SECTION_EXPOSES.payments ?? []).includes("money") && (SECTION_EXPOSES.payments ?? []).includes("costs"), SECTION_EXPOSES.payments);
  check("nothing else claims a feed path", !SECTIONS.some((s) => s.key !== "payments" && s.paths.some((p) => p.startsWith("/admin/bank") || p.startsWith("/api/admin/bank"))));

  const view: EffectiveAccess = { kind: "role", access: normalizeAccess({ worlds: ["experience"], sections: { payments: "view" }, fields: {} }) };
  const edit: EffectiveAccess = { kind: "role", access: normalizeAccess({ worlds: ["experience"], sections: { payments: "edit" }, fields: {} }) };
  const none: EffectiveAccess = { kind: "role", access: normalizeAccess({ worlds: ["experience"], sections: { bookings: "edit" }, fields: {} }) };
  check("a granular role with payments:view reaches the feed", effectiveCanAccess(view, "/admin/bank") && effectiveCanAccess(view, "/api/admin/bank/transactions"));
  check("…and the booked rows", effectiveCanAccess(view, "/admin/payments") && effectiveCanAccess(view, "/api/admin/payments"));
  check("…but cannot connect or record", !effectiveCanWrite(view, "/api/admin/bank/x") && !effectiveCanWrite(view, "/api/admin/payments"));
  check("payments:edit can connect and record", effectiveCanWrite(edit, "/api/admin/bank/x") && effectiveCanWrite(edit, "/api/admin/payments") && effectiveCanWrite(edit, "/api/admin/payments/x"));
  check("a role without the section reaches neither page", !effectiveCanAccess(none, "/admin/payments") && !effectiveCanAccess(none, "/admin/bank"));

  const folded = normalizeAccess({ worlds: ["experience"], sections: { bank: "edit" }, fields: {} });
  check("a stored role still saying bank:edit is folded into payments:edit", folded.sections.payments === "edit" && !("bank" in folded.sections), folded.sections);
  const kept = normalizeAccess({ worlds: ["experience"], sections: { bank: "view", payments: "edit" }, fields: {} });
  check("…and never lowers a higher payments grant", kept.sections.payments === "edit", kept.sections);
  const lifted = normalizeAccess({ worlds: ["experience"], sections: { bank: "edit", payments: "view" }, fields: {} });
  check("…while a higher bank grant lifts it (whoever saw the feed still sees it)", lifted.sections.payments === "edit", lifted.sections);
  check("the folded role reaches the merged page", effectiveCanAccess({ kind: "role", access: folded }, "/admin/payments"));

  const manager: EffectiveAccess = { kind: "role", access: builtinAccess("manager") };
  const owner: EffectiveAccess = { kind: "role", access: builtinAccess("owner") };
  check("built-in Manager is refused the feed and the rows", !effectiveCanAccess(manager, "/admin/bank") && !effectiveCanAccess(manager, "/admin/payments"));
  check("built-in Owner reaches both", effectiveCanAccess(owner, "/admin/bank") && effectiveCanAccess(owner, "/admin/payments"));

  const { data: roles } = await db.from("team_roles").select("name, system_key, access");
  const byName = new Map((roles ?? []).map((r: { name: string; system_key: string | null; access: unknown }) => [r.name, r]));
  check("no stored role carries a `bank` grant (migration 243)", !(roles ?? []).some((r: { access: { sections?: Record<string, string> } }) => r.access?.sections && "bank" in r.access.sections));
  const real = (name: string): EffectiveAccess | null => {
    const r = byName.get(name) as { system_key: string | null; access: unknown } | undefined;
    if (!r) return null;
    return { kind: "role", access: r.system_key ? builtinAccess(r.system_key) : normalizeAccess(r.access) };
  };
  const media = real("NP7 Experience Media");
  if (media) check("NP7 Experience Media (real role) is refused", !effectiveCanAccess(media, "/admin/payments") && !effectiveCanAccess(media, "/api/admin/bank/transactions"));
  const adminRole = real("Admin");
  if (adminRole) check("Admin (real role) reaches and edits", effectiveCanAccess(adminRole, "/admin/bank") && effectiveCanWrite(adminRole, "/api/admin/payments"));
  const perf = real("NP7 Performance Team");
  if (perf) check("NP7 Performance Team (real role) is refused: wrong world", !effectiveCanAccess(perf, "/admin/payments"));
}

console.log("\n── THREE · the live rows obey the labels ─────────────────────────────────");
type Pay = { id: string; amount: number | string | null; direction: string | null; reference: string | null; provenance: string; off_bank_reason: string | null; bank_transaction_id: string | null; date: string | null; received_at: string | null; created_at: string | null; booking_id: string | null };
type Tx = { id: string; amount: number | string; kind: string; payment_id: string | null; matched_at: string | null; ignored_at: string | null };
{
  const { data: pays } = await db.from("exp_payments").select("id, amount, direction, reference, provenance, off_bank_reason, bank_transaction_id, date, received_at, created_at, booking_id");
  const { data: txs } = await db.from("bank_transactions").select("id, amount, kind, payment_id, matched_at, ignored_at");
  const P: Pay[] = pays ?? []; const T: Tx[] = txs ?? [];
  const txById = new Map(T.map((t) => [t.id, t]));
  const by = (prov: string) => P.filter((p) => p.provenance === prov);
  const counts = Object.fromEntries(["bank", "off_bank", "unverified", "legacy"].map((k) => [k, by(k).length]));
  console.log(`  · ${P.length} payments: ${JSON.stringify(counts)} · ${T.length} transactions`);

  check("every row carries one of the four labels", P.every((p) => ["bank", "off_bank", "unverified", "legacy"].includes(p.provenance)));
  const offNoReason = by("off_bank").filter((p) => !(p.off_bank_reason ?? "").trim());
  check("every off-bank row has a reason", offNoReason.length === 0, offNoReason.map((p) => p.id));
  const bankNoTx = by("bank").filter((p) => !p.bank_transaction_id);
  check("every bank row names a transaction (migration 243)", bankNoTx.length === 0, bankNoTx.map((p) => p.id));
  const bankBadTx = by("bank").filter((p) => p.bank_transaction_id && !txById.has(p.bank_transaction_id));
  check("…and that transaction exists", bankBadTx.length === 0, bankBadTx.map((p) => p.id));
  const bankWrongSign = by("bank").filter((p) => {
    const t = p.bank_transaction_id ? txById.get(p.bank_transaction_id) : null;
    if (!t) return false;
    return p.direction === "cost" ? Number(t.amount) >= 0 : Number(t.amount) <= 0;
  });
  check("a revenue row names a credit, a cost row names a debit", bankWrongSign.length === 0, bankWrongSign.map((p) => p.id));

  const day = (p: Pay) => (p.date ?? p.received_at ?? p.created_at ?? "").slice(0, 10);
  const legacyLate = by("legacy").filter((p) => day(p) >= SWITCH);
  check(`every legacy row is dated before the switch (${SWITCH})`, legacyLate.length === 0, legacyLate.map((p) => [p.id, day(p)]));
  const legacyLinked = by("legacy").filter((p) => p.bank_transaction_id);
  check("no legacy row is tied to the feed", legacyLinked.length === 0, legacyLinked.map((p) => p.id));

  const toMatch = T.filter((t) => Number(t.amount) > 0 && (t.kind === "income" || t.kind === "unknown") && !t.payment_id && !t.matched_at && !t.ignored_at);
  const namedByLegacy = new Set(by("legacy").map((p) => p.bank_transaction_id).filter(Boolean));
  check(`the to-match pile (${toMatch.length} credits) has no legacy money in it`, !toMatch.some((t) => namedByLegacy.has(t.id)));

  // Never over-allocated: what a movement's payments add up to fits inside it.
  const sumBy = new Map<string, number>();
  for (const p of P) if (p.bank_transaction_id) sumBy.set(p.bank_transaction_id, r2((sumBy.get(p.bank_transaction_id) ?? 0) + (Number(p.amount) || 0)));
  const over = [...sumBy].filter(([id, sum]) => { const t = txById.get(id); return t ? sum > Math.abs(Number(t.amount)) + 0.01 : false; });
  check("no movement is allocated beyond what it holds", over.length === 0, over);
  const connected = T.filter((t) => t.payment_id || t.matched_at);
  const emptyConnected = connected.filter((t) => !sumBy.has(t.id));
  check(`every connected movement (${connected.length}) carries at least one payment row`, emptyConnected.length === 0, emptyConnected.map((t) => t.id));
  const payoutMatched = T.filter((t) => (t.kind === "payout" || t.kind === "transfer") && (t.payment_id || t.matched_at));
  check("no Stripe payout or own transfer was ever booked as money", payoutMatched.length === 0, payoutMatched.map((t) => t.id));

  const queue = await loadUnverifiedQueue();
  const queueIds = new Set(queue.rows.map((r) => r.id));
  console.log(`  · unverified queue: ${queue.rows.length} rows to decide, ${queue.allocationRows} internal allocation rows left out`);
  check("the queue lists no legacy row", !by("legacy").some((p) => queueIds.has(p.id)));
  check("the queue lists no bank or off-bank row", !P.some((p) => (p.provenance === "bank" || p.provenance === "off_bank") && queueIds.has(p.id)));
  check("the queue lists no internal allocation row", !queue.rows.some((r) => isAllocationRef(r.reference)));
  check("every unverified non-allocation row is in the queue", by("unverified").filter((p) => !isAllocationRef(p.reference)).every((p) => queueIds.has(p.id)));
  const badSugg = queue.rows.flatMap((r) => r.suggestions.filter((s) => {
    const t = txById.get(s.transactionId);
    if (!t || t.payment_id || t.matched_at || t.ignored_at || Number(t.amount) <= 0) return true;
    return Math.abs((Number(t.amount) - (s.transaction.allocated ?? 0)) - r.amount) > 0.01;
  }));
  check("every suggestion names an unmatched credit holding exactly the row's amount", badSugg.length === 0, badSugg.map((s) => s.transactionId));
  check("a cost-direction row gets no bank suggestion", queue.rows.filter((r) => r.direction === "cost").every((r) => r.suggestions.length === 0));
}

console.log("\n── FOUR · the pure rules ─────────────────────────────────────────────────");
{
  const credit = (over: Partial<CreditLike>): CreditLike => ({
    id: "tx-" + Math.random().toString(36).slice(2, 8), source: "qonto", external_id: "np7-gmbh-1496-1-transaction-abc",
    booked_on: "2026-08-15", amount: 2445, counterparty: "MEIJER J", reference: null, label: null, ...over,
  });
  const row = (over: Partial<PaymentLike>): PaymentLike => ({
    id: "p1", amount: 2445, direction: "revenue", reference: null, on: "2026-08-15", guestName: "Jan Meijer", invoiceNumber: "NP7-XP-2026-0043", ...over,
  });

  {
    const stripe = credit({ source: "stripe", external_id: "pi_3UAFGtGgTgsQzsXU0N0OyoSv", amount: 750, counterparty: "Someone Else" });
    const m = suggestTransactionsForPayment(row({ amount: 750, reference: "pi_3UAFGtGgTgsQzsXU0N0OyoSv", guestName: "Nobody Named" }), [stripe, credit({ amount: 750 })]);
    check("the Stripe intent on the row IS the transaction's id → exact", m[0]?.transactionId === stripe.id && m[0].confidence === "exact", m.map((x) => x.confidence));
  }
  {
    const c = credit({ reference: "Zahlung NP7-XP-2026-0043 Bonaire", counterparty: "UNRELATED NAME" });
    const m = suggestTransactionsForPayment(row({ reference: "NP7-XP-2026-0043", guestName: "X" }), [c]);
    check("the invoice number typed as the reference, quoted by the transfer → exact", m[0]?.confidence === "exact", m[0]);
  }
  {
    const c = credit({ counterparty: "JAN MEIJER" });
    const m = suggestTransactionsForPayment(row({}), [c]);
    check("same amount and the payer's name → offered, with 'Paid by'", m.length === 1 && m[0].reasons.some((r) => r.startsWith("Paid by")), m[0]?.reasons);
    check("…but only as strong/possible, never exact", m[0]?.confidence !== "exact");
  }
  {
    const two = [credit({ id: "a", counterparty: "SOMEONE" }), credit({ id: "b", counterparty: "ELSE" })];
    const m = suggestTransactionsForPayment(row({ guestName: "Nobody Here" }), two);
    check("two credits of the amount and nothing naming the guest → offers nobody", m.length === 0, m);
  }
  {
    const one = [credit({ id: "only", counterparty: "SOMEONE", booked_on: "2026-08-20" })];
    const m = suggestTransactionsForPayment(row({ guestName: "Nobody Here" }), one);
    check("exactly one credit of the amount within a fortnight → 'possible'", m.length === 1 && m[0].confidence === "possible", m);
    const far = suggestTransactionsForPayment(row({ guestName: "Nobody Here", on: "2026-06-01" }), one);
    check("…and not when it is months away", far.length === 0, far);
  }
  {
    const c = credit({ source: "stripe", external_id: "pi_ABCDEFGH123", amount: 2440 });
    const m = suggestTransactionsForPayment(row({ reference: "pi_ABCDEFGH123" }), [c]);
    check("an amount that does not agree to the cent is never offered, even with the intent id", m.length === 0, m);
  }
  {
    const c = credit({ amount: 6650, allocated: 4205, counterparty: "MÄNTYNEN MINNA" });
    const m = suggestTransactionsForPayment(row({ amount: 2445, guestName: "Minna Mäntynen" }), [c]);
    check("a partly placed movement offers what it still holds", m.length === 1, m);
    const n = suggestTransactionsForPayment(row({ amount: 6650, guestName: "Minna Mäntynen" }), [c]);
    check("…not its face value", n.length === 0, n);
  }
  check("a cost row is never adopted onto a credit", suggestTransactionsForPayment(row({ direction: "cost" }), [credit({ counterparty: "JAN MEIJER" })]).length === 0);
  check("an internal allocation row is never adopted", suggestTransactionsForPayment(row({ reference: "alloc#ced1:Tim→Cameron" }), [credit({ counterparty: "JAN MEIJER" })]).length === 0);

  const tx = { amount: 2445, kind: "income", ignored_at: null };
  const base = { provenance: "unverified", bank_transaction_id: null, direction: "revenue", amount: 2445, reference: "217" };
  const ok = adoptCheck({ payment: base, transaction: tx, alreadyAllocated: 0 });
  check("adoption of a clean row onto its movement is allowed, nothing left", ok.ok && ok.remaining === 0, ok);
  const part = adoptCheck({ payment: { ...base, amount: 2000 }, transaction: tx, alreadyAllocated: 0 });
  check("a smaller row leaves the rest of the movement to place", part.ok && part.remaining === 445, part);
  check("refused: a legacy row", !adoptCheck({ payment: { ...base, provenance: "legacy" }, transaction: tx, alreadyAllocated: 0 }).ok);
  check("refused: a row already naming a movement", !adoptCheck({ payment: { ...base, bank_transaction_id: "x" }, transaction: tx, alreadyAllocated: 0 }).ok);
  check("refused: a cost row", !adoptCheck({ payment: { ...base, direction: "cost" }, transaction: tx, alreadyAllocated: 0 }).ok);
  check("refused: an internal allocation row", !adoptCheck({ payment: { ...base, reference: "alloc#x:a→b" }, transaction: tx, alreadyAllocated: 0 }).ok);
  check("refused: a movement set aside", !adoptCheck({ payment: base, transaction: { ...tx, ignored_at: "2026-09-01" }, alreadyAllocated: 0 }).ok);
  check("refused: a debit", !adoptCheck({ payment: base, transaction: { ...tx, amount: -2445 }, alreadyAllocated: 0 }).ok);
  check("refused: a Stripe payout", !adoptCheck({ payment: base, transaction: { ...tx, kind: "payout" }, alreadyAllocated: 0 }).ok);
  const overAsk = adoptCheck({ payment: base, transaction: tx, alreadyAllocated: 1000 });
  check("refused, with the figures: more than the movement still holds", !overAsk.ok && /1445\.00/.test(overAsk.ok ? "" : overAsk.error), overAsk);

  const good = validateOffBank({ bookingId: "b", amount: "150", date: "2026-09-01", method: "cash", reason: "paid cash at the centre" });
  check("the back-door takes a booking, an amount, a method and a reason", good.ok && good.row.amount === 150 && good.row.method === "cash" && good.row.date === "2026-09-01", good);
  check("refused: no reason", !validateOffBank({ bookingId: "b", amount: 150, method: "cash", reason: "" }).ok);
  check("refused: a reason of two characters", !validateOffBank({ bookingId: "b", amount: 150, method: "cash", reason: "ok" }).ok);
  check("refused: 'bank_transfer' is not an off-bank method", !validateOffBank({ bookingId: "b", amount: 150, method: "bank_transfer", reason: "typed it" }).ok && !isOffBankMethod("bank_transfer"));
  check("refused: no booking and no invoice", !validateOffBank({ amount: 150, method: "cash", reason: "cash at the centre" }).ok);
  check("refused: zero or negative amount", !validateOffBank({ bookingId: "b", amount: 0, method: "cash", reason: "cash" }).ok && !validateOffBank({ bookingId: "b", amount: -5, method: "cash", reason: "cash" }).ok);
  check("refused: a date in the future", !validateOffBank({ bookingId: "b", amount: 150, method: "cash", reason: "cash at the centre", date: "2099-01-01" }).ok);
  check("refused: a date that is not one", !validateOffBank({ bookingId: "b", amount: 150, method: "cash", reason: "cash at the centre", date: "yesterday" }).ok);
  const today = validateOffBank({ bookingId: "b", amount: 150, method: "surfcenter", reason: "wired to the old account" });
  check("no date means today", today.ok && today.row.date === new Date().toISOString().slice(0, 10), today);
  check("four methods, and only four", OFF_BANK_METHODS.length === 4 && ["cash", "surfcenter", "offset", "other"].every(isOffBankMethod));
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL GREEN — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
