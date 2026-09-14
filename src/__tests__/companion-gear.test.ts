/**
 * A companion's gear, and what it costs them.
 *
 * The main booker has had a three-way gear choice since 2026-08-26: rental is
 * in the package price, own gear takes it back out, and the difference lands as
 * ONE delta add-on row referencing the real component. A companion had none of
 * it. They were charged the package price with the rental baked in whatever
 * they brought, silently, because nothing in the roster, the quote or
 * createCompanionBookings knew a companion could have a gear choice at all.
 *
 * What is pinned here is the symmetry, in the three places it can break:
 * the wire format the choice travels in, the arithmetic (a companion's delta
 * must be the SAME number the payer gets on the same package), and the write
 * (a row on their own booking, none at all for a beginner).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { gearAddon, gearDelta, gearOptions, resolveGearInfo, type GearInfo } from "@/lib/gear-choice";
import { encodeGearSpec, gearAdjustment, parseGearSpec, type GearChoice } from "@/lib/gear-shape";
import { createCompanionBookings, sumCompanionPrices, type ValidCompanion } from "@/lib/group-register";

beforeAll(() => {
  // Everything here runs on a fake db. Without the service-role key
  // createAdminClient throws, which is exactly what keeps a stray code path
  // (getMemberTier, resolveGearInfo) from reaching the real Supabase.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

/** Alaçatı Week I, the week the bug was found on: one rental tier at 485.10
 *  and storage at 132.00, both sell prices. */
const ALACATI: GearInfo = {
  rental: { id: "comp-rental", name: "Gear rental", sell: 485.1 },
  rentals: [{ id: "comp-rental", name: "Gear rental", sell: 485.1 }],
  storage: { id: "comp-storage", name: "Gear storage", sell: 132 },
};

/** Two tiers: the included freeride rig and a slalom upgrade. */
const TENERIFE: GearInfo = {
  rental: { id: "comp-freeride", name: "Freeride rental", sell: 400 },
  rentals: [
    { id: "comp-freeride", name: "Freeride rental", sell: 400 },
    { id: "comp-slalom", name: "Slalom rental", sell: 550 },
  ],
  storage: { id: "comp-storage", name: "Gear storage", sell: 120 },
};

/** What a package whose components are not built (and every beginner package)
 *  resolves to. */
const NO_GEAR: GearInfo = { rental: null, rentals: [], storage: null };

describe("the wire format a companion's choice travels in", () => {
  it("reads a bare package id as untouched, NOT as rental", () => {
    // The backwards-compatibility promise: a bookmarked quote URL, or a client
    // that has not reloaded since the format changed, still sends plain ids.
    // Calling that "rental" would charge a guest for kit on a package whose
    // price never contained any.
    expect(parseGearSpec("pkg-1")).toEqual({ packageId: "pkg-1", gear: null, rentalId: null });
  });

  it("round-trips a plain choice and a choice with a rental tier", () => {
    expect(parseGearSpec(encodeGearSpec({ packageId: "pkg-1", gear: "none" })))
      .toEqual({ packageId: "pkg-1", gear: "none", rentalId: null });
    expect(parseGearSpec(encodeGearSpec({ packageId: "pkg-1", gear: "rental", rentalId: "comp-slalom" })))
      .toEqual({ packageId: "pkg-1", gear: "rental", rentalId: "comp-slalom" });
  });

  it("drops a gear value it does not recognise back to untouched", () => {
    expect(parseGearSpec("pkg-1:kitesurf").gear).toBeNull();
    expect(parseGearSpec("pkg-1:").gear).toBeNull();
  });

  it("encodes an untouched choice as the bare id, tier or no tier", () => {
    expect(encodeGearSpec({ packageId: "pkg-1", gear: null, rentalId: "comp-slalom" })).toBe("pkg-1");
  });
});

