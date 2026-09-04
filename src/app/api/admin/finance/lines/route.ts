import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { monthDate } from "@/lib/finance/board";

async function guard() {
  const access = await getRequestAccess();
  // No identity is not permission: getRequestAccess() returns null for an
  // unauthenticated or non-team caller, and `access && …` let exactly that
  // caller through to the service-role client below.
  if (!access || !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  return null;
}

type RowIdent = {
  plan_id: string;
  category_id: string | null;
  label: string;
  edition_id: string | null;
  vendor_id: string | null;
};

/** The four columns that make two lines the same row, matched the same way the
 *  board groups them. `is` rather than `eq` because these are nullable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whereRow(q: any, ident: RowIdent) {
  q = q.eq("plan_id", ident.plan_id).eq("label", ident.label);
  q = ident.category_id ? q.eq("category_id", ident.category_id) : q.is("category_id", null);
  q = ident.edition_id ? q.eq("edition_id", ident.edition_id) : q.is("edition_id", null);
  q = ident.vendor_id ? q.eq("vendor_id", ident.vendor_id) : q.is("vendor_id", null);
  return q;
}

/**
 * PUT /api/admin/finance/lines
 * Set one row's planned amount in one or more months. This is the only write
 * the grid needs: it creates the line, updates it, or clears it, depending on
 * what is already there and what was typed.
 *
 * body: { plan_id, year, category_id, label, edition_id?, vendor_id?,
 *         confidence?, months: number[], amount_net: number }
 */
export async function PUT(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();

  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "A row needs a name." }, { status: 400 });
  if (!body.plan_id) return NextResponse.json({ error: "No plan selected." }, { status: 400 });

  const year = Number(body.year);
  if (!year) return NextResponse.json({ error: "Which year?" }, { status: 400 });
  const months: number[] = Array.isArray(body.months) ? body.months.map(Number) : [Number(body.month)];
  if (!months.length || months.some((m) => !(m >= 1 && m <= 12))) {
    return NextResponse.json({ error: "Months must be 1 to 12." }, { status: 400 });
  }
  const amount = Number(body.amount_net);
  if (Number.isNaN(amount)) return NextResponse.json({ error: "That is not a number." }, { status: 400 });

  const ident: RowIdent = {
    plan_id: body.plan_id,
    category_id: body.category_id || null,
    label,
    edition_id: body.edition_id || null,
    vendor_id: body.vendor_id || null,
  };

  const { data: existing } = await whereRow(db.from("fin_plan_lines").select("id,month"), ident)
    .in("month", months.map((m) => monthDate(year, m)));
  const byMonth = new Map<string, string>();
  for (const r of ((existing ?? []) as { id: string; month: string }[])) byMonth.set(r.month.slice(0, 10), r.id);

  // A line someone has already attached an invoice to is not deleted when the
  // plan is cleared: it drops to zero and keeps the actual visible in the row.
  const ids = [...byMonth.values()];
  const attached = new Set<string>();
  if (ids.length) {
    const { data: allocs } = await db
      .from("fin_actual_allocations").select("plan_line_id").in("plan_line_id", ids);
    for (const a of ((allocs ?? []) as { plan_line_id: string }[])) attached.add(a.plan_line_id);
  }

  for (const m of months) {
    const key = monthDate(year, m);
    const id = byMonth.get(key);
    if (amount === 0) {
      if (!id) continue;
      if (attached.has(id)) {
        await db.from("fin_plan_lines").update({ amount_net: 0, updated_at: new Date().toISOString() }).eq("id", id);
      } else {
        await db.from("fin_plan_lines").delete().eq("id", id);
      }
      continue;
    }
    if (id) {
      await db.from("fin_plan_lines")
        .update({ amount_net: amount, confidence: body.confidence || "expected", updated_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      await db.from("fin_plan_lines").insert({
        ...ident, month: key, amount_net: amount,
        confidence: body.confidence || "expected",
        cost_center_kind: ident.edition_id ? "edition" : body.cost_center_kind || null,
      });
    }
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/finance/lines — rename or recategorise a whole row at once.
 * body: { plan_id, from: {category_id,label,edition_id,vendor_id}, to: {...} }
 */
export async function PATCH(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { plan_id, from, to } = await req.json();
  if (!plan_id || !from || !to) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const label = String(to.label ?? from.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "A row needs a name." }, { status: 400 });

  const { error } = await whereRow(db.from("fin_plan_lines"), { plan_id, ...from })
    .update({
      label,
      category_id: to.category_id ?? from.category_id ?? null,
      edition_id: to.edition_id ?? from.edition_id ?? null,
      vendor_id: to.vendor_id ?? from.vendor_id ?? null,
      confidence: to.confidence ?? undefined,
      updated_at: new Date().toISOString(),
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/finance/lines — remove a row for the whole year.
 * Attached actuals survive and reappear as unallocated, which is honest: the
 * money was still spent.
 */
export async function DELETE(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();
  if (!body.plan_id || !body.label) return NextResponse.json({ error: "Which row?" }, { status: 400 });

  const { error } = await whereRow(db.from("fin_plan_lines"), {
    plan_id: body.plan_id,
    category_id: body.category_id || null,
    label: String(body.label),
    edition_id: body.edition_id || null,
    vendor_id: body.vendor_id || null,
  }).delete();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
