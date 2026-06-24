import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getHoursActor } from "@/lib/hours-auth";

export async function GET(request: NextRequest) {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  // Members only ever see their OWN hours; managers may filter by anyone.
  const employeeId = actor.canManageOthers ? searchParams.get("employee_id") : actor.id;
  const experienceId = searchParams.get("experience_id");
  const editionId = searchParams.get("edition_id");

  let query = client
    .from("hours_log")
    .select("*, team_members:employee_id(id, name, rate_per_hour), exp_experiences:experience_id(id, title), booking:booking_id(id, name)")
    .order("date", { ascending: false });

  if (employeeId) query = query.eq("employee_id", employeeId);
  if (experienceId) query = query.eq("experience_id", experienceId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (editionId) query = (query as any).eq("edition_id", editionId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const actor = await getHoursActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const client = createAdminClient();
  const body = await request.json();
  // Auto-attach to the signed-in user. Managers may log on someone else's behalf
  // (explicit employee_id); everyone else is always forced to themselves.
  const employee_id = actor.canManageOthers ? (body.employee_id || actor.id) : actor.id;
  const { data, error } = await client
    .from("hours_log")
    .insert({ ...body, employee_id })
    .select("*, team_members:employee_id(id, name, rate_per_hour), exp_experiences:experience_id(id, title), booking:booking_id(id, name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
