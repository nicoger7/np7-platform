import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { r2 } from "@/lib/finance/board";
import { buildObjectTree, subtreeFigures, type Contribution } from "@/lib/finance/objects";
import { subtreeOf } from "@/lib/finance/scope";

/**
 * Everything about one product line, project or size, in one answer.
 *
 * The point of the page this feeds is that nothing is a dead end. A range knows
 * what it costs, what it earns, what one of them costs, who makes it, which
 * product it is, which budget lines belong to it, what has actually been booked
 * against it and which milestones it is waiting on. Each of those is a link to
 * somewhere else rather than a fact printed on a card.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRequestAccess();
  if (!access || !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();

  const { data: object } = await db
    .from("fin_cost_objects")
    .select("id,entity_id,name,kind,note,parent_id,sort,ref_table,ref_id,supplier_id")
    .eq("id", id).maybeSingle();
  if (!object) return NextResponse.json({ error: "No such thing." }, { status: 404 });

  const { data: siblings } = await db
    .from("fin_cost_objects").select("id,name,kind,parent_id,sort")
    .eq("entity_id", object.entity_id).is("archived_at", null).order("sort");
  const family = (siblings ?? []) as { id: string; name: string; kind: string; parent_id: string | null; sort: number }[];
  const scope = subtreeOf(family, id);

  // ── who makes it, and what it is ──
  const [supplier, product, parent] = await Promise.all([
    object.supplier_id
      ? db.from("hw_suppliers").select("id,name,country,default_incoterm,default_payment_terms").eq("id", object.supplier_id).maybeSingle()
      : Promise.resolve({ data: null }),
    object.ref_table === "hw_products" && object.ref_id
      ? db.from("hw_products").select("id,name,slug,category,status,price,currency").eq("id", object.ref_id).maybeSingle()
      : Promise.resolve({ data: null }),
    object.parent_id
      ? db.from("fin_cost_objects").select("id,name").eq("id", object.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ── the money, this object and everything under it ──
  const { data: plans } = await db
    .from("fin_plans").select("id,name").eq("entity_id", object.entity_id).eq("year", year).eq("status", "active");
  const planIds = ((plans ?? []) as { id: string }[]).map((p) => p.id);

  const { data: cats } = await db.from("fin_categories").select("id,name,pnl_group");
  const catById = new Map(((cats ?? []) as { id: string; name: string; pnl_group: string | null }[]).map((c) => [c.id, c]));

  type Line = { id: string; label: string; month: string; amount_net: number; quantity: number | null; category_id: string | null };
  let lines: Line[] = [];
  const contributions: Contribution[] = [];
  if (planIds.length) {
    const { data: l } = await db
      .from("fin_plan_lines").select("id,label,month,amount_net,quantity,category_id").in("plan_id", planIds);
    const byId = new Map(((l ?? []) as Line[]).map((x) => [x.id, x]));
    const { data: allocs } = await db
      .from("fin_line_objects").select("plan_line_id,cost_object_id,share").in("plan_line_id", [...byId.keys()]);
    const keep = new Map<string, number>();
    for (const a of ((allocs ?? []) as { plan_line_id: string; cost_object_id: string; share: number }[])) {
      if (!scope.has(a.cost_object_id)) continue;
      keep.set(a.plan_line_id, Math.min(1, (keep.get(a.plan_line_id) ?? 0) + (Number(a.share) || 0) / 100));
      contributions.push({
        objectId: a.cost_object_id,
        group: byId.get(a.plan_line_id)?.category_id ? catById.get(byId.get(a.plan_line_id)!.category_id!)?.pnl_group ?? null : null,
        amount: r2((Number(byId.get(a.plan_line_id)?.amount_net) || 0) * (Number(a.share) || 0) / 100),
        quantity: r2((Number(byId.get(a.plan_line_id)?.quantity) || 0) * (Number(a.share) || 0) / 100),
      });
    }
    lines = [...keep.entries()]
      .map(([lineId, share]) => {
        const l0 = byId.get(lineId)!;
        return { ...l0, amount_net: r2((Number(l0.amount_net) || 0) * share) };
      })
      .sort((a, b) => a.month.localeCompare(b.month) || a.label.localeCompare(b.label));
  }

  // ── what was actually booked ──
  type ActualRow = {
    id: string; description: string; amount_net: number;
    incurred_on: string; paid_on: string | null; category_id: string | null;
  };
  const { data: rawActuals } = await db
    .from("fin_actuals").select("id,description,amount_net,incurred_on,paid_on,category_id")
    .eq("entity_id", object.entity_id)
    .gte("incurred_on", `${year}-01-01`).lte("incurred_on", `${year}-12-31`);
  const actualById = new Map(((rawActuals ?? []) as ActualRow[]).map((a) => [a.id, a]));
  let actuals: ActualRow[] = [];
  if (actualById.size) {
    const { data: aAllocs } = await db
      .from("fin_actual_objects").select("actual_id,cost_object_id,share").in("actual_id", [...actualById.keys()]);
    const keep = new Map<string, number>();
    for (const a of ((aAllocs ?? []) as { actual_id: string; cost_object_id: string; share: number }[])) {
      if (!scope.has(a.cost_object_id)) continue;
      keep.set(a.actual_id, Math.min(1, (keep.get(a.actual_id) ?? 0) + (Number(a.share) || 0) / 100));
    }
    actuals = [...keep.entries()].flatMap(([aid, share]) => {
      const a = actualById.get(aid);
      return a ? [{ ...a, amount_net: r2((Number(a.amount_net) || 0) * share) }] : [];
    });
  }

  // ── what it is waiting on ──
  const { data: milestones } = await db
    .from("roadmap_items")
    .select("id,title,kind,status,starts_on,ends_on,target_quantity,target_metric,amount_net")
    .in("cost_object_id", [...scope]).is("archived_at", null).order("starts_on");

  const figures = subtreeFigures(buildObjectTree(family, contributions), id);

  return NextResponse.json({
    object: { ...object, parentName: parent.data?.name ?? null },
    supplier: supplier.data ?? null,
    product: product.data ?? null,
    year,
    plan: (plans ?? [])[0] ?? null,
    figures,
    children: family.filter((f) => f.parent_id === id).map((c) => ({
      ...c, figures: subtreeFigures(buildObjectTree(family, contributions), c.id),
    })),
    lines: lines.map((l) => ({ ...l, categoryName: l.category_id ? catById.get(l.category_id)?.name ?? null : null })),
    actuals,
    milestones: milestones ?? [],
  });
}
