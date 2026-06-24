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
      edition:edition_id(year, label)
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
  return Response.json({ rooms: notArchived(data) });
}

// Find (or create) the physical room (exp_rooms) for an occupancy row so every
// room×week links to a single physical room. Tolerant: if exp_rooms doesn't
// exist yet (pre-migration 060) it returns undefined and the caller just inserts
// the occupancy as before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRoomId(admin: any, body: any): Promise<string | undefined> {
  if (!body?.name) return undefined;
  const { experience_id = null, hotel = null, name, room_type = null, room_number = null } = body;
  let sel = admin.from("exp_rooms").select("id").eq("name", name).limit(1);
  sel = hotel == null ? sel.is("hotel", null) : sel.eq("hotel", hotel);
  sel = experience_id == null ? sel.is("experience_id", null) : sel.eq("experience_id", experience_id);
  const { data: existing, error: selErr } = await sel;
  if (selErr) return undefined; // table missing → pre-migration, stay as-is
  if (existing && existing.length) return existing[0].id;
  const { data: created, error: insErr } = await admin
    .from("exp_rooms")
    .insert({ experience_id, hotel, name, room_type, room_number })
    .select("id")
    .single();
  if (insErr) return undefined;
  return created?.id;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = getServiceClient();

  if (!body.room_id) {
    const rid = await resolveRoomId(admin, body);
    if (rid) body.room_id = rid; // only set when we actually have one (pre-migration safe)
  }

  const { data, error } = await admin
    .from("exp_hotel_rooms")
    .insert(body)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ room: data });
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;
  const admin = getServiceClient();

  const { data, error } = await admin
    .from("exp_hotel_rooms")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ room: data });
}
