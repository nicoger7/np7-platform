import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { fetchVideoText, youtubeId } from "@/lib/youtube";
import { draftMagazinePost, type IntakeNotes } from "@/lib/blog-intake";

/**
 * AI Magazine intake — paste a YouTube link or any notes and get a DRAFT post
 * proposal in the review queue. The queue row is written FIRST, so a slow or
 * failed AI call still leaves the source text somewhere a human can find it.
 * Nothing here touches exp_blog_posts; the post is created from the queue by a
 * person, always as a draft (see [id]/route.ts).
 */

const MISSING_TABLE = /does not exist|schema cache/i;

// GET — the review queue: what still needs a human, newest first.
export async function GET(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const wantAll = request.nextUrl.searchParams.get("all") === "1";
  let q = db.from("blog_intake_queue")
    .select("id, text, status, post_id, notes, created_at, processed_at")
    .order("created_at", { ascending: false })
    .limit(wantAll ? 100 : 25);
  if (!wantAll) q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) {
    if (MISSING_TABLE.test(error.message)) return NextResponse.json({ error: "Run migration 139 first.", items: [] }, { status: 503 });
    return NextResponse.json({ error: error.message, items: [] }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

// POST { text } or { url } — queue the source and draft a post from it.
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  // One box, two kinds of input: a bare link pasted into the notes field is a
  // link, not a two-word article.
  const url = rawUrl || (youtubeId(rawText) && !/\s/.test(rawText) ? rawText : "");

  let text = url ? "" : rawText;
  let source: IntakeNotes["source"];
  if (url) {
    const video = await fetchVideoText(url);
    if ("error" in video) return NextResponse.json({ error: video.error }, { status: 400 });
    source = { kind: "youtube", url, title: video.title, channel: video.channel };
    text = [video.title, video.description].filter(Boolean).join("\n\n").trim();
    // A title alone is not a post. Queue the link so the video isn't lost, and
    // say plainly that someone has to watch it.
    if (video.description.trim().length < 40) {
      return queueOnly(
        [`YouTube video to write up for the Magazine: ${url}`, video.title ? `Video title: ${video.title}` : ""].filter(Boolean).join("\n"),
        { source, error: "No description came through — watch the video and write the notes yourself, then draft from those." },
      );
    }
  }
  if (text.length < 20) return NextResponse.json({ error: "Paste a bit more — a link, or at least a couple of sentences." }, { status: 400 });

  const queued = await insertRow(text, { source });
  if ("error" in queued) return NextResponse.json({ error: queued.error }, { status: queued.status });

  const drafted = await draftMagazinePost(text);
  const notes: IntakeNotes = "draft" in drafted ? { draft: drafted.draft, source } : { error: drafted.error, source };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("blog_intake_queue")
    .update({ notes }).eq("id", queued.id)
    .select("id, text, status, post_id, notes, created_at, processed_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data, drafted: "draft" in drafted });
}

/** Park text in the queue without asking the AI for anything. */
async function queueOnly(text: string, notes: IntakeNotes) {
  const queued = await insertRow(text, notes);
  if ("error" in queued) return NextResponse.json({ error: queued.error }, { status: queued.status });
  return NextResponse.json({ ok: true, item: queued.row, drafted: false });
}

async function insertRow(text: string, notes: IntakeNotes) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("blog_intake_queue")
    .insert({ text, notes })
    .select("id, text, status, post_id, notes, created_at, processed_at").single();
  if (error) {
    return MISSING_TABLE.test(error.message)
      ? { error: "Run migration 139 first.", status: 503 as const }
      : { error: `Couldn't queue that: ${error.message}`, status: 400 as const };
  }
  return { id: data.id as string, row: data };
}
