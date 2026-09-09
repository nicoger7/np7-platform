/**
 * POST /api/admin/bank/[id] — act on one transaction.
 *
 *   { action: "match",   documentId }  book it against an invoice
 *   { action: "unmatch" }              undo that
 *   { action: "ignore",  reason }      set it aside (never a delete)
 *   { action: "unignore" }
 *   { action: "kind",    kind }        correct what sort of movement it is
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { getRequestMember } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";
import { matchToInvoice, unmatch } from "@/lib/bank/store";

type Ctx = { params: Promise<{ id: string }> };

const KINDS = ["income", "expense", "payout", "fee", "transfer", "unknown"];

export async function POST(request: NextRequest, { params }: Ctx) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? "");

  const member = await getRequestMember();
  const by = member?.id ?? "admin";

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  if (action === "match") {
    const documentId = String(body.documentId ?? "");
    if (!documentId) return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    const res = await matchToInvoice({
      transactionId: id,
      documentId,
      by,
      // A suggestion someone clicked is not the same as one nobody looked at.
      confidence: body.fromSuggestion ? "suggested" : "manual",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, paymentId: res.paymentId });
  }

  if (action === "unmatch") {
    const res = await unmatch(id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "ignore") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "Say why it is being set aside — it stays on the row." }, { status: 400 });
    const { error } = await admin
      .from("bank_transactions")
      .update({ ignored_at: new Date().toISOString(), ignored_reason: reason })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "unignore") {
    const { error } = await admin
      .from("bank_transactions")
      .update({ ignored_at: null, ignored_reason: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "kind") {
    const kind = String(body.kind ?? "");
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}.` }, { status: 400 });
    }
    const { error } = await admin.from("bank_transactions").update({ kind }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
