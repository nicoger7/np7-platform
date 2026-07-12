import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { notArchived } from "@/lib/archive";

// Physical rooms (exp_rooms) — one per experience+hotel+name. Weekly occupancy
// lives in exp_hotel_rooms (room_id). See migration 060.

// GET /api/admin/rooms[?experience_id=]
export async function GET(request: Request) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const experienceId = new URL(request.url).searchParams.get("experience_id");
  let q = client.from("exp_rooms").select("*").order("hotel").order("name");
  // match the multi-experience array OR the legacy single column
  if (experienceId) q = q.or(`experience_id.eq.${experienceId},experience_ids.cs.{${experienceId}}`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ rooms: [] }); // tolerant pre-migration 060
  return NextResponse.json({ rooms: notArchived(data) });
}

// POST /api/admin/rooms — create a physical room
export async function POST(request: Request) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json();
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_rooms")
    .insert({
      experience_id: (Array.isArray(body.experience_ids) ? body.experience_ids[0] : body.experience_id) || null,
      experience_ids: Array.isArray(body.experience_ids) ? body.experience_ids : (body.experience_id ? [body.experience_id] : []),
      hotel: body.hotel || null,
      name: body.name,
      room_type: body.room_type || null,
      room_number: body.room_number || null,
      comments: body.comments || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ room: data });
}
