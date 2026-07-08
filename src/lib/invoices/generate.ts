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
import { buildInvoiceDocument, type InvoiceData } from "./template";
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

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
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
    deposit: number | null;
  } | null;
  exp_packages: {
    name: string | null;
    deposit: number | null;
    downpayment_percent: number | null;
    final_days_before: number | null;
    deposit_refund_days: number | null;
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
       exp_editions(label, year, date_start, date_end, deposit),
       exp_packages(name, deposit, downpayment_percent, final_days_before, deposit_refund_days)`
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
  // plan (computePaymentPlan). Deposit honours an edition-level override; the
  // rest of the schedule (down-payment %, final timing) comes from the package.
  const total = booking.agreed_price ?? 0;
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
  const finalAmt = milestoneAmount("final", cfg, state);

  const currency = company.currency || "EUR";
  const isInvoice = type !== "booking_confirmation";
  const isProforma = type === "proforma_invoice";
  const year = new Date().getFullYear();

  // Pro-forma = payment request for the SECURING payment (deposit if set, else
  // downpayment), due X days after sign-up. Idempotent: a live pro-forma for
  // this booking is returned as-is (double-clicks / repeat registrations).
  const securingAmt = depositAmt > 0 ? depositAmt : downpaymentAmt;
  const proformaDue = booking.created_at
    ? addDays(booking.created_at, cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays)
    : null;
  if (isProforma) {
    if (securingAmt <= 0) throw new Error("Nothing to request — this booking has no securing payment stage.");
    const admin0 = getDb();
    const { data: existing } = await admin0
      .from("documents")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("type", "proforma_invoice")
      .eq("status", "issued")
      .maybeSingle();
    if (existing) return existing as DocumentRow;
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

  // 2. Allocate invoice number. Pro-formas do NOT burn the gapless tax-invoice
  // counter — they get a deterministic PF reference (unique per booking) the
  // rider quotes on the transfer, which reconciliation matches like any other.
  let invoiceNumber: string | null = null;
  if (isProforma) {
    invoiceNumber = `PF-${company.invoice_prefix || "INV"}-${year}-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  } else if (isInvoice) {
    const seq = await allocateInvoiceNumber(division, year);
    invoiceNumber = formatInvoiceNumber(company.invoice_prefix, year, seq);
  }

  // 3. Build InvoiceData for template
  const contact = booking.contacts;
  const ed = booking.exp_editions;
  const exp = booking.exp_experiences;
  const pkg = booking.exp_packages;

  if (!exp) throw new Error(`Booking ${bookingId} has no associated experience.`);

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
      notes: booking.notes,
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
  if (type === "proforma_invoice") amount = securingAmt;
  else if (type === "deposit_invoice") amount = depositAmt;
  else if (type === "downpayment_invoice") amount = downpaymentAmt;
  else if (type === "final_invoice") amount = finalAmt;

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
      ...(isProforma ? { milestone: depositAmt > 0 ? "deposit" : "downpayment" } : {}),
    },
  };

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
