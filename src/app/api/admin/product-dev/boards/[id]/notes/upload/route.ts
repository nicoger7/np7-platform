import { NextRequest, NextResponse } from "next/server";
import { requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { presignPut, r2VideoEnabled } from "@/lib/r2-presign";

/**
 * Where a voice note goes: a short-lived link the browser PUTs the recording
 * to, straight into storage.
 *
 * The media route takes the file through a Vercel function, whose body limit
 * (about 4.5 MB) is four or five minutes of iPhone audio; a measuring session
 * is longer. 501 means storage can't take direct uploads here, and the browser
 * falls back to the media route.
 */

const EXT: Record<string, string> = {
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac",
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/flac": "flac", "audio/x-flac": "flac",
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown board." }, { status: 400 });
  const { contentType } = (await request.json().catch(() => ({}))) as { contentType?: string };
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return NextResponse.json({ error: `That isn't an audio file this can keep (${type || "no type"}).` }, { status: 400 });
  if (!r2VideoEnabled()) return NextResponse.json({ error: "Direct upload isn't set up here.", fallback: true }, { status: 501 });

  const key = `product-dev/boards/${id}/voice/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-note.${ext}`;
  const uploadUrl = await presignPut(key, type);
  return NextResponse.json({ uploadUrl, key, contentType: type });
}
