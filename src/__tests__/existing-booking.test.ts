/**
 * "Is this person already on this week?"
 *
 * Nothing guarded the signup against a repeat. /api/register looked a contact
 * up by email and then inserted a booking unconditionally, and so did every
 * companion: a reload, a double click or a guest who had simply forgotten got a
 * second lead, a second pro-forma and a second payment plan.
 *
 * What is pinned here is the RULE, in the four places it can go wrong: who
 * counts as still on the week (lost is the only exclusion, and the legacy
 * Notion spellings have to normalise), what "this week" means (the edition, not
 * the experience, or a repeat customer could never book next year), when a
 * repeat is really one submission, and which tone the guest is owed.
 *
 * Deliberately in one file with the companion case, because the whole point of
 * the module is that the payer and the roster are judged by the same rule.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  appendBookingNote,
  classifyExistingBooking,
  existingBookingKind,
  findLiveBookings,
  isEmptyLead,
  isLiveBooking,
  isUniqueViolation,
  resolveContactIdsByEmail,
  CLOCK_SKEW_TOLERANCE_MS,
  DOUBLE_SUBMIT_WINDOW_MS,
  type LiveBookingRow,
} from "@/lib/existing-booking";
import { createCompanionBookings, validateCompanions, type ValidCompanion } from "@/lib/group-register";

beforeAll(() => {
  // Everything here runs on a fake db. Without the service-role key
  // createAdminClient throws, which is what keeps a stray code path from
  // reaching the real Supabase.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

const NOW = Date.parse("2026-09-14T10:00:00.000Z");
const row = (over: Partial<LiveBookingRow> = {}): LiveBookingRow => ({
  id: "bk-1",
  contact_id: "c-nico",
  package_id: "pkg-standard",
  status: "lead",
  created_at: new Date(NOW - 10_000).toISOString(),
  covered_by_booking_id: null,
  agreed_price: 4590,
  notes: "Website registration · package: Standard room",
  ...over,
});

/** The shape /api/week-interest writes: a week, a person, and nothing else. */
const emptyLead = (over: Partial<LiveBookingRow> = {}): LiveBookingRow => row({
  id: "bk-interest",
  package_id: null,
  agreed_price: null,
  notes: "Website interest · asked to be emailed when this week's packages go live.",
  ...over,
});

// ────────────────────────────────────────────────────────────────────────────

describe("classifyExistingBooking", () => {
  it("says nothing when there is no prior booking", () => {
    expect(classifyExistingBooking({ row: null, packageId: "pkg-standard", now: NOW })).toBe("none");
    expect(classifyExistingBooking({ row: undefined, packageId: "pkg-standard", now: NOW })).toBe("none");
  });

  it("treats the same package seconds ago as one submission, not two bookings", () => {
    expect(classifyExistingBooking({ row: row(), packageId: "pkg-standard", now: NOW })).toBe("same-submission");
  });

  it("treats the same package a minute and one second later as a deliberate rebooking", () => {
    const old = row({ created_at: new Date(NOW - 61_000).toISOString() });
    expect(classifyExistingBooking({ row: old, packageId: "pkg-standard", now: NOW })).toBe("conflict");
  });

  it("holds the window open at exactly the boundary and closes it one ms later", () => {
    const at = row({ created_at: new Date(NOW - DOUBLE_SUBMIT_WINDOW_MS).toISOString() });
    const past = row({ created_at: new Date(NOW - DOUBLE_SUBMIT_WINDOW_MS - 1).toISOString() });
    expect(classifyExistingBooking({ row: at, packageId: "pkg-standard", now: NOW })).toBe("same-submission");
    expect(classifyExistingBooking({ row: past, packageId: "pkg-standard", now: NOW })).toBe("conflict");
  });

  it("calls a different package a conflict even seconds later, because that is a choice", () => {
    expect(classifyExistingBooking({ row: row(), packageId: "pkg-suite", now: NOW })).toBe("conflict");
  });

  it("treats a lead with no package as no booking at all, so the guest is never locked out", () => {
    // Anna asked to be told when Tenerife 2027 went live (/api/week-interest
    // files exactly this row: no package, no price). Prices land, she comes
    // back, and the old rule compared null against a real package id, called it
    // a conflict and answered 409 forever. Nothing ever cleared that row.
    expect(classifyExistingBooking({ row: emptyLead(), packageId: "pkg-standard", now: NOW })).toBe("none");
  });

  it("still lets her register months later, because an ask does not expire", () => {
    const old = emptyLead({ created_at: "2026-01-04T09:00:00.000Z" });
    expect(classifyExistingBooking({ row: old, packageId: "pkg-standard", now: NOW })).toBe("none");
  });

  it("reads a double click as one submission when the database clock runs ahead", () => {
    // created_at is stamped by Postgres and compared against a Vercel function's
    // clock. A few ms of skew used to make the age negative, fail the window
    // test and send a genuine double click to the conflict screen.
    const skewed = row({ created_at: new Date(NOW + 2_000).toISOString() });
    expect(classifyExistingBooking({ row: skewed, packageId: "pkg-standard", now: NOW })).toBe("same-submission");
  });

  it("does not take a booking from next week as a double click", () => {
    const wayAhead = row({ created_at: new Date(NOW + CLOCK_SKEW_TOLERANCE_MS + 1_000).toISOString() });
    expect(classifyExistingBooking({ row: wayAhead, packageId: "pkg-standard", now: NOW })).toBe("conflict");
  });
});

