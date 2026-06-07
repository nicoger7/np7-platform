import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/payments — list payments with related data
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const bookingId = searchParams.get("booking_id");
  const experienceId = searchParams.get("experience_id");
  const status = searchParams.get("status");

  let query = client
    .from("exp_payments")
    .select(
      "*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title)"
    )
    .order("date", { ascending: false });

  if (bookingId) query = query.eq("booking_id", bookingId);
  if (experienceId) query = query.eq("experience_id", experienceId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/payments — create a payment
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  const { data, error } = await client
    .from("exp_payments")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
