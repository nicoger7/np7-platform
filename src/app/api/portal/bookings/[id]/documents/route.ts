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

  // Attach short-lived signed URLs (1 hour): one that renders inline in the
  // browser (View) and one that forces a download with a friendly filename.
  const rows = await Promise.all(
    (data ?? []).map(async (row: Record<string, unknown>) => {
      if (!row.file_path) return { ...row, signedUrl: null, downloadUrl: null };
      const path = row.file_path as string;
      const filename = `${(row.invoice_number as string) || (row.type as string) || "document"}.pdf`;
      const [view, dl] = await Promise.all([
        dbAny.storage.from("documents").createSignedUrl(path, 3600),
        dbAny.storage.from("documents").createSignedUrl(path, 3600, { download: filename }),
      ]);
      return { ...row, signedUrl: view.data?.signedUrl ?? null, downloadUrl: dl.data?.signedUrl ?? null };
    })
  );

  /**
   * The signed waiver belongs here too.
   *
   * It lives in `exp_waiver_signatures`, not `documents`, so it never appeared
   * on this tab — a guest could sign a liability waiver and then have no way to
   * read back what they agreed to. It has no PDF and no file in storage (the
   * signature is a data URL on the row), so it is surfaced as a virtual entry
   * pointing at the waiver page rather than a signed storage URL.
   */
  let waiverRow: Record<string, unknown> | null = null;
  try {
    const { data: sig } = await dbAny
      .from("exp_waiver_signatures")
      .select("id, signed_at, signed_name, version")
      .eq("booking_id", id)
      .maybeSingle();
    if (sig) {
      waiverRow = {
        id: `waiver:${sig.id}`,
        type: "waiver",
        invoice_number: null,
        title: "Signed waiver",
        amount: null,
        currency: null,
        issued_at: sig.signed_at,
        status: "signed",
        signedUrl: `/account/bookings/${id}/waiver`,
        downloadUrl: null,
        meta: { signedName: sig.signed_name, version: sig.version },
      };
    }
  } catch { /* table not there yet — the rest of the tab still works */ }

  return NextResponse.json({ documents: waiverRow ? [waiverRow, ...rows] : rows });
}
