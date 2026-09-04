import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/reviews?status= — the review pool (optionally filtered by status)
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const status = new URL(request.url).searchParams.get("status");
  let q = client
    .from("exp_reviews")
    .select("*, exp_experiences(id, title), exp_editions(id, label, year)")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/admin/reviews — manually create a review (pre-approved by default)
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json();
  const { data, error } = await client
    .from("exp_reviews")
    .insert({
      author_name: body.author_name || null,
      author_country: body.author_country || null,
      rating: body.rating != null ? Math.max(1, Math.min(5, Number(body.rating))) : 5,
      quote: body.quote || null,
      photo_url: body.photo_url || null,
      experience_id: body.experience_id || null,
      edition_id: body.edition_id || null,
      status: body.status || "approved",
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
