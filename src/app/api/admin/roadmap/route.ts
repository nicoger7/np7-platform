import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { type WorldId } from "@/lib/access";
import { moneyWorlds } from "@/lib/finance/guard";
import { entitiesForWorld, type BoardEntity } from "@/lib/finance/board";

/** Refuses, or hands back the worlds this caller may see money in. The worlds
 *  matter: `world` arrives in the query string and must be clamped to them. */
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

/** Columns a milestone is allowed to write back into. Anything not on this list
 *  is read-only no matter what a row claims, so a bad `source_field` can never
 *  reach an arbitrary column. */
const WRITE_BACK: Record<string, { table: string; column: string; monthOnly?: boolean; endColumn?: string }> = {
  "hw_purchase_orders.order_date":            { table: "hw_purchase_orders", column: "order_date" },
  "hw_purchase_orders.ex_factory_planned":    { table: "hw_purchase_orders", column: "ex_factory_planned" },
  "hw_purchase_orders.expected_receipt_date": { table: "hw_purchase_orders", column: "expected_receipt_date" },
  // The budget keys a line by the first of its month, so a drag inside one month
  // changes nothing there and a drag across months moves the money.
  "fin_plan_lines.month":                     { table: "fin_plan_lines", column: "month", monthOnly: true },
  // Moving a trip on the roadmap moves the trip. Only the start: the end is
  // written alongside it below, because a trip that keeps its length is what
  // dragging one means, and stretching it is a separate gesture.
  "exp_editions.date_start":                  { table: "exp_editions", column: "date_start", endColumn: "date_end" },
};

const SELECT =
  "id,entity_id,title,kind,status,starts_on,ends_on,baseline_starts_on,baseline_ends_on," +
  "product_id,project_id,purchase_order_id,edition_id,cost_object_id,plan_line_id," +
  "source_table,source_field,amount_net,note,sort";

/** GET /api/admin/roadmap?entity=&world=&from=&to= */
export async function GET(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(req.url);
  // Clamped, not trusted; see the note in the board route.
  const allowedWorlds = gate.worlds;
  const askedWorld = searchParams.get("world");
  const world = askedWorld && allowedWorlds.includes(askedWorld as (typeof allowedWorlds)[number])
    ? askedWorld
    : allowedWorlds[0];
  const entityParam = searchParams.get("entity");

  const { data: entities } = await db
    .from("fin_entities").select("id,key,name,role,division,status,active_from,legal_name,own_entity_from,note").order("sort");
  const list = entitiesForWorld((entities ?? []) as BoardEntity[], world);
  const entity = list.find((e) => e.id === entityParam || e.key === entityParam) ?? list[0] ?? null;
  if (!entity) return NextResponse.json({ entity: null, items: [], dependencies: [], lanes: [] });

  const { data: items } = await db
    .from("roadmap_items").select(SELECT)
    .eq("entity_id", entity.id).is("archived_at", null).order("starts_on");

  const ids = ((items ?? []) as { id: string }[]).map((i) => i.id);
  let dependencies: unknown[] = [];
  if (ids.length) {
    const { data: deps } = await db
      .from("roadmap_dependencies").select("id,predecessor_id,successor_id,kind,lag_days")
      .in("predecessor_id", ids);
    dependencies = deps ?? [];
  }

  // Lanes come from the things a milestone can point at, so a new product or
  // project shows up here without anyone maintaining a list.
  const [products, projects, pos, objects] = await Promise.all([
    db.from("hw_products").select("id,name").is("archived_at", null).order("name"),
    db.from("pd_projects").select("id,name").is("archived_at", null).order("name"),
    db.from("hw_purchase_orders").select("id,po_number").is("archived_at", null).order("po_number"),
    db.from("fin_cost_objects").select("id,name,parent_id,sort").eq("entity_id", entity.id)
      .is("archived_at", null).order("sort"),
  ]);

  return NextResponse.json({
    entity, entities: list,
    items: items ?? [],
    dependencies,
    lanes: {
      products: products.data ?? [], projects: projects.data ?? [],
      purchaseOrders: pos.data ?? [], costObjects: objects.data ?? [],
    },
  });
}

