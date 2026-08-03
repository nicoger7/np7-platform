import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { pickBlogFields } from "../../fields";
import { coerceDraft, slugifyPost, worldForTab, type IntakeNotes } from "@/lib/blog-intake";

/**
 * One queued intake item: edit or discard it (PATCH), or turn it into a post
 * (POST). The post is always created as a DRAFT — there is deliberately no path
 * from this queue to a published page.
 */

type Row = { id: string; text: string; status: string; notes: IntakeNotes | null };

async function loadRow(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("blog_intake_queue")
    .select("id, text, status, post_id, notes").eq("id", id).maybeSingle();
  if (error) {
    return /does not exist|schema cache/i.test(error.message)
      ? { error: "Run migration 139 first.", status: 503 as const }
      : { error: error.message, status: 500 as const };
  }
  if (!data) return { error: "That intake item is gone.", status: 404 as const };
  return { db, row: data as Row };
}

// PATCH { status: "discarded" } | { draft: {...} } — bin it, or save your edits
// to the proposal before creating the post.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const loaded = await loadRow(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { db, row } = loaded;
  if (row.status !== "pending") return NextResponse.json({ error: "That item has already been handled." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body?.status === "discarded") {
    patch.status = "discarded";
    patch.processed_at = new Date().toISOString();
  }
  if (body?.draft) {
    const draft = coerceDraft(body.draft);
    if (!draft) return NextResponse.json({ error: "A draft needs at least a title and a body." }, { status: 400 });
    patch.notes = { ...(row.notes ?? {}), draft } satisfies IntakeNotes;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await db.from("blog_intake_queue").update(patch).eq("id", id)
    .select("id, text, status, post_id, notes, created_at, processed_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}

// POST — create the Magazine post from the queued draft. Draft only, by design.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const loaded = await loadRow(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { db, row } = loaded;
  if (row.status !== "pending") return NextResponse.json({ error: "That item has already been handled." }, { status: 409 });

  // Whatever the reviewer has on screen wins over what was stored.
  const body = await request.json().catch(() => ({}));
  const draft = coerceDraft(body?.draft ?? row.notes?.draft);
  if (!draft) return NextResponse.json({ error: "There's no draft to create — write a title and a body first." }, { status: 400 });

  const base = draft.slug || slugifyPost(draft.title) || `untitled-${Date.now()}`;
  const { data: clashes } = await db.from("exp_blog_posts").select("slug").like("slug", `${base}%`);
  const taken = new Set(((clashes ?? []) as { slug: string }[]).map((p) => p.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const fields = pickBlogFields({
    title: draft.title,
    slug,
    excerpt: draft.excerpt || null,
    content: draft.content,
    // A prose draft has no structured template_data, so it lands as an article
    // — the editor can switch template afterwards and fill the blanks.
    template: "standard",
    world: worldForTab(draft.tab),
    status: "draft",
    published_at: null,
  });
  const { data: post, error } = await db.from("exp_blog_posts").insert(fields).select("id, slug, title").single();
  if (error) return NextResponse.json({ error: `Couldn't create the post: ${error.message}` }, { status: 400 });
  // No public invalidation: a draft is on no public page.

  const notes: IntakeNotes = { ...(row.notes ?? {}), draft };
  await db.from("blog_intake_queue")
    .update({ status: "processed", post_id: post.id, processed_at: new Date().toISOString(), notes })
    .eq("id", id);

  return NextResponse.json({ ok: true, post });
}
