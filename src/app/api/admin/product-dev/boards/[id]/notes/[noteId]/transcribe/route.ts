import { NextRequest, NextResponse } from "next/server";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { cdnUrlFor, r2CdnBase } from "@/lib/r2-presign";
import { NeedsTranscribeKey, TRANSCRIBE_MAX_BYTES, transcribeAudio } from "@/lib/pd-transcribe";

/**
 * Write a voice note down: the recording goes to ChatGPT's speech-to-text and
 * the words become the note's transcript (its body). A transcript somebody
 * already typed is never overwritten, also not one typed while this ran.
 * Filing into the board stays a separate, reviewed step ("Sort into the board").
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const deadline = Date.now() + (maxDuration - 15) * 1000;
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id, noteId } = await params;
  const db = pdDb();
  const { data: note, error } = await db.from("pd_board_notes")
    .select("id, kind, body, audio_key, duration_s").eq("id", noteId).eq("board_id", id).single();
  if (error || !note) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.kind !== "voice" || !note.audio_key) return NextResponse.json({ error: "That note has no recording." }, { status: 400 });
  if ((note.body ?? "").trim()) return NextResponse.json({ body: note.body, kept: true });

  const key = String(note.audio_key);
  const url = r2CdnBase()
    ? cdnUrlFor(key)
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${key.split("/").map(encodeURIComponent).join("/")}`;

  try {
    const audioRes = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!audioRes.ok) return NextResponse.json({ error: `The recording couldn't be read (${audioRes.status}).` }, { status: 502 });
    if (Number(audioRes.headers.get("content-length") ?? 0) > TRANSCRIBE_MAX_BYTES) {
      return NextResponse.json({ error: "This recording is over 25 MB, too long to write down in one go. Play it and type what you said." }, { status: 422 });
    }
    const audio = await audioRes.blob();
    const { text } = await transcribeAudio(audio, key.split("/").pop() || "note.m4a", { durationS: note.duration_s, deadline });
    if (!text) return NextResponse.json({ error: "Nothing was heard in this recording." }, { status: 422 });

    // only while the note still has no text: somebody may have typed one meanwhile
    const { data: upd, error: upErr } = await db.from("pd_board_notes")
      .update({ body: text, updated_at: new Date().toISOString() })
      .eq("id", noteId).eq("board_id", id).or("body.is.null,body.eq.")
      .select("id");
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (!upd?.length) {
      const { data: now } = await db.from("pd_board_notes").select("body").eq("id", noteId).eq("board_id", id).single();
      return NextResponse.json({ body: now?.body ?? "", kept: true });
    }
    return NextResponse.json({ body: text });
  } catch (e) {
    if (e instanceof NeedsTranscribeKey) return NextResponse.json({ needsKey: true, message: e.message });
    return NextResponse.json({ error: e instanceof Error ? e.message : "The recording couldn't be written down." }, { status: 502 });
  }
}
