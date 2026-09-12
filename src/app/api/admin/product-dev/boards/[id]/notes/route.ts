import { NextRequest, NextResponse } from "next/server";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";

/**
 * The note inbox for one board.
 *
 * You measure a board with both hands busy and a pencil in your teeth, so the
 * note that comes out of it is a voice memo or a scrap of text, not a form.
 * Both land here RAW and stay raw: `body` is never rewritten, the tidy-up lives
 * in `filed`, and nothing in `filed` reaches the board until somebody imports
 * it from the review table.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { data, error } = await pdDb()
    .from("pd_board_notes").select("*").eq("board_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: "text" | "voice"; body?: string; audio_key?: string; duration_s?: number;
  };
  const kind = body.kind === "voice" ? "voice" : "text";
  if (kind === "text" && !(body.body ?? "").trim()) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  if (kind === "voice" && !body.audio_key) {
    return NextResponse.json({ error: "The recording didn't upload." }, { status: 400 });
  }

  const { data, error } = await pdDb().from("pd_board_notes").insert({
    board_id: id,
    kind,
    body: (body.body ?? "").trim() || null,
    audio_key: body.audio_key ?? null,
    duration_s: body.duration_s ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
