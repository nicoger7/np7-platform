import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /(documents|relation|schema cache|does not exist)/i.test(message)
  );
}

// ─── GET /api/portal/bookings/[id]/documents ──────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  // Member must be logged in
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  // Verify the booking belongs to this member
  const { data: booking, error: bookingError } = await dbAny
    .from("exp_bookings")
    .select("id, contact_id")
    .eq("id", id)
    .maybeSingle();

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 400 });
  }

  if (!booking || booking.contact_id !== user.contactId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Fetch documents for this booking
  const { data, error } = await dbAny
    .from("documents")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ documents: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Attach short-lived signed URLs (1 hour)
  const rows = await Promise.all(
    (data ?? []).map(async (row: Record<string, unknown>) => {
      if (!row.file_path) return { ...row, signedUrl: null };
      const { data: urlData } = await dbAny.storage
        .from("documents")
        .createSignedUrl(row.file_path as string, 3600);
      return { ...row, signedUrl: urlData?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ documents: rows });
}
