import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { r2 } from "@/lib/finance/board";

async function guard() {
  const access = await getRequestAccess();
  if (access && !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  return null;
}

const EDITABLE = [
  "description", "document_number", "category_id", "vendor_id", "amount_net", "amount_vat",
  "amount_gross", "incurred_on", "due_on", "paid_on", "note", "entity_id",
] as const;

/** PATCH /api/admin/finance/actuals/[id] — correct a recorded cost. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(); if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (body[k] !== undefined) patch[k] = body[k] === "" ? null : body[k];

  // Shrinking a cost below what has been attached would make the plan lie.
  if (patch.amount_net !== undefined && patch.amount_net !== null) {
    const { data: allocs } = await db
      .from("fin_actual_allocations").select("amount").eq("actual_id", id);
    const used = r2(((allocs ?? []) as { amount: number }[]).reduce((s, a) => s + (Number(a.amount) || 0), 0));
    if (Number(patch.amount_net) + 0.005 < used) {
      return NextResponse.json(
        { error: `${used} of this cost is attached to planned lines. Detach some before reducing it below that.` },
        { status: 400 },
      );
    }
  }

  const { data, error } = await db.from("fin_actuals").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** DELETE /api/admin/finance/actuals/[id] — its attachments go with it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(); if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("fin_actuals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
