/**
 * What a correction document is, and what it does to the invoice it corrects.
 *
 * Pure. Shared by the generator, the two admin pages, the send route and the
 * smoke script, so "is this invoice reversed?" has one answer everywhere. The
 * legal shape it encodes:
 *
 *   An issued tax invoice is never edited (GoBD). It is corrected by a NEW
 *   document with its own number from the same gapless series, which names the
 *   invoice it corrects by number and date (§ 14 Abs. 4 UStG, Abschn. 14.11
 *   UStAE). NP7 issues two kinds:
 *
 *     STORNO        reverses the whole invoice. Stornorechnung.
 *     CREDIT NOTE   reduces it by a part. Rechnungskorrektur.
 *
 *   Both are stored as `documents.type = "credit_note"` with a NEGATIVE amount,
 *   `meta.original_document_id` pointing at the invoice, and `meta.full` saying
 *   which of the two it is. The word "Gutschrift" is deliberately not the
 *   document's title: since 2013 § 14 Abs. 4 Nr. 10 UStG reserves it for
 *   self-billing (Abrechnungsgutschrift), and a title that reads like one
 *   invites the § 14c question. A correction that names the invoice it
 *   corrects is not one, and the paper says so in the words the law uses.
 */

export const TAX_INVOICE_TYPES = ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice"] as const;

/** The documents that carry a number from the gapless counter. */
export const NUMBERED_TYPES = [...TAX_INVOICE_TYPES, "credit_note"] as const;

export type DocLike = {
  id: string;
  type: string;
  status: string;
  amount: number | null;
  invoice_number: string | null;
  meta?: Record<string, unknown> | null;
  sent_at?: string | null;
  paid_at?: string | null;
  issued_at?: string | null;
  created_at?: string | null;
  booking_id?: string | null;
};

/** The meta a correction document carries. Written once by generateCreditNote. */
export type CorrectionMeta = {
  original_document_id?: string;
  original_invoice_number?: string;
  original_issued_at?: string | null;
  reason?: string;
  /** true = Storno (whole invoice), false = partial credit. */
  full?: boolean;
  kind?: "storno" | "credit";
  /** Money the guest had already paid against the original, up to the credit. */
  refund_due?: number;
  /** A partial correction changes the margin by a judgement call; the
      accounting plan sends those to the Steuerberater rather than booking
      them straight through. Mirrors the warning in lexoffice/push.ts. */
  needs_tax_review?: boolean;
};

/** The link an original invoice carries once it has been corrected. */
export type CorrectedMeta = {
  reversed_by?: string;
  reversed_by_number?: string;
  reversed_at?: string;
  credited_by?: string[];
  correction_pending?: string;
};

export type DocKind = "invoice" | "storno" | "credit" | "proforma" | "confirmation" | "other";

export const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

export function isProformaDoc(d: Pick<DocLike, "type" | "invoice_number">): boolean {
  return d.type === "proforma_invoice" || String(d.invoice_number ?? "").startsWith("PF-");
}

export function isTaxInvoiceDoc(d: Pick<DocLike, "type" | "invoice_number">): boolean {
  return (TAX_INVOICE_TYPES as readonly string[]).includes(d.type) && !isProformaDoc(d);
}

export function correctionMeta(d: Pick<DocLike, "meta">): CorrectionMeta {
  return (d.meta ?? {}) as CorrectionMeta;
}

export function correctedMeta(d: Pick<DocLike, "meta">): CorrectedMeta {
  return (d.meta ?? {}) as CorrectedMeta;
}

/** Which pile a document belongs to. A credit note splits by `meta.full`. */
export function docKind(d: Pick<DocLike, "type" | "invoice_number" | "meta">): DocKind {
  if (d.type === "credit_note") return correctionMeta(d).full === true ? "storno" : "credit";
  if (isProformaDoc(d)) return "proforma";
  if (d.type === "booking_confirmation") return "confirmation";
  if (isTaxInvoiceDoc(d)) return "invoice";
  return "other";
}

export const KIND_LABELS: Record<DocKind, string> = {
  invoice: "Invoice",
  storno: "Storno",
  credit: "Credit note",
  proforma: "Pro-forma",
  confirmation: "Confirmation",
  other: "Document",
};

