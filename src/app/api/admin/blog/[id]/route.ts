import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { pickBlogFields } from "../fields";
import { revalidateBlog } from "@/lib/revalidate-public";

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
  // The editor autosaves ~2 s after every pause in typing. Snapshot the row so
  // we can (a) skip invalidation entirely while a DRAFT is being written — it is
  // not on any public page, so flushing the public cache per keystroke-pause
  // would hand back the CPU the caching just saved — and (b) catch a slug
  // RENAME, where the OLD url would otherwise keep serving from cache.
  const { data: before } = await client
    .from("exp_blog_posts").select("slug, status").eq("id", id).maybeSingle();
  const prev = before as { slug?: string | null; status?: string | null } | null;
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
  // Only published-facing changes touch the public cache: a draft edit, and an
  // edit to a post that is still a draft after saving, change nothing public.
  const now = data as { slug?: string | null; status?: string | null } | null;
  if (now?.status === "published" || prev?.status === "published") {
    revalidateBlog(now?.slug ?? null, { previousSlug: prev?.slug ?? null });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  // read the slug BEFORE deleting — afterwards there is nothing to look up
  const { data: gone } = await client.from("exp_blog_posts").select("slug, status").eq("id", id).maybeSingle();
  const { error } = await client.from("exp_blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const was = gone as { slug?: string | null; status?: string | null } | null;
  // a deleted DRAFT was never public; a deleted published post must also clear
  // its own url (now a 404) and the related-posts strips still linking to it
  if (was?.status === "published") revalidateBlog(was?.slug ?? null);
  return NextResponse.json({ success: true });
}
