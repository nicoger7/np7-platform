import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// PATCH /api/portal/bookings/:id/photo-sharing  { shared: boolean }
// The member toggles whether their personal trip photos are visible to the other
// participants on the same edition. Ownership-checked. Tolerant of migration 060:
// if the photos_shared column isn't there yet the update no-ops gracefully.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const shared = body?.shared !== false; // default to sharing

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Verify ownership with a column that always exists.
  const { data: booking } = await db.from("exp_bookings").select("id").eq("id", id).eq("contact_id", auth.user.contactId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { error } = await db.from("exp_bookings").update({ photos_shared: shared }).eq("id", id);
  if (error && /photos_shared|column|schema cache/i.test(error.message)) {
    // Column not migrated yet — accept the request so the UI doesn't error.
    return NextResponse.json({ ok: true, shared, pending: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, shared });
}
