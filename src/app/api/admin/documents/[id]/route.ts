import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { settleInvoices } from "@/lib/invoices/generate";
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
  const body: { status?: string; reason?: string } = await request.json();
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
  let voidedCorrectionOf: { originalId: string; docId: string } | null = null;
  if (body.status === "void") {
    const { data: doc } = await db
      .from("documents").select("id, sent_at, type, invoice_number, meta, status").eq("id", id).maybeSingle();
    const isTax = doc && !["proforma_invoice", "booking_confirmation"].includes(String(doc.type));
    if (doc?.sent_at && isTax) {
      return NextResponse.json({
        error: doc.type === "credit_note"
          ? `${doc.invoice_number ?? "This correction"} has already been sent to the customer. A sent correction is not cancelled; if it was wrong, invoice the amount again.`
          : `${doc.invoice_number ?? "This invoice"} has already been sent to the customer, so voiding it here would change nothing on their side. Issue a Storno instead: "Storno…" on this invoice.`,
      }, { status: 409 });
    }
    /*
     * An invoice that a Storno or credit note stands against cannot be
     * written off as a Fehldruck: the correction names it, and a cancelled
     * original would leave that correction pointing at nothing. Cancel the
     * correction first (if it was never sent) and the invoice is free again.
     */
    const corrected = (doc?.meta ?? {}) as { reversed_by?: string; reversed_by_number?: string; credited_by?: string[] };
    if (doc && isTax && doc.type !== "credit_note" && (corrected.reversed_by || (corrected.credited_by ?? []).length)) {
      return NextResponse.json({
        error: `${doc.invoice_number ?? "This invoice"} has been corrected by ${corrected.reversed_by_number ?? "a credit note"}. Cancel that correction first, or leave both standing.`,
      }, { status: 409 });
    }
    // Cancelling an unsent correction frees the invoice it named.
    const cm = (doc?.meta ?? {}) as { original_document_id?: string };
    if (doc?.type === "credit_note" && doc.status === "issued" && cm.original_document_id) {
      voidedCorrectionOf = { originalId: cm.original_document_id, docId: doc.id };
    }

    /*
     * A cancelled tax-invoice number has to say why, in writing, on the row.
     *
     * The gapless sequence is kept precisely so it can be read back, and today
     * it cannot be: NP7-XP-2026-0003, 0004 and 0005 are three cancelled
     * €4,595 finals on one Alaçatı booking, 0033 and 0034 two more on another,
     * and not one of them carries a sentence explaining itself. They were
     * duplicates pressed minutes apart and replaced immediately — perfectly
     * ordinary — but nothing in the books says so, and "it was wrong" is not
     * an answer to give a Steuerberater a year from now.
     *
     * A pro-forma is exempt: voiding one is routine bookkeeping (a payment
     * request replaced by the invoice it turned into) and promote.ts does it
     * automatically on every payment, with its own superseded_reason.
     */
    if (isTax) {
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json({
          error: `Say why ${doc.invoice_number ?? "this invoice"} is being cancelled. The number stays in the sequence, so the reason has to stay with it.`,
        }, { status: 400 });
      }
      updates.meta = {
        ...((doc.meta ?? {}) as Record<string, unknown>),
        void_reason: reason,
        voided_at: new Date().toISOString(),
      };
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

  // The original's back-link goes with the cancelled correction, so the
  // invoice reads uncorrected again and can be corrected properly. Its paid
  // stamp is recomputed for the same reason.
  if (voidedCorrectionOf) {
    const { data: orig } = await db.from("documents").select("id, booking_id, meta").eq("id", voidedCorrectionOf.originalId).maybeSingle();
    if (orig) {
      const meta = { ...((orig.meta ?? {}) as Record<string, unknown>) } as { reversed_by?: string; reversed_by_number?: string; reversed_at?: string; credited_by?: string[] };
      if (meta.reversed_by === voidedCorrectionOf.docId) { delete meta.reversed_by; delete meta.reversed_by_number; delete meta.reversed_at; }
      if (Array.isArray(meta.credited_by)) meta.credited_by = meta.credited_by.filter((x) => x !== voidedCorrectionOf!.docId);
      await db.from("documents").update({ meta }).eq("id", orig.id);
      if (orig.booking_id) await settleInvoices(orig.booking_id).catch(() => {});
    }
  }

  return NextResponse.json(data);
}
