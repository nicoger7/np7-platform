import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/bookings — list bookings with related data
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const experienceId = searchParams.get("experience_id");
  const status = searchParams.get("status");

  let query = client
    .from("exp_bookings")
    .select(
      "*, contacts(name, email, phone), exp_experiences(title, slug), exp_packages(name)"
    )
    .order("created_at", { ascending: false });

  if (experienceId) {
    query = query.eq("experience_id", experienceId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/bookings — create a booking
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  const { data, error } = await client
    .from("exp_bookings")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
