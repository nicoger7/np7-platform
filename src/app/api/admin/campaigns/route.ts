import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { notArchived } from "@/lib/archive";

// GET /api/admin/campaigns — list (tolerant pre-migration 086: empty list)
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client.from("email_campaigns").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ campaigns: [], migrationPending: true });
  return NextResponse.json({ campaigns: notArchived(data) });
}

// POST /api/admin/campaigns — create a draft
export async function POST(request: Request) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json();
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("email_campaigns")
    .insert({
      name: body.name,
      subject: body.subject || null,
      preheader: body.preheader || null,
      body: body.body || null,
      division: body.division === "hardware" ? "hardware" : "experience",
      header_image: body.header_image || null,
      header_position: body.header_position ?? null,
      audience: body.audience || {},
    })
    .select()
    .single();
  if (error) {
    const pending = /email_campaigns/.test(error.message) && /(does not exist|schema cache)/i.test(error.message);
    return NextResponse.json({ error: pending ? "Apply migration 086 first (creates email_campaigns)." : error.message }, { status: 400 });
  }
  return NextResponse.json({ campaign: data });
}
