import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/portal/reviews — a logged-in member submits a review for one of
 * their own trips. Lands in the pool as `pending` for admin approval/placement.
 * Body: { booking_id, rating (1-5), quote, author_name?, author_country?, photo_url? }
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.booking_id) return NextResponse.json({ error: "booking_id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Verify the booking belongs to this member.
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, contact_id, experience_id, edition_id")
    .eq("id", body.booking_id)
    .maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("exp_reviews")
    .insert({
      booking_id: booking.id,
      experience_id: booking.experience_id,
      edition_id: booking.edition_id,
      author_name: body.author_name || user.name || null,
      author_country: body.author_country || null,
      rating: body.rating != null ? Math.max(1, Math.min(5, Number(body.rating))) : 5,
      quote: body.quote || null,
      photo_url: body.photo_url || null,
      status: "pending",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
