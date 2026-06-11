import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Fallback until the hotels table exists (migration 016)
const LEGACY_HOTELS = [
  { id: null, name: "Sorobon", prefix: "SOR" },
  { id: null, name: "Wanapa", prefix: "WAN" },
  { id: null, name: "Playa Surf", prefix: "PLS" },
  { id: null, name: "Hotel Paradiso", prefix: "PAR" },
  { id: null, name: "Alacati", prefix: "ALA" },
  { id: null, name: "REF", prefix: "REF" },
  { id: null, name: "REF II", prefix: "REF2" },
];

// GET /api/admin/hotels — list hotels (DB-backed, legacy fallback)
export async function GET() {
  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).from("hotels").select("*").order("name");
  if (error) {
    // table not created yet — serve the legacy hardcoded list
    return NextResponse.json({ hotels: LEGACY_HOTELS, source: "legacy" });
  }
  return NextResponse.json({ hotels: data || [], source: "db" });
}

// POST /api/admin/hotels — add a hotel (name + prefix)
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("hotels")
    .insert({ name: body.name, prefix: body.prefix || null, location: body.location || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
