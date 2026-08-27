import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { windcoachAuthorized } from "@/lib/windcoach-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/windcoach/trips — the weeks a wind.coach coach can pick from.
 *
 * Exists so the "send this guide to NP7" form becomes a dropdown instead of
 * four hand-typed fields (rider email + trip name + two dates), where a single
 * date typo parked the guide in the review queue. The coach picks a trip here,
 * then a rider from /trips/{id}/riders, and posts the resulting booking_id —
 * which skips matching entirely.
 *
 * Bounded on purpose (recent + upcoming): cheap enough to call on every
 * dropdown-open, and a coach never needs a trip from three seasons ago.
 * `kind` rides along so wind.coach can hide 1–2 day events from a guide picker.
 */
const PAST_DAYS = 180;
// Short on purpose. A guide is written AFTER a week, so a partner never needs
// next season — and a 365-day window handed out every unannounced 2027 edition
// we have staged. Draft and archived weeks are excluded for the same reason:
// the season calendar is not the partner's business until it is public.
const FUTURE_DAYS = 60;
const HIDDEN_STATUS = ["draft", "archived"];

export async function GET(req: NextRequest) {
  if (!windcoachAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("exp_editions")
    .select("id,label,date_start,date_end,kind,status,archived_at,exp_experiences(title)")
    .is("archived_at", null)
    .not("status", "in", `(${HIDDEN_STATUS.join(",")})`)
    .gte("date_end", day(-PAST_DAYS))
    .lte("date_start", day(FUTURE_DAYS))
    .order("date_start", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trips = ((data ?? []) as Record<string, unknown>[]).map((e) => {
    const title = (e.exp_experiences as { title?: string } | null)?.title ?? "";
    const label = e.label ? String(e.label) : "";
    return {
      id: String(e.id),
      // What the coach reads in the dropdown — and what lands in trip_label,
      // so the review queue shows the same words the coach saw.
      label: [title, label].filter(Boolean).join(" — ") || "Untitled trip",
      start: e.date_start ?? null,
      end: e.date_end ?? null,
      kind: e.kind ?? "experience",
    };
  });
  return NextResponse.json({ trips });
}
