import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { windcoachAuthorized } from "@/lib/windcoach-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/windcoach/trips/{id}/riders — who was on that week.
 *
 * DELIBERATELY MINIMAL: booking_id + display name, nothing else. wind.coach
 * needs exactly enough to render a dropdown and hand the id back; it has no
 * business holding NP7 rider email addresses, and the guide push resolves the
 * contact's email on our side from the booking anyway.
 *
 * Only people who actually came (or are coming): bookings have no archived_at —
 * their lifecycle IS the status — so 'lost' and 'lead' are excluded. A guide is
 * written after the week, by which point a real rider is confirmed/paid/
 * attended; leaving leads in would bury the actual crew under enquiries.
 */
const NOT_RIDERS = new Set(["lost", "lead"]);
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!windcoachAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Trip id required." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("exp_bookings")
    .select("id,name,status,contacts(name)")
    .eq("edition_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const riders = ((data ?? []) as Record<string, unknown>[])
    .filter((b) => !NOT_RIDERS.has(String(b.status ?? "")))
    .map((b) => ({
      booking_id: String(b.id),
      name:
        (b.contacts as { name?: string } | null)?.name ||
        // Booking names carry a " — Experience 2026" tail; the coach only needs
        // the human part to recognise the rider.
        String(b.name ?? "").split(" — ")[0].split(" - ")[0] ||
        "Participant",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ riders });
}
