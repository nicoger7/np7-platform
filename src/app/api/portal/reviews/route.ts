import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeCategoryRatings } from "@/lib/review-categories";

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

  const fields = {
    author_name: body.author_name || user.name || null,
    author_country: body.author_country || null,
    rating: body.rating != null ? Math.max(1, Math.min(5, Number(body.rating))) : 5,
    quote: body.quote || null,
    photo_url: body.photo_url || null,
    // Whitelisted keys, clamped 1–5 (lib/review-categories); null when none.
    category_ratings: sanitizeCategoryRatings(body.category_ratings),
    status: "pending",
    submitted_at: new Date().toISOString(),
  };

  // One review per booking. Submitting again UPDATES it rather than piling a
  // second pending row into the pool (the old behaviour) — which also lets a
  // guest add category stars to a review they already wrote. An edit drops an
  // approved review back to pending, so nothing changes publicly unreviewed.
  const { data: existing } = await db
    .from("exp_reviews")
    .select("id")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from("exp_reviews").update(fields).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: existing.id, updated: true }, { status: 200 });
  }

  const { data, error } = await db
    .from("exp_reviews")
    .insert({
      booking_id: booking.id,
      experience_id: booking.experience_id,
      edition_id: booking.edition_id,
      ...fields,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
