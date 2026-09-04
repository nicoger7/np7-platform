import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { composeBookingName } from "@/lib/booking-name";

import { rateLimited, LIMITS } from "@/lib/rate-limit";
/**
 * "Tell me when this week goes live."
 *
 * A published week without priced packages showed "being finalised" and simply
 * ended the page. This takes first name + email and files a plain LEAD booking
 * on that week — deliberately NOT a reservation: no package, no price, no
 * payment mail. The lead status already means "interested, talk to them", and
 * the admin pipeline is where every other follow-up already lives.
 */

type Body = {
  experienceId?: string;
  editionId?: string;
  firstName?: string;
  email?: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "week-interest", policy: LIMITS.write });
  if (tooMany) return tooMany;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { experienceId, editionId } = body;
  const firstName = (body.firstName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  if (!experienceId || !editionId) return bad("Missing trip selection.");
  if (!firstName) return bad("Please fill in your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");

  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Server-side sanity: the week must exist, belong to the experience, and be
  // genuinely public — this endpoint must not leak or attach to draft weeks.
  const [{ data: exp }, { data: edition }] = await Promise.all([
    db.from("exp_experiences").select("id,title").eq("id", experienceId).maybeSingle(),
    db.from("exp_editions").select("id,label,date_start,experience_id,status").eq("id", editionId).maybeSingle(),
  ]);
  if (!exp || !edition || edition.experience_id !== exp.id || edition.status !== "published") {
    return bad("This week is not available.", 409);
  }

  // Contact: reuse by email → create. Same shape as /api/reserve.
  const { data: existing } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
  let contactId: string | undefined = existing?.id;
  if (!contactId) {
    const { data: created, error: cErr } = await db
      .from("contacts").insert({ name: firstName, email, source: "website" }).select("id").single();
    if (cErr) return bad("Could not save your details. Please try again.", 500);
    contactId = created.id;
  }

  // Already on this week (any live status)? Then they're covered — idempotent
  // OK instead of a second pipeline row for the same person and week.
  const { data: dupe } = await db
    .from("exp_bookings").select("id,status").eq("contact_id", contactId).eq("edition_id", editionId)
    .is("archived_at", null).limit(1).maybeSingle();
  if (dupe && dupe.status !== "lost") return NextResponse.json({ ok: true, already: true });

  const { error: bErr } = await db.from("exp_bookings").insert({
    name: composeBookingName({
      contactName: firstName,
      experienceTitle: exp.title,
      editionLabel: edition.label,
      year: edition.date_start ? new Date(edition.date_start).getFullYear() : null,
    }),
    contact_id: contactId,
    experience_id: exp.id,
    edition_id: editionId,
    status: "lead",
    notes: "Website interest — asked to be emailed when this week's packages go live.",
  });
  if (bErr) return bad("Could not save your request. Please try again.", 500);

  return NextResponse.json({ ok: true });
}
