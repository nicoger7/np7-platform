import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { revalidateBlog } from "@/lib/revalidate-public";

/** Approved notes are rendered server-side into the (now cached) post page, so a
 *  moderation decision has to invalidate that page or it stays invisible. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function revalidateNotePost(client: any, blogPostId: string | null | undefined) {
  if (!blogPostId) return;
  const { data } = await client.from("exp_blog_posts").select("slug, status").eq("id", blogPostId).maybeSingle();
  if (data?.status === "published") revalidateBlog(data.slug ?? null);
}

/** Moderate a note: set status to approved / rejected / pending. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = (body as { status?: string }).status;
  if (!["pending", "approved", "rejected"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_blog_spot_notes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await revalidateNotePost(client, data?.blog_post_id);
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  // read the parent post before the note goes, so its page can refresh
  const { data: gone } = await client.from("exp_blog_spot_notes").select("blog_post_id, status").eq("id", id).maybeSingle();
  const { error } = await client.from("exp_blog_spot_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // only an APPROVED note was on the page; a pending/rejected one never rendered
  if (gone?.status === "approved") await revalidateNotePost(client, gone.blog_post_id);
  return NextResponse.json({ success: true });
}
