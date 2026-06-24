import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getHoursActor } from "@/lib/hours-auth";

// Non-managers may only touch their OWN entries. Returns a 403 to bail, else null.
async function guardOwn(id: string): Promise<NextResponse | null> {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (actor.canManageOthers) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createAdminClient() as any).from("hours_log").select("employee_id").eq("id", id).maybeSingle();
  if (!data || data.employee_id !== actor.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardOwn(id);
  if (denied) return denied;
  const client = createAdminClient();
  const { data, error } = await client.from("hours_log").select("*, team_members:employee_id(id, name), exp_experiences:experience_id(id, title)").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardOwn(id);
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();
  const actor = await getHoursActor();
  if (actor && !actor.canManageOthers) body.employee_id = actor.id; // can't reassign to someone else
  const { data, error } = await client.from("hours_log").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select("*, team_members:employee_id(id, name), exp_experiences:experience_id(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardOwn(id);
  if (denied) return denied;
  const client = createAdminClient();
  const { error } = await client.from("hours_log").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
