import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/editions/:id/notes — list notes (newest first)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("edition_notes")
    .select("*")
    .eq("edition_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, notes: [] }, { status: 200 });
  return NextResponse.json({ notes: data || [] });
}

// POST /api/admin/editions/:id/notes — add a note; author + timestamp burned in
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // Author = logged-in admin (server-side session), not client-supplied
  let author = "Unknown";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) author = user.email;
  } catch {
    // keep fallback
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("edition_notes")
    .insert({ edition_id: id, author, body: body.body })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/admin/editions/:id/notes?note_id=… — remove a note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const noteId = new URL(request.url).searchParams.get("note_id");
  if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("edition_notes")
    .delete()
    .eq("id", noteId)
    .eq("edition_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
