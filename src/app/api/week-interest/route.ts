import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { composeBookingName } from "@/lib/booking-name";
import { findLiveBookings } from "@/lib/existing-booking";

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

  /*
   * Contact: reuse by email, oldest wins, then create. Case-insensitive and
   * LIMITED, which the rest of the codebase already does and this did not:
   * `.eq(...).maybeSingle()` errors when an address has two contacts, and the
   * error was being dropped, so a duplicated address minted a THIRD contact and
   * the duplicate guard below it read a brand new row with no bookings and
   * never fired. pim@huubenheurman.nl has two contacts today.
   */
  const { data: found } = await db.from("contacts").select("id")
    .ilike("email", email).order("created_at", { ascending: true }).limit(1);
  let contactId: string | undefined = (found ?? [])[0]?.id;
  if (!contactId) {
    const { data: created, error: cErr } = await db
      .from("contacts").insert({ name: firstName, email, source: "website" }).select("id").single();
    if (cErr) return bad("Could not save your details. Please try again.", 500);
    contactId = created.id;
  }

  /*
   * Already on this week (any live status)? Then they're covered, so this is
   * an idempotent OK instead of a second pipeline row for one person and week.
   *
   * Through findLiveBookings, the same rule /api/register is judged by, and
   * that matters in three ways the hand-rolled query got wrong. It compared the
   * RAW status against "lost", so a Notion-era row still spelled "cancelled"
   * (Derek Rotz on Bonaire Week III) counted as live and swallowed a real
   * signup as {ok: true, already: true}: a lost lead reported as a success. It
   * had no .order(), so for somebody holding both a lost and a live booking on
   * one week the planner decided which row came back. And it is best-effort, so
   * a query that hiccups files the lead rather than losing it.
   *
   * This guard has also never actually run before now: it used to filter
   * `archived_at is null`, a column exp_bookings does not have (migration 039
   * adds it to nine tables and not this one), so PostgREST rejected the whole
   * query. Same mistake, same family, as the cron at
   * src/app/api/cron/booking-status/route.ts.
   */
  const live = await findLiveBookings(db, {
    contactIds: [contactId!], experienceId: exp.id, editionId,
  });
  if (live.has(contactId!)) return NextResponse.json({ ok: true, already: true });

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
    notes: "Website interest · asked to be emailed when this week's packages go live.",
  });
  if (bErr) return bad("Could not save your request. Please try again.", 500);

  return NextResponse.json({ ok: true });
}
