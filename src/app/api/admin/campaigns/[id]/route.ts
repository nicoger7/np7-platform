import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { softDelete } from "@/lib/archive";

const EDITABLE = ["name", "subject", "preheader", "body", "division", "header_image", "header_position", "audience"] as const;

// GET /api/admin/campaigns/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client.from("email_campaigns").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ campaign: data });
}

// PATCH /api/admin/campaigns/[id] — drafts only (a sent campaign is immutable)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data: cur } = await client.from("email_campaigns").select("status").eq("id", id).single();
  if (cur?.status === "sent") return NextResponse.json({ error: "This campaign was sent — duplicate it to send again." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) patch[k] = body[k] === "" ? null : body[k];
  const { data, error } = await client.from("email_campaigns").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaign: data });
}

// DELETE /api/admin/campaigns/[id] — soft-delete
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const client = createAdminClient();
  const { ok, error } = await softDelete(client, "email_campaigns", id);
  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
