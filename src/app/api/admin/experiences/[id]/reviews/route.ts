import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Reviews are curated at the EXPERIENCE level (not per edition). Experience-level
// placements are rows in exp_review_placements with edition_id IS NULL.

// GET /api/admin/experiences/:id/reviews — reviews placed on this experience
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const { data, error } = await client
    .from("exp_review_placements")
    .select("*, exp_reviews(id, author_name, author_country, rating, quote, photo_url, status, booking_id)")
    .eq("experience_id", id)
    .is("edition_id", null)
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/admin/experiences/:id/reviews — place an approved review on this experience
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.review_id) {
    return NextResponse.json({ error: "review_id required" }, { status: 400 });
  }
  const { data: existing } = await client
    .from("exp_review_placements")
    .select("sort_order")
    .eq("experience_id", id)
    .is("edition_id", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;
  const { data, error } = await client
    .from("exp_review_placements")
    .insert({ review_id: body.review_id, experience_id: id, edition_id: null, sort_order: nextSort })
    .select("*, exp_reviews(id, author_name, author_country, rating, quote, photo_url, status, booking_id)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/experiences/:id/reviews — reorder a placement
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.review_id) return NextResponse.json({ error: "review_id required" }, { status: 400 });
  const { data, error } = await client
    .from("exp_review_placements")
    .update({ sort_order: body.sort_order ?? 0 })
    .eq("experience_id", id)
    .is("edition_id", null)
    .eq("review_id", body.review_id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/experiences/:id/reviews?review_id= — unplace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const reviewId = new URL(request.url).searchParams.get("review_id");
  if (!reviewId) return NextResponse.json({ error: "review_id required" }, { status: 400 });
  const { error } = await client
    .from("exp_review_placements")
    .delete()
    .eq("experience_id", id)
    .is("edition_id", null)
    .eq("review_id", reviewId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
