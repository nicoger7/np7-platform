// Shared contract for invoicing & documents — used by the PDF engine, the admin
// + portal APIs, and the UIs. Keep in sync with migration 20260618_021_invoicing.sql.

export type Division = "experience" | "hardware";

export type VatMode = "margin" | "standard";

export const DOCUMENT_TYPES = [
  "proforma_invoice",
  "deposit_invoice",
  "downpayment_invoice",
  "final_invoice",
  "addon_invoice",
  "booking_confirmation",
  "credit_note",
  "sicherungsschein",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** The invoice/document types the generator can produce from a booking.
    proforma_invoice = a PAYMENT REQUEST for the securing payment (deposit if
    set, else the downpayment): its own PF- reference for the bank transfer,
    no tax-invoice number burned. The real invoice is issued when money lands
    (promoteProformaIfPaid) — so unpaid registrations never need a Storno. */
export type GeneratableType = Extract<
  DocumentType,
  "proforma_invoice" | "deposit_invoice" | "downpayment_invoice" | "final_invoice" | "addon_invoice" | "booking_confirmation"
>;

/** Per-division legal/company profile (company_settings row). */
export type CompanySettings = {
  division: Division;
  legal_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  vat_id: string | null;
  tax_number: string | null;
  register_info: string | null;
  managing_director: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  logo_url: string | null;
  currency: string;
  vat_mode: VatMode;
  vat_rate: number | null;
  invoice_prefix: string | null;
  invoice_footer: string | null;
  terms_url: string | null;
  sicherungsschein_insurer: string | null;
  sicherungsschein_number: string | null;
  /** GS1 company prefix (hardware) — GTINs are derived from it. */
  gs1_prefix: string | null;
};

/** A stored/generated document (documents row). */
export type DocumentRow = {
  id: string;
  booking_id: string | null;
  contact_id: string | null;
  division: Division;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  file_path: string | null;
  amount: number | null;
  currency: string;
  status: "issued" | "void";
  issued_at: string;
  created_at: string;
  meta: Record<string, unknown>;
};

/** Input to the document generator. The service resolves booking/contact/edition/settings. */
export type GenerateInput = {
  bookingId: string;
  type: GeneratableType;
  /** Force a specific division; otherwise inferred (experience for bookings). */
  division?: Division;
  /** For a pro-forma: which stage it stands in for. Default = the securing
   *  payment (deposit if set, else downpayment). "final" = a pro-forma for the
   *  remaining balance (trip total incl. add-ons − amounts already real-invoiced). */
  milestone?: "deposit" | "downpayment" | "final";
  /**
   * Re-render an ALREADY ISSUED document in place, keeping its invoice number.
   *
   * A tax invoice sequence must stay gapless, so a correction cannot simply
   * burn the next number and abandon the old one. When the figures are right
   * and only the rendering is wrong — and the document was never sent — this
   * rewrites the same number's PDF and row rather than issuing a new one.
   */
  reuseDocumentId?: string;
  /**
   * Invoice a specific amount instead of the one the milestone formula derives.
   *
   * The formulas assume two things: that stages are invoiced in payment order,
   * and that the price does not move after money has arrived. Jens Hahn broke
   * both — he paid 50% of his trip, then upgraded, so the 3,184.50 that
   * actually arrived is neither 50% of the new total (3,496.88) nor the
   * outstanding balance (3,809.25), and no formula could name it.
   *
   * A person who knows what was agreed has to be able to say the number. The
   * reason is required and stored on the document, so a figure that departs
   * from the calculation always carries the sentence explaining why.
   */
  amount?: number;
  amountReason?: string;
};

export const DIVISIONS: Division[] = ["experience", "hardware"];

/** Format the gapless counter int into a human invoice number. */
export function formatInvoiceNumber(prefix: string | null, year: number, seq: number): string {
  return `${prefix || "INV"}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Money formatter for PDF + UI. */
export function formatMoney(amount: number | null | undefined, currency = "EUR"): string {
  if (amount == null) return "—";
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
