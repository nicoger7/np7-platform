import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { PHOTO_FLAG_THRESHOLD } from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/photo-vote — a member up/down-votes a photo and/or
 * flags it. Body: { photoId, value?: -1|0|1, flag?: boolean }. Enough flags
 * auto-hide the photo (status 'hidden') for NP7 to review. Returns the refreshed
 * score + the member's own reaction.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const photoId = (body.photoId ?? "").trim();
  if (!photoId) return NextResponse.json({ error: "Missing photo." }, { status: 400 });
  const value = [1, 0, -1].includes(body.value) ? body.value : undefined;
  const flag = typeof body.flag === "boolean" ? body.flag : undefined;
  if (value === undefined && flag === undefined) return NextResponse.json({ error: "Nothing to do." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("spot_photo_votes").select("value, flagged").eq("photo_id", photoId).eq("contact_id", user.contactId).maybeSingle();
  const row = {
    photo_id: photoId, contact_id: user.contactId,
    value: value !== undefined ? value : existing?.value ?? 0,
    flagged: flag !== undefined ? flag : existing?.flagged ?? false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("spot_photo_votes").upsert(row, { onConflict: "photo_id,contact_id" });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Photo voting isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }

  const { data: votes } = await db.from("spot_photo_votes").select("value, flagged").eq("photo_id", photoId);
  const score = (votes ?? []).reduce((s: number, v: { value: number }) => s + (v.value || 0), 0);
  const flags = (votes ?? []).filter((v: { flagged: boolean }) => v.flagged).length;

  let hidden = false;
  if (flags >= PHOTO_FLAG_THRESHOLD) {
    const { data: photo } = await db.from("spot_photos").select("status").eq("id", photoId).maybeSingle();
    if (photo?.status === "approved") {
      await db.from("spot_photos").update({ status: "hidden" }).eq("id", photoId);
      hidden = true;
    }
  }
  return NextResponse.json({ ok: true, score, flags, mine: { value: row.value, flagged: row.flagged }, hidden });
}
