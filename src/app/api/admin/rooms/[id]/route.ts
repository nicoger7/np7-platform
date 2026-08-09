import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { softDelete } from "@/lib/archive";

const EDITABLE = ["experience_id", "hotel", "hotel_id", "name", "room_type", "room_number", "comments", "experience_ids", "sleeps"] as const;

// PATCH /api/admin/rooms/[id] — edit physical-room fields (reflects on every week)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) patch[k] = body[k] === "" ? null : body[k];
  // experience_ids is the source of truth; mirror the first into the legacy column
  if (Array.isArray(patch.experience_ids)) patch.experience_id = patch.experience_ids[0] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client.from("exp_rooms").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // The week rows carry denormalized copies of these fields (Notion legacy),
  // and everything from the admin list to the public room grouping reads them.
  // Without this write-through a rename updated the physical room and stranded
  // every week under the old name — the "renames broke public grouping" bug.
  const MIRRORED = ["name", "hotel", "hotel_id", "room_type", "room_number"] as const;
  const mirror: Record<string, unknown> = {};
  for (const k of MIRRORED) if (k in patch) mirror[k] = patch[k];
  if (Object.keys(mirror).length) {
    const { error: mirrorErr } = await client.from("exp_hotel_rooms")
      .update({ ...mirror, updated_at: new Date().toISOString() }).eq("room_id", id);
    if (mirrorErr) console.error("[rooms] week mirror failed:", mirrorErr.message);
  }
  return NextResponse.json({ room: data });
}

// DELETE /api/admin/rooms/[id] — soft-delete the physical room (occupancy rows
// keep their booking/edition links and remain reachable via those views).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const client = createAdminClient();
  const { ok, error } = await softDelete(client, "exp_rooms", id);
  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
