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
  exp_packages: { name: string | null; deposit: number | null } | null;
};

async function resolveBooking(bookingId: string): Promise<ResolvedBooking> {
  const db = getDb();
  const { data, error } = await db
    .from("exp_bookings")
    .select(
      `id, contact_id, experience_id, edition_id, package_id,
       agreed_price, downpayment_received, final_payment_received, notes,
       contacts(name, email, billing_address, billing_postal_code, billing_city, billing_country),
       exp_experiences(title, slug),
       exp_editions(label, year, date_start, date_end, deposit),
       exp_packages(name, deposit)`
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

  const deposit = computeDeposit(booking);
  const total = booking.agreed_price ?? 0;
  const balance = total - deposit;
  const currency = company.currency || "EUR";
  const isInvoice = type !== "booking_confirmation";
  const year = new Date().getFullYear();

  // 2. Allocate invoice number (only for invoice types)
  let invoiceNumber: string | null = null;
  if (isInvoice) {
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
      deposit,
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
  if (type === "deposit_invoice") amount = deposit;
  else if (type === "final_invoice") amount = balance;

  // 7. Insert documents row
  const docRow = {
    booking_id: bookingId,
    contact_id: booking.contact_id,
    division,
    type,
    invoice_number: invoiceNumber,
    title: isInvoice
      ? `${type === "deposit_invoice" ? "Deposit Invoice" : "Invoice"} – ${exp.title}${ed?.label ? " · " + ed.label : ""}`
      : `Booking Confirmation – ${exp.title}${ed?.label ? " · " + ed.label : ""}`,
    file_path: filePath,
    amount,
    currency,
    status: "issued",
    issued_at: new Date().toISOString(),
    meta: {
      booking_id: bookingId,
      experience_title: exp.title,
      edition_label: ed?.label ?? null,
      package_name: pkg?.name ?? null,
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

  return inserted as DocumentRow;
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
