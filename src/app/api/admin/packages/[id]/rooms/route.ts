import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";

// Rooms backing a package — the package's availability derives from how many
// physical rooms are assigned to it.
//   GET → { roomIds: string[] }
//   PUT { roomIds: string[] } → replace the assignment set

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("exp_package_rooms").select("room_id").eq("package_id", id);
  if (error) return NextResponse.json({ roomIds: [] }); // tolerant pre-migration 090
  return NextResponse.json({ roomIds: (data ?? []).map((r: { room_id: string }) => r.room_id) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const roomIds: string[] = Array.isArray(body.roomIds) ? [...new Set<string>((body.roomIds as unknown[]).map(String))] : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error: delErr } = await db.from("exp_package_rooms").delete().eq("package_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (roomIds.length) {
    const { error } = await db.from("exp_package_rooms").insert(roomIds.map((room_id) => ({ package_id: id, room_id })));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, count: roomIds.length });
}
