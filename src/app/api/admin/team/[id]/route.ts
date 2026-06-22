import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client.from("team_members").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// role_id arrives with migration 045 — strip & retry if the column isn't there
// yet, so saving the rest of a team member still works pre-migration.
const PENDING_OPTIONAL = ["role_id"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (payload: Record<string, unknown>) => (client as any).from("team_members").update(payload).eq("id", id).select().single();
  let { data, error } = await run(body);
  if (error && PENDING_OPTIONAL.some((k) => k in body) && /column .* does not exist|schema cache|could not find/i.test(error.message)) {
    const stripped = Object.fromEntries(Object.entries(body).filter(([k]) => !PENDING_OPTIONAL.includes(k)));
    ({ data, error } = await run(stripped));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { error } = await client.from("team_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