describe("what a companion's choice is worth", () => {
  it("is the same three numbers the main booker gets on the same package", () => {
    // The figures off Alaçatı Week I: nothing for the included rental, 353.10
    // back for storage, 485.10 back for bringing everything.
    expect(gearDelta(ALACATI, "rental", "rental")).toBe(0);
    expect(gearDelta(ALACATI, "storage", "rental")).toBe(-353.1);
    expect(gearDelta(ALACATI, "none", "rental")).toBe(-485.1);

    const options = gearOptions(ALACATI, "rental");
    expect(options?.deltas).toEqual({ rental: 0, storage: -353.1, none: -485.1 });
  });

  it("charges upward where the package never contained the rental", () => {
    // The only shape in which this change can make anybody pay MORE: a package
    // whose baseline is storage, and a companion who wants the rental.
    expect(gearDelta(ALACATI, "rental", "storage")).toBe(353.1);
    expect(gearOptions(ALACATI, "storage")?.deltas).toEqual({ rental: 353.1, storage: 0, none: -132 });
  });

  it("prices a rental upgrade tier against the included one", () => {
    expect(gearDelta(TENERIFE, "rental", "rental", "comp-slalom")).toBe(150);
    expect(gearOptions(TENERIFE, "rental")?.rentalTiers).toEqual([
      { id: "comp-freeride", name: "Freeride rental", delta: 0 },
      { id: "comp-slalom", name: "Slalom rental", delta: 150 },
    ]);
  });

  it("offers a beginner nothing, and prices a hand-posted choice at zero", () => {
    // gear-choice.ts:34 is the single enforcement point: beginners never get
    // the choice, because beginners do not fly in with their own kit. It has to
    // hold even when a gear value is posted straight at the API.
    expect(gearOptions(NO_GEAR, "rental")).toBeNull();
    expect(gearDelta(NO_GEAR, "none", "rental")).toBe(0);
    expect(gearDelta(NO_GEAR, "storage", "rental")).toBe(0);
  });

  it("resolves a beginner package to nothing without asking the database", async () => {
    await expect(resolveGearInfo("exp-alacati", "ed-week-1", "beginner")).resolves.toEqual(NO_GEAR);
  });
});

describe("the payer's total, per chosen spot", () => {
  // The quote keys its prices by SPEC, not by package: two friends in the same
  // room, one of them on their own board, are two different amounts of money.
  const priced = new Map([
    ["pkg-adv:rental", 4590],
    ["pkg-adv:none", 4104.9],
  ]);

  it("gives two friends on the same package different money", () => {
    expect(sumCompanionPrices(["pkg-adv:rental", "pkg-adv:none"], priced))
      .toEqual({ total: 8694.9, counted: 2 });
  });

  it("still counts the same spec once per person", () => {
    expect(sumCompanionPrices(["pkg-adv:none", "pkg-adv:none"], priced))
      .toEqual({ total: 8209.8, counted: 2 });
  });

  it("drops a spec it could not price, delta and person together", () => {
    expect(sumCompanionPrices(["pkg-adv:none", "other-weeks-package:none"], priced))
      .toEqual({ total: 4104.9, counted: 1 });
  });
});

/**
 * A Supabase-shaped stand-in: chainable, awaitable, and it remembers what was
 * written. Reads answer from `canned`; every insert is recorded instead.
 */
function fakeDb(canned: Record<string, unknown[]> = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  function chain(table: string) {
    let pending: Record<string, unknown> | null = null;
    const settle = () => {
      if (pending) {
        inserts.push({ table, row: pending });
        return { data: { id: `${table}-${inserts.length}` }, error: null };
      }
      return { data: canned[table] ?? [], error: null };
    };
    const first = () => {
      const r = settle();
      return Array.isArray(r.data) ? { data: r.data[0] ?? null, error: null } : r;
    };
    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select: () => api, eq: () => api, ilike: () => api, in: () => api,
      is: () => api, not: () => api, order: () => api,
      limit: () => Promise.resolve(settle()),
      single: () => Promise.resolve(first()),
      maybeSingle: () => Promise.resolve(first()),
      insert: (row: Record<string, unknown>) => { pending = row; return api; },
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, err),
    });
    return api;
  }
  return { db: { from: (t: string) => chain(t) }, inserts };
}

const companion = (over: Partial<ValidCompanion> = {}): ValidCompanion => ({
  firstName: "Anna", lastName: "Meyer", fullName: "Anna Meyer", email: "anna@example.com",
  packageId: "pkg-adv", packageName: "Advanced · Standard Room", price: 4590,
  gear: null, rentalId: null, gearBaseline: "rental", level: "advanced",
  ...over,
});

