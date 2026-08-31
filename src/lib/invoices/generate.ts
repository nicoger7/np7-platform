/**
 * Document generation engine.
 *
 * generateDocument(input) → renders a PDF, uploads it to the private
 * `documents` Supabase Storage bucket, inserts a `documents` DB row,
 * and returns the row.
 *
 * Resilient: if migration 021 hasn't been applied yet (tables missing) the
 * function throws a clear Error that callers must catch — it does NOT crash
 * on module import.
 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase";
import { buildInvoiceDocument, type InvoiceData , buildCreditNoteDocument } from "./template";
import {
  formatInvoiceNumber,
  type GenerateInput,
  type DocumentRow,
  type CompanySettings,
} from "./types";
import {
  milestoneAmount,
  addDays,
  PAYMENT_DEFAULTS,
  type PackagePaymentConfig,
  type BookingPaymentState,
} from "@/lib/payments";
import { effectiveAddonStatus } from "@/lib/addons";
import { includeLine } from "@/lib/include-line";
import { sumReceived, type PaymentLike } from "@/lib/payment-totals";

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sum of CONFIRMED add-ons on a booking — billable, part of the trip total
    everywhere (member plan + invoices). Matches getBookingAddonsTotal in
    portal-data so plan and invoices agree. */
export async function confirmedAddonsTotal(bookingId: string): Promise<number> {
  const db = getDb();
  const { data } = await db.from("exp_booking_addons").select("price,status,notes,payment_mode").eq("booking_id", bookingId);
  return round2(((data ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed")
    // pay-direct add-ons are arranged by us but settled with the provider — they
    // are not revenue and must never appear on an NP7 invoice
    .filter((a) => a.payment_mode !== "direct")
    .reduce((s, a) => s + (Number(a.price) || 0), 0));
}

/** Money actually in the bank on this booking. Same definition as the booking
    page and the member plan — sumReceived, so 'pending' and 'cancelled' rows
    never count as paid. */
export async function bookingReceivedTotal(bookingId: string): Promise<number> {
  const db = getDb();
  const { data } = await db.from("exp_payments").select("amount,direction,type,status").eq("booking_id", bookingId);
  return sumReceived(data ?? []);
}

/** The same billable add-ons, itemised, so the invoice can show what they were. */
export async function confirmedAddonLines(bookingId: string): Promise<{ label: string; price: number }[]> {
  const db = getDb();
  const { data } = await db
    .from("exp_booking_addons")
    .select("label,price,quantity,unit_price,status,notes,payment_mode,exp_components(name)")
    .eq("booking_id", bookingId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed")
    .filter((a) => a.payment_mode !== "direct")
    .filter((a) => Number(a.price) > 0)
    .map((a) => ({ label: addonLineLabel(a), price: round2(Number(a.price) || 0) }));
}

/** An add-on's invoice line. `price` is already the LINE TOTAL (migration 189),
    so quantity only enters the LABEL — "Extra night × 5 (€295.80 each)" — which
    is what a guest needs to check the number, and never the maths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addonLineLabel(a: any): string {
  const base = String(a.label || a.exp_components?.name || "Add-on");
  const qty = Number(a.quantity) || 1;
  if (qty < 2) return base;
  const unit = a.unit_price != null ? Number(a.unit_price) : Number(a.price) / qty;
  const each = Number.isFinite(unit)
    ? ` (${unit.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} each)`
    : "";
  return `${base} × ${qty}${each}`;
}

/** Confirmed, billable add-ons no issued invoice has picked up yet — the
    add-on invoice bills exactly these and stamps them (invoiced_in), so a
    second add-on invoice can never double-bill a row. */
export async function unbilledAddonLines(bookingId: string): Promise<{ id: string; label: string; price: number }[]> {
  const db = getDb();
  const { data } = await db
    .from("exp_booking_addons")
    .select("id,label,price,quantity,unit_price,status,notes,payment_mode,invoiced_in,exp_components(name)")
    .eq("booking_id", bookingId)
    .is("invoiced_in", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed")
    .filter((a) => a.payment_mode !== "direct")
    .filter((a) => Number(a.price) > 0)
    .map((a) => ({ id: String(a.id), label: addonLineLabel(a), price: round2(Number(a.price) || 0) }));
}

/** Total of the real (non-void) tax invoices already ISSUED for a booking. Used
    to derive the outstanding balance — a real invoice is immutable, so anything
    added after it flows into the next document, never backward. */
export async function issuedInvoiceTotal(bookingId: string): Promise<number> {
  const db = getDb();
  const { data } = await db.from("documents").select("amount,type,status").eq("booking_id", bookingId).eq("status", "issued");
  return round2(((data ?? []) as { amount: number | null; type: string }[])
    .filter((d) => ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice", "credit_note"].includes(d.type))
    .reduce((s, d) => s + (Number(d.amount) || 0), 0));
}

/**
 * Issued tax invoices, net of the money already received against the booking.
 *
 * This is the part of the debt that a document already stands for and money has
 * NOT yet settled. The final invoice subtracts it, or it re-bills whatever an
 * earlier invoice covered — while subtracting the gross would double-count any
 * invoice that has been paid, since the payment is subtracted too.
 *
 * It nets against ALL received revenue, not only payments carrying a
 * `document_id`. The allocation-only version quietly broke the common case: a
 * down-payment tax invoice is issued, the guest pays it by bank transfer, and
 * that payment lands on the booking with no `document_id` linking it to the
 * invoice (Sven Heinsohn's Bonaire booking — invoice #0028 issued, €2,895 paid,
 * unallocated). The invoice then read as fully unpaid AND the payment was
 * subtracted as `received`, so the €2,895 down-payment was deducted twice and
 * the final invoice — a real €2,895 still owed — refused to generate with
 * "nothing to invoice". Netting against total received settles issued invoices
 * first, so each debt is subtracted exactly once regardless of allocation:
 * finalAmt = total − received − max(0, issued − received) = total − max(received, issued).
 */
export async function unpaidIssuedInvoiceTotal(bookingId: string): Promise<number> {
  const db = getDb();
  const [{ data: docs }, { data: pays }] = await Promise.all([
    db.from("documents").select("id,amount,type,status").eq("booking_id", bookingId).eq("status", "issued"),
    db.from("exp_payments").select("amount,direction,type,status,document_id").eq("booking_id", bookingId),
  ]);
  const billed = ((docs ?? []) as { id: string; amount: number | null; type: string }[])
    .filter((d) => ["deposit_invoice", "downpayment_invoice", "final_invoice", "addon_invoice", "credit_note"].includes(d.type));
  const gross = round2(billed.reduce((s, d) => s + (Number(d.amount) || 0), 0));
  // Received money settles issued invoices first — a bank transfer against a
  // pro-forma or booking pays down the tax invoice it corresponds to even when
  // nothing wrote the link. The caller subtracts the same `received` from the
  // trip total, and `max(0, …)` keeps the two subtractions from overlapping.
  const received = sumReceived((pays ?? []) as PaymentLike[]);
  return round2(Math.max(0, gross - received));
}

/** One place for the money: trip total (agreed + confirmed add-ons), how much has
    already been real-invoiced, and the outstanding balance. */
export async function bookingBillingTotals(bookingId: string, agreedPrice: number): Promise<{ total: number; invoiced: number; outstanding: number }> {
  const [addons, invoiced] = await Promise.all([confirmedAddonsTotal(bookingId), issuedInvoiceTotal(bookingId)]);
  const total = round2((agreedPrice || 0) + addons);
  return { total, invoiced, outstanding: round2(Math.max(0, total - invoiced)) };
}

// ─── Resolve company settings ──────────────────────────────────────────────────

async function resolveCompanySettings(division: string): Promise<CompanySettings> {
  const db = getDb();
  const { data, error } = await db
    .from("company_settings")
    .select("*")
    .eq("division", division)
    .maybeSingle();

  if (error) {
    // Table may not exist pre-migration
    if (
      error.code === "42P01" || // relation does not exist
      error.message?.includes("does not exist")
    ) {
      throw new Error("Migration 021 not applied: company_settings table missing.");
    }
    throw new Error(`Failed to fetch company_settings: ${error.message}`);
  }

  // Return a safe default if no row found yet (migration applied but seed not run)
  return (data as CompanySettings | null) ?? {
    division: division as "experience" | "hardware",
    legal_name: null,
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
    country: null,
    email: null,
    phone: null,
    website: null,
    vat_id: null,
    tax_number: null,
    register_info: null,
    managing_director: null,
    iban: null,
    bic: null,
    bank_name: null,
    logo_url: null,
    currency: "EUR",
    vat_mode: "margin",
    vat_rate: null,
    invoice_prefix: null,
    invoice_footer: null,
    terms_url: null,
    sicherungsschein_insurer: null,
    sicherungsschein_number: null,
    gs1_prefix: null,
  };
}

// ─── Resolve booking data ─────────────────────────────────────────────────────

type ResolvedBooking = {
  id: string;
  contact_id: string | null;
  experience_id: string | null;
  edition_id: string | null;
  package_id: string | null;
  agreed_price: number;
  downpayment_received: boolean;
  final_payment_received: boolean;
  notes: string | null;
  created_at: string | null;
  // joined
  contacts: {
    name: string | null;
    email: string | null;
    billing_address: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
  } | null;
  exp_experiences: { title: string; slug: string } | null;
  exp_editions: {
    label: string | null;
    year: number | null;
    date_start: string | null;
    date_end: string | null;
    /** 'event' = a 1–2 day clinic bought outright (migration 157). */
    kind?: string | null;
    deposit: number | null;
  } | null;
  exp_packages: {
    name: string | null;
    deposit: number | null;
    downpayment_percent: number | null;
    final_days_before: number | null;
    deposit_refund_days: number | null;
    includes: string[] | null;
  } | null;
};

async function resolveBooking(bookingId: string): Promise<ResolvedBooking> {
  const db = getDb();
  const { data, error } = await db
    .from("exp_bookings")
    .select(
      `id, contact_id, experience_id, edition_id, package_id,
       agreed_price, downpayment_received, final_payment_received, notes, created_at,
       contacts(name, email, billing_address, billing_postal_code, billing_city, billing_country),
       exp_experiences(title, slug),
       exp_editions(label, year, date_start, date_end, deposit, kind),
       exp_packages(name, deposit, downpayment_percent, final_days_before, deposit_refund_days, includes)`
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error(`Migration not applied or table missing: ${error.message}`);
    }
    throw new Error(`Failed to fetch booking: ${error.message}`);
  }
  if (!data) throw new Error(`Booking not found: ${bookingId}`);
  return data as ResolvedBooking;
}

/** The package's website-included components — the same "Web" checkmarks +
 *  Website text that drive the public included-list (migration 090). Shown on
 *  invoices under the package name. Tolerant pre-migration → []. */
async function packageIncludes(packageId: string | null): Promise<string[]> {
  if (!packageId) return [];
  try {
    const db = getDb();
    const { data, error } = await db
      .from("exp_package_components")
      .select("show_on_website, quantity, exp_components(name, description, category)")
      .eq("package_id", packageId);
    if (error) return [];
    return ((data ?? []) as { show_on_website?: boolean | null; quantity?: number | null; exp_components: { name: string | null; description: string | null; category?: string | null } | null }[])
      .filter((r) => r.show_on_website)
      .map((r) => includeLine({ ...r.exp_components, quantity: r.quantity }))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Compute deposit ──────────────────────────────────────────────────────────

function computeDeposit(booking: ResolvedBooking): number {
  return (
    booking.exp_editions?.deposit ??
    booking.exp_packages?.deposit ??
    300
  );
}

// ─── Allocate invoice number ──────────────────────────────────────────────────

async function allocateInvoiceNumber(division: string, year: number): Promise<number> {
  const db = getDb();
  const { data, error } = await db.rpc("next_invoice_number", {
    p_division: division,
    p_year: year,
  });
  if (error) {
    if (error.code === "42883" || error.message?.includes("does not exist")) {
      throw new Error("Migration 021 not applied: next_invoice_number function missing.");
    }
    throw new Error(`Failed to allocate invoice number: ${error.message}`);
  }
  return data as number;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate a PDF document for the given booking, upload it to Storage, insert
 * a documents row, and return the row.
 *
 * Throws a descriptive Error if migration 021 is not applied — callers must
 * wrap in try/catch.
 */
export async function generateDocument(input: GenerateInput): Promise<DocumentRow> {
  const { bookingId, type } = input;
  const division = input.division ?? "experience";

  // 1. Resolve all data
  const [booking, company] = await Promise.all([
    resolveBooking(bookingId),
    resolveCompanySettings(division),
  ]);

  // Milestone amounts — single source of truth shared with the member payment
  // plan (computePaymentPlan). The trip TOTAL is agreed price + confirmed add-ons,
  // so every stage below reflects extras the same way the member's plan does.
  // Deposit honours an edition-level override; the rest (down-payment %, final
  // timing) comes from the package.
  const { total } = await bookingBillingTotals(bookingId, booking.agreed_price ?? 0);
  const cfg: PackagePaymentConfig = {
    deposit: computeDeposit(booking),
    downpayment_percent: booking.exp_packages?.downpayment_percent ?? null,
    final_days_before: booking.exp_packages?.final_days_before ?? null,
    deposit_refund_days: booking.exp_packages?.deposit_refund_days ?? null,
  };
  const state: BookingPaymentState = {
    total,
    editionStart: booking.exp_editions?.date_start ?? null,
  };
  const depositAmt = milestoneAmount("deposit", cfg, state);
  const downpaymentAmt = milestoneAmount("downpayment", cfg, state);
  /**
   * Final = what is actually still owed, and "owed" has two forms.
   *
   * It used to be `total − already invoiced`, which broke one way: Andreas
   * Burmeister had paid €3,950 of €4,595 and owed €645, but nothing had been
   * invoiced, so this stored €4,595 while the PDF printed €2,297.50 from its
   * own separate formula. One invoice, two numbers, neither the debt.
   *
   * Then it became `total − received`, which broke the other way, and did so on
   * a live booking: an add-on invoice for €2,103.75 was issued and unpaid, so
   * the final invoice — seeing no money against it — billed the whole trip
   * again. Two issued tax invoices totalling €9,097.50 against a €6,993.75
   * trip, both holding gapless §14 numbers, and an add-on invoice cannot even
   * be credit-noted.
   *
   * Both are true at once: a debt is settled by money OR by a tax invoice that
   * already stands for it. Subtract each exactly once — an invoice net of what
   * has been paid against it, so a paid invoice is not deducted twice.
   */
  const [received, addonLines, unpaidInvoiced] = await Promise.all([
    bookingReceivedTotal(bookingId),
    confirmedAddonLines(bookingId),
    unpaidIssuedInvoiceTotal(bookingId),
  ]);
  const finalAmt = round2(Math.max(0, total - received - unpaidInvoiced));

  // Add-on invoice: bills exactly the confirmed extras nothing has invoiced
  // yet — an interim document for things added AFTER the down-payment, so the
  // guest pays the extra now while the final stays on its own schedule.
  // (Final self-corrects either way: it is total − received.)
  const billedAddons = type === "addon_invoice" ? await unbilledAddonLines(bookingId) : [];
  const addonAmt = round2(billedAddons.reduce((sum, a) => sum + a.price, 0));

  const currency = company.currency || "EUR";
  const isInvoice = type !== "booking_confirmation";
  const isProforma = type === "proforma_invoice";
  const year = new Date().getFullYear();

  // Which stage a pro-forma stands in for (default = the securing payment).
  const proformaMilestone: "deposit" | "downpayment" | "final" =
    input.milestone ?? (depositAmt > 0 ? "deposit" : "downpayment");
  const proformaAmt =
    // Same figure as the final invoice — what's owed after payments received,
    // not what has merely gone un-invoiced.
    proformaMilestone === "final" ? finalAmt
    : proformaMilestone === "deposit" ? depositAmt
    : downpaymentAmt;
  // Deadline: securing = sign-up + refund window; final balance = trip start − final_days_before.
  const refundDays = cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays;
  const finalDaysBefore = cfg.final_days_before ?? PAYMENT_DEFAULTS.finalDaysBefore;
  /*
   * Same clamp as computePaymentPlan: a final-stage payment request must never
   * be born overdue. `start − final_days_before` can predate the signup itself
   * (a live pro-forma carried a due date two months in the past), and a
   * document that asks for money by a date already gone reads as a mistake,
   * not a deadline.
   */
  const secureDue = booking.created_at ? addDays(booking.created_at, refundDays) : null;
  const finalStageDue = booking.exp_editions?.date_start ? addDays(booking.exp_editions.date_start, -finalDaysBefore) : null;
  const proformaDue =
    proformaMilestone === "final"
      ? (finalStageDue && secureDue && finalStageDue < secureDue ? secureDue : finalStageDue)
      : secureDue;

  // One open pro-forma per booking. If one is already issued, this call UPDATES
  // it in place (a resync after an add-on change) — keeping its existing PF
  // reference — or returns it unchanged when the amount already matches.
  let existingProforma: DocumentRow | null = null;
  if (isProforma) {
    if (proformaAmt <= 0) throw new Error("Nothing to request — this booking has no outstanding amount for this stage.");
    const admin0 = getDb();
    const { data: existing } = await admin0
      .from("documents").select("*")
      .eq("booking_id", bookingId).eq("type", "proforma_invoice").eq("status", "issued")
      .maybeSingle();
    if (existing) {
      existingProforma = existing as DocumentRow;
      if (Math.abs(Number(existing.amount ?? 0) - proformaAmt) < 0.01) return existing as DocumentRow; // unchanged
    }
  }

  // Don't issue an invoice for a stage that doesn't exist in this plan
  // (e.g. a deposit invoice when the package has deposit = 0 → 2-stage plan).
  if (type === "deposit_invoice" && depositAmt <= 0) {
    throw new Error("This booking has no deposit stage (deposit = 0) — nothing to invoice. Issue the down-payment invoice instead.");
  }
  if (type === "downpayment_invoice" && downpaymentAmt <= 0) {
    throw new Error("This booking has no down-payment stage — nothing to invoice.");
  }
  if (type === "final_invoice" && finalAmt <= 0) {
    throw new Error("This booking has no outstanding final balance — nothing to invoice.");
  }
  if (type === "addon_invoice" && addonAmt <= 0) {
    throw new Error("No un-invoiced add-ons on this booking — every confirmed extra is already on an invoice.");
  }

  // 2. Allocate invoice number. Pro-formas do NOT burn the gapless tax-invoice
  // counter — they get a deterministic PF reference (stage-coded, unique per
  // booking+stage) the rider quotes on the transfer, matched by reconciliation.
  // Re-issuing a corrected copy of an existing document keeps its number.
  let reuseRow: DocumentRow | null = null;
  if (input.reuseDocumentId) {
    const { data: existing } = await getDb()
      .from("documents").select("*").eq("id", input.reuseDocumentId).maybeSingle();
    if (!existing) throw new Error(`No document ${input.reuseDocumentId} to re-issue.`);
    if ((existing as DocumentRow & { sent_at?: string | null }).sent_at) {
      throw new Error("That invoice has already been sent — correct it with a credit note, not by rewriting it.");
    }
    reuseRow = existing as DocumentRow;
  }

  // An existing pro-forma being updated keeps its reference.
  let invoiceNumber: string | null = reuseRow?.invoice_number ?? existingProforma?.invoice_number ?? null;
  if (isProforma && !invoiceNumber) {
    const stage = proformaMilestone === "final" ? "FIN" : proformaMilestone === "deposit" ? "DEP" : "DP";
    invoiceNumber = `PF-${company.invoice_prefix || "INV"}-${year}-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}-${stage}`;
  } else if (isInvoice && !isProforma && !invoiceNumber) {
    const seq = await allocateInvoiceNumber(division, year);
    invoiceNumber = formatInvoiceNumber(company.invoice_prefix, year, seq);
  }

  // 3. Build InvoiceData for template
  const contact = booking.contacts;
  const ed = booking.exp_editions;
  const exp = booking.exp_experiences;
  const pkg = booking.exp_packages;

  if (!exp) throw new Error(`Booking ${bookingId} has no associated experience.`);

  // Same rule as the public website's included-list: the manual "Website list"
  // wins when set, else the components carrying the Web checkmark.
  const manualIncludes = (pkg?.includes ?? []).map((s) => String(s).trim()).filter(Boolean);
  const pkgIncludes = manualIncludes.length ? manualIncludes : await packageIncludes(booking.package_id ?? null);

  const invoiceData: InvoiceData = {
    type,
    company,
    invoiceNumber,
    invoiceDate: new Date().toISOString().slice(0, 10),
    booking: {
      id: booking.id,
      agreedPrice: total,
      deposit: depositAmt,
      downpayment: downpaymentAmt,
      currency,
      packageName: pkg?.name ?? null,
      packageIncludes: pkgIncludes,
      notes: booking.notes,
      // The PDF prints these rather than re-deriving them, so the document row
      // and the document itself can never disagree again.
      addons: addonLines,
      billedAddons: billedAddons.map(({ label, price }) => ({ label, price })),
      packagePrice: round2(booking.agreed_price ?? 0),
      received,
    },
    contact: {
      name: contact?.name ?? null,
      billingAddress: contact?.billing_address ?? null,
      billingPostalCode: contact?.billing_postal_code ?? null,
      billingCity: contact?.billing_city ?? null,
      billingCountry: contact?.billing_country ?? null,
      email: contact?.email ?? null,
    },
    experience: {
      title: exp.title,
    },
    edition: ed
      ? {
          label: ed.label,
          dateStart: ed.date_start,
          dateEnd: ed.date_end,
        }
      : null,
    dueDate: isProforma ? proformaDue : null,
  };

  // 4. Render PDF
  const element = buildInvoiceDocument(invoiceData);
  // React.createElement is already used inside buildInvoiceDocument; wrap in a
  // plain React.createElement call to satisfy renderToBuffer's type expectation.
  const pdfBuffer = await renderToBuffer(element as React.ReactElement<ReactPDF.DocumentProps>);

  // 5. Upload to Storage
  const admin = getDb();
  const fileSlug = invoiceNumber
    ? invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
    : type;
  const filePath = `${division}/${bookingId}/${fileSlug}.pdf`;

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    // Storage bucket may not exist pre-migration / before bucket creation
    throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);
  }

  // 6. Determine amount for the documents row
  let amount: number | null = null;
  if (type === "proforma_invoice") amount = proformaAmt;
  else if (type === "deposit_invoice") amount = depositAmt;
  else if (type === "downpayment_invoice") amount = downpaymentAmt;
  else if (type === "final_invoice") amount = finalAmt;
  else if (type === "addon_invoice") amount = addonAmt;

  // 7. Insert documents row
  const docRow = {
    booking_id: bookingId,
    contact_id: booking.contact_id,
    division,
    type,
    invoice_number: invoiceNumber,
    title: isInvoice
      ? `${
          type === "proforma_invoice"
            ? "Pro-forma Invoice (Payment Request)"
            : type === "deposit_invoice"
            ? "Deposit Invoice"
            : type === "downpayment_invoice"
            ? "Down-Payment Invoice"
            : type === "addon_invoice"
            ? "Add-on Invoice"
            // A 1–2 day clinic is bought outright, so "Final Invoice" reads as
            // the last of several instalments that never existed. It is simply
            // the invoice.
            : ed?.kind === "event"
            ? "Invoice"
            : "Final Invoice"
        } – ${exp.title}${ed?.label ? " · " + ed.label : ""}`
      : `Booking Confirmation – ${exp.title}${ed?.label ? " · " + ed.label : ""}`,
    file_path: filePath,
    amount,
    currency,
    status: "issued",
    issued_at: new Date().toISOString(),
    // The pro-forma's deadline drives recon's "what's due next" + the promote
    // step knows which milestone it stands in for.
    ...(isProforma ? { due_date: proformaDue } : {}),
    meta: {
      booking_id: bookingId,
      experience_title: exp.title,
      edition_label: ed?.label ?? null,
      package_name: pkg?.name ?? null,
      ...(isProforma ? { milestone: proformaMilestone } : {}),
    },
  };

  // Update-in-place for an existing pro-forma (resync after an add-on change) —
  // its PDF was just re-uploaded above (upsert); refresh amount/due/meta. New
  // documents are inserted.
  /*
   * A FINAL invoice economically contains every confirmed, still-unstamped
   * add-on — its amount is total − received − other invoices, and the add-ons
   * are inside that total. But only the addon_invoice path ever wrote
   * invoiced_in, so rows billed inside a final stayed unstamped and the
   * "Add-on invoice" button could bill the same nights a SECOND time on a
   * fresh gapless number. Stamp them with the final's id; pay-direct rows are
   * the supplier's money and stay out.
   */
  async function stampFinalAddons(docId: string) {
    if (type !== "final_invoice") return;
    await admin.from("exp_booking_addons")
      .update({ invoiced_in: docId })
      .eq("booking_id", bookingId)
      .eq("status", "confirmed")
      .is("invoiced_in", null)
      .gt("price", 0)
      .or("payment_mode.is.null,payment_mode.eq.np7");
  }

  if (reuseRow) {
    const { data: updated, error: updErr } = await admin
      .from("documents")
      .update({ amount, title: docRow.title, meta: docRow.meta })
      .eq("id", reuseRow.id)
      .select()
      .single();
    if (updErr) throw new Error(`Failed to re-issue ${reuseRow.invoice_number}: ${updErr.message}`);
    await stampFinalAddons(reuseRow.id);
    return Object.assign(updated as DocumentRow, { pdf: pdfBuffer });
  }

  if (existingProforma) {
    const { data: updated, error: updErr } = await admin
      .from("documents")
      .update({ amount, due_date: proformaDue ?? null, title: docRow.title, meta: docRow.meta, issued_at: docRow.issued_at })
      .eq("id", existingProforma.id)
      .select()
      .single();
    if (updErr) throw new Error(`Failed to update pro-forma: ${updErr.message}`);
    return Object.assign(updated as DocumentRow, { pdf: pdfBuffer });
  }

  const { data: inserted, error: insertError } = await admin
    .from("documents")
    .insert(docRow)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "42P01" || insertError.message?.includes("does not exist")) {
      throw new Error("Migration 021 not applied: documents table missing.");
    }
    throw new Error(`Failed to insert document row: ${insertError.message}`);
  }

  // Stamp the billed add-on rows with this invoice — the double-billing lock.
  // Voiding the document releases them (documents PATCH route).
  if (type === "addon_invoice" && billedAddons.length) {
    await admin.from("exp_booking_addons")
      .update({ invoiced_in: (inserted as DocumentRow).id })
      .in("id", billedAddons.map((a) => a.id));
  }
  await stampFinalAddons((inserted as DocumentRow).id);

  // Callers that email the document right away get the buffer for free
  // (saves a signed-URL download round-trip).
  return Object.assign(inserted as DocumentRow, { pdf: pdfBuffer });
}

// ─── Import type shim ─────────────────────────────────────────────────────────
// The @react-pdf/renderer types use a `ReactPDF` namespace imported from the
// package. We need it for the renderToBuffer call above.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace ReactPDF {
  interface DocumentProps {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  }
}


// ─── Credit note / Storno ─────────────────────────────────────────────────────

export type CreditNoteInput = {
  bookingId: string;
  /** The issued tax invoice being corrected. */
  originalDocumentId: string;
  /** Omit for a FULL cancellation of the original; set for a partial credit. */
  amount?: number;
  /** Printed on the document — a correction without a stated reason reads as an error. */
  reason: string;
};

/**
 * A legally-shaped correction document (§14/§17 UStG logic, margin-scheme
 * aware): its own number from the same gapless circle, a mandatory reference
 * to the original invoice, a negative total, and no payment request. The
 * documents row stores the amount NEGATIVE so `issuedInvoiceTotal` nets it
 * out and the booking's billing state stays truthful.
 */
export async function generateCreditNote(input: CreditNoteInput): Promise<DocumentRow> {
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new Error("A credit note needs a reason — it is printed on the document.");

  const db = getDb();
  const { data: orig } = await db.from("documents").select("*").eq("id", input.originalDocumentId).maybeSingle();
  if (!orig) throw new Error("Original invoice not found.");
  const o = orig as DocumentRow;
  if (o.booking_id !== input.bookingId) throw new Error("That invoice belongs to a different booking.");
  if (o.status !== "issued") throw new Error("Only an issued invoice can be corrected.");
  if (!["deposit_invoice", "downpayment_invoice", "final_invoice"].includes(o.type)) {
    throw new Error(o.type === "proforma_invoice"
      ? "A pro-forma is a payment request, not a tax invoice — void or re-issue it, no Storno needed."
      : "Only tax invoices (deposit / down-payment / final) can be corrected with a credit note.");
  }
  if (!o.invoice_number) throw new Error("The original invoice has no number — cannot reference it.");

  const originalAmount = round2(Number(o.amount) || 0);
  if (originalAmount <= 0) throw new Error("The original invoice has no positive amount to credit.");
  const amount = round2(input.amount ?? originalAmount);
  if (!(amount > 0)) throw new Error("The credit amount must be positive.");
  if (amount > originalAmount + 0.005) {
    throw new Error(`The credit (${amount}) cannot exceed the original invoice amount (${originalAmount}).`);
  }
  // Guard against double-correcting: existing credits against this original.
  const { data: priorRows } = await db.from("documents").select("amount,meta,status")
    .eq("booking_id", input.bookingId).eq("type", "credit_note").eq("status", "issued");
  const priorCredit = round2(((priorRows ?? []) as { amount: number | null; meta: Record<string, unknown> | null }[])
    .filter((r) => (r.meta as { original_document_id?: string } | null)?.original_document_id === o.id)
    .reduce((s2, r) => s2 + Math.abs(Number(r.amount) || 0), 0));
  if (priorCredit + amount > originalAmount + 0.005) {
    throw new Error(`Already credited ${priorCredit} against this invoice — only ${round2(originalAmount - priorCredit)} left to credit.`);
  }
  const full = Math.abs(amount - originalAmount) < 0.01 && priorCredit === 0;

  const division = o.division ?? "experience";
  const [booking, company] = await Promise.all([resolveBooking(input.bookingId), resolveCompanySettings(division)]);
  const contact = booking.contacts;
  const year = new Date().getFullYear();
  const seq = await allocateInvoiceNumber(division, year);
  const invoiceNumber = formatInvoiceNumber(company.invoice_prefix, year, seq);
  const currency = o.currency || company.currency || "EUR";

  const element = buildCreditNoteDocument({
    company,
    invoiceNumber,
    invoiceDate: new Date().toISOString().slice(0, 10),
    original: { number: o.invoice_number, date: o.issued_at ?? o.created_at, amount: originalAmount },
    amount,
    full,
    reason,
    currency,
    contact: {
      name: contact?.name ?? null,
      billingAddress: contact?.billing_address ?? null,
      billingPostalCode: contact?.billing_postal_code ?? null,
      billingCity: contact?.billing_city ?? null,
      billingCountry: contact?.billing_country ?? null,
      email: contact?.email ?? null,
    },
    experience: { title: booking.exp_experiences?.title ?? "NP7 Experience" },
    edition: booking.exp_editions
      ? { label: booking.exp_editions.label, dateStart: booking.exp_editions.date_start, dateEnd: booking.exp_editions.date_end }
      : null,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any);

  const fileSlug = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = `${division}/${input.bookingId}/${fileSlug}.pdf`;
  const { error: uploadError } = await db.storage
    .from("documents").upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`Failed to upload PDF to storage: ${uploadError.message}`);

  const docRow = {
    booking_id: input.bookingId,
    contact_id: booking.contact_id,
    division,
    type: "credit_note" as const,
    invoice_number: invoiceNumber,
    title: full
      ? `Cancellation Invoice (Storno) for ${o.invoice_number}`
      : `Credit Note for ${o.invoice_number}`,
    file_path: filePath,
    amount: -amount,
    currency,
    status: "issued" as const,
    meta: { original_document_id: o.id, original_invoice_number: o.invoice_number, reason, full },
  };
  const { data: inserted, error: insErr } = await db.from("documents").insert(docRow).select("*").single();
  if (insErr) throw new Error(`Failed to save the credit note: ${insErr.message}`);
  return inserted as DocumentRow;
}