describe("isEmptyLead: the narrow shape that gets completed rather than blocked", () => {
  it("is the row /api/week-interest writes, and nothing else", () => {
    expect(isEmptyLead(emptyLead())).toBe(true);
    expect(isEmptyLead(null)).toBe(false);
    expect(isEmptyLead(row())).toBe(false);
  });

  it("leaves a guest whose spot somebody else is paying for alone", () => {
    // She is covered: she has no plan and owes nothing, so the covered screen
    // is right and asking her to register would ask for money that is not hers.
    expect(isEmptyLead(emptyLead({ covered_by_booking_id: "bk-payer" }))).toBe(false);
  });

  it("leaves a confirmed row with no package to a human", () => {
    // A paid booking with no package is a data oddity, not an unanswered ask.
    for (const status of ["confirmed", "paid", "attended", "reserved"]) {
      expect(isEmptyLead(emptyLead({ status }))).toBe(false);
    }
  });

  it("never writes over a price somebody negotiated by hand", () => {
    expect(isEmptyLead(emptyLead({ agreed_price: 2549 }))).toBe(false);
    expect(classifyExistingBooking({ row: emptyLead({ agreed_price: 2549 }), packageId: "pkg-standard", now: NOW })).toBe("conflict");
  });

  it("still counts a legacy row with no status at all, which reads as a lead", () => {
    expect(isEmptyLead(emptyLead({ status: null }))).toBe(true);
  });
});

describe("appendBookingNote", () => {
  it("keeps what an employee typed and adds to it", () => {
    expect(appendBookingNote("Called her, wants the sea view room", "Website registration · package: Standard room"))
      .toBe("Called her, wants the sea view room · Website registration · package: Standard room");
  });

  it("writes the new note on its own when there was nothing there", () => {
    expect(appendBookingNote(null, "Website registration")).toBe("Website registration");
    expect(appendBookingNote("   ", "Website registration")).toBe("Website registration");
  });
});

