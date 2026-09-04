import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import type { CompanySettings } from "@/lib/invoices/types";
import { DIVISIONS } from "@/lib/invoices/types";
import { revalidateLegal } from "@/lib/revalidate-public";
import { requireAdminGate } from "@/lib/admin-auth";
// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ division: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /(company_settings|relation|schema cache|does not exist)/i.test(message)
  );
}

const COMPANY_COLUMNS = [
  "legal_name",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country",
  "email",
  "phone",
  "website",
  "vat_id",
  "tax_number",
  "register_info",
  "managing_director",
  "iban",
  "bic",
  "bank_name",
  "logo_url",
  "currency",
  "vat_mode",
  "vat_rate",
  "invoice_prefix",
  "invoice_footer",
  "terms_url",
  "sicherungsschein_insurer",
  "sicherungsschein_number",
] as const;

type CompanyColumn = (typeof COMPANY_COLUMNS)[number];

function emptySettings(division: string): { division: string } {
  return { division };
}

// ─── GET /api/admin/company-settings/[division] ───────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { division } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data, error } = await db
    .from("company_settings")
    .select("*")
    .eq("division", division)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(emptySettings(division));
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? emptySettings(division));
}

// ─── PUT /api/admin/company-settings/[division] ───────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { division } = await params;

  if (!DIVISIONS.includes(division as "experience" | "hardware")) {
    return NextResponse.json(
      { error: `Unknown division "${division}". Must be one of: ${DIVISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const body: Record<string, unknown> = await request.json();

  // Refuse an IBAN that cannot possibly be right. This field prints on every
  // invoice, and a bad one is invisible until a customer's bank rejects the
  // transfer — which is exactly how NP7's own 20-character German IBAN was
  // found, by voice message, long after the invoices went out.
  if ("iban" in body) {
    const { checkIban } = await import("@/lib/iban");
    const verdict = checkIban(body.iban as string | null);
    if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Whitelist columns
  const updates: Record<string, unknown> = {};
  for (const col of COMPANY_COLUMNS) {
    if (col in body) {
      const val = body[col as CompanyColumn];
      if (col === "vat_rate") {
        updates[col] = val === null || val === "" || val === undefined
          ? null
          : Number(val);
      } else {
        updates[col] = val;
      }
    }
  }

  const row: Record<string, unknown> = {
    ...updates,
    division,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("company_settings")
    .upsert(row, { onConflict: "division" })
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "Run migration 021 in the Supabase SQL editor first (company_settings table missing)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Impressum / privacy / terms / Widerrufsbelehrung all render getLegalEntity()
  // → company_settings, and they are cached for a day. A legal page must never
  // sit on a stale address or VAT id, so push the change out immediately.
  if (division === "experience") revalidateLegal();

  return NextResponse.json(data);
}
