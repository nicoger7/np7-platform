import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { revalidateExperience } from "@/lib/revalidate-public";
import { requireAdminGate } from "@/lib/admin-auth";
// PATCH /api/admin/reviews/:id — edit / approve / hide a review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["author_name", "author_country", "quote", "photo_url", "status", "experience_id", "edition_id", "reply"]) {
    if (k in body) patch[k] = body[k] === "" ? null : body[k];
  }
  // The reply's timestamp follows the reply: set when one is written, cleared
  // with it — nobody has to remember a second field.
  if ("reply" in body) patch.replied_at = patch.reply ? new Date().toISOString() : null;
  if ("rating" in body) patch.rating = Math.max(1, Math.min(5, Number(body.rating) || 5));
  const { data, error } = await client
    .from("exp_reviews")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidateExperience();
  return NextResponse.json(data);
}

// DELETE /api/admin/reviews/:id — delete a review (cascades placements)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const { error } = await client.from("exp_reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidateExperience();
  return NextResponse.json({ success: true });
}
