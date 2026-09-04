import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/coaches — the reusable coach library
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_coaches")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/admin/coaches — add a coach to the library
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json();
  const full: Record<string, unknown> = {
    name: body.name,
    role: body.role || null,
    bio: body.bio || null,
    image_url: body.image_url || null,
    whatsapp_link: body.whatsapp_link || null, // migration 027
  };
  const doInsert = (payload: Record<string, unknown>) => client.from("exp_coaches").insert(payload).select("*").single();
  let { data, error } = await doInsert(full);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    const { whatsapp_link: _omit, ...rest } = full; void _omit;
    ({ data, error } = await doInsert(rest));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
