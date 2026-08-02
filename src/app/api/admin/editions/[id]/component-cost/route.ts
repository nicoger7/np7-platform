import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Set (or clear) a component's ACTUAL cost for one week.
 *
 * The estimate — qty × unit cost from the signed-up packages — stays visible;
 * this writes the real bill over it, as an exp_costs row keyed by
 * (edition_id, component_id). One per component per week (unique index,
 * migration 132), so saving twice updates rather than duplicates, and the row
 * behaves like any other cost line everywhere costs are listed. Clearing the
 * amount deletes the row and the estimate takes over again.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const componentId = String(body?.componentId ?? "");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(componentId)) return NextResponse.json({ error: "No component given." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const raw = body?.actual;
  const clearing = raw === null || raw === undefined || String(raw).trim() === "";

  if (clearing) {
    const { error } = await db.from("exp_costs").delete().eq("edition_id", id).eq("component_id", componentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  }

  const actual = Number(raw);
  if (!Number.isFinite(actual) || actual < 0) return NextResponse.json({ error: "Enter the real amount." }, { status: 400 });

  const [{ data: ed }, { data: comp }] = await Promise.all([
    db.from("exp_editions").select("id, experience_id").eq("id", id).maybeSingle(),
    db.from("exp_components").select("id, name").eq("id", componentId).maybeSingle(),
  ]);
  if (!ed || !comp) return NextResponse.json({ error: "Unknown week or component." }, { status: 404 });

  const { error } = await db.from("exp_costs").upsert(
    {
      edition_id: id,
      experience_id: ed.experience_id,
      component_id: componentId,
      item: comp.name,
      actual_amount: actual,
      status: "actual",
      date: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "edition_id,component_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, actual });
}
