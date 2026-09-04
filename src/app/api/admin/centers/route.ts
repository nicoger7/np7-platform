import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/centers — the centers, plus the destinations to pick from.
// The destination list is served from here rather than /api/admin/destinations
// so a role granted Centers but not Destinations still gets a working picker.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data, error }, { data: dests }] = await Promise.all([
    db.from("centers").select("*").order("name"),
    db.from("destinations").select("id,name,country").order("name"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ centers: notArchived(data), destinations: notArchived(dests) });
}

// POST /api/admin/centers — add a center (name + where it is)
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const { data, error } = await db
    .from("centers")
    .insert({ name: body.name, destination_id: body.destination_id || null, location: body.location || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
