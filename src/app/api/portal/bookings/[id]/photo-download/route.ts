import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { MEMORY_DOWNLOAD_LIMIT } from "@/lib/portal-data";

// POST /api/portal/bookings/:id/photo-download
// Records one "download all photos" use and returns how many remain. The actual
// zipping happens client-side; this just enforces the per-booking cap. Tolerant of
// migration 024 being unapplied (then the cap simply isn't enforced yet).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Verify ownership with a column that always exists.
  const { data: booking } = await db
    .from("exp_bookings").select("id")
    .eq("id", id).eq("contact_id", auth.user.contactId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Read the count tolerantly — the column arrives in migration 024. If it's not
  // there yet, the cap simply isn't enforced (download still works).
  let used = 0;
  const { data: countRow } = await db.from("exp_bookings").select("memory_download_count").eq("id", id).maybeSingle();
  if (countRow && typeof countRow.memory_download_count === "number") used = countRow.memory_download_count;

  if (used >= MEMORY_DOWNLOAD_LIMIT) {
    return NextResponse.json({ error: "limit_reached", remaining: 0 }, { status: 403 });
  }

  // Best-effort increment; if the column doesn't exist yet, this no-ops gracefully.
  await db.from("exp_bookings").update({ memory_download_count: used + 1 }).eq("id", id);
  return NextResponse.json({ ok: true, remaining: Math.max(0, MEMORY_DOWNLOAD_LIMIT - (used + 1)) });
}
