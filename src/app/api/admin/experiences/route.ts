import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/experiences — list all experiences
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();

  const { data, error } = await client
    .from("exp_experiences")
    .select("*")
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(notArchived(data));
}

// Real exp_experiences (template) columns. Edition-level fields (date_start,
// date_end, max_spots, spots_taken, deposit, year, …) live on exp_editions and
// must NOT be written here — inserting them throws "column does not exist".
const ALLOWED_COLUMNS = [
  "title", "slug", "code", "location", "description", "hero_image", "gallery",
  "status", "timezone", "hotels", "hotel", "airport_code", "notes",
  "cancellation_policy", "active_status", "location_lat", "location_lng",
  "notion_id", "currency", "price", "whatsapp_group_link", "whats_included",
  "total_fixed_costs",
];

// POST /api/admin/experiences — create an experience (template fields only)
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();

  const sanitized = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED_COLUMNS.includes(k))
  );

  const { data, error } = await (client as any)
    .from("exp_experiences")
    .insert(sanitized)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