/** POST /api/admin/roadmap — a new milestone. */
export async function POST(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const b = await req.json();
  if (!String(b.title ?? "").trim()) return NextResponse.json({ error: "Give the milestone a name." }, { status: 400 });
  if (!b.starts_on) return NextResponse.json({ error: "A milestone needs a date." }, { status: 400 });

  const { data, error } = await db.from("roadmap_items").insert({
    entity_id: b.entity_id ?? null,
    title: String(b.title).trim(),
    kind: b.kind || "other",
    status: b.status || "planned",
    starts_on: b.starts_on,
    ends_on: b.ends_on || null,
    // A hand-made milestone is its own baseline from the moment it is made.
    baseline_starts_on: b.starts_on,
    baseline_ends_on: b.ends_on || null,
    product_id: b.product_id || null,
    project_id: b.project_id || null,
    purchase_order_id: b.purchase_order_id || null,
    edition_id: b.edition_id || null,
    cost_object_id: b.cost_object_id || null,
    amount_net: b.amount_net != null && b.amount_net !== "" ? Number(b.amount_net) : null,
    note: b.note || null,
  }).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

const EDITABLE = ["title", "kind", "status", "ends_on", "product_id", "project_id",
  "purchase_order_id", "edition_id", "cost_object_id", "amount_net", "note", "sort"] as const;

/**
 * PATCH /api/admin/roadmap — move it, resize it, or edit it.
 *
 * A drag sends starts_on (and ends_on for a span). Two things happen that a
 * plain update would not do: the first move captures where the milestone was as
 * its baseline, so the slip stays visible; and if it was read out of another
 * table, the new date is written back there rather than drifting away from it.
 */
export async function PATCH(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "Which milestone?" }, { status: 400 });

  const { data: before } = await db.from("roadmap_items").select(SELECT).eq("id", b.id).maybeSingle();
  if (!before) return NextResponse.json({ error: "That milestone no longer exists." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (b[k] !== undefined) patch[k] = b[k] === "" ? null : b[k];

  if (b.starts_on !== undefined) {
    patch.starts_on = b.starts_on;
    if (!before.baseline_starts_on) patch.baseline_starts_on = before.starts_on;
  }
  if (b.ends_on !== undefined && !before.baseline_ends_on && before.ends_on) {
    patch.baseline_ends_on = before.ends_on;
  }
  const ends = (patch.ends_on ?? before.ends_on) as string | null;
  const starts = (patch.starts_on ?? before.starts_on) as string;
  if (ends && ends < starts) {
    return NextResponse.json({ error: "A milestone cannot end before it starts." }, { status: 400 });
  }

  const { data, error } = await db.from("roadmap_items").update(patch).eq("id", b.id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ── write the date back where it came from ──
  let wroteBack: string | null = null;
  if (b.starts_on !== undefined && before.source_table && before.source_field) {
    const rule = WRITE_BACK[`${before.source_table}.${before.source_field}`];
    const rowId = before.purchase_order_id ?? before.plan_line_id ?? before.edition_id;
    if (rule && rowId) {
      const value = rule.monthOnly ? `${String(b.starts_on).slice(0, 7)}-01` : b.starts_on;
      // A trip has two dates and dragging it moves both. The end is only written
      // when the caller sent one, so resizing and moving both do the right thing
      // and a milestone with no end never invents one.
      const patchBack: Record<string, unknown> = { [rule.column]: value };
      if (rule.endColumn && b.ends_on) patchBack[rule.endColumn] = b.ends_on;
      const { error: backErr } = await db.from(rule.table).update(patchBack).eq("id", rowId);
      // The milestone moved either way; a failed write-back is worth saying so
      // nobody assumes the purchase order followed it.
      wroteBack = backErr
        ? `could not update ${rule.table}.${rule.column}: ${backErr.message}`
        : `${rule.table}.${Object.keys(patchBack).join(" and ")} updated to ${value}`;
    }
  }
  return NextResponse.json({ ...data, wroteBack });
}

/** DELETE /api/admin/roadmap — archive rather than destroy. */
export async function DELETE(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Which milestone?" }, { status: 400 });
  const { error } = await db.from("roadmap_items")
    .update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