describe("isUniqueViolation", () => {
  it("recognises the one error migration 246 can produce, and nothing else", () => {
    // Inert until that index is applied, which is the point: applying it then
    // needs no code change.
    expect(isUniqueViolation({ code: "23505", message: "duplicate key value" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});

describe("existingBookingKind", () => {
  it("puts covered ahead of every status, because there is nothing to pay either way", () => {
    expect(existingBookingKind(row({ covered_by_booking_id: "bk-payer", status: "lead" }))).toBe("covered");
    expect(existingBookingKind(row({ covered_by_booking_id: "bk-payer", status: "attended" }))).toBe("covered");
  });

  it("calls the attending statuses secured", () => {
    for (const status of ["confirmed", "paid", "attended"]) {
      expect(existingBookingKind(row({ status }))).toBe("secured");
    }
  });

  it("calls a signup with nothing paid yet pending", () => {
    expect(existingBookingKind(row({ status: "lead" }))).toBe("pending");
    expect(existingBookingKind(row({ status: "reserved" }))).toBe("pending");
  });

  it("reads the legacy Notion spellings the same way the pipeline does", () => {
    // downpayment_paid was the old "hold deposit is in" = confirmed.
    expect(existingBookingKind(row({ status: "downpayment_paid" }))).toBe("secured");
    expect(existingBookingKind(row({ status: "payment_pending" }))).toBe("pending");
  });
});

describe("isLiveBooking", () => {
  it("drops a cancelled booking, however it was spelled", () => {
    // Derek Rotz cancelled Bonaire Week III in June and rebooked a fortnight
    // later. A guard counting lost as live would have turned him away.
    expect(isLiveBooking(row({ status: "lost" }))).toBe(false);
    expect(isLiveBooking(row({ status: "cancelled" }))).toBe(false);
  });

  it("keeps every live status", () => {
    for (const status of ["lead", "reserved", "confirmed", "paid", "attended"]) {
      expect(isLiveBooking(row({ status }))).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────

type FakeRow = Record<string, unknown>;

/** The slice of PostgREST these two readers use, over in-memory tables. */
function fakeDb(tables: Record<string, FakeRow[]>, opts: { error?: string } = {}) {
  return {
    from(table: string) {
      const filters: ((r: FakeRow) => boolean)[] = [];
      let sortKey: string | null = null;
      let ascending = true;
      let take: number | null = null;
      const run = () => {
        if (opts.error) return { data: null, error: { message: opts.error } };
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (sortKey) {
          const key = sortKey;
          rows = [...rows].sort((a, b) =>
            (String(a[key] ?? "") < String(b[key] ?? "") ? -1 : 1) * (ascending ? 1 : -1));
        }
        if (take != null) rows = rows.slice(0, take);
        return { data: rows, error: null };
      };
      const q = {
        select: () => q,
        in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q; },
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return q; },
        is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return q; },
        ilike: (col: string, val: string) => {
          filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
          return q;
        },
        order: (col: string, o?: { ascending?: boolean }) => { sortKey = col; ascending = o?.ascending !== false; return q; },
        limit: (n: number) => { take = n; return q; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  };
}

const BONAIRE = "exp-bonaire";
const WEEK_3 = "ed-week-3";
const WEEK_4 = "ed-week-4";
const booking = (over: FakeRow = {}): FakeRow => ({
  id: "bk-1", contact_id: "c-nico", package_id: "pkg-standard", status: "lead",
  created_at: "2026-06-01T09:00:00.000Z", covered_by_booking_id: null,
  agreed_price: 4590, notes: "Website registration · package: Standard room",
  experience_id: BONAIRE, edition_id: WEEK_3, ...over,
});

/** The week-interest row, in the fake table. */
const interest = (over: FakeRow = {}): FakeRow => booking({
  id: "bk-interest", package_id: null, agreed_price: null,
  notes: "Website interest · asked to be emailed when this week's packages go live.",
  ...over,
});

describe("findLiveBookings", () => {
  it("finds the same person on the same week", async () => {
    const db = fakeDb({ exp_bookings: [booking()] });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-nico")?.id).toBe("bk-1");
  });

  it("ignores a cancelled booking, in either spelling", async () => {
    const lost = fakeDb({ exp_bookings: [booking({ status: "lost" })] });
    const legacy = fakeDb({ exp_bookings: [booking({ status: "cancelled" })] });
    expect((await findLiveBookings(lost, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 })).size).toBe(0);
    expect((await findLiveBookings(legacy, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 })).size).toBe(0);
  });

  it("lets the same person book another week of the same experience", async () => {
    // The repeat customer IS the business. Keying on the experience would have
    // refused next year's Bonaire to everyone who has ever been.
    const db = fakeDb({ exp_bookings: [booking({ edition_id: WEEK_4 })] });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.size).toBe(0);
  });

  it("keys an edition-less experience on the experience with a null edition", async () => {
    const db = fakeDb({
      exp_bookings: [
        booking({ id: "bk-open", edition_id: null }),
        booking({ id: "bk-week", edition_id: WEEK_3 }),
      ],
    });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: null });
    expect(live.get("c-nico")?.id).toBe("bk-open");
  });

  it("points a guest at their oldest booking, never a later stray", async () => {
    const db = fakeDb({
      exp_bookings: [
        booking({ id: "bk-later", created_at: "2026-06-05T09:00:00.000Z" }),
        booking({ id: "bk-first", created_at: "2026-06-01T09:00:00.000Z" }),
      ],
    });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-nico")?.id).toBe("bk-first");
  });

  it("lets a real booking outrank the empty lead that came before it", async () => {
    /*
     * Hers is the older row, so plain oldest-first would hand /api/register the
     * empty lead, which it would then complete: two live bookings on one week,
     * the exact thing this module exists to prevent. The shape is real, because
     * src/app/api/event/checkout/route.ts reuses only rows whose notes start
     * "Event ticket (" and inserts beside anything else.
     */
    const db = fakeDb({
      exp_bookings: [
        interest({ contact_id: "c-anna", created_at: "2026-01-04T09:00:00.000Z" }),
        booking({ id: "bk-real", contact_id: "c-anna", created_at: "2026-06-01T09:00:00.000Z" }),
      ],
    });
    const live = await findLiveBookings(db, { contactIds: ["c-anna"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-anna")?.id).toBe("bk-real");
  });

  it("still answers with the empty lead when that is all she has", async () => {
    const db = fakeDb({ exp_bookings: [interest({ contact_id: "c-anna" })] });
    const live = await findLiveBookings(db, { contactIds: ["c-anna"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-anna")?.id).toBe("bk-interest");
  });

  it("keeps the older of two empty leads, so the preference is not a free pass to the newest row", async () => {
    const db = fakeDb({
      exp_bookings: [
        interest({ id: "bk-asked-first", contact_id: "c-anna", created_at: "2026-01-04T09:00:00.000Z" }),
        interest({ id: "bk-asked-again", contact_id: "c-anna", created_at: "2026-02-04T09:00:00.000Z" }),
      ],
    });
    const live = await findLiveBookings(db, { contactIds: ["c-anna"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-anna")?.id).toBe("bk-asked-first");
  });

  it("finds nobody rather than everybody when the query fails", async () => {
    // A guard that fails closed would cost a real booking every time the query
    // hiccups. The registration goes through instead.
    const db = fakeDb({ exp_bookings: [booking()] }, { error: "column exp_bookings.archived_at does not exist" });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.size).toBe(0);
  });

  it("passes over a legacy cancelled row to find the live one, whatever the planner returns", async () => {
    /*
     * The guard /api/week-interest used to run by hand was
     * .eq().eq().limit(1).maybeSingle() with no .order() and a raw
     * `status !== "lost"` comparison. For a contact holding both a cancelled
     * row and a live one, the planner decided which came back; and a Notion-era
     * row still spelled "cancelled" counted as live, so a real signup was
     * swallowed as {ok: true, already: true} and the lead was lost.
     */
    const db = fakeDb({
      exp_bookings: [
        booking({ id: "bk-cancelled", status: "cancelled", created_at: "2026-05-01T09:00:00.000Z" }),
        booking({ id: "bk-live", status: "reserved", created_at: "2026-06-01T09:00:00.000Z" }),
      ],
    });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.get("c-nico")?.id).toBe("bk-live");
  });

  it("finds nothing for somebody whose only row on the week was cancelled", async () => {
    // Which is what lets that person register for real, instead of being told
    // they already did.
    const db = fakeDb({ exp_bookings: [booking({ status: "cancelled" })] });
    const live = await findLiveBookings(db, { contactIds: ["c-nico"], experienceId: BONAIRE, editionId: WEEK_3 });
    expect(live.size).toBe(0);
  });

  it("asks nothing at all when there is no contact to ask about", async () => {
    const db = fakeDb({ exp_bookings: [booking()] });
    expect((await findLiveBookings(db, { contactIds: [], experienceId: BONAIRE, editionId: WEEK_3 })).size).toBe(0);
  });
});

describe("resolveContactIdsByEmail", () => {
  const contacts = [
    { id: "c-old", email: "Anna@Example.com", created_at: "2024-01-01T00:00:00.000Z" },
    { id: "c-new", email: "anna@example.com", created_at: "2026-01-01T00:00:00.000Z" },
  ];

  it("matches case-insensitively and takes the oldest contact", async () => {
    const map = await resolveContactIdsByEmail(fakeDb({ contacts }), ["ANNA@example.com"]);
    expect(map.get("anna@example.com")).toBe("c-old");
  });

  it("leaves an unknown address out of the map entirely", async () => {
    const map = await resolveContactIdsByEmail(fakeDb({ contacts }), ["nobody@example.com"]);
    expect(map.size).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("validateCompanions: a friend who is already on this week", () => {
  const packages = [
    { id: "pkg-standard", name: "Standard room", price: 4590, experience_id: BONAIRE, edition_id: null, status: "active", archived_at: null, category: "advanced", gear_baseline: "rental" },
  ];
  const contacts = [
    { id: "c-anna", email: "anna@example.com", created_at: "2025-01-01T00:00:00.000Z" },
  ];
  const roster = [
    { firstName: "Anna", lastName: "Meyer", email: "anna@example.com", packageId: "pkg-standard" },
  ];
  const scope = { experienceId: BONAIRE, editionId: WEEK_3, payerEmail: "nico@example.com" };

  it("blocks her, names her row, and says nothing about her other booking", async () => {
    const db = fakeDb({ exp_packages: packages, contacts, exp_bookings: [booking({ contact_id: "c-anna", status: "confirmed" })] });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.blocked).toEqual({ index: 0, firstName: "Anna", email: "anna@example.com" });
    expect(res.error).toContain("Anna is already registered for this week");
    // The message no longer offers an action it cannot provide: the "email us"
    // it used to end on had no address and no link behind it. The modal renders
    // a real mailto beside this text.
    expect(res.error).toContain("they can register themselves");
    // Her status, package, price and booking id are not the payer's business.
    expect(res.error).not.toMatch(/confirmed|bk-1|4590|pkg-standard/i);
  });

  it("lets her through when her only booking was cancelled", async () => {
    const db = fakeDb({ exp_packages: packages, contacts, exp_bookings: [booking({ contact_id: "c-anna", status: "lost" })] });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(true);
  });

  it("lets her through when her booking is another week of the same experience", async () => {
    const db = fakeDb({ exp_packages: packages, contacts, exp_bookings: [booking({ contact_id: "c-anna", edition_id: WEEK_4 })] });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(true);
  });

  it("lets a brand new friend through", async () => {
    const db = fakeDb({ exp_packages: packages, contacts: [], exp_bookings: [] });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.companions).toHaveLength(1);
  });

  it("keeps package problems ahead of the bookings check", async () => {
    // The roster is rejected for the package before anyone asks the DB whether
    // this person is already on the week, so the payer fixes one thing at a time.
    const db = fakeDb({
      exp_packages: [{ ...packages[0], edition_id: WEEK_4 }],
      contacts,
      exp_bookings: [booking({ contact_id: "c-anna" })],
    });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.blocked).toBeUndefined();
    expect(res.error).toContain("isn't offered in this week");
  });

  it("blocks the first problem in the roster and names that person", async () => {
    const db = fakeDb({
      exp_packages: packages,
      contacts: [
        { id: "c-anna", email: "anna@example.com", created_at: "2025-01-01T00:00:00.000Z" },
        { id: "c-ben", email: "ben@example.com", created_at: "2025-01-01T00:00:00.000Z" },
      ],
      exp_bookings: [
        booking({ id: "bk-anna", contact_id: "c-anna" }),
        booking({ id: "bk-ben", contact_id: "c-ben" }),
      ],
    });
    const res = await validateCompanions(db, [
      { firstName: "Anna", lastName: "Meyer", email: "anna@example.com", packageId: "pkg-standard" },
      { firstName: "Ben", lastName: "Roth", email: "ben@example.com", packageId: "pkg-standard" },
    ], scope);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.blocked).toEqual({ index: 0, firstName: "Anna", email: "anna@example.com" });
  });

  it("names the blocked person by email, which survives whatever the client filtered", async () => {
    /*
     * The index is a position in the list the CLIENT posted, and the client
     * posts the roster with its half-typed rows dropped. Row 0 is Anna with no
     * email yet, row 1 is Ben who already holds a booking: the server sees
     * [Ben], answers index 0, and the modal painted "Ben is already registered"
     * under Anna. The email is the same identity on both sides.
     */
    const db = fakeDb({
      exp_packages: packages,
      contacts: [{ id: "c-ben", email: "ben@example.com", created_at: "2025-01-01T00:00:00.000Z" }],
      exp_bookings: [booking({ id: "bk-ben", contact_id: "c-ben", status: "confirmed" })],
    });
    const res = await validateCompanions(db, [
      { firstName: "Ben", lastName: "Roth", email: "Ben@Example.com", packageId: "pkg-standard" },
    ], scope);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.blocked?.email).toBe("ben@example.com");
    expect(res.blocked?.firstName).toBe("Ben");
  });

  it("lets the payer book a friend whose only row is an empty lead, without touching that lead", async () => {
    // Anna asked to be told when the week went live. Blocking her here would
    // mean the friend who registered interest can never be booked by anybody,
    // herself included. Her lead is left exactly where it is: this runs from a
    // public endpoint that knows the caller only by a typed email, so writing
    // to a booking row that already exists is not something it may do.
    const db = fakeDb({ exp_packages: packages, contacts, exp_bookings: [interest({ contact_id: "c-anna" })] });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.companions).toHaveLength(1);
    expect(res.companions[0].email).toBe("anna@example.com");
    expect("existingLead" in res.companions[0]).toBe(false);
  });

  it("blocks a friend whose empty lead sits in front of a booking she really holds", async () => {
    // Completing the older lead under the payer would have given Anna a second
    // live booking on the week and billed the payer for a spot she already has.
    const db = fakeDb({
      exp_packages: packages, contacts,
      exp_bookings: [
        interest({ contact_id: "c-anna", created_at: "2026-01-04T09:00:00.000Z" }),
        booking({ id: "bk-real", contact_id: "c-anna", status: "confirmed", created_at: "2026-06-01T09:00:00.000Z" }),
      ],
    });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.blocked?.email).toBe("anna@example.com");
  });

  it("still blocks a friend whose empty lead is somebody else's to pay for", async () => {
    const db = fakeDb({
      exp_packages: packages, contacts,
      exp_bookings: [interest({ contact_id: "c-anna", covered_by_booking_id: "bk-someone-else" })],
    });
    const res = await validateCompanions(db, roster, scope);
    expect(res.ok).toBe(false);
  });

  it("does not report this submission's own first attempt back as a duplicate", async () => {
    /*
     * The same-submission check has to run the roster rules against a group it
     * may itself have created seconds ago. Without ignoreCoveredBy, every
     * companion the first attempt wrote comes back blocked and nothing can ever
     * compare equal.
     */
    const db = fakeDb({
      exp_packages: packages, contacts,
      exp_bookings: [booking({ id: "bk-anna", contact_id: "c-anna", covered_by_booking_id: "bk-payer" })],
    });
    expect((await validateCompanions(db, roster, scope)).ok).toBe(false);
    expect((await validateCompanions(db, roster, { ...scope, ignoreCoveredBy: "bk-payer" })).ok).toBe(true);
    // Somebody ELSE's payer is still a duplicate.
    expect((await validateCompanions(db, roster, { ...scope, ignoreCoveredBy: "bk-other-payer" })).ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────

/**
 * The same fake, plus the writes. `settle` records an insert or an update
 * instead of performing one, so a test can read back exactly what would have
 * hit the table, and which row an update was aimed at.
 */
function recordingDb(canned: Record<string, FakeRow[]> = {}) {
  const writes: { table: string; op: "insert" | "update"; row: FakeRow; target: string | null }[] = [];
  function chain(table: string) {
    const filters: ((r: FakeRow) => boolean)[] = [];
    let pending: { op: "insert" | "update"; row: FakeRow } | null = null;
    let target: string | null = null;
    const settle = () => {
      if (pending) {
        writes.push({ table, op: pending.op, row: pending.row, target });
        return { data: { id: target ?? `${table}-${writes.length}` }, error: null };
      }
      return { data: (canned[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
    };
    const first = () => {
      const r = settle();
      return Array.isArray(r.data) ? { data: r.data[0] ?? null, error: null } : r;
    };
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q; },
      eq: (col: string, val: unknown) => {
        if (col === "id" && pending) target = String(val);
        filters.push((r) => r[col] === val);
        return q;
      },
      is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return q; },
      ilike: (col: string, val: string) => {
        filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
        return q;
      },
      not: () => q,
      order: () => q,
      limit: () => Promise.resolve(settle()),
      single: () => Promise.resolve(first()),
      maybeSingle: () => Promise.resolve(first()),
      insert: (row: FakeRow) => { pending = { op: "insert", row }; return q; },
      update: (row: FakeRow) => { pending = { op: "update", row }; return q; },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (res: any, rej: any) => Promise.resolve(settle()).then(res, rej),
    });
    return q;
  }
  return { db: { from: (t: string) => chain(t) }, writes };
}

const NO_GEAR = { rental: null, rentals: [], storage: null };
const groupCtx = {
  payerBookingId: "bk-payer", payerName: "Nico Prien",
  experienceId: BONAIRE, experienceTitle: "Bonaire", editionId: WEEK_3,
  editionLabel: "Week III", editionStart: "2026-11-07", edition: null, botFlag: false,
  resolveGear: async () => NO_GEAR,
};
const anna: ValidCompanion = {
  firstName: "Anna", lastName: "Meyer", fullName: "Anna Meyer", email: "anna@example.com",
  packageId: "pkg-standard", packageName: "Standard room", price: 4590,
  gear: null, rentalId: null, gearBaseline: "rental", level: "advanced",
};

describe("createCompanionBookings: the friend who already asked about this week", () => {
  it("gives her a fresh booking and never writes to the lead she already had", async () => {
    // The lead is a CRM row, not money. Completing it in place was the first
    // design and it turned this public path into an unauthenticated update of
    // an existing booking, so it is gone: insert only, always.
    const { db, writes } = recordingDb({
      contacts: [{ id: "c-anna", email: "anna@example.com", created_at: "2025-01-01T00:00:00.000Z" }],
    });
    const made = await createCompanionBookings(db, [anna], groupCtx);

    expect(made).toHaveLength(1);
    const rows = writes.filter((w) => w.table === "exp_bookings");
    expect(rows).toHaveLength(1);
    expect(rows[0].op).toBe("insert");
    expect(rows.some((r) => r.op === "update")).toBe(false);
    expect(rows[0].row.covered_by_booking_id).toBe("bk-payer");
    expect(rows[0].row.package_id).toBe("pkg-standard");
  });

  it("inserts as usual for a friend with no history on the week", async () => {
    const { db, writes } = recordingDb({ contacts: [] });
    await createCompanionBookings(db, [anna], groupCtx);
    const rows = writes.filter((w) => w.table === "exp_bookings");
    expect(rows).toHaveLength(1);
    expect(rows[0].op).toBe("insert");
    expect(rows[0].row.covered_by_booking_id).toBe("bk-payer");
  });
});
