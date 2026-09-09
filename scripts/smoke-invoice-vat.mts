/**
 * Proves the VAT guard: a tax invoice cannot be rendered without a VAT
 * position, and the margin note carries the phrase §14 Abs. 4 Nr. 10 UStG
 * asks for. Needs no database and no login — it builds documents in memory.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-invoice-vat.mts
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { buildInvoiceDocument, type InvoiceData } from "@/lib/invoices/template";
import type { CompanySettings } from "@/lib/invoices/types";

const company = (over: Partial<CompanySettings>): CompanySettings => ({
  division: "experience", legal_name: "NP7 GmbH", address_line1: "Graskamp 8", address_line2: null,
  postal_code: "24217", city: "Schönberg", country: "DE", email: null, phone: null, website: null,
  vat_id: "DE352850142", tax_number: null, register_info: null, managing_director: null,
  iban: null, bic: null, bank_name: null, logo_url: null, currency: "EUR",
  vat_mode: "standard", vat_rate: null, invoice_prefix: "NP7-XP", invoice_footer: null,
  terms_url: null, sicherungsschein_insurer: null, sicherungsschein_number: null, gs1_prefix: null,
  ...over,
});

const doc = (c: CompanySettings, over: Partial<InvoiceData> = {}): InvoiceData => ({
  type: "final_invoice", company: c, invoiceNumber: "NP7-XP-2026-0099", invoiceDate: "2026-09-09",
  booking: {
    id: "00000000-0000-0000-0000-000000000000", agreedPrice: 1190, deposit: 0, downpayment: 595,
    currency: "EUR", packageName: "Test package", packageIncludes: [], notes: null,
    addons: [], billedAddons: [], packagePrice: 1190, received: 0,
  },
  contact: { name: "Test Rider", billingAddress: null, billingPostalCode: null, billingCity: null, billingCountry: null, email: null },
  experience: { title: "Bonaire" }, edition: null, dueDate: null, amountDue: 1190,
  ...over,
} as InvoiceData);

let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${note ? "  — " + note : ""}`);
  if (!ok) failed++;
};

// F1 — the blocker. Hardware's live row is exactly this: standard, rate null.
try {
  buildInvoiceDocument(doc(company({ vat_mode: "standard", vat_rate: null })));
  check("standard VAT with no rate is refused", false, "it rendered");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  check("standard VAT with no rate is refused", /no VAT rate/.test(msg), msg.slice(0, 90) + "…");
}
for (const bad of [0, -19, Number.NaN]) {
  try {
    buildInvoiceDocument(doc(company({ vat_rate: bad })));
    check(`standard VAT at ${bad} is refused`, false, "it rendered");
  } catch { check(`standard VAT at ${bad} is refused`, true); }
}

// A real rate still works.
const std = await renderToBuffer(buildInvoiceDocument(doc(company({ vat_rate: 19 }))) as never);
check("standard VAT at 19% renders", std.length > 1000, `${std.length} bytes`);

// Margin has no rate to state, so it must NOT be blocked — this is Experience.
const margin = await renderToBuffer(
  buildInvoiceDocument(doc(company({ vat_mode: "margin", vat_rate: null }))) as never);
check("margin scheme renders without a rate", margin.length > 1000, `${margin.length} bytes`);

/* F5 — the phrase itself. Asserted on the element tree, not the PDF bytes:
   @react-pdf subsets its fonts and writes text through a ToUnicode CMap, so
   the string is genuinely not in the content stream and a byte search would
   pass or fail for the wrong reason. Verified separately with a real PDF
   text extractor that "Sonderregelung für Reisebüros" reaches the page with
   its umlauts intact. */
const flat = (n: unknown): string => {
  if (n == null || n === false || n === true) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(flat).join("");
  const el = n as { type?: unknown; props?: Record<string, unknown> };
  if (!el.props) return "";
  // A function component has not run yet — the tree holds the component, not
  // its output. Call it, so <VatNote> contributes its actual words. Every
  // component on this page is pure and hookless, which is what makes this safe.
  if (typeof el.type === "function") {
    return flat((el.type as (p: Record<string, unknown>) => unknown)(el.props));
  }
  return flat(el.props.children);
};

const marginText = flat(buildInvoiceDocument(doc(company({ vat_mode: "margin", vat_rate: null }))));
check("margin invoice states 'Sonderregelung für Reisebüros'", marginText.includes("Sonderregelung für Reisebüros"));
check("margin invoice cites § 25 UStG", marginText.includes("§ 25 UStG"));
check("margin invoice keeps the EU-directive wording", /Articles 306.{1,3}310 EU VAT Directive/.test(marginText));

const stdText = flat(buildInvoiceDocument(doc(company({ vat_rate: 19 }))));
check("standard invoice states its rate instead", stdText.includes("19% VAT") && !stdText.includes("Sonderregelung"));

// A pro-forma states a gross amount, not a VAT position — never blocked.
try {
  buildInvoiceDocument(doc(company({ vat_rate: null }), { type: "proforma_invoice", milestone: "final" } as Partial<InvoiceData>));
  check("pro-forma is not blocked by a missing rate", true);
} catch (e) {
  check("pro-forma is not blocked by a missing rate", false, String(e).slice(0, 80));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
