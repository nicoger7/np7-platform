import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
import { entitiesForWorld, r2, type BoardEntity } from "@/lib/finance/board";
import { buildObjectTree, spreadOverheads, type Contribution, type OverheadDriver } from "@/lib/finance/objects";
import { moneyWorlds } from "@/lib/finance/guard";
/**
 * GET /api/admin/finance/objects?entity=&year=&world=
 *
 * What each range, size and project cost and earned, planned against actual.
 * Shares are applied here so the tree never has to know they existed.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const access = await getRequestAccess();
  // No identity is not permission: getRequestAccess() returns null for an
  // unauthenticated or non-team caller, and `access && …` let exactly that
  // caller through to the service-role client below.
  if (!access || !moneyWorlds(access).length) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const world = searchParams.get("world");
  const entityParam = searchParams.get("entity");
  // How the overheads are shared out, if at all. Named on screen, never stored.
  const driverParam = searchParams.get("driver");
  const driver: OverheadDriver =
    driverParam === "revenue" || driverParam === "units" || driverParam === "equal" ? driverParam : "none";

  const { data: entities } = await db
    .from("fin_entities").select("id,key,name,role,division,status,active_from,legal_name,own_entity_from,note").order("sort");
  const list = entitiesForWorld((entities ?? []) as BoardEntity[], world);
  const entity = list.find((e) => e.id === entityParam || e.key === entityParam) ?? list[0] ?? null;
  if (!entity) return NextResponse.json({ entity: null, tree: [], planned: [], actual: [] });

  const { data: objects } = await db
    .from("fin_cost_objects").select("id,name,kind,parent_id,sort")
    .eq("entity_id", entity.id).is("archived_at", null).order("sort");

  const { data: cats } = await db.from("fin_categories").select("id,pnl_group");
  const groupOf = new Map(((cats ?? []) as { id: string; pnl_group: string | null }[]).map((c) => [c.id, c.pnl_group]));

  // ── planned: allocated shares of this year's plan lines ────────────────────
  const { data: plans } = await db
    .from("fin_plans").select("id").eq("entity_id", entity.id).eq("year", year).eq("status", "active");
  const planIds = ((plans ?? []) as { id: string }[]).map((p) => p.id);

  const plannedContribs: Contribution[] = [];
  if (planIds.length) {
    const { data: lines } = await db
      .from("fin_plan_lines").select("id,category_id,amount_net,quantity").in("plan_id", planIds);
    const lineById = new Map(((lines ?? []) as { id: string; category_id: string | null; amount_net: number; quantity: number | null }[])
      .map((l) => [l.id, l]));
    const ids = [...lineById.keys()];
    if (ids.length) {
      const { data: allocs } = await db
        .from("fin_line_objects").select("plan_line_id,cost_object_id,share").in("plan_line_id", ids);
      for (const a of ((allocs ?? []) as { plan_line_id: string; cost_object_id: string; share: number }[])) {
        const l = lineById.get(a.plan_line_id);
        if (!l) continue;
        plannedContribs.push({
          objectId: a.cost_object_id,
          group: l.category_id ? groupOf.get(l.category_id) ?? null : null,
          amount: r2((Number(l.amount_net) || 0) * (Number(a.share) || 0) / 100),
          quantity: r2((Number(l.quantity) || 0) * (Number(a.share) || 0) / 100),
        });
      }
    }
  }

  // ── actual: allocated shares of what was recorded in the year ──────────────
  const actualContribs: Contribution[] = [];
  const { data: actuals } = await db
    .from("fin_actuals").select("id,category_id,amount_net,quantity")
    .eq("entity_id", entity.id).gte("incurred_on", `${year}-01-01`).lte("incurred_on", `${year}-12-31`);
  const actualById = new Map(((actuals ?? []) as { id: string; category_id: string | null; amount_net: number; quantity: number | null }[])
    .map((a) => [a.id, a]));
  if (actualById.size) {
    const { data: allocs } = await db
      .from("fin_actual_objects").select("actual_id,cost_object_id,share").in("actual_id", [...actualById.keys()]);
    for (const a of ((allocs ?? []) as { actual_id: string; cost_object_id: string; share: number }[])) {
      const rec = actualById.get(a.actual_id);
      if (!rec) continue;
      actualContribs.push({
        objectId: a.cost_object_id,
        group: rec.category_id ? groupOf.get(rec.category_id) ?? null : null,
        amount: r2((Number(rec.amount_net) || 0) * (Number(a.share) || 0) / 100),
        quantity: r2((Number(rec.quantity) || 0) * (Number(a.share) || 0) / 100),
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objs = (objects ?? []) as any[];
  return NextResponse.json({
    entity,
    year,
    driver,
    planned: spreadOverheads(buildObjectTree(objs, plannedContribs), driver),
    actual: spreadOverheads(buildObjectTree(objs, actualContribs), driver),
  });
}
