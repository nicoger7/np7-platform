import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { isActiveTeamMember } from "@/lib/admin-auth";
import { notArchived } from "@/lib/archive";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getServiceClient();
  const experienceId = request.nextUrl.searchParams.get("experience_id");
  const editionId = request.nextUrl.searchParams.get("edition_id");
  const hotel = request.nextUrl.searchParams.get("hotel");
  const status = request.nextUrl.searchParams.get("status");

  let query = admin
    .from("exp_hotel_rooms")
    .select(
      `
      *,
      booking:exp_bookings(id, name, status, contacts(id, name, email)),
      edition:edition_id(year, label),
      room:room_id(id, sleeps)
    `
    )
    .order("hotel", { ascending: true })
    .order("room_type", { ascending: true });

  if (experienceId) query = query.eq("experience_id", experienceId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (editionId) query = (query as any).eq("edition_id", editionId);
  if (hotel) query = query.eq("hotel", hotel);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  // sleeps lives on the physical room; flattened here so callers see one shape.
  const rooms = (notArchived(data) as Record<string, unknown>[]).map((r) => ({
    ...r,
    sleeps: (r.room as { sleeps?: number | null } | null)?.sleeps ?? null,
  }));
  return Response.json({ rooms });
}

/**
 * Find (or create) the physical room (exp_rooms) behind a week row, so every
 * room×week points at one physical room.
 *
 * Matched on hotel_id, not the legacy `hotel` text. That text holds nicknames
 * ("REF", "Sorobon") while the room form writes hotels.name ("REF Carsi"), so
 * matching on it found nothing and forked a NEW physical room on every save —
 * and two rows for one room means twice the beds in the pool. hotel_id is
 * populated on every week row and was backfilled onto exp_rooms by migration
 * 143; the text compare stays as a fallback for anything it could not resolve.
 *
 * Tolerant: if exp_rooms doesn't exist yet it returns undefined and the caller
 * inserts the week row as before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRoomId(admin: any, body: any): Promise<string | undefined> {
  if (!body?.name) return undefined;
  const { experience_id = null, hotel = null, hotel_id = null, name, room_type = null, room_number = null } = body;
  let sel = admin.from("exp_rooms").select("id").eq("name", name).limit(1);
  if (hotel_id) sel = sel.eq("hotel_id", hotel_id);
  else if (hotel == null) sel = sel.is("hotel", null);
  else sel = sel.eq("hotel", hotel);
  sel = experience_id == null ? sel.is("experience_id", null) : sel.eq("experience_id", experience_id);
  const { data: existing, error: selErr } = await sel;
  if (selErr) return undefined; // table missing → pre-migration, stay as-is
  if (existing && existing.length) return existing[0].id;

  // Nothing under the link — try the legacy text before creating a duplicate of
  // a room that already exists under its old nickname.
  if (hotel_id && hotel) {
    const { data: legacy } = await admin
      .from("exp_rooms").select("id").eq("name", name).eq("hotel", hotel).limit(1);
    if (legacy && legacy.length) {
      await admin.from("exp_rooms").update({ hotel_id }).eq("id", legacy[0].id);
      return legacy[0].id;
    }
  }

  const { data: created, error: insErr } = await admin
    .from("exp_rooms")
    .insert({ experience_id, hotel, hotel_id, name, room_type, room_number })
    .select("id")
    .single();
  if (insErr) return undefined;
  return created?.id;
}

/**
 * How many people the room sleeps lives on the PHYSICAL room, not the week — a
 * double is a double every week of the year. The room form edits a week row, so
 * the value is forwarded here rather than stored twice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeSleeps(admin: any, roomId: string | null | undefined, sleeps: unknown) {
  if (!roomId || sleeps === undefined) return;
  const n = sleeps === null || sleeps === "" ? null : Number(sleeps);
  if (n !== null && (!Number.isFinite(n) || n < 1)) return;
  await admin.from("exp_rooms").update({ sleeps: n }).eq("id", roomId);
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = getServiceClient();
  const { sleeps, ...row } = body;

  if (!row.room_id) {
    const rid = await resolveRoomId(admin, row);
    if (rid) row.room_id = rid; // only set when we actually have one (pre-migration safe)
  }

  const { data, error } = await admin
    .from("exp_hotel_rooms")
    .insert(row)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await writeSleeps(admin, data?.room_id, sleeps);
  return Response.json({ room: data });
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, sleeps, ...updates } = body;
  const admin = getServiceClient();

  // "The hotel took this one back" only ever applies to a room we have NOT
  // sold: once a guest books, NP7 blocks the room at the hotel, so it cannot be
  // pulled. Releasing an occupied room would quietly leave a paid guest with
  // nowhere to sleep and no signal anywhere, so it is refused.
  if (updates.released_at) {
    const { data: cur } = await admin
      .from("exp_hotel_rooms").select("booking_id, extra_booking_ids").eq("id", id).maybeSingle();
    if (cur?.booking_id || (cur?.extra_booking_ids ?? []).length) {
      return Response.json(
        { error: "This room has a guest in it. We block a room at the hotel the moment it's booked, so it can't be taken back — move the guest first if it really is gone." },
        { status: 409 }
      );
    }
  }

  const { data, error } = await admin
    .from("exp_hotel_rooms")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await writeSleeps(admin, data?.room_id, sleeps);
  return Response.json({ room: data });
}
