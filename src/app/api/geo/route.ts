import { NextRequest, NextResponse } from "next/server";
import { edgeCountry } from "@/lib/signup-country";

/**
 * Which country is this visitor browsing from? `{ country: "NL" }`, or null
 * when the edge cannot say.
 *
 * Only there to pre-select the "Country you live in" dropdown at trip sign-up
 * (Nico, 27 Sep 2026). The guest still sees it and can change it; this just
 * saves most of them a scroll through 250 names.
 *
 * Its own tiny endpoint rather than a header read in the experience page,
 * because that page is ISR: reading the request there would make every trip
 * page dynamic, and a cached page would hand one visitor's country to the next.
 *
 * Nothing is stored and no IP is read or returned, only the two-letter code
 * Vercel already derived at the edge. Never cached, for the same reason the
 * page cannot hold it: the answer belongs to one visitor.
 */
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.json(
    { country: edgeCountry(request.headers) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
