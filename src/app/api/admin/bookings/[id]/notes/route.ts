import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireTeamMember, getActiveTeamMember } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** The signed-in team member's display name for the note byline. */
async function authorName(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const member = await getActiveTeamMember(user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((member as any)?.name as string | undefined) || user.email || null;
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/bookings/:id/notes — newest first
export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("exp_booking_notes").select("*")
    .eq("booking_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notes: data ?? [] });
}

// POST — add a note { body }
export async function POST(request: NextRequest, { params }: Ctx) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body: { body?: string } = await request.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("exp_booking_notes")
    .insert({ booking_id: id, body: text, author: await authorName() })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}

// PATCH — toggle/edit a note { noteId, done?, struck?, body? }.
// No DELETE on purpose: strike keeps the history honest.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body: { noteId?: string; done?: boolean; struck?: boolean; body?: string } = await request.json().catch(() => ({}));
  if (!body.noteId) return NextResponse.json({ error: "Missing noteId." }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof body.done === "boolean") updates.done_at = body.done ? new Date().toISOString() : null;
  if (typeof body.struck === "boolean") updates.struck_at = body.struck ? new Date().toISOString() : null;
  if (typeof body.body === "string" && body.body.trim()) updates.body = body.body.trim();
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("exp_booking_notes").update(updates)
    .eq("id", body.noteId).eq("booking_id", id)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}
