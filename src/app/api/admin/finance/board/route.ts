import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { buildBoard, entitiesForWorld, type BoardCategory, type BoardEntity, type BoardPlan } from "@/lib/finance/board";

/**
 * GET /api/admin/finance/board?entity=<key|id>&year=YYYY&plan=<id>
 *
 * Everything the budget grid needs in one round trip: the entity, the plan for
 * that year, every planned line, what has actually been booked against those
 * lines, and the actuals that are not attached to anything.
 *
 * A missing plan is not an error. The first visit to a year has none, and the
 * grid renders empty with a button to create one.
 */
export async function GET(req: NextRequest) {
  const access = await getRequestAccess();
  if (access && !effectiveCanSeeField(access, "money")) {
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
  const world = searchParams.get("world");

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
    .from("fin_categories").select("id,key,name,kind,sort,division").is("archived_at", null).order("sort");
  if (entity?.division) catQuery = catQuery.or(`division.is.null,division.eq.${entity.division}`);
  const { data: cats } = await catQuery;
  const categories = (cats ?? []) as BoardCategory[];

  // Plans for this entity + year; the caller may pin one, otherwise prefer the
  // active version over a draft so the grid opens on the number in force.
  let plansQuery = db.from("fin_plans").select("id,entity_id,name,year,status,note").eq("year", year);
  if (entity) plansQuery = plansQuery.eq("entity_id", entity.id);
  const { data: plansRaw } = await plansQuery;
  const plans = ((plansRaw ?? []) as BoardPlan[]).sort((a, b) => {
    const rank = (s: string) => (s === "active" ? 0 : s === "draft" ? 1 : 2);
    return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
  });
  const plan = plans.find((p) => p.id === planParam) ?? plans[0] ?? null;

  let lines: unknown[] = [];
  let allocations: unknown[] = [];
  if (plan) {
    const { data: l } = await db
      .from("fin_plan_lines")
      .select("id,category_id,label,month,amount_net,edition_id,vendor_id,confidence")
      .eq("plan_id", plan.id);
    lines = l ?? [];
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

  const board = buildBoard({
    entity, plan, year, categories,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: lines as any, allocations: allocations as any, actuals: actuals as any,
    allocatedActualIds, editionLabels, vendorNames,
  });

  return NextResponse.json({ ...board, entities: entityList, categories, plans });
}
