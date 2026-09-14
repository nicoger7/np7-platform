/**
 * "Same submission, or did they change something?"
 *
 * /api/register short-circuits a repeat of the same package within a minute and
 * answers 200 with the first booking's id. It used to do that BEFORE the
 * companions were validated and before a single add-on was written, keyed on
 * nothing but the package and the age of the row. Two real shapes fell through
 * it: a payer who reopened the modal and added Mia was told "2 spots held!"
 * while Mia got no booking, no contact and no mail; a payer who reopened and
 * switched to "Own gear" had the choice discarded and was billed the old price
 * behind a success screen quoting the new one.
 *
 * What is pinned here is the identity rule, which is about the EFFECT and not
 * the payload: the short-circuit may only fire when this submission would write
 * exactly the rows that already exist. Everything else is a real change and
 * takes the warm "you already have a booking" screen, where nothing is lost.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { isUnchangedResubmission, type Submission } from "@/lib/resubmission";
import type { GearInfo } from "@/lib/gear-choice";
import type { LiveBookingRow } from "@/lib/existing-booking";

beforeAll(() => {
  // Everything here runs on a fake db. Without the service-role key
  // createAdminClient throws, which is what keeps a stray code path from
  // reaching the real Supabase.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

type FakeRow = Record<string, unknown>;

/** The slice of PostgREST this module and its dependencies use. */
function fakeDb(tables: Record<string, FakeRow[]>, opts: { error?: string } = {}) {
  return {
    from(table: string) {
      const filters: ((r: FakeRow) => boolean)[] = [];
      let take: number | null = null;
      const run = () => {
        if (opts.error) return { data: null, error: { message: opts.error } };
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
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
        order: () => q,
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

/** Tenerife's two tiers: the included freeride rig and a slalom upgrade. */
const GEAR: GearInfo = {
  rental: { id: "comp-freeride", name: "Freeride rental", sell: 400 },
  rentals: [
    { id: "comp-freeride", name: "Freeride rental", sell: 400 },
    { id: "comp-slalom", name: "Slalom rental", sell: 550 },
  ],
  storage: { id: "comp-storage", name: "Gear storage", sell: 120 },
};

const prior: LiveBookingRow = {
  id: "bk-payer", contact_id: "c-nico", package_id: "pkg-standard", status: "lead",
  created_at: "2026-09-14T09:59:30.000Z", covered_by_booking_id: null,
  agreed_price: 4590, notes: "Website registration · package: Standard room",
};

const packages = [
  { id: "pkg-standard", name: "Standard room", price: 4590, experience_id: BONAIRE, edition_id: null, status: "active", archived_at: null, category: "advanced", gear_baseline: "rental" },
  // A SECOND package, and it earns its place: with only one in the fixture,
  // moving a companion to a different room could not be expressed, and the
  // identity check silently passed on it for exactly that reason.
  { id: "pkg-private", name: "Private room", price: 5600, experience_id: BONAIRE, edition_id: null, status: "active", archived_at: null, category: "advanced", gear_baseline: "rental" },
];
const contacts = [
  { id: "c-nico", email: "nico@example.com", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "c-mia", email: "mia@example.com", created_at: "2025-01-01T00:00:00.000Z" },
];

/** Mia's booking, as the payer's first attempt would have written it. */
const miaBooking = {
  id: "bk-mia", contact_id: "c-mia", package_id: "pkg-standard", status: "lead",
  created_at: "2026-09-14T09:59:31.000Z", covered_by_booking_id: "bk-payer",
  agreed_price: 4590, notes: "Website registration (group)",
  experience_id: BONAIRE, edition_id: WEEK_3,
};

const submission = (over: Partial<Submission> = {}): Submission => ({
  experienceId: BONAIRE,
  editionId: WEEK_3,
  payerEmail: "nico@example.com",
  companions: [],
  payerGear: { gear: "rental", baseline: "rental", rentalId: null, level: "advanced" },
  extras: [],
  resolveGear: async () => GEAR,
  ...over,
});

const MIA = { firstName: "Mia", lastName: "Roth", email: "mia@example.com", packageId: "pkg-standard" };

describe("isUnchangedResubmission", () => {
  it("lets a plain reload through: same package, same choice, nothing else", async () => {
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, { prior, submission: submission() });
    expect(res.identical).toBe(true);
  });

  it("refuses a resubmission that added somebody", async () => {
    // The payer registered alone, pressed Done, reopened within the minute and
    // added Mia. The short-circuit used to fire and Mia got nothing at all,
    // behind a screen saying "2 spots held!".
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, { prior, submission: submission({ companions: [MIA] }) });
    expect(res.identical).toBe(false);
  });

  it("refuses a companion moved to a different room", async () => {
    /*
     * The one that got through. Mia is the same person on both attempts, and on
     * the rental baseline neither attempt writes an add-on, so comparing people
     * plus add-ons called this unchanged: her booking kept the shared room at
     * 4,590 while the screen said two spots were held, and the payer was never
     * billed the 1,010 euro upgrade he had just chosen.
     */
    const db = fakeDb({ exp_bookings: [miaBooking], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, {
      prior,
      submission: submission({ companions: [{ ...MIA, packageId: "pkg-private" }] }),
    });
    expect(res.identical).toBe(false);
  });

  it("still lets a plain reload through when the companion did not move", async () => {
    const db = fakeDb({ exp_bookings: [miaBooking], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, { prior, submission: submission({ companions: [MIA] }) });
    expect(res.identical).toBe(true);
  });

  it("refuses a resubmission that took somebody off", async () => {
    const db = fakeDb({ exp_bookings: [miaBooking], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, { prior, submission: submission() });
    expect(res.identical).toBe(false);
  });

  it("refuses the payer switching to their own gear inside the window", async () => {
    // Registered on the rental baseline at 10:00:00, reopened at 10:00:40 and
    // chose "Own gear". Dropping that silently billed 485.10 more than the
    // modal promised, on a plan the guest had already been shown.
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, {
      prior,
      submission: submission({ payerGear: { gear: "none", baseline: "rental", rentalId: null, level: "advanced" } }),
    });
    expect(res.identical).toBe(false);
  });

  it("lets a reload through when the gear row it would write is already there", async () => {
    // The mirror of the case above, and the reason the check compares what
    // WOULD be written rather than "are there any add-ons": a guest who chose
    // own gear and reloaded is still the same submission.
    const db = fakeDb({
      exp_bookings: [],
      exp_booking_addons: [{ booking_id: "bk-payer", component_id: "comp-freeride", price: -400, source: "booking" }],
      contacts, exp_packages: packages,
    });
    const res = await isUnchangedResubmission(db, {
      prior,
      submission: submission({ payerGear: { gear: "none", baseline: "rental", rentalId: null, level: "advanced" } }),
    });
    expect(res.identical).toBe(true);
  });

  it("refuses a changed rental tier, on the payer or on a friend", async () => {
    const withMia = {
      exp_bookings: [miaBooking],
      contacts, exp_packages: packages,
    };
    // Mia was written on the included tier; this submission upgrades her.
    const db = fakeDb({ ...withMia, exp_booking_addons: [] });
    const res = await isUnchangedResubmission(db, {
      prior,
      submission: submission({ companions: [{ ...MIA, gear: "rental", rentalId: "comp-slalom" }] }),
    });
    expect(res.identical).toBe(false);

    // And the same roster with her tier already recorded IS the same submission.
    const same = fakeDb({
      ...withMia,
      exp_booking_addons: [{ booking_id: "bk-mia", component_id: "comp-slalom", price: 150, source: "booking" }],
    });
    const res2 = await isUnchangedResubmission(same, {
      prior,
      submission: submission({ companions: [{ ...MIA, gear: "rental", rentalId: "comp-slalom" }] }),
    });
    expect(res2.identical).toBe(true);
    if (!res2.identical) return;
    // The names come back so the success screen can be rendered from what the
    // server knows instead of from the payer's local state.
    expect(res2.companions).toEqual([{ firstName: "Mia", email: "mia@example.com" }]);
  });

  it("refuses a resubmission that ticked a booking-time extra", async () => {
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts, exp_packages: packages });
    const res = await isUnchangedResubmission(db, {
      prior,
      submission: submission({ extras: [{ componentId: "comp-nights", price: 240 }] }),
    });
    expect(res.identical).toBe(false);
  });

  it("ignores an add-on somebody else put on the booking", async () => {
    // An admin row is not this submission's work, and a guest reloading must
    // not be told their booking changed because the office added a transfer.
    const db = fakeDb({
      exp_bookings: [],
      exp_booking_addons: [{ booking_id: "bk-payer", component_id: "comp-transfer", price: 60, source: "admin" }],
      contacts, exp_packages: packages,
    });
    const res = await isUnchangedResubmission(db, { prior, submission: submission() });
    expect(res.identical).toBe(true);
  });

  it("answers no when it cannot read, never yes", async () => {
    // Failing toward "changed" costs one warm screen naming the real booking.
    // Failing the other way costs a friend their spot, silently.
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts, exp_packages: packages }, { error: "nope" });
    const res = await isUnchangedResubmission(db, { prior, submission: submission() });
    expect(res.identical).toBe(false);
  });

  it("answers no for a friend who does not exist as a contact yet", async () => {
    const db = fakeDb({ exp_bookings: [], exp_booking_addons: [], contacts: [contacts[0]], exp_packages: packages });
    const res = await isUnchangedResubmission(db, { prior, submission: submission({ companions: [MIA] }) });
    expect(res.identical).toBe(false);
  });
});