const ctxFor = (info: GearInfo) => ({
  payerBookingId: "bk-payer", payerName: "Nico Prien",
  experienceId: "exp-alacati", experienceTitle: "Alaçatı", editionId: "ed-week-1",
  editionLabel: "Week I", editionStart: "2027-06-05", edition: null, botFlag: false,
  resolveGear: async () => info,
});

const addons = (inserts: { table: string; row: Record<string, unknown> }[]) =>
  inserts.filter((i) => i.table === "exp_booking_addons").map((i) => i.row);

describe("the row a companion's choice writes", () => {
  it("takes the rental back off a companion who brings their own board", async () => {
    const { db, inserts } = fakeDb();
    const made = await createCompanionBookings(db, [companion({ gear: "none" })], ctxFor(ALACATI));

    expect(made).toHaveLength(1);
    const booking = inserts.find((i) => i.table === "exp_bookings")!.row;
    // Their package figure stays whole on the booking: it is what the edition
    // P&L and the §25 UStG margin settlement read per person. The choice lives
    // in the add-on row beside it, exactly as it does for the payer.
    expect(booking.agreed_price).toBe(4590);
    expect(booking.covered_by_booking_id).toBe("bk-payer");

    expect(addons(inserts)).toEqual([{
      booking_id: "exp_bookings-2",
      component_id: "comp-rental",
      label: "Own gear · included rental removed",
      price: -485.1,
      status: "confirmed",
      source: "booking",
      payment_mode: "np7",
    }]);
  });

  it("charges the companion exactly what the main booker would pay", async () => {
    const { db, inserts } = fakeDb();
    await createCompanionBookings(db, [companion({ gear: "storage" })], ctxFor(ALACATI));

    const booking = inserts.find((i) => i.table === "exp_bookings")!.row;
    const [addon] = addons(inserts);
    // The whole point of the change: package plus delta, the same two parts and
    // the same delta the payer's own path produces for this package.
    expect(Number(booking.agreed_price) + Number(addon.price))
      .toBe(4590 + gearDelta(ALACATI, "storage", "rental"));
    expect(addon.price).toBe(-353.1);
    expect(addon.component_id).toBe("comp-storage");
  });

  it("writes nothing for a companion who leaves the choice alone", async () => {
    const { db, inserts } = fakeDb();
    await createCompanionBookings(db, [companion({ gear: null })], ctxFor(ALACATI));
    expect(addons(inserts)).toEqual([]);
  });

  it("writes nothing for a beginner, even when a choice is posted at it", async () => {
    const { db, inserts } = fakeDb();
    await createCompanionBookings(db, [companion({ gear: "none", level: "beginner" })], ctxFor(NO_GEAR));
    expect(addons(inserts)).toEqual([]);
    expect(inserts.find((i) => i.table === "exp_bookings")!.row.agreed_price).toBe(4590);
  });

  it("gives each of two friends their own row, on their own booking", async () => {
    const { db, inserts } = fakeDb();
    await createCompanionBookings(db, [
      companion({ gear: "none" }),
      companion({ firstName: "Ben", fullName: "Ben Kraus", email: "ben@example.com", gear: "rental", rentalId: "comp-slalom" }),
    ], ctxFor(TENERIFE));

    expect(inserts.filter((i) => i.table === "exp_bookings")).toHaveLength(2);
    const rows = addons(inserts);
    expect(rows.map((r) => r.price)).toEqual([-400, 150]);
    expect(rows.map((r) => r.label)).toEqual([
      "Own gear · included rental removed",
      "Rental upgrade · Slalom rental",
    ]);
    // Two bookings, two rows, never both on one booking.
    expect(new Set(rows.map((r) => r.booking_id)).size).toBe(2);
  });

  it("keeps the booking when the add-on row cannot be written", async () => {
    const { db, inserts } = fakeDb();
    const exploding = {
      from: (t: string) => {
        if (t === "exp_booking_addons") throw new Error("add-ons table is having a day");
        return (db as { from: (t: string) => unknown }).from(t);
      },
    };
    const made = await createCompanionBookings(exploding, [companion({ gear: "none" })], ctxFor(ALACATI));
    // A lost add-on is a repair job. A lost booking is a guest who thinks they
    // are coming and is not on any list.
    expect(made).toHaveLength(1);
    expect(inserts.filter((i) => i.table === "exp_bookings")).toHaveLength(1);
  });
});

