import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { normalizeAccess } from "@/lib/access";

/** team_roles isn't there until migration 045 is applied — recognise that so the
 *  Roles page shows an "apply migration" hint instead of a hard error. */
function tableMissing(msg?: string | null): boolean {
  return /could not find the table|relation .* does not exist|schema cache/i.test(msg || "");
}

// GET /api/admin/roles — list all custom roles
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("team_roles").select("*").order("name");
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ roles: [], migrationNeeded: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ roles: data ?? [] });
}

// POST /api/admin/roles — create a role
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json();
  if (!body?.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("team_roles")
    .insert({ name: body.name.trim(), description: body.description || null, access: normalizeAccess(body.access) })
    .select()
    .single();
  if (error) {
    if (tableMissing(error.message)) return NextResponse.json({ error: "Apply migration 045 (team_roles) first." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
