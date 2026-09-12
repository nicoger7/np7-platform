/**
 * Storno and credit note, checked against the live books and the rules.
 *
 * Read-only. Writes nothing, issues nothing, mails nothing. It asserts:
 *   - every correction in the books names an issued tax invoice on its own
 *     booking, is stored negative, and never credits more than the invoice
 *   - the gapless sequence, corrections included, has no holes and the
 *     counter is not behind it
 *   - the summary maths treats a Storno as negative revenue, not "cancelled"
 *   - the correction door is owner-only and belongs to the Finance section
 *   - the rules refuse the wrong thing (pro-forma, cancelled, already
 *     reversed, over-credit) on synthetic rows
 *   - both PDFs render, in the words the law uses
 *   - the guest mail for a correction never asks for a bank transfer
 *
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-storno.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildCreditNoteDocument } from "@/lib/invoices/template";
import type { CompanySettings } from "@/lib/invoices/types";
import {
  correctionsByOriginal,
  correctionState,
  correctionAllowance,
  summarizeDocuments,
  sequenceChecks,
  nestCorrections,
  docKind,
  isTaxInvoiceDoc,
  type DocLike,
} from "@/lib/invoices/corrections";
import { isOwnerOnlyPath, sectionForPath } from "@/lib/access";
import { TEMPLATES } from "@/lib/email/templates";
import { AUTOMATIONS } from "@/lib/email/automations";
import { DEFAULT_BODIES, DEFAULT_SUBJECTS } from "@/lib/email/default-bodies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;

let pass = 0, fail = 0;
const check = (n: string, c: boolean, got?: unknown) => {
  if (c) { console.log(`  ✓ ${n}`); pass++; }
  else { console.log(`  ✗ ${n}  got: ${JSON.stringify(got)}`); fail++; }
};
const note = (s: string) => console.log(`  · ${s}`);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Doc = DocLike & { division: string; contact_id: string | null };

// ── the books ────────────────────────────────────────────────────────────────
const { data: all } = await db.from("documents").select("id, booking_id, contact_id, division, type, invoice_number, amount, status, issued_at, created_at, sent_at, paid_at, meta").order("created_at");
const docs: Doc[] = all ?? [];
const numbered = docs.filter((d) => (isTaxInvoiceDoc(d) || d.type === "credit_note"));
const credits = docs.filter((d) => d.type === "credit_note");
const liveCredits = credits.filter((d) => d.status === "issued");
console.log(`\n── the books: ${docs.length} documents, ${numbered.length} numbered, ${credits.length} corrections (${liveCredits.length} live) ──`);

const byId = new Map(docs.map((d) => [d.id, d]));
for (const c of liveCredits) {
  const m = (c.meta ?? {}) as { original_document_id?: string; original_invoice_number?: string; full?: boolean; reason?: string };
  const orig = m.original_document_id ? byId.get(m.original_document_id) : undefined;
  check(`${c.invoice_number}: stored negative`, Number(c.amount) < 0, c.amount);
  check(`${c.invoice_number}: names an existing invoice`, !!orig, m.original_document_id);
  if (!orig) continue;
  check(`${c.invoice_number}: the invoice it names is an issued tax invoice`, isTaxInvoiceDoc(orig) && orig.status === "issued", { type: orig.type, status: orig.status });
  check(`${c.invoice_number}: same booking as ${orig.invoice_number}`, c.booking_id === orig.booking_id, { c: c.booking_id, o: orig.booking_id });
  check(`${c.invoice_number}: printed reference matches`, m.original_invoice_number === orig.invoice_number, m.original_invoice_number);
  check(`${c.invoice_number}: carries a reason`, !!m.reason && m.reason.trim().length > 0);
  const series = (n: string | null) => (n ?? "").replace(/-\d+$/, "");
  check(`${c.invoice_number}: same number series as ${orig.invoice_number}`, series(c.invoice_number) === series(orig.invoice_number), { c: c.invoice_number, o: orig.invoice_number });
}

const byOriginal = correctionsByOriginal(docs);
for (const inv of docs.filter((d) => isTaxInvoiceDoc(d) && d.status === "issued" && byOriginal.has(d.id))) {
  const st = correctionState(inv, byOriginal);
  check(`${inv.invoice_number}: corrections (${st.credited}) never exceed the invoice (${inv.amount})`, st.credited <= r2(Number(inv.amount)) + 0.005, st);
  check(`${inv.invoice_number}: at most one Storno stands against it`, st.credits.filter((c) => (c.meta as { full?: boolean } | null)?.full === true).length <= 1);
  note(`${inv.invoice_number} ${inv.type} ${inv.amount} → credited ${st.credited}, net ${st.net}, ${st.reversed ? "REVERSED" : "stands"}`);
}

// ── the sequence ─────────────────────────────────────────────────────────────
console.log("\n── the sequence, corrections included ──");
for (const c of sequenceChecks(numbered)) {
  check(`${c.division} ${c.year}: ${String(c.first).padStart(4, "0")}…${String(c.last).padStart(4, "0")} has no gaps (${c.count} numbers)`, c.missing.length === 0, c.missing);
}
const { data: counters } = await db.from("invoice_counters").select("*");
for (const c of counters ?? []) {
  const highest = Math.max(0, ...numbered
    .filter((d) => d.division === c.division && /-(\d{4})-(\d+)$/.exec(d.invoice_number ?? "")?.[1] === String(c.year))
    .map((d) => Number(/-(\d+)$/.exec(d.invoice_number ?? "")?.[1] ?? 0)));
  check(`${c.division} ${c.year}: counter ${c.last_number} is not behind the highest number ${highest}`, Number(c.last_number) >= highest);
}
// The numbers a correction spent are in the same list as the invoices'.
check("every live correction sits inside the invoice series", liveCredits.every((c) => /-(\d{4})-(\d+)$/.test(c.invoice_number ?? "")), liveCredits.map((c) => c.invoice_number));

// ── the maths the Invoices page shows ────────────────────────────────────────
console.log("\n── summary maths: a Storno is negative revenue ──");
const live = docs.filter((d) => d.status === "issued");
const charges = r2(live.filter(isTaxInvoiceDoc).reduce((s, d) => s + Number(d.amount ?? 0), 0));
const creditAbs = r2(live.filter((d) => d.type === "credit_note").reduce((s, d) => s + Math.abs(Number(d.amount ?? 0)), 0));
const t = summarizeDocuments(docs, docs);
check(`invoiced (net) ${t.invoiced} = charges ${charges} − corrections ${creditAbs}`, Math.abs(t.invoiced - (charges - creditAbs)) < 0.01, t);
check(`reversed card is negative when corrections exist (${t.reversed})`, liveCredits.length === 0 || t.reversed < 0, t.reversed);
check("settled + open never double-count a reversed invoice", t.settled + t.open <= t.invoiced + 0.01, { settled: t.settled, open: t.open, invoiced: t.invoiced });
// The Invoices pill alone must still read net of a Storno it does not show.
const invoicesOnly = docs.filter((d) => docKind(d) === "invoice");
const tv = summarizeDocuments(invoicesOnly, docs);
check(`the Invoices view reads net of corrections it hides (${tv.invoiced} = ${t.invoiced})`, Math.abs(tv.invoiced - t.invoiced) < 0.01, tv);
const nested = nestCorrections(docs.filter((d) => d.booking_id));
check("every correction with a known original nests under it", nested.every(({ doc }) => !(doc.type === "credit_note" && byId.has(String((doc.meta as { original_document_id?: string } | null)?.original_document_id)))));

// ── what settleInvoices will say, per booking with a correction ──────────────
console.log("\n── a correction settles the invoice it names ──");
for (const bookingId of new Set(liveCredits.map((c) => c.booking_id).filter(Boolean) as string[])) {
  const mine = docs.filter((d) => d.booking_id === bookingId && d.status === "issued" && isTaxInvoiceDoc(d));
  const { data: pays } = await db.from("exp_payments").select("amount,type,direction,status,document_id").eq("booking_id", bookingId);
  const received = r2((pays ?? []).filter((p: { direction: string | null; status: string | null }) => p.direction !== "cost" && p.status === "paid")
    .reduce((s: number, p: { amount: number | null; type: string | null }) => s + (p.type === "refund" ? -1 : 1) * Number(p.amount ?? 0), 0));
  for (const inv of mine) {
    const st = correctionState(inv, byOriginal);
    const currently = inv.paid_at ? "paid" : "open";
    const shouldBe = st.reversed ? "reversed (no paid stamp)" : received + 0.005 >= st.net ? "paid" : "open";
    note(`${inv.invoice_number} ${inv.type} ${inv.amount}: net ${st.net}, money on booking ${received} → reads "${currently}" now; the settle rule says "${shouldBe}"`);
    if ((currently === "paid") !== (shouldBe === "paid")) {
      note(`   ↳ stamp will change on the next settle of this booking (a payment write, a document issue, or a correction). Nothing here writes it.`);
    }
  }
}

// ── the door ─────────────────────────────────────────────────────────────────
console.log("\n── the correction door is money, and gated like money ──");
const door = "/api/admin/documents/2f4a2a5c-0000-4000-8000-000000000000/credit-note";
check("POST …/documents/:id/credit-note is owner-only", isOwnerOnlyPath(door));
check("…and belongs to the Finance/documents section", sectionForPath(door)?.key === "documents", sectionForPath(door)?.key);
check("the correction dialog's page is owner-only too", isOwnerOnlyPath("/admin/documents"));
check("the old bookings-section door is gone from disk", !existsSync("src/app/api/admin/bookings/[id]/credit-note/route.ts"));
check("the route file exists", existsSync("src/app/api/admin/documents/[id]/credit-note/route.ts"));

// ── the rules, on synthetic rows ─────────────────────────────────────────────
console.log("\n── the rules refuse the wrong thing ──");
const mk = (over: Partial<DocLike> & { id: string }): DocLike => ({ type: "final_invoice", status: "issued", amount: 1000, invoice_number: `NP7-XP-2026-${over.id.padStart(4, "0")}`, meta: {}, ...over });
const inv = mk({ id: "1" });
const pf = mk({ id: "2", type: "proforma_invoice", invoice_number: "PF-NP7-XP-2026-ABC-DP" });
const voided = mk({ id: "3", status: "void" });
const stornoOf1 = mk({ id: "4", type: "credit_note", amount: -1000, meta: { original_document_id: "1", full: true } });
const inv5 = mk({ id: "5" });
const partOf5 = mk({ id: "6", type: "credit_note", amount: -300, meta: { original_document_id: "5", full: false } });
const map = correctionsByOriginal([inv, pf, voided, stornoOf1, inv5, partOf5]);
check("a pro-forma cannot be corrected", !!correctionAllowance(pf, map).blocker, correctionAllowance(pf, map));
check("a cancelled number cannot be reversed", !!correctionAllowance(voided, map).blocker);
check("a correction cannot itself be corrected", !!correctionAllowance(stornoOf1, map).blocker);
check("an invoice reversed by a Storno is refused a second one", !!correctionAllowance(inv, map).blocker, correctionAllowance(inv, map).blocker);
const a5 = correctionAllowance(inv5, map);
check("after a partial credit, Storno is off and the remainder is creditable", !a5.blocker && !a5.canStorno && a5.canCredit && a5.remaining === 700, a5);
const fresh = correctionAllowance(mk({ id: "7" }), map);
check("an untouched invoice can take either", !fresh.blocker && fresh.canStorno && fresh.canCredit && fresh.remaining === 1000, fresh);

// ── the paper ────────────────────────────────────────────────────────────────
console.log("\n── the paper ──");
const company: CompanySettings = {
  division: "experience", legal_name: "NP7 GmbH", address_line1: "Graskamp 8", address_line2: null, postal_code: "24217", city: "Schönberg", country: "DE",
  email: null, phone: null, website: null, vat_id: "DE352850142", tax_number: null, register_info: null, managing_director: null, iban: null, bic: null, bank_name: null,
  logo_url: null, currency: "EUR", vat_mode: "margin", vat_rate: null, invoice_prefix: "NP7-XP", invoice_footer: null, terms_url: null,
  sicherungsschein_insurer: null, sicherungsschein_number: null, gs1_prefix: null,
};
const base = {
  company, invoiceNumber: "NP7-XP-2026-0099", invoiceDate: "2026-09-12",
  original: { number: "NP7-XP-2026-0039", date: "2026-08-31", amount: 1820 },
  currency: "EUR",
  contact: { name: "Test Rider", billingAddress: null, billingPostalCode: null, billingCity: null, billingCountry: null, email: null },
  experience: { title: "Bonaire" }, edition: { label: "Week I", dateStart: "2026-11-07", dateEnd: "2026-11-14" },
};
const stornoPdf = await renderToBuffer(buildCreditNoteDocument({ ...base, amount: 1820, full: true, reason: "Booking cancelled by the guest", refundDue: 1820 }) as never);
check(`a Storno renders (${stornoPdf.length} bytes)`, stornoPdf.length > 1000);
const creditPdf = await renderToBuffer(buildCreditNoteDocument({ ...base, amount: 250, full: false, reason: "Goodwill reduction", refundDue: 0 }) as never);
check(`a credit note renders (${creditPdf.length} bytes)`, creditPdf.length > 1000);
const tpl = readFileSync("src/lib/invoices/template.tsx", "utf8");
const cn = tpl.slice(tpl.indexOf("Storno / Rechnungskorrektur"));
check("the title is the legal term: Stornorechnung", cn.includes('"Stornorechnung"'));
check("the partial title is Rechnungskorrektur", cn.includes('"Rechnungskorrektur"'));
const titleLines = cn.split("\n").filter((l) => /const title(De|En) =/.test(l));
check("neither title says Gutschrift", titleLines.length === 2 && titleLines.every((l) => !l.includes("Gutschrift")), titleLines);
check("the corrected invoice is named by number and date", cn.includes("die Rechnung Nr. {original.number} vom {fmtDate(original.date)}"));
check("the same § 25 note the original carried", cn.includes("<VatNote vatMode={company.vat_mode}"));
check("the standard VAT guard runs before rendering", cn.includes("assertVatConfigured(company)"));
let vatRefused = false;
try { buildCreditNoteDocument({ ...base, company: { ...company, vat_mode: "standard", vat_rate: null }, amount: 10, full: false, reason: "x", refundDue: 0 }); }
catch { vatRefused = true; }
check("a company on standard VAT with no rate is refused a correction", vatRefused);

// ── the mail ─────────────────────────────────────────────────────────────────
console.log("\n── the mail ──");
check("credit_note_sent template exists", typeof TEMPLATES.credit_note_sent === "function");
check("…and is in the automations catalogue", AUTOMATIONS.some((a) => a.key === "credit_note_sent"));
check("…and has an editable default body and subject", !!DEFAULT_BODIES.credit_note_sent && !!DEFAULT_SUBJECTS.credit_note_sent);
const storno = TEMPLATES.credit_note_sent({ firstName: "Bryana", experienceTitle: "Bonaire", amount: "€1,820.00", reference: "NP7-XP-2026-0048", originalReference: "NP7-XP-2026-0039", kind: "storno", refundAmount: "€1,820.00", bookingLink: "https://x" });
const credit = TEMPLATES.credit_note_sent({ firstName: "Bryana", experienceTitle: "Bonaire", amount: "€250.00", reference: "NP7-XP-2026-0049", originalReference: "NP7-XP-2026-0039", kind: "credit", bookingLink: "https://x" });
const plain = (h: string) => h.replace(/<[^>]+>/g, " ");
check("the Storno mail says which invoice is cancelled", plain(storno.html).includes("NP7-XP-2026-0039") && /revers/i.test(storno.html));
check("the Storno mail never asks for a bank transfer", !/please pay|quote the reference|pay by/i.test(storno.html), storno.subject);
check("the Storno mail says the refund is coming", /refunded/i.test(storno.html));
check("the credit mail says the balance is reduced", /reduced/i.test(credit.html));
const tplSrc = readFileSync("src/lib/email/templates.ts", "utf8");
const cnTpl = tplSrc.slice(tplSrc.indexOf("credit_note_sent: (v, opts) =>"), tplSrc.indexOf("invoice_after_payment: (v, opts) =>"));
const bodySrc = readFileSync("src/lib/email/default-bodies.ts", "utf8");
const cnBody = bodySrc.slice(bodySrc.indexOf("credit_note_sent:\n"), bodySrc.indexOf("payment_shortfall_reminder:\n"));
check("no em dash in the new mail copy", cnTpl.length > 100 && !cnTpl.includes("—") && !cnBody.includes("—") && !storno.subject.includes("—") && !credit.subject.includes("—"), { tpl: cnTpl.length, body: cnBody.length });
const sendSrc = readFileSync("src/app/api/admin/documents/[id]/send/route.ts", "utf8");
check("the send route picks the correction mail for a credit_note", sendSrc.includes('isCorrection ? "credit_note_sent" : "invoice_sent"'));
check("the send route refuses a cancelled document", sendSrc.includes('doc.status === "void"'));

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