/**
 * The roster line, the plan panel and the add-on row are three renderings of
 * one number, and they disagreed.
 *
 * The browser only ever holds deltas, and `deltas.rental` is the BASE tier:
 * what the included kit is worth against this package's baseline, which is 0 on
 * a baseline-rental package. The upgrade the guest actually pressed lives in
 * `rentalTiers[].delta`, and the roster never read it. Live case: package
 * 9854e404 on edition 123ad479 quotes 5,600 with the base tier and 5,741 with
 * the upgrade, so the roster said 5,600 under a plan panel saying 5,741, and
 * the booking was written a +141 row.
 *
 * Every case below is pinned to the SERVER's own gearDelta and to the row
 * gearAddon writes, never to a figure typed in here: a test that agrees with a
 * hand-written number and not with the writer would have passed before the fix.
 */
describe("the roster, the plan panel and the written row agree to the cent", () => {
  /** What the picker's summary and the group roster now compute, from the
   *  deltas the quote sends them. */
  const browser = (info: GearInfo, baseline: GearChoice, gear: GearChoice | null, rentalId: string | null = null) =>
    gearAdjustment(gearOptions(info, baseline), gear, rentalId);
  /** What /api/register/quote adds to the plan, and what gearAddon prices the
   *  written row at. */
  const server = (info: GearInfo, baseline: GearChoice, gear: GearChoice, rentalId: string | null = null) =>
    gearDelta(info, gear, baseline, rentalId);

  it("counts the included rental as nothing, chosen or left alone", () => {
    expect(browser(TENERIFE, "rental", "rental")).toBe(0);
    expect(browser(TENERIFE, "rental", "rental")).toBe(server(TENERIFE, "rental", "rental"));
    // An untouched choice IS the baseline. It must read as ±0 and not as
    // "rental", which on a storage-baseline package would silently add kit.
    expect(browser(TENERIFE, "rental", null)).toBe(0);
    expect(browser(TENERIFE, "storage", null)).toBe(0);
    expect(browser(TENERIFE, "none", null)).toBe(0);
  });

  it("counts the upgrade tier the guest pressed, not the tier underneath it", () => {
    // The whole finding, in one line: 150 and not 0.
    expect(browser(TENERIFE, "rental", "rental", "comp-slalom")).toBe(150);
    expect(browser(TENERIFE, "rental", "rental", "comp-slalom")).toBe(server(TENERIFE, "rental", "rental", "comp-slalom"));
    // And the base tier, which the pills send as a null id, stays free.
    expect(browser(TENERIFE, "rental", "rental", null)).toBe(0);
    expect(browser(TENERIFE, "rental", "rental", "comp-freeride")).toBe(0);
  });

  it("takes the whole rental back out for own gear", () => {
    expect(browser(ALACATI, "rental", "none")).toBe(-485.1);
    expect(browser(ALACATI, "rental", "none")).toBe(server(ALACATI, "rental", "none"));
  });

  it("keeps the storage and drops the rental for own gear plus storage", () => {
    expect(browser(ALACATI, "rental", "storage")).toBe(-353.1);
    expect(browser(ALACATI, "rental", "storage")).toBe(server(ALACATI, "rental", "storage"));
    // A tier id left over from a flip to rental and back must not price kit
    // onto somebody who is bringing their own.
    expect(browser(TENERIFE, "rental", "storage", "comp-slalom")).toBe(server(TENERIFE, "rental", "storage", "comp-slalom"));
  });

  it("sums the swap AND the upgrade where the price never contained a rental", () => {
    // The only shape that charges twice over: a storage-baseline package, a
    // guest who wants kit, and the slalom rig. 280 to add the base rental plus
    // 150 for the tier. Reading deltas alone would have billed 280.
    expect(browser(TENERIFE, "storage", "rental", "comp-slalom")).toBe(430);
    expect(browser(TENERIFE, "storage", "rental", "comp-slalom")).toBe(server(TENERIFE, "storage", "rental", "comp-slalom"));
  });

  it("adds nothing at all for a package that offers no choice", () => {
    expect(browser(NO_GEAR, "rental", "none")).toBe(0);
    expect(gearAdjustment(null, "rental", "comp-slalom")).toBe(0);
    expect(gearAdjustment(undefined, "none", null)).toBe(0);
  });

  it("prices the same row the writer writes, component and money both", () => {
    // gearAddon is the single source for the write and for the same-submission
    // comparison. If the roster and this ever part company, one of the two
    // numbers on screen is a lie about what the guest will be charged.
    expect(gearAddon(TENERIFE, { gear: "rental", baseline: "rental", rentalId: "comp-slalom" }))
      .toEqual({ componentId: "comp-slalom", price: browser(TENERIFE, "rental", "rental", "comp-slalom") });
    expect(gearAddon(ALACATI, { gear: "none", baseline: "rental", rentalId: null }))
      .toEqual({ componentId: "comp-rental", price: browser(ALACATI, "rental", "none") });
    expect(gearAddon(ALACATI, { gear: "storage", baseline: "rental", rentalId: null }))
      .toEqual({ componentId: "comp-storage", price: browser(ALACATI, "rental", "storage") });
    // Baseline, base tier: nothing to write, so nothing to show either.
    expect(gearAddon(TENERIFE, { gear: "rental", baseline: "rental", rentalId: null })).toBeNull();
  });

  it("gives a companion's booking the number their roster line showed", async () => {
    // The payer reads the roster; the companion's own booking carries the row.
    // Four cases, each run all the way through createCompanionBookings, so the
    // money on screen is checked against the money in the database and not
    // against a second copy of the arithmetic.
    const cases: { gear: GearChoice; rentalId: string | null; info: GearInfo }[] = [
      { gear: "rental", rentalId: null, info: TENERIFE },
      { gear: "rental", rentalId: "comp-slalom", info: TENERIFE },
      { gear: "none", rentalId: null, info: ALACATI },
      { gear: "storage", rentalId: null, info: ALACATI },
    ];
    for (const c of cases) {
      const { db, inserts } = fakeDb();
      await createCompanionBookings(db, [companion({ gear: c.gear, rentalId: c.rentalId })], ctxFor(c.info));
      const shown = browser(c.info, "rental", c.gear, c.rentalId);
      const booking = inserts.find((i) => i.table === "exp_bookings")!.row;
      const written = addons(inserts).reduce((n, r) => n + Number(r.price), 0);
      expect(written).toBe(shown);
      // And the roster line itself: package price plus the same adjustment.
      expect(Number(booking.agreed_price) + written).toBe(4590 + shown);
    }
  });
});

