import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { assertEntity, assertPlan, moneyWorlds } from "@/lib/finance/guard";
import { type WorldId } from "@/lib/access";

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
 * POST /api/admin/finance/plans — start a budget, or fork one.
 *
 * body: { entity_id, year, name?, note?, copy_from? }
 *
 * `copy_from` is how re-planning works: the old version is left untouched and
 * every line is copied into a new one, so what you believed in January survives
 * being wrong. Only one plan per entity and year is `active`; promoting a fork
 * is a separate, deliberate PATCH.
 */
export async function POST(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await req.json();

  const year = Number(body.year);
  if (!year) return NextResponse.json({ error: "Which year?" }, { status: 400 });
  if (!body.entity_id) return NextResponse.json({ error: "Which company?" }, { status: 400 });
  // Naming a company is not the same as being allowed to budget for it.
  const wrongCompany = await assertEntity(db, body.entity_id, gate.worlds);
  if (wrongCompany) return wrongCompany;

  const { data: siblings } = await db
    .from("fin_plans").select("id,status,name").eq("entity_id", body.entity_id).eq("year", year);
  const taken = new Set(((siblings ?? []) as { name: string }[]).map((p) => p.name));
  const isFirst = !(siblings ?? []).length;

  /* A fork used to be named "Budget <year> v<count+1>". Delete one and the
     count comes back down, so the next fork reuses a name that already exists.
     Nico ended up with two "v3" and three "v5", all identical. Names are made
     unique here instead of counted. */
  const uniqueName = (base: string) => {
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  };

  const { data: plan, error } = await db.from("fin_plans").insert({
    entity_id: body.entity_id,
    year,
    name: uniqueName(String(body.name ?? "").trim() || (isFirst ? `Plan ${year}` : `Variant`)),
    // The first plan for a year is the one in force; a fork starts as a draft.
    status: isFirst ? "active" : "draft",
    note: body.note ?? null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.copy_from) {
    const { data: lines } = await db
      .from("fin_plan_lines")
      .select("category_id,label,month,amount_net,vat_rate,cost_center_kind,edition_id,vendor_id,confidence,note")
      .eq("plan_id", body.copy_from);
    if ((lines ?? []).length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from("fin_plan_lines").insert((lines as any[]).map((l) => ({ ...l, plan_id: plan.id })));
    }
  }
  return NextResponse.json(plan, { status: 201 });
}

/**
 * PATCH /api/admin/finance/plans — rename, annotate, or put a version in force.
 * Promoting one to `active` archives whichever version held that slot, so the
 * question "which plan are we working to" always has exactly one answer.
 */
export async function PATCH(req: NextRequest) {
  const gate = await guard(); if (gate instanceof NextResponse) return gate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, name, note, status } = await req.json();
  if (!id) return NextResponse.json({ error: "Which plan?" }, { status: 400 });

  if (status === "active") {
    const notOurs = await assertPlan(db, id, gate.worlds);
    if (notOurs) return notOurs;
    const { data: plan } = await db.from("fin_plans").select("entity_id,year").eq("id", id).maybeSingle();
    if (plan) {
      await db.from("fin_plans").update({ status: "archived" })
        .eq("entity_id", plan.entity_id).eq("year", plan.year).eq("status", "active").neq("id", id);
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = String(name).trim();
  if (note !== undefined) patch.note = note;
  if (status !== undefined) patch.status = status;

  const { data, error } = await db.from("fin_plans").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
