import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { generateDocument } from "@/lib/invoices/generate";
import { DOCUMENT_TYPES } from "@/lib/invoices/types";
import type { DocumentType, GeneratableType } from "@/lib/invoices/types";

// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /(documents|company_settings|invoice_counters|relation|schema cache|does not exist)/i.test(
      message
    )
  );
}

async function attachSignedUrl(
  db: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!row.file_path) return { ...row, signedUrl: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).storage
    .from("documents")
    .createSignedUrl(row.file_path as string, 3600);
  return { ...row, signedUrl: data?.signedUrl ?? null };
}

// ─── GET /api/admin/bookings/[id]/documents ───────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { data, error } = await dbAny
    .from("documents")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ documents: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = await Promise.all(
    (data ?? []).map((row: Record<string, unknown>) => attachSignedUrl(db, row))
  );

  return NextResponse.json({ documents: rows });
}

// ─── POST /api/admin/bookings/[id]/documents ──────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const body: { type?: string } = await request.json();

  const type = body.type as DocumentType | undefined;

  if (
    !type ||
    !["deposit_invoice", "downpayment_invoice", "final_invoice", "booking_confirmation"].includes(type)
  ) {
    return NextResponse.json(
      {
        error: `Invalid type. Must be one of: deposit_invoice, downpayment_invoice, final_invoice, booking_confirmation. Got: "${type ?? ""}"`,
      },
      { status: 400 }
    );
  }

  // Satisfy TypeScript narrowing — we've verified it above
  const safeType = type as GeneratableType;

  try {
    const row = await generateDocument({ bookingId: id, type: safeType });

    // Attach a fresh signed URL to the returned row
    const db = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withUrl = await attachSignedUrl(db, row as unknown as Record<string, unknown>);
    return NextResponse.json(withUrl, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface migration hint clearly
    const status = /(migration 021|missing table|does not exist)/i.test(message)
      ? 503
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// Re-export so TypeScript knows we're using the import
void DOCUMENT_TYPES;