/**
 * The picker, the roster and the quote endpoint are three readers of one rule,
 * and only two of them share code: the browser works from deltas, the server
 * from sell prices. So the guarantee worth pinning is not one figure but the
 * identity itself, over every shape a package can come in.
 */
it("browser deltas and server sell prices never disagree, on any package shape", () => {
  const shapes: [string, GearInfo][] = [
    ["one rental tier and storage", ALACATI],
    ["two rental tiers and storage", TENERIFE],
    ["tiers but no storage", { ...TENERIFE, storage: null }],
    ["one tier, no storage", { ...ALACATI, storage: null }],
  ];
  const baselines: GearChoice[] = ["rental", "storage", "none"];
  const choices: (GearChoice | null)[] = [null, "rental", "storage", "none"];
  for (const [name, info] of shapes) {
    for (const baseline of baselines) {
      const options = gearOptions(info, baseline);
      // A baseline this package cannot price offers no choice at all, and a
      // choice nobody can be shown cannot be mis-added.
      if (!options) continue;
      for (const gear of choices) {
        for (const rentalId of [null, ...info.rentals.map((r) => r.id)]) {
          expect(
            [name, baseline, gear, rentalId, gearAdjustment(options, gear, rentalId)],
          ).toEqual(
            [name, baseline, gear, rentalId, gearDelta(info, gear ?? baseline, baseline, rentalId)],
          );
        }
      }
    }
  }
});
