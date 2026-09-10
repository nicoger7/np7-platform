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
import { allocateTransaction, unmatch, type Allocation } from "@/lib/bank/store";

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
    /* One transfer can settle several invoices — a guest pays their balance,
       not their paperwork. `allocations` is the real shape; a bare documentId
       is the one-invoice shorthand and means "all of it". */
    const raw = Array.isArray(body.allocations) ? (body.allocations as unknown[]) : null;
    let allocations: Allocation[];

    if (raw) {
      allocations = raw
        .map((a) => a as { documentId?: unknown; amount?: unknown })
        .filter((a) => typeof a.documentId === "string" && a.documentId)
        .map((a) => ({ documentId: String(a.documentId), amount: Number(a.amount) }))
        .filter((a) => Number.isFinite(a.amount) && a.amount > 0);
      if (!allocations.length) {
        return NextResponse.json({ error: "Every allocation needs an invoice and a positive amount." }, { status: 400 });
      }
      const seen = new Set(allocations.map((a) => a.documentId));
      if (seen.size !== allocations.length) {
        return NextResponse.json({ error: "The same invoice is listed twice." }, { status: 400 });
      }
    } else {
      const documentId = String(body.documentId ?? "");
      if (!documentId) return NextResponse.json({ error: "documentId is required." }, { status: 400 });
      const { data: tx } = await admin.from("bank_transactions").select("amount").eq("id", id).maybeSingle();
      allocations = [{ documentId, amount: Number(tx?.amount ?? 0) }];
    }

    const res = await allocateTransaction({
      transactionId: id,
      allocations,
      by,
      // A suggestion someone clicked is not the same as one nobody looked at.
      confidence: body.fromSuggestion ? "suggested" : "manual",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, paymentIds: res.paymentIds, allocated: res.allocated, remaining: res.remaining });
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
