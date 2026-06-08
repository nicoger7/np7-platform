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
      `*,
       contact:contact_id(id, name, email, phone),
       experience:experience_id(id, title, slug, location, date_start),
       package:package_id(id, name, price)`
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

  // Calculate payment info per booking
  const bookingIds = (data || []).map((b) => b.id);
  let payments: Record<string, number> = {};

  if (bookingIds.length > 0) {
    const { data: paymentData } = await client
      .from("exp_payments")
      .select("booking_id, amount")
      .in("booking_id", bookingIds);

    if (paymentData) {
      for (const p of paymentData) {
        if (p.booking_id) {
          payments[p.booking_id] =
            (payments[p.booking_id] || 0) + Number(p.amount);
        }
      }
    }
  }

  const bookings = (data || []).map((b) => ({
    ...b,
    total_paid: payments[b.id] || 0,
    outstanding: b.agreed_price
      ? Math.max(0, Number(b.agreed_price) - (payments[b.id] || 0))
      : 0,
  }));

  return NextResponse.json({ bookings });
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
