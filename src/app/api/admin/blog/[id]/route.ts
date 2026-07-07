import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { pickBlogFields } from "../fields";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client.from("exp_blog_posts").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const fields = pickBlogFields(await request.json());
  const doUpdate = (f: Record<string, unknown>) =>
    client.from("exp_blog_posts").update({ ...f, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  let { data, error } = await doUpdate(fields);
  if (error && "cover_focus" in fields && /cover_focus|schema cache|does not exist/i.test(error.message)) {
    // migration 071 not applied yet — save everything else and drop the framing
    const { cover_focus: _omit, ...rest } = fields as Record<string, unknown>;
    void _omit;
    ({ data, error } = await doUpdate(rest));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const { error } = await client.from("exp_blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
