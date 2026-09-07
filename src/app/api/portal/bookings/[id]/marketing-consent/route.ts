import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { storedConsentText } from "@/lib/marketing-consent";

// PATCH /api/portal/bookings/:id/marketing-consent  { allowed: boolean }
//
// The guest decides whether NP7 may use their likeness publicly: website, social
// accounts, paid ads. Separate from photo-sharing, which only concerns the other
// people on the same trip.
//
// Granting stamps the time AND the wording (GDPR Art. 7(1): the controller must be
// able to demonstrate what was consented to). The text comes from the server, not
// from the request body — a client that could name its own consent wording could
// manufacture a permission that was never shown to anyone.
//
// Withdrawing stamps a second date and leaves the first one standing. Art. 7(3)
// makes withdrawal forward-looking: a campaign that ran while consent stood was
// lawful, and the grant date is the only proof of that afterwards.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const allowed = body?.allowed === true; // opt-in: anything but an explicit yes is a no

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, marketing_consent_at")
    .eq("id", id)
    .eq("contact_id", auth.user.contactId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const now = new Date().toISOString();
  const patch = allowed
    ? {
        marketing_consent_at: booking.marketing_consent_at ?? now, // re-granting keeps the original date
        marketing_consent_withdrawn_at: null,
        marketing_consent_text: storedConsentText(),
      }
    : { marketing_consent_withdrawn_at: now };

  const { error } = await db.from("exp_bookings").update(patch).eq("id", id);
  if (error && /marketing_consent|column|schema cache/i.test(error.message)) {
    // Column not migrated yet. Report it rather than pretending: unlike a photo
    // preference, a consent switch that silently does nothing is a permission the
    // guest believes they withdrew.
    return NextResponse.json({ error: "Not available yet, please try again later" }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, allowed });
}
