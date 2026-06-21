import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";

/** List spot notes for moderation (newest first). Optional ?status= filter. */
export async function GET(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const status = new URL(request.url).searchParams.get("status");
  let query = client
    .from("exp_blog_spot_notes")
    .select("*, exp_blog_posts:blog_post_id(title, slug)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
