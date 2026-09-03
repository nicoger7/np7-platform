import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Photos and videos on one knowledge entry.
 *
 * Nothing is copied. A memory picked here is the same object in the same
 * bucket the guest's gallery serves, referenced by its storage path, so
 * illustrating a skill with the real shot of a real rider costs no storage and
 * no upload. See migration 203 for why `ref` is the handle rather than the URL.
 */

/** GET — everything on the entry, grouped by the section it illustrates. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("kb_media").select("*").eq("entry_id", id)
    .order("section_key").order("sort_order");
  return NextResponse.json({ media: data ?? [] });
}

/** POST — attach one or many. Picking the same photo twice is a no-op. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const items = (Array.isArray(body.items) ? body.items : [body]).filter(
    (i: { ref?: string; url?: string }) => i?.ref && i?.url
  );
  if (!items.length) return NextResponse.json({ error: "Nothing to attach." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const sectionKey = typeof body.sectionKey === "string" && body.sectionKey ? body.sectionKey : null;
  const { data: last } = await db.from("kb_media").select("sort_order")
    .eq("entry_id", id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  let next = (last?.sort_order ?? -1) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = items.map((i: any) => ({
    entry_id: id,
    section_key: sectionKey,
    kind: i.kind === "video" ? "video" : "photo",
    ref: String(i.ref),
    url: String(i.url),
    poster_url: i.posterUrl ?? null,
    caption: i.caption ?? null,
    source: ["library", "memories", "upload"].includes(i.source) ? i.source : "library",
    sort_order: next++,
  }));
  // Same photo on the same section twice is a slip, not a choice: the unique
  // index catches it and we quietly keep the first.
  const { error } = await db.from("kb_media").upsert(rows, { onConflict: "entry_id,section_key,ref", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, added: rows.length });
}

/** PATCH — caption or order. DELETE — detach (the file itself is untouched). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (Array.isArray(body.order)) {
    await Promise.all((body.order as string[]).map((mediaId, i) =>
      db.from("kb_media").update({ sort_order: i }).eq("id", mediaId).eq("entry_id", id)
    ));
    return NextResponse.json({ ok: true });
  }
  if (body.mediaId) {
    const patch: Record<string, unknown> = {};
    if ("caption" in body) patch.caption = body.caption || null;
    if ("sectionKey" in body) patch.section_key = body.sectionKey || null;
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    const { error } = await db.from("kb_media").update(patch).eq("id", body.mediaId).eq("entry_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const mediaId = new URL(request.url).searchParams.get("mediaId");
  if (!mediaId) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Detaches only. The photo stays in the bucket: it is a guest's memory and
  // this entry merely borrowed it.
  const { error } = await db.from("kb_media").delete().eq("id", mediaId).eq("entry_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
