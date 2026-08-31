import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { MEMORY_DOWNLOAD_LIMIT } from "@/lib/portal-data";

// POST /api/portal/bookings/:id/video-download
// Mirror of photo-download: records one "download all videos" use and returns how
// many remain. The zipping happens client-side; this only enforces the per-booking
// cap. Counted separately from photos (video_download_count, migration 196) and
// tolerant of that migration being unapplied — then the cap isn't enforced yet.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db
    .from("exp_bookings").select("id")
    .eq("id", id).eq("contact_id", auth.user.contactId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  let used = 0;
  const { data: countRow } = await db.from("exp_bookings").select("video_download_count").eq("id", id).maybeSingle();
  if (countRow && typeof countRow.video_download_count === "number") used = countRow.video_download_count;

  if (used >= MEMORY_DOWNLOAD_LIMIT) {
    return NextResponse.json({ error: "limit_reached", remaining: 0 }, { status: 403 });
  }

  await db.from("exp_bookings").update({ video_download_count: used + 1 }).eq("id", id);
  return NextResponse.json({ ok: true, remaining: Math.max(0, MEMORY_DOWNLOAD_LIMIT - (used + 1)) });
}
