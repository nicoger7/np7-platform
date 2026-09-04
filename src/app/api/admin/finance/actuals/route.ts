import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { moneyWorlds } from "@/lib/finance/guard";
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
 * GET /api/admin/finance/actuals?entity=&year=&unallocated=1
 * The pool of real costs, for the attach picker and the actuals list.
 */
export async function GET(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const entityId = searchParams.get("entity");

  let q = db.from("fin_actuals")
    .select("id,description,document_number,amount_net,amount_vat,amount_gross,incurred_on,due_on,paid_on,category_id,vendor_id,source_kind,file_path,note")
    .gte("incurred_on", `${year}-01-01`).lte("incurred_on", `${year}-12-31`)
    .order("incurred_on", { ascending: false });
  if (entityId) q = q.eq("entity_id", entityId);
  const { data: actuals, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // How much of each actual is already spoken for, so a partially attached
  // invoice shows what is left rather than looking untouched.
  const ids = ((actuals ?? []) as { id: string }[]).map((a) => a.id);
  const usedBy = new Map<string, number>();
  if (ids.length) {
    const { data: allocs } = await db
      .from("fin_actual_allocations").select("actual_id,amount").in("actual_id", ids);
    for (const a of ((allocs ?? []) as { actual_id: string; amount: number }[])) {
      usedBy.set(a.actual_id, r2((usedBy.get(a.actual_id) || 0) + Number(a.amount || 0)));
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((actuals ?? []) as any[]).map((a) => {
    const allocated = usedBy.get(a.id) || 0;
    return { ...a, allocated, remaining: r2((Number(a.amount_net) || 0) - allocated) };
  });
  const onlyFree = searchParams.get("unallocated") === "1";
  return NextResponse.json(onlyFree ? rows.filter((r) => r.remaining > 0.005) : rows);
}

/**
 * POST /api/admin/finance/actuals — record a real cost, optionally against a plan line.
 *
 * body: { entity_id, description, amount_net, incurred_on, category_id?,
 *         vendor_id?, amount_vat?, amount_gross?, document_number?, due_on?,
 *         paid_on?, note?, plan_line_id?, allocate_amount? }
 *
 * `incurred_on` is the invoice date, not the payment date: the cost belongs to
 * the period it was incurred in, which is the whole reason this table exists
 * separately from exp_payments.
 */
export async function POST(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();

  const description = String(body.description ?? "").trim();
  if (!description) return NextResponse.json({ error: "What was this cost for?" }, { status: 400 });
  if (!body.incurred_on) return NextResponse.json({ error: "An invoice needs its date." }, { status: 400 });
  const net = Number(body.amount_net);
  if (!Number.isFinite(net)) return NextResponse.json({ error: "That is not an amount." }, { status: 400 });

  const { data: actual, error } = await db.from("fin_actuals").insert({
    entity_id: body.entity_id || null,
    category_id: body.category_id || null,
    vendor_id: body.vendor_id || null,
    description,
    document_number: body.document_number || null,
    amount_net: net,
    amount_vat: body.amount_vat != null && body.amount_vat !== "" ? Number(body.amount_vat) : null,
    amount_gross: body.amount_gross != null && body.amount_gross !== "" ? Number(body.amount_gross) : null,
    incurred_on: body.incurred_on,
    due_on: body.due_on || null,
    paid_on: body.paid_on || null,
    source_kind: body.source_kind || "manual",
    note: body.note || null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.plan_line_id) {
    const amount = Number(body.allocate_amount);
    const { error: allocErr } = await db.from("fin_actual_allocations").insert({
      actual_id: actual.id,
      plan_line_id: body.plan_line_id,
      amount: Number.isFinite(amount) && amount > 0 ? amount : net,
    });
    // The cost is recorded either way; a failed attach is worth saying out loud
    // rather than losing the invoice along with it.
    if (allocErr) return NextResponse.json({ ...actual, attachWarning: allocErr.message }, { status: 201 });
  }
  return NextResponse.json(actual, { status: 201 });
}
