import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
import { buildBoard, entitiesForWorld, PLAN_LINE_COLUMNS, type BoardCategory, type BoardEntity, type BoardPlan } from "@/lib/finance/board";
import { subtreeOf, shareInScope, scaleToScope, type Allocation } from "@/lib/finance/scope";
import { collectSources } from "@/lib/finance/collect-sources";
import { moneyWorlds } from "@/lib/finance/guard";
/**
 * GET /api/admin/finance/board?entity=<key|id>&year=YYYY&plan=<id>
 *
 * Everything the budget grid needs in one round trip: the entity, the plan for
 * that year, every planned line, what has actually been booked against those
 * lines, and the actuals that are not attached to anything.
 *
 * Alongside the plan it reads the systems that already know the answer. What a
 * purchase order commits and what a trip actually cost are not copied in here;
 * they are read every time, so changing the order changes the budget and there
 * is never a second version of the truth to reconcile.
 *
 * A missing plan is not an error. The first visit to a year has none, and the
 * grid renders empty with a button to create one.
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
  const entityParam = searchParams.get("entity");
  const planParam = searchParams.get("plan");
  // Which admin world the page is being viewed from. With no explicit entity
  // chosen it decides the default, so opening Budget in Hardware lands on the
  // hardware company rather than on whatever sorts first.
  //
  // It arrives in the query string, so it is clamped rather than trusted: a
  // caller who may only see Performance cannot ask for Experience and be handed
  // it, and a caller who asks for nothing gets one of their own worlds instead
  // of both companies. The two are legally separate; this is the seam.
  const allowedWorlds = moneyWorlds(access);
  const asked = searchParams.get("world");
  const world = asked && allowedWorlds.includes(asked as (typeof allowedWorlds)[number])
    ? asked
    : allowedWorlds[0];
  // Narrow the whole board to one project, range or size. Everything downstream
  // (the P&L, the cash curve, the timeline) is computed from the scaled lines,
  // so one filter re-answers every question on the page rather than just the
  // one chart that knows about it.
  const objectParam = searchParams.get("object");

  const { data: entities } = await db
    .from("fin_entities").select("id,key,name,role,division,status,active_from,legal_name,own_entity_from,note").order("sort");
  // Scoped BEFORE anything is chosen, so an entity from the other world cannot
  // be reached even by passing its key in the query string.
  const entityList = entitiesForWorld((entities ?? []) as BoardEntity[], world);
  const entity =
    entityList.find((e) => e.id === entityParam || e.key === entityParam) ??
    entityList[0] ?? null;

  // Experience and Hardware are being separated into their own companies, so
  // they do not share a planning vocabulary. A category with no division is
  // shared on purpose: rent is the same idea whichever company pays it.
  let catQuery = db
    .from("fin_categories").select("id,key,name,kind,sort,division,pnl_group").is("archived_at", null).order("sort");
  if (entity?.division) catQuery = catQuery.or(`division.is.null,division.eq.${entity.division}`);
  const { data: cats } = await catQuery;
  const categories = (cats ?? []) as BoardCategory[];

  // Plans for this entity + year; the caller may pin one, otherwise prefer the
  // active version over a draft so the grid opens on the number in force.
  let plansQuery = db.from("fin_plans").select("id,entity_id,name,year,status,note").eq("year", year);
  if (entity) plansQuery = plansQuery.eq("entity_id", entity.id);
  const { data: plansRaw } = await plansQuery;
  // Archived versions stay in the database as history but off the picker, so a
  // year with one plan in force offers one plan. A specific archived version is
  // still reachable by pinning its id.
  const allPlans = (plansRaw ?? []) as BoardPlan[];
  const plans = allPlans
    .filter((p) => p.status !== "archived" || p.id === planParam)
    .sort((a, b) => {
      const rank = (s: string) => (s === "active" ? 0 : s === "draft" ? 1 : 2);
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
    });
  const plan = allPlans.find((p) => p.id === planParam) ?? plans[0] ?? null;

  // The object being filtered to, plus everything beneath it.
  let scope: Set<string> | null = null;
  let scopeName: string | null = null;
  if (objectParam && entity) {
    const { data: all } = await db
      .from("fin_cost_objects").select("id,name,parent_id").eq("entity_id", entity.id);
    const rows = (all ?? []) as { id: string; name: string; parent_id: string | null }[];
    const found = subtreeOf(rows, objectParam);
    // An id that is not this entity's filters nothing rather than everything.
    if (found.size) { scope = found; scopeName = rows.find((o) => o.id === objectParam)?.name ?? null; }
  }

  /** Share-applied scoping for one table's rows. */
  async function narrow<T extends { id: string; amount_net: number }>(
    rows: T[], table: string, key: string,
  ): Promise<T[]> {
    if (!scope || !rows.length) return rows;
    const { data } = await db.from(table).select(`${key},cost_object_id,share`).in(key, rows.map((r) => r.id));
    const allocs: Allocation[] = ((data ?? []) as Record<string, string | number>[]).map((a) => ({
      sourceId: String(a[key]), cost_object_id: String(a.cost_object_id), share: Number(a.share) || 0,
    }));
    return scaleToScope(rows, shareInScope(allocs, scope));
  }

  let lines: unknown[] = [];
  let allocations: unknown[] = [];
  if (plan) {
    const { data: l } = await db
      .from("fin_plan_lines")
      .select(PLAN_LINE_COLUMNS)
      .eq("plan_id", plan.id);
    lines = l ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines = await narrow(lines as any[], "fin_line_objects", "plan_line_id");
    const ids = (lines as { id: string }[]).map((x) => x.id);
    if (ids.length) {
      const { data: a } = await db
        .from("fin_actual_allocations").select("plan_line_id,amount,actual_id").in("plan_line_id", ids);
      allocations = a ?? [];
    }
  }

  // Actuals booked in this entity's year, so unattached ones can be surfaced.
  let actuals: unknown[] = [];
  if (entity) {
    const { data: ac } = await db
      .from("fin_actuals")
      .select("id,description,amount_net,incurred_on,category_id,vendor_id")
      .eq("entity_id", entity.id)
      .gte("incurred_on", `${year}-01-01`)
      .lte("incurred_on", `${year}-12-31`);
    actuals = ac ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actuals = await narrow(actuals as any[], "fin_actual_objects", "actual_id");
  }
  const allocatedActualIds = new Set(
    (allocations as { actual_id: string }[]).map((a) => a.actual_id),
  );

  // Labels for the two things a line can point at.
  const editionIds = [...new Set((lines as { edition_id: string | null }[]).map((l) => l.edition_id).filter(Boolean))] as string[];
  const vendorIds = [...new Set([
    ...(lines as { vendor_id: string | null }[]).map((l) => l.vendor_id),
    ...(actuals as { vendor_id: string | null }[]).map((a) => a.vendor_id),
  ].filter(Boolean))] as string[];

  const editionLabels = new Map<string, string>();
  if (editionIds.length) {
    const { data: eds } = await db
      .from("exp_editions").select("id,label,year,exp_experiences(title)").in("id", editionIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of ((eds ?? []) as any[])) {
      const title = e.exp_experiences?.title ?? "";
      editionLabels.set(e.id, [title, e.label ?? e.year].filter(Boolean).join(" · "));
    }
  }
  const vendorNames = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vs } = await db.from("vendors").select("id,name").in("id", vendorIds);
    for (const v of ((vs ?? []) as { id: string; name: string }[])) vendorNames.set(v.id, v.name);
  }

  // Where the cash line starts. A year does not begin at zero when the year
  // before it ended with money in the account, and the Sep-to-May plan crosses
  // exactly one such boundary. Sum what every earlier plan in force moved.
  let openingBalance = 0;
  // A project does not have a bank account. Filtered, the running line is the
  // project's own contribution from zero, not the company's balance, so it must
  // not inherit last year's cash.
  if (entity && !scope) {
    const { data: priorPlans } = await db
      .from("fin_plans").select("id").eq("entity_id", entity.id).lt("year", year).eq("status", "active");
    const priorIds = ((priorPlans ?? []) as { id: string }[]).map((p) => p.id);
    if (priorIds.length) {
      const { data: priorLines } = await db
        .from("fin_plan_lines").select("category_id,amount_net").in("plan_id", priorIds);
      const groupOf = new Map(categories.map((c) => [c.id, c.pnl_group]));
      for (const l of ((priorLines ?? []) as { category_id: string | null; amount_net: number }[])) {
        const g = l.category_id ? groupOf.get(l.category_id) : null;
        const amount = Number(l.amount_net) || 0;
        // money in less money out, financing included: this is a bank balance
        if (g === "revenue" || g === "financing") openingBalance += amount;
        else openingBalance -= amount;
      }
      openingBalance = Math.round(openingBalance * 100) / 100;
    }
  }

  const board = buildBoard({
    entity, plan, year, categories,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: lines as any, allocations: allocations as any, actuals: actuals as any,
    allocatedActualIds, editionLabels, vendorNames, openingBalance,
  });

  // Read through to the systems that own the real numbers. Deliberately after
  // buildBoard: the plan is the plan whether or not a supplier has been paid,
  // and these figures sit beside it rather than quietly editing it.
  const sources = await collectSources(
    db, entity, year, (lines as { id: string }[]).map((l) => l.id),
  );

  const { data: filterObjects } = entity
    ? await db.from("fin_cost_objects").select("id,name,kind,parent_id,sort")
        .eq("entity_id", entity.id).is("archived_at", null).order("sort")
    : { data: [] };

  return NextResponse.json({
    ...board, entities: entityList, categories, plans, sources,
    filterObjects: filterObjects ?? [],
    scope: scope ? { id: objectParam, name: scopeName } : null,
  });
}
