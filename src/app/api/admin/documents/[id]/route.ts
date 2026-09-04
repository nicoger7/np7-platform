import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Match a genuinely-missing TABLE (relation), not a missing column — otherwise
// "column documents.updated_at does not exist" was wrongly read as "table missing"
// and returned a 503, silently breaking Void.
function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /schema cache|could not find the table|relation .* does not exist/i.test(message)
  );
}

// ─── GET /api/admin/documents/[id] ───────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { data, error } = await dbAny
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Run migration 021 first (documents table missing)." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let signedUrl: string | null = null;
  if (data.file_path) {
    const { data: urlData } = await dbAny.storage
      .from("documents")
      .createSignedUrl(data.file_path as string, 3600);
    signedUrl = urlData?.signedUrl ?? null;
  }

  return NextResponse.json({ ...data, signedUrl });
}

// ─── PATCH /api/admin/documents/[id] ─────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body: { status?: string } = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["issued", "void"].includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status "${body.status}". Must be "issued" or "void".` },
        { status: 400 }
      );
    }
    updates.status = body.status;
  }

  /*
   * An invoice the customer already holds cannot be cancelled by us alone.
   *
   * Void is the right tool for paper that never left the house: the row keeps
   * its number, stays visible and reads "void", so the gapless sequence still
   * tells a complete story. Once it has been SENT that stops being true — the
   * customer has a valid invoice in their own books, and a flag flipped over
   * here reaches nobody. The correction they need is a Storno: its own
   * document, its own number, showing what was reversed.
   *
   * That generator already exists (generateCreditNote — "Storno…" on the
   * booking's Documents tab). This only stops the wrong door being used.
   */
  if (body.status === "void") {
    const { data: doc } = await db
      .from("documents").select("sent_at, type, invoice_number").eq("id", id).maybeSingle();
    const isTax = doc && !["proforma_invoice", "booking_confirmation"].includes(String(doc.type));
    if (doc?.sent_at && isTax) {
      return NextResponse.json({
        error: `${doc.invoice_number ?? "This invoice"} has already been sent to the customer, so voiding it here would change nothing on their side. Issue a Storno instead — "Storno…" on this invoice.`,
      }, { status: 409 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // NB: the `documents` table has no `updated_at` column — don't write one.
  const { data, error } = await db
    .from("documents")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "Run migration 021 first (documents table missing)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Voiding an add-on invoice releases its stamped add-on rows, so they are
  // billable again on the next add-on invoice. (A later re-issue toggle does
  // NOT re-stamp — the rows may have been billed elsewhere meanwhile.)
  if (body.status === "void" && data?.type === "addon_invoice") {
    await db.from("exp_booking_addons").update({ invoiced_in: null }).eq("invoiced_in", id);
  }

  return NextResponse.json(data);
}