/** The human name of a document's type, for a row label. */
export function typeLabel(d: Pick<DocLike, "type" | "invoice_number" | "meta">): string {
  switch (d.type) {
    case "deposit_invoice": return "Deposit invoice";
    case "downpayment_invoice": return "Down-payment invoice";
    case "final_invoice": return "Final invoice";
    case "addon_invoice": return "Add-on invoice";
    case "proforma_invoice": return "Pro-forma (payment request)";
    case "booking_confirmation": return "Booking confirmation";
    case "credit_note": return correctionMeta(d).full === true ? "Storno (cancellation invoice)" : "Credit note (correction)";
    case "sicherungsschein": return "Sicherungsschein";
    default: return d.type.replace(/_/g, " ");
  }
}

export type CorrectionState = {
  /** Live correction documents against this invoice, oldest first. */
  credits: DocLike[];
  /** Σ |credit amounts| already issued against it. */
  credited: number;
  /** amount − credited, floored at zero. */
  net: number;
  /** A full Storno stands against it, or the credits add up to the whole amount. */
  reversed: boolean;
};

/**
 * Every live correction, keyed by the invoice it corrects.
 *
 * Read from the correction side (meta.original_document_id) rather than from
 * the original's meta, so a credit note issued before the originals learned
 * to carry a back-link (NP7-XP-2026-0024) still counts.
 */
export function correctionsByOriginal(docs: DocLike[]): Map<string, DocLike[]> {
  const map = new Map<string, DocLike[]>();
  const credits = docs
    .filter((d) => d.type === "credit_note" && d.status !== "void")
    .sort((a, b) => String(a.issued_at ?? a.created_at ?? "").localeCompare(String(b.issued_at ?? b.created_at ?? "")));
  for (const c of credits) {
    const orig = correctionMeta(c).original_document_id;
    if (!orig) continue;
    map.set(orig, [...(map.get(orig) ?? []), c]);
  }
  return map;
}

export function correctionState(invoice: DocLike, byOriginal: Map<string, DocLike[]>): CorrectionState {
  const credits = byOriginal.get(invoice.id) ?? [];
  const amount = round2(Number(invoice.amount) || 0);
  const credited = round2(credits.reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0));
  const full = credits.some((c) => correctionMeta(c).full === true);
  const net = round2(Math.max(0, amount - credited));
  return { credits, credited, net, reversed: full || (amount > 0 && net <= 0.005) };
}

export type CorrectionAllowance = {
  canStorno: boolean;
  canCredit: boolean;
  /** What a partial credit may still take off this invoice. */
  remaining: number;
  credited: number;
  /** Why neither is possible, in one sentence. */
  blocker: string | null;
};

/**
 * Refuse the wrong thing, in words. The generator applies the same rules
 * server-side; this lets the dialog say them before anyone presses anything.
 */
export function correctionAllowance(invoice: DocLike, byOriginal: Map<string, DocLike[]>): CorrectionAllowance {
  const none = (blocker: string): CorrectionAllowance => ({ canStorno: false, canCredit: false, remaining: 0, credited: 0, blocker });
  if (invoice.type === "credit_note") return none("A correction document cannot itself be corrected. If it is wrong, invoice the amount again.");
  if (isProformaDoc(invoice)) return none("A pro-forma is a payment request, not a tax invoice. Void it; no Storno is needed.");
  if (invoice.type === "booking_confirmation") return none("A booking confirmation carries no amount and needs no correction.");
  if (!isTaxInvoiceDoc(invoice)) return none("Only tax invoices (deposit, down-payment, final, add-on) can be corrected.");
  if (invoice.status !== "issued") return none("This invoice is cancelled. A cancelled number is not reversed, it is written off.");
  if (!invoice.invoice_number) return none("This invoice has no number, so a correction could not reference it.");
  const amount = round2(Number(invoice.amount) || 0);
  if (amount <= 0) return none("This invoice has no positive amount to credit.");
  const state = correctionState(invoice, byOriginal);
  if (state.reversed) {
    const by = state.credits.find((c) => correctionMeta(c).full === true) ?? state.credits[state.credits.length - 1];
    return none(`Already reversed by ${by?.invoice_number ?? "a Storno"}. An invoice is reversed once.`);
  }
  return {
    // A Storno reverses the WHOLE invoice. Once part of it has been credited,
    // the rest is credited too, which is a partial correction, not a Storno.
    canStorno: state.credited === 0,
    canCredit: state.net > 0.005,
    remaining: state.net,
    credited: state.credited,
    blocker: null,
  };
}

