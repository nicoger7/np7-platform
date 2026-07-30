import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { pickBlogFields } from "./fields";
import { revalidateBlog } from "@/lib/revalidate-public";

export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const { data, error } = await client
    .from("exp_blog_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const fields = pickBlogFields(await request.json());
  // slug is NOT NULL + unique; a brand-new post has no title yet, so give it a
  // unique placeholder here (server-side) until the editor sets a real one.
  if (!fields.slug) fields.slug = `untitled-${Date.now()}`;
  const { data, error } = await client.from("exp_blog_posts").insert(fields).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // A new post is normally a draft, which is on no public page — only spend the
  // invalidation if it was created already published.
  const created = data as { slug?: string | null; status?: string | null } | null;
  if (created?.status === "published") revalidateBlog(created.slug ?? null);
  return NextResponse.json(data, { status: 201 });
}
