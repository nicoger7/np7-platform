import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { assertActual, assertLine, moneyWorlds } from "@/lib/finance/guard";
import { type WorldId } from "@/lib/access";
import { r2 } from "@/lib/finance/board";

/** Refuses, or hands back the worlds this caller may see money in. The routes
 *  need those: every id they accept has to be checked against them. */
async function guard(): Promise<NextResponse | { worlds: WorldId[] }> {
  const access = await getRequestAccess();
  // No identity is not permission: getRequestAccess() returns null for an
  // unauthenticated or non-team caller, and `access && …` let exactly that
  // caller through to the service-role client below.
  const worlds = access ? moneyWorlds(access) : [];
  if (!access || !worlds.length) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  return { worlds };
}

/**
 * POST /api/admin/finance/allocations — attach a recorded cost to a planned line.
 * body: { actual_id, plan_line_id, amount? }
 *
 * A hotel bill that covers two editions is attached twice, part to each, which
 * is why this is an amount and not a flag. Over-attaching is refused: the sum
 * of a cost's allocations can never exceed the cost.
 */
export async function POST(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { actual_id, plan_line_id, amount } = await req.json();
  // Both ends have to be ours: an Experience invoice must not be attachable to
  // a Performance budget line, in either direction.
  const worlds = gate.worlds;
  const notOurs = (await assertActual(db, actual_id, worlds)) ?? (await assertLine(db, plan_line_id, worlds));
  if (notOurs) return notOurs;
  if (!actual_id || !plan_line_id) {
    return NextResponse.json({ error: "Needs a cost and a line to attach it to." }, { status: 400 });
  }

  const { data: actual } = await db.from("fin_actuals").select("amount_net").eq("id", actual_id).maybeSingle();
  if (!actual) return NextResponse.json({ error: "That cost no longer exists." }, { status: 404 });

  const { data: existing } = await db
    .from("fin_actual_allocations").select("plan_line_id,amount").eq("actual_id", actual_id);
  const used = r2(((existing ?? []) as { plan_line_id: string; amount: number }[])
    .filter((a) => a.plan_line_id !== plan_line_id)
    .reduce((s, a) => s + (Number(a.amount) || 0), 0));

  const total = r2(Number(actual.amount_net) || 0);
  const want = amount != null && amount !== "" ? r2(Number(amount)) : r2(total - used);
  if (!(want > 0)) return NextResponse.json({ error: "Nothing left of this cost to attach." }, { status: 400 });
  if (used + want > total + 0.005) {
    return NextResponse.json(
      { error: `Only ${r2(total - used)} of this cost is still unattached.` }, { status: 400 },
    );
  }

  // Re-attaching to the same line replaces the amount rather than erroring on
  // the unique constraint, because that is what the second attempt meant.
  const { error } = await db.from("fin_actual_allocations")
    .upsert({ actual_id, plan_line_id, amount: want }, { onConflict: "actual_id,plan_line_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, amount: want });
}

/** DELETE /api/admin/finance/allocations — detach. The cost itself survives. */
export async function DELETE(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { actual_id, plan_line_id } = await req.json();
  if (!actual_id || !plan_line_id) return NextResponse.json({ error: "Which attachment?" }, { status: 400 });
  const worlds = gate.worlds;
  const notOurs = (await assertActual(db, actual_id, worlds)) ?? (await assertLine(db, plan_line_id, worlds));
  if (notOurs) return notOurs;
  const { error } = await db.from("fin_actual_allocations")
    .delete().eq("actual_id", actual_id).eq("plan_line_id", plan_line_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
