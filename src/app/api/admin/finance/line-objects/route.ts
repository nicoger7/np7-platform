import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { moneyWorlds } from "@/lib/finance/guard";
import { r2 } from "@/lib/finance/board";

async function guard() {
  const access = await getRequestAccess();
  // No identity is not permission.
  if (!access || !moneyWorlds(access).length) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  return null;
}

/**
 * Allocating a budget ROW, not a line.
 *
 * A row in the grid is twelve months of plan lines sharing one identity, and
 * "the hotel is Slalom" is true of all of them or none. So both verbs work on
 * the row and fan out across its lines, which is also what stops January and
 * February drifting into different splits by accident.
 */
type RowIdent = {
  plan_id: string; category_id: string | null; label: string;
  edition_id: string | null; vendor_id: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whereRow(q: any, i: RowIdent) {
  q = q.eq("plan_id", i.plan_id).eq("label", i.label);
  q = i.category_id ? q.eq("category_id", i.category_id) : q.is("category_id", null);
  q = i.edition_id ? q.eq("edition_id", i.edition_id) : q.is("edition_id", null);
  q = i.vendor_id ? q.eq("vendor_id", i.vendor_id) : q.is("vendor_id", null);
  return q;
}

const identFrom = (src: Record<string, string | null>): RowIdent => ({
  plan_id: src.plan_id as string,
  category_id: src.category_id || null,
  label: String(src.label ?? ""),
  edition_id: src.edition_id || null,
  vendor_id: src.vendor_id || null,
});

/** GET /api/admin/finance/line-objects?plan_id=&label=&category_id=&… */
export async function GET(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(req.url);
  const ident = identFrom(Object.fromEntries(searchParams.entries()));
  if (!ident.plan_id || !ident.label) {
    return NextResponse.json({ error: "Which row?" }, { status: 400 });
  }

  const { data: plan } = await db.from("fin_plans").select("entity_id").eq("id", ident.plan_id).maybeSingle();
  const { data: objects } = await db
    .from("fin_cost_objects").select("id,name,kind,parent_id,sort")
    .eq("entity_id", plan?.entity_id ?? "").is("archived_at", null).order("sort");

  const { data: lines } = await whereRow(db.from("fin_plan_lines").select("id,amount_net"), ident);
  const ids = ((lines ?? []) as { id: string }[]).map((l) => l.id);

  let current: { cost_object_id: string; share: number }[] = [];
  let uneven = false;
  if (ids.length) {
    const { data: allocs } = await db
      .from("fin_line_objects").select("plan_line_id,cost_object_id,share").in("plan_line_id", ids);
    const byObject = new Map<string, Set<number>>();
    for (const a of ((allocs ?? []) as { cost_object_id: string; share: number }[])) {
      if (!byObject.has(a.cost_object_id)) byObject.set(a.cost_object_id, new Set());
      byObject.get(a.cost_object_id)!.add(Number(a.share));
    }
    // Every line of a row should carry the same split. If an older pass left
    // them uneven, say so rather than silently showing one month's answer.
    current = [...byObject.entries()].map(([cost_object_id, shares]) => {
      if (shares.size > 1) uneven = true;
      return { cost_object_id, share: Math.max(...shares) };
    });
    const covered = ((allocs ?? []) as { plan_line_id: string }[]).map((a) => a.plan_line_id);
    if (new Set(covered).size && new Set(covered).size !== ids.length) uneven = true;
  }

  const total = r2(((lines ?? []) as { amount_net: number }[]).reduce((s, l) => s + (Number(l.amount_net) || 0), 0));
  return NextResponse.json({ objects: objects ?? [], current, uneven, lineCount: ids.length, total });
}

/**
 * PUT /api/admin/finance/line-objects — replace the row's split.
 * body: { …row identity, allocations: [{ cost_object_id, share }] }
 */
export async function PUT(req: NextRequest) {
  const denied = await guard(); if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();
  const ident = identFrom(body);
  if (!ident.plan_id || !ident.label) return NextResponse.json({ error: "Which row?" }, { status: 400 });

  const allocations = (Array.isArray(body.allocations) ? body.allocations : [])
    .map((a: { cost_object_id: string; share: unknown }) => ({
      cost_object_id: a.cost_object_id, share: r2(Number(a.share)),
    }))
    .filter((a: { cost_object_id: string; share: number }) => a.cost_object_id && a.share > 0);

  const seen = new Set<string>();
  for (const a of allocations) {
    if (seen.has(a.cost_object_id)) {
      return NextResponse.json({ error: "The same thing is listed twice." }, { status: 400 });
    }
    seen.add(a.cost_object_id);
  }
  const sum = r2(allocations.reduce((s: number, a: { share: number }) => s + a.share, 0));
  if (sum > 100.005) {
    return NextResponse.json({ error: `That splits the row ${sum}% ways. It cannot exceed 100%.` }, { status: 400 });
  }

  const { data: lines } = await whereRow(db.from("fin_plan_lines").select("id"), ident);
  const ids = ((lines ?? []) as { id: string }[]).map((l) => l.id);
  if (!ids.length) return NextResponse.json({ error: "That row has no lines to allocate." }, { status: 404 });

  // Replace rather than merge: the dialog always sends the whole split, so a
  // removed object has to disappear instead of lingering.
  const { error: delErr } = await db.from("fin_line_objects").delete().in("plan_line_id", ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  if (allocations.length) {
    const rows = ids.flatMap((plan_line_id) =>
      allocations.map((a: { cost_object_id: string; share: number }) => ({ plan_line_id, ...a })));
    const { error } = await db.from("fin_line_objects").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, lines: ids.length, allocated: sum });
}
