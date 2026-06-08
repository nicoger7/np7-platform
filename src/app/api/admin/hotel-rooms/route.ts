import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

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
  if (!user) throw new Error("Unauthorized");
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
      booking:exp_bookings(id, name, status, contacts(id, name, email))
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
  return Response.json({ rooms: data });
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = getServiceClient();

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
