import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET — every tier-perk rule, with names resolved for the admin list. */
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_tier_perks")
    .select("*, exp_experiences(title), exp_editions(label,year), exp_packages(name)")
    .order("created_at");
  return NextResponse.json({ rules: data ?? [] });
}

/** POST — add a rule. Body: { experienceId, tier, value, editionId?, packageId? } */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const value = Number(body.value);
  if (!body.experienceId || !["rider", "crew", "legend"].includes(body.tier) || !(value >= 0 && value < 100)) {
    return NextResponse.json({ error: "Experience, tier and a percentage (0–99) are required." }, { status: 400 });
  }
  const { data, error } = await db.from("exp_tier_perks").insert({
    experience_id: body.experienceId,
    edition_id: body.editionId || null,
    package_id: body.packageId || null,
    tier: body.tier,
    value,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}

/** PATCH — { id, active? , value? }. DELETE — ?id= removes the rule. */
export async function PATCH(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("active" in body) patch.active = !!body.active;
  if ("value" in body) {
    const v = Number(body.value);
    if (!(v >= 0 && v < 100)) return NextResponse.json({ error: "Percentage must be 0–99." }, { status: 400 });
    patch.value = v;
  }
  const { error } = await db.from("exp_tier_perks").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("exp_tier_perks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