export type DocumentTotals = {
  /** Σ live invoices, each net of its corrections. */
  invoiced: number;
  invoiceCount: number;
  /** Σ net of invoices marked paid and not reversed. */
  settled: number;
  settledCount: number;
  /** Σ net of live, unpaid, not reversed invoices. */
  open: number;
  openCount: number;
  /** Σ live correction amounts (negative). */
  reversed: number;
  reversedCount: number;
  /** Refunds the corrections say are owed back. */
  refundsDue: number;
  /** Σ of cancelled (void) numbered documents: never revenue. */
  voided: number;
  voidCount: number;
};

/**
 * The money an invoice list has to state.
 *
 * `shown` is what the page is looking at; `all` is every document it knows,
 * so an invoice still reads net of a Storno that the current filter hides. A
 * correction stored negative is ADDED, never subtracted: `charges − credits`
 * negates a negative and doubles the credit (this list once read Dimitri
 * Lagendijk's 2,550 as 5,540).
 */
export function summarizeDocuments(shown: DocLike[], all: DocLike[]): DocumentTotals {
  const byOriginal = correctionsByOriginal(all);
  const live = shown.filter((d) => d.status !== "void");
  const invoices = live.filter(isTaxInvoiceDoc);
  const credits = live.filter((d) => d.type === "credit_note");
  let invoiced = 0, settled = 0, settledCount = 0, open = 0, openCount = 0;
  for (const inv of invoices) {
    const st = correctionState(inv, byOriginal);
    invoiced = round2(invoiced + st.net);
    if (st.reversed) continue;
    if (inv.paid_at) { settled = round2(settled + st.net); settledCount += 1; }
    else { open = round2(open + st.net); openCount += 1; }
  }
  const reversed = round2(credits.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const refundsDue = round2(credits.reduce((s, c) => s + (Number(correctionMeta(c).refund_due) || 0), 0));
  const voidRows = shown.filter((d) => d.status === "void" && (NUMBERED_TYPES as readonly string[]).includes(d.type) && !isProformaDoc(d));
  return {
    invoiced, invoiceCount: invoices.length,
    settled, settledCount, open, openCount,
    reversed, reversedCount: credits.length, refundsDue,
    voided: round2(voidRows.reduce((s, d) => s + (Number(d.amount) || 0), 0)), voidCount: voidRows.length,
  };
}

/**
 * Invoices with their corrections nested beneath them, newest first, so a
 * Storno reads as what it is: a line under the invoice it reverses, not a
 * sibling with a minus sign. A correction whose original is not in the list
 * stays top-level rather than vanishing.
 */
export function nestCorrections<T extends DocLike>(docs: T[]): { doc: T; children: T[] }[] {
  const ids = new Set(docs.map((d) => d.id));
  const children = new Map<string, T[]>();
  const top: T[] = [];
  for (const d of docs) {
    const orig = d.type === "credit_note" ? correctionMeta(d).original_document_id : undefined;
    if (orig && ids.has(orig)) children.set(orig, [...(children.get(orig) ?? []), d]);
    else top.push(d);
  }
  const at = (d: DocLike) => String(d.issued_at ?? d.created_at ?? "");
  return top
    .sort((a, b) => at(b).localeCompare(at(a)))
    .map((doc) => ({ doc, children: (children.get(doc.id) ?? []).sort((a, b) => at(a).localeCompare(at(b))) }));
}

/** The gapless-sequence check, per division and year, credit notes included. */
export type SequenceCheck = { key: string; division: string; year: number; first: number; last: number; missing: number[]; count: number };

export function sequenceChecks(docs: { invoice_number: string | null; division?: string | null }[]): SequenceCheck[] {
  const groups = new Map<string, { division: string; year: number; nums: number[] }>();
  for (const d of docs) {
    const n = d.invoice_number;
    if (!n || n.startsWith("PF-")) continue;
    const m = /-(\d{4})-(\d+)$/.exec(n);
    if (!m) continue;
    const year = Number(m[1]);
    const division = d.division ?? "experience";
    const key = `${division}:${year}`;
    if (!groups.has(key)) groups.set(key, { division, year, nums: [] });
    groups.get(key)!.nums.push(Number(m[2]));
  }
  return [...groups.entries()].map(([key, g]) => {
    const nums = [...new Set(g.nums)].sort((a, b) => a - b);
    const first = nums[0] ?? 0;
    const last = nums[nums.length - 1] ?? 0;
    const have = new Set(nums);
    const missing: number[] = [];
    for (let i = first; i <= last; i++) if (!have.has(i)) missing.push(i);
    return { key, division: g.division, year: g.year, first, last, missing, count: nums.length };
  }).sort((a, b) => b.year - a.year);
}
