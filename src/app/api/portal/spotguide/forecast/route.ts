import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { FORECAST_MODELS, tallyForecastVotes } from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/forecast — a member votes their favourite / most
 * accurate forecast model for a spot (one vote per member, upserted).
 * Body: { spotId, model }. Returns the refreshed tally.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to vote." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spotId = (body.spotId ?? "").trim();
  const model = (body.model ?? "").trim();
  if (!spotId) return NextResponse.json({ error: "Missing spot." }, { status: 400 });
  if (!FORECAST_MODELS.some((m) => m.id === model)) return NextResponse.json({ error: "Unknown model." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("spot_forecast_votes").upsert(
    { spot_id: spotId, contact_id: user.contactId, model },
    { onConflict: "spot_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save your vote." }, { status: 500 });
  }

  const { data: rows } = await db.from("spot_forecast_votes").select("model").eq("spot_id", spotId);
  return NextResponse.json({ ok: true, tally: tallyForecastVotes(rows ?? []), mine: model });
}
