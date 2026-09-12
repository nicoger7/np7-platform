/**
 * POST /api/admin/bank/[id] — act on one transaction.
 *
 *   Money in (unchanged):
 *   { action: "match",   documentId }  book it against an invoice
 *   { action: "unmatch" }              undo that
 *
 *   Money out:
 *   { action: "allocate-cost",   allocations: [{ costId, amount }] }
 *                                      allocate the debit to cost lines (partial
 *                                      allowed, over-allocation refused)
 *   { action: "create-cost",     cost: { item, scope, edition_id, experience_id,
 *                                        year, scope_reason, margin_class, notes },
 *                                amount? }
 *                                      no expected line exists: create one in the
 *                                      chosen scope, marked unplanned, and allocate
 *   { action: "unallocate-cost", costId? }
 *                                      undo an allocation (all of them without costId)
 *
 *   Either:
 *   { action: "ignore",  reason }      set it aside (never a delete)
 *   { action: "unignore" }
 *   { action: "kind",    kind }        correct what sort of movement it is
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate } from "@/lib/admin-auth";
import { getRequestMember } from "@/lib/admin-auth";
import { createClient } from "@supabase/supabase-js";
import { allocateTransaction, unmatch, type Allocation } from "@/lib/bank/store";
import { allocateDebitToCosts, createCostFromDebit, unallocateDebit, type CostAllocation } from "@/lib/bank/costs";

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

  if (action === "allocate-cost") {
    /* The debit side of "match". `allocations` is the real shape; a bare
       costId is the one-line shorthand and means "what is left of it". */
    const raw = Array.isArray(body.allocations) ? (body.allocations as unknown[]) : null;
    let allocations: CostAllocation[];
    if (raw) {
      allocations = raw
        .map((a) => a as { costId?: unknown; amount?: unknown })
        .filter((a) => typeof a.costId === "string" && a.costId)
        .map((a) => ({ costId: String(a.costId), amount: Number(a.amount) }))
        .filter((a) => Number.isFinite(a.amount) && a.amount > 0);
      if (!allocations.length) {
        return NextResponse.json({ error: "Every allocation needs a cost line and a positive amount." }, { status: 400 });
      }
    } else {
      const costId = String(body.costId ?? "");
      if (!costId) return NextResponse.json({ error: "costId is required." }, { status: 400 });
      const { data: tx } = await admin.from("bank_transactions").select("amount").eq("id", id).maybeSingle();
      const { data: existing } = await admin.from("exp_payments").select("amount").eq("bank_transaction_id", id).eq("direction", "cost");
      const already = (existing ?? []).reduce((n, p) => n + (Number(p.amount) || 0), 0);
      const left = Math.round((Math.abs(Number(tx?.amount ?? 0)) - already) * 100) / 100;
      const amount = body.amount == null ? left : Number(body.amount);
      allocations = [{ costId, amount }];
    }
    const res = await allocateDebitToCosts({
      transactionId: id,
      allocations,
      by,
      confidence: body.fromSuggestion ? "suggested" : "manual",
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, paymentIds: res.paymentIds, allocated: res.allocated, remaining: res.remaining });
  }

  if (action === "create-cost") {
    const cost = (body.cost ?? {}) as Record<string, unknown>;
    const res = await createCostFromDebit({
      transactionId: id,
      cost: {
        item: String(cost.item ?? ""),
        scope: cost.scope, edition_id: cost.edition_id, experience_id: cost.experience_id,
        year: cost.year, scope_reason: cost.scope_reason, margin_class: cost.margin_class,
        notes: typeof cost.notes === "string" ? cost.notes : null,
      },
      amount: body.amount == null || body.amount === "" ? null : Number(body.amount),
      by,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, costId: res.costId, paymentIds: res.paymentIds, allocated: res.allocated, remaining: res.remaining });
  }

  if (action === "unallocate-cost") {
    const res = await unallocateDebit(id, typeof body.costId === "string" ? body.costId : null);
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
