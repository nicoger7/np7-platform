import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { normalizeAccess } from "@/lib/access";

// PATCH /api/admin/roles/:id — update a role's name / description / access
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if ("description" in body) patch.description = body.description || null;
  if ("access" in body) patch.access = normalizeAccess(body.access);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("team_roles").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/roles/:id — remove a role (system roles are protected)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: role } = await db.from("team_roles").select("is_system").eq("id", id).maybeSingle();
  if (role?.is_system) return NextResponse.json({ error: "Built-in roles can't be deleted." }, { status: 400 });
  // team_members.role_id is ON DELETE SET NULL, so assigned members fall back to their tier.
  const { error } = await db.from("team_roles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
