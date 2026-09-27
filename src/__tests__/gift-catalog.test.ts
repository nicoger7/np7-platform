/**
 * What the gift voucher chooser offers (Nico, 27 Sep 2026: "make it easily
 * bookable and choosable (package etc.)").
 *
 * The chooser walks trip, week, level, room. The data it walks is pinned here:
 *
 *  - A clinic (NP7 Coaching Clinics USA) is not giftable: its card checkout has
 *    no voucher field, so the voucher could never be used.
 *  - A trip needs at least one live week to be offered; a trip whose weeks have
 *    no prices out yet is offered by value only.
 *  - Bonaire sells the same room at Beginner and Advanced, €660 apart, and
 *    Alaçatı sells one room name at two hotels. None of those may collapse
 *    into one card, and the level is its own step.
 *  - Every package keeps its own week and its own price.
 *
 * Fixtures mirror the live rows read on 27 Sep 2026 (read-only).
 */
import { describe, it, expect } from "vitest";
import {
  GIFT_ANY_TRIP,
  buildGiftCatalog,
  giftChoice,
  giftFromPrice,
  giftPackageName,
  giftPackageTitle,
  giftPackagesFor,
  giftTripName,
  giftValueLine,
  giftWeekLabel,
  giftWeekNeedsLevel,
  type GiftChoiceState,
  type GiftEditionRow,
  type GiftExpRow,
  type GiftHotelRow,
  type GiftPackageRow,
} from "@/lib/gift-data";

const TODAY = "2026-09-27";

const exp = (id: string, title: string, extra: Partial<GiftExpRow> = {}): GiftExpRow => ({ id, title, currency: "EUR", ...extra });
const ed = (id: string, experience_id: string, extra: Partial<GiftEditionRow> = {}): GiftEditionRow => ({
  id, experience_id, label: null, status: "published", kind: "trip", date_start: "2026-11-30", date_end: "2026-12-06", archived_at: null, ...extra,
});
const pkg = (id: string, experience_id: string, edition_id: string | null, name: string, price: number | string | null, extra: Partial<GiftPackageRow> = {}): GiftPackageRow => ({
  id, experience_id, edition_id, name, price, category: null, hotel_id: null, status: "active", website_visible: true, archived_at: null, ...extra,
});
const HOTELS: GiftHotelRow[] = [
  { id: "h-wanapa", name: "Boutique Hotel Wanapa" },
  { id: "h-carsi", name: "REF Carsi" },
  { id: "h-koyici", name: "REF Koyici" },
];

function catalog(experiences: GiftExpRow[], editions: GiftEditionRow[], packages: GiftPackageRow[]) {
  return buildGiftCatalog({ experiences, editions, packages, hotels: HOTELS, today: TODAY }).trips;
}

describe("step 1: which trips can be gifted", () => {
  it("leaves out a clinic series whose live editions are all events", () => {
    const trips = catalog(
      [exp("obx", "NP7 Coaching Clinics USA"), exp("bon", "NP7 Experience Bonaire")],
      [ed("obx-oct", "obx", { kind: "event", date_start: "2026-10-10", date_end: "2026-10-16" }), ed("bon-w1", "bon")],
      [pkg("ticket", "obx", "obx-oct", "OBX Clinic — Ticket", 750), pkg("wanapa", "bon", "bon-w1", "WANAPA", 3990)],
    );
    expect(trips.map((t) => t.id)).toEqual(["bon"]);
  });

  it("leaves out an event-template experience even with a trip week", () => {
    expect(catalog([exp("race", "NP7 Race Clinic", { page_template: "event" })], [ed("r1", "race")], [])).toEqual([]);
  });

  it("leaves out a trip with no live week at all", () => {
    const trips = catalog(
      [exp("gar", "NP7 Experience Lake Garda")],
      [ed("gar-2026", "gar", { date_start: "2026-05-24", date_end: "2026-05-31" }), ed("gar-2027", "gar", { status: "draft", date_start: "2027-05-23", date_end: "2027-05-30" })],
      [pkg("old", "gar", "gar-2026", "Standard", 2390)],
    );
    expect(trips).toEqual([]);
  });

  it("keeps a trip whose live week has no prices yet, with no package weeks (value only)", () => {
    const trips = catalog(
      [exp("gar", "NP7 Experience Lake Garda")],
      [ed("gar-2026", "gar", { date_start: "2026-05-24", date_end: "2026-05-31" }), ed("gar-2027", "gar", { date_start: "2027-05-24", date_end: "2027-05-29" })],
      [pkg("old", "gar", "gar-2026", "Experience Only", 2390)],
    );
    expect(trips).toEqual([{ id: "gar", title: "NP7 Experience Lake Garda", name: "Lake Garda", currency: "EUR", weeks: [] }]);
  });

  it("never sends the legacy experience price to the browser", () => {
    const [t] = catalog([{ ...exp("ten", "NP7 Experience Tenerife"), price: 3120 } as GiftExpRow], [ed("t1", "ten")], []);
    expect(Object.keys(t).sort()).toEqual(["currency", "id", "name", "title", "weeks"]);
  });

  it("names a trip by its place on a chip, and leaves other titles whole", () => {
    expect(giftTripName("NP7 Experience Bonaire")).toBe("Bonaire");
    expect(giftTripName("NP7 Experience Alaçatı")).toBe("Alaçatı");
    expect(giftTripName("NP7 Mauritius & Madagascar Experience")).toBe("NP7 Mauritius & Madagascar Experience");
  });
});

describe("step 2: weeks", () => {
  const trips = () => catalog(
    [exp("bon", "NP7 Experience Bonaire")],
    [
      ed("w2", "bon", { label: "Week II", date_start: "2026-12-07", date_end: "2026-12-13" }),
      ed("w1", "bon", { label: "Week I" }),
      ed("w27", "bon", { label: "Week I", date_start: "2027-11-28", date_end: "2027-12-04" }),
      ed("race", "bon", { kind: "event", date_start: "2026-12-20", date_end: "2026-12-21" }),
      ed("past", "bon", { date_start: "2025-11-30", date_end: "2025-12-06" }),
    ],
    [
      pkg("a", "bon", "w1", "No Hotel - Beginner", 2390, { category: "beginner" }),
      pkg("b", "bon", "w2", "No Hotel", 2390, { category: "beginner" }),
      pkg("hidden27", "bon", "w27", "SOROBON Garden View Studio", 4190, { category: "beginner", website_visible: false }),
      pkg("r", "bon", "race", "Race day", 400),
      pkg("old", "bon", "past", "Last year", 2800),
    ],
  );

  it("offers only live trip weeks that have a package on sale, soonest first, with dates in words", () => {
    const [bon] = trips();
    expect(bon.weeks.map((w) => [w.id, w.dates, w.label])).toEqual([
      ["w1", "30 Nov - 6 Dec 2026", "Week I"],
      ["w2", "7 - 13 Dec 2026", "Week II"],
    ]);
  });

  it("each week keeps its own packages", () => {
    const [bon] = trips();
    expect(bon.weeks[0].packages.map((p) => p.id)).toEqual(["a"]);
    expect(bon.weeks[1].packages.map((p) => p.id)).toEqual(["b"]);
  });

  it("counts a week that has started but not ended as live", () => {
    const [t] = catalog([exp("bon", "Bonaire")], [ed("now", "bon", { date_start: "2026-09-24", date_end: "2026-09-30" })], [pkg("p", "bon", "now", "WANAPA", 3990)]);
    expect(t.weeks.map((w) => w.id)).toEqual(["now"]);
  });

  it("writes an edition label without long dashes", () => {
    const [t] = catalog([exp("bon", "Bonaire")], [ed("w", "bon", { label: "OBX Wind – 10–16 October" })], [pkg("p", "bon", "w", "WANAPA", 3990)]);
    expect(t.weeks[0].label).toBe("OBX Wind · 10-16 October");
  });
});

describe("step 3 and 4: levels and packages (Bonaire Week I, live data)", () => {
  const [bon] = catalog(
    [exp("bon", "NP7 Experience Bonaire")],
    [ed("w1", "bon", { label: "Week I" })],
    [
      pkg("b-nohotel", "bon", "w1", "No Hotel - Beginner", 2390, { category: "beginner" }),
      pkg("a-nohotel", "bon", "w1", "No Hotel - Advanced", 2990, { category: "advanced" }),
      pkg("b-balcony", "bon", "w1", "WANAPA Double Deluxe with Balcony", 3490, { category: "beginner", hotel_id: "h-wanapa" }),
      pkg("a-balcony", "bon", "w1", "WANAPA Double Deluxe with Balcony", 4150, { category: "advanced", hotel_id: "h-wanapa" }),
      pkg("a-patio", "bon", "w1", "WANAPA Double Deluxe Patio", 3990, { category: "advanced", hotel_id: "h-wanapa" }),
    ],
  );
  const week = bon.weeks[0];

  it("asks the level because the week sells both, Beginner first", () => {
    expect(week.levels).toEqual(["beginner", "advanced"]);
    expect(giftWeekNeedsLevel(week)).toBe(true);
  });

  it("does not collapse the same room at two levels: each keeps its own price", () => {
    const balcony = week.packages.filter((p) => p.name === "WANAPA Double Deluxe with Balcony");
    expect(balcony.map((p) => [p.level, p.price])).toEqual([["beginner", 3490], ["advanced", 4150]]);
  });

  it("shows each level's own cards, cheapest first, with the hotel and the level word dropped", () => {
    expect(giftPackagesFor(week, "beginner").map((p) => [p.name, p.price, p.hotel])).toEqual([
      ["No Hotel", 2390, null],
      ["WANAPA Double Deluxe with Balcony", 3490, "Boutique Hotel Wanapa"],
    ]);
    expect(giftPackagesFor(week, "advanced").map((p) => [p.name, p.price])).toEqual([
      ["No Hotel", 2990],
      ["WANAPA Double Deluxe Patio", 3990],
      ["WANAPA Double Deluxe with Balcony", 4150],
    ]);
    expect(giftFromPrice(giftPackagesFor(week, "advanced"))).toBe(2990);
  });

  it("keeps a level-less package under every level", () => {
    const [t] = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon")],
      [
        pkg("b", "bon", "w1", "Beginner – Standard Room", 2750, { category: "beginner" }),
        pkg("a", "bon", "w1", "Advanced – Standard Room", 4350, { category: "advanced" }),
        pkg("c", "bon", "w1", "Coaching only", 1100),
      ],
    );
    expect(giftPackagesFor(t.weeks[0], "beginner").map((p) => p.id)).toEqual(["c", "b"]);
    expect(giftPackagesFor(t.weeks[0], "advanced").map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("skips the level step when the week sells one level (Tenerife)", () => {
    const [ten] = catalog(
      [exp("ten", "NP7 Experience Tenerife")],
      [ed("t", "ten", { date_start: "2027-02-07", date_end: "2027-02-13" })],
      [pkg("x", "ten", "t", "Experience Only", 2190, { category: "advanced" }), pkg("y", "ten", "t", "Coaching + Rental", 2580, { category: "advanced" })],
    );
    expect(ten.weeks[0].levels).toEqual(["advanced"]);
    expect(giftWeekNeedsLevel(ten.weeks[0])).toBe(false);
    expect(giftPackagesFor(ten.weeks[0], null).map((p) => p.price)).toEqual([2190, 2580]);
  });
});

describe("Alaçatı: one room name at two hotels on one week", () => {
  const [ala] = catalog(
    [exp("ala", "NP7 Experience Alaçatı")],
    [ed("w1", "ala", { date_start: "2027-08-22", date_end: "2027-08-28" }), ed("w2", "ala", { date_start: "2027-08-29", date_end: "2027-09-04" })],
    [
      pkg("carsi", "ala", "w1", "Advanced – Standard Room", 4350, { category: "advanced", hotel_id: "h-carsi" }),
      pkg("koyici", "ala", "w1", "Advanced – Standard Room", 5100, { category: "advanced", hotel_id: "h-koyici" }),
      pkg("b", "ala", "w1", "Beginner – Standard Room", 2750, { category: "beginner", hotel_id: "h-carsi" }),
      pkg("w2a", "ala", "w2", "Advanced – Standard Room", 4350, { category: "advanced", hotel_id: "h-carsi" }),
    ],
  );

  it("keeps both, told apart by the hotel line", () => {
    expect(giftPackagesFor(ala.weeks[0], "advanced").map((p) => [p.id, p.name, p.hotel, p.price])).toEqual([
      ["carsi", "Standard Room", "REF Carsi", 4350],
      ["koyici", "Standard Room", "REF Koyici", 5100],
    ]);
  });

  it("the value line names the hotel when the room name alone is ambiguous", () => {
    const week = ala.weeks[0];
    const koyici = week.packages.find((p) => p.id === "koyici")!;
    expect(giftValueLine({ isAny: false, trip: ala, week, pkg: koyici })).toBe(
      "Worth the Advanced · Standard Room · REF Koyici price, 22 - 28 Aug 2027. They can use it on any Alaçatı week.",
    );
    const beginner = week.packages.find((p) => p.id === "b")!;
    expect(giftValueLine({ isAny: false, trip: ala, week, pkg: beginner })).toBe(
      "Worth the Beginner · Standard Room price, 22 - 28 Aug 2027. They can use it on any Alaçatı week.",
    );
  });

  it("the second week has its own packages and its own level list", () => {
    expect(ala.weeks[1].packages.map((p) => p.id)).toEqual(["w2a"]);
    expect(ala.weeks[1].levels).toEqual(["advanced"]);
  });
});

describe("what the booking flow would not sell is not offered", () => {
  it("drops draft, hidden, archived, unpriced and off-week packages", () => {
    const [t] = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon"), ed("draft", "bon", { status: "draft" }), ed("gone", "bon", { archived_at: "2026-09-01" })],
      [
        pkg("ok", "bon", "w1", "WANAPA", 3990),
        pkg("draftPkg", "bon", "w1", "Premium Ocean Front", 6090, { status: "draft" }),
        pkg("hidden", "bon", "w1", "Kas Chicitu", 5864, { website_visible: false }),
        pkg("archived", "bon", "w1", "Old", 3000, { archived_at: "2026-08-01" }),
        pkg("free", "bon", "w1", "Free", 0),
        pkg("unpriced", "bon", "w1", "Unpriced", null),
        pkg("draftWeek", "bon", "draft", "Not yet", 2800),
        pkg("archivedWeek", "bon", "gone", "Archived week", 2800),
        pkg("otherExp", "hidden-exp", "w1", "Elsewhere", 2800),
      ],
    );
    expect(t.weeks.flatMap((w) => w.packages.map((p) => p.id))).toEqual(["ok"]);
  });

  it("collapses only true duplicates: same week, level, name, hotel and price", () => {
    const [t] = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon")],
      [pkg("first", "bon", "w1", "BON1 - WANAPA", 3990), pkg("again", "bon", "w1", "WANAPA", 3990), pkg("dearer", "bon", "w1", "WANAPA", 4200)],
    );
    expect(t.weeks[0].packages.map((p) => p.id)).toEqual(["first", "dearer"]);
  });

  it("sells a package with no week on every week, unless the week has its own of that name", () => {
    const [t] = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon"), ed("w2", "bon", { date_start: "2026-12-07", date_end: "2026-12-13" })],
      [pkg("shared", "bon", null, "Coaching only", "1450"), pkg("w2own", "bon", "w2", "Coaching only", 1500)],
    );
    expect(t.weeks.map((w) => w.packages.map((p) => [p.id, p.price]))).toEqual([
      [["shared", 1450]],
      [["w2own", 1500]],
    ]);
  });
});

describe("the chooser: what is shown, what is ordered", () => {
  const trips = catalog(
    [exp("bon", "NP7 Experience Bonaire"), exp("ten", "NP7 Experience Tenerife"), exp("gar", "NP7 Experience Lake Garda")],
    [
      ed("b1", "bon", { label: "Week I" }),
      ed("b2", "bon", { label: "Week II", date_start: "2026-12-07", date_end: "2026-12-13" }),
      ed("t1", "ten", { date_start: "2027-02-07", date_end: "2027-02-13" }),
      ed("g1", "gar", { date_start: "2027-05-24", date_end: "2027-05-29" }),
    ],
    [
      pkg("b1-beg", "bon", "b1", "WANAPA Double Deluxe with Balcony", 3490, { category: "beginner", hotel_id: "h-wanapa" }),
      pkg("b1-adv", "bon", "b1", "WANAPA Double Deluxe with Balcony", 4150, { category: "advanced", hotel_id: "h-wanapa" }),
      pkg("b2-beg", "bon", "b2", "No Hotel", 2390, { category: "beginner" }),
      pkg("t1-exp", "ten", "t1", "Experience Only", 2190, { category: "advanced" }),
    ],
  );
  const state = (over: Partial<GiftChoiceState>): GiftChoiceState => ({ tripId: null, weekId: null, level: null, pkgId: null, custom: false, sliderAmount: 1000, ...over });

  it("nothing picked: nothing to order", () => {
    const c = giftChoice(trips, state({}));
    expect(c.ready).toBe(false);
  });

  it("Any NP7 trip goes straight to the slider and orders a value with no trip", () => {
    const c = giftChoice(trips, state({ tripId: GIFT_ANY_TRIP, sliderAmount: 1400 }));
    expect(c).toMatchObject({ isAny: true, byValue: true, ready: true, amount: 1400, experienceId: null, packageId: null, currency: "EUR" });
    expect(giftValueLine(c)).toBe("A voucher for any NP7 trip. They can use it on any week.");
  });

  it("Bonaire: asks the week, then the level, then shows that level's rooms", () => {
    let c = giftChoice(trips, state({ tripId: "bon" }));
    expect(c).toMatchObject({ askWeek: true, week: null, showCards: false, ready: false });

    c = giftChoice(trips, state({ tripId: "bon", weekId: "b1" }));
    expect(c).toMatchObject({ askLevel: true, showCards: false, ready: false });

    c = giftChoice(trips, state({ tripId: "bon", weekId: "b1", level: "advanced" }));
    expect(c.showCards).toBe(true);
    expect(c.cards.map((p) => [p.id, p.price])).toEqual([["b1-adv", 4150]]);
  });

  it("the voucher is worth the picked package's price, and orders that package on that trip", () => {
    const c = giftChoice(trips, state({ tripId: "bon", weekId: "b1", level: "advanced", pkgId: "b1-adv", sliderAmount: 1000 }));
    expect(c).toMatchObject({ ready: true, amount: 4150, experienceId: "bon", packageId: "b1-adv", byValue: false });
    expect(giftValueLine(c)).toBe("Worth the Advanced · WANAPA Double Deluxe with Balcony price, 30 Nov - 6 Dec 2026. They can use it on any Bonaire week.");
    expect(giftValueLine(c)).not.toMatch(/any NP7 trip/);
  });

  it("the Beginner room of the same name is its own, cheaper voucher", () => {
    const c = giftChoice(trips, state({ tripId: "bon", weekId: "b1", level: "beginner", pkgId: "b1-beg" }));
    expect(c.amount).toBe(3490);
    expect(c.packageId).toBe("b1-beg");
  });

  it("a package id from another level or week is not ordered", () => {
    const c = giftChoice(trips, state({ tripId: "bon", weekId: "b1", level: "beginner", pkgId: "b1-adv" }));
    expect(c).toMatchObject({ pkg: null, packageId: null, ready: false });
  });

  it("a week with one level skips the level step (Bonaire Week II)", () => {
    const c = giftChoice(trips, state({ tripId: "bon", weekId: "b2" }));
    expect(c).toMatchObject({ askLevel: false, showCards: true });
    expect(c.cards.map((p) => p.id)).toEqual(["b2-beg"]);
  });

  it("a trip with one week skips the week step (Tenerife)", () => {
    const c = giftChoice(trips, state({ tripId: "ten" }));
    expect(c).toMatchObject({ askWeek: false, askLevel: false, showCards: true });
    expect(c.week?.id).toBe("t1");
  });

  it("a trip with no prices out yet goes straight to an amount (Lake Garda)", () => {
    const c = giftChoice(trips, state({ tripId: "gar", sliderAmount: 2000 }));
    expect(c).toMatchObject({ askWeek: false, showCards: false, byValue: true, ready: true, amount: 2000, experienceId: "gar", packageId: null });
    expect(giftValueLine(c)).toBe("A voucher for NP7 Experience Lake Garda. They can use it on any Lake Garda week.");
  });

  it("A set amount instead: the slider's value, on the trip, with no package", () => {
    const c = giftChoice(trips, state({ tripId: "ten", custom: true, sliderAmount: 3000 }));
    expect(c).toMatchObject({ ready: true, amount: 3000, experienceId: "ten", packageId: null });
  });

  it("Change amount keeps the package price until the slider moves", () => {
    const c = giftChoice(trips, state({ tripId: "ten", pkgId: "t1-exp", custom: true, sliderAmount: 2000 }));
    expect(c).toMatchObject({ byValue: true, amount: 2190, packageId: "t1-exp" });
  });
});

describe("guest-facing labels", () => {
  it("writes a week without a long dash, whatever it spans", () => {
    expect(giftWeekLabel("2026-11-30", "2026-12-06")).toBe("30 Nov - 6 Dec 2026");
    expect(giftWeekLabel("2026-12-07", "2026-12-13")).toBe("7 - 13 Dec 2026");
    expect(giftWeekLabel("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 - 3 Jan 2027");
    expect(giftWeekLabel("2026-10-10", "2026-10-10")).toBe("10 Oct 2026");
    expect(giftWeekLabel("2026-10-10", null)).toBe("10 Oct 2026");
    expect(giftWeekLabel(null, "2026-10-10")).toBeNull();
  });

  it("drops the week code and turns long dashes into a middot", () => {
    expect(giftPackageName("BON1 - WANAPA")).toBe("WANAPA");
    expect(giftPackageName("Advanced – Standard Room")).toBe("Advanced · Standard Room");
    expect(giftPackageName("OBX Clinic — Ticket")).toBe("OBX Clinic · Ticket");
    expect(giftPackageName("All Inclusive – Double Superior - Single Use")).toBe("All Inclusive · Double Superior - Single Use");
    for (const n of ["Advanced – Standard Room", "OBX Clinic — Ticket", "BON2 – No Hotel"]) {
      expect(giftPackageName(n)).not.toMatch(/[–—]/);
    }
  });

  it("drops the level word only where it repeats the level", () => {
    expect(giftPackageTitle("Advanced – Standard Room", "advanced")).toBe("Standard Room");
    expect(giftPackageTitle("Beginner – No Hotel", "beginner")).toBe("No Hotel");
    expect(giftPackageTitle("No Hotel - Beginner", "beginner")).toBe("No Hotel");
    expect(giftPackageTitle("Advanced – Standard Room", "beginner")).toBe("Advanced · Standard Room");
    expect(giftPackageTitle("All Inclusive – Double Superior - Single Use", "advanced")).toBe("All Inclusive · Double Superior - Single Use");
    expect(giftPackageTitle("Beginner", "beginner")).toBe("Beginner");
    expect(giftPackageTitle("SOROBON RESORT Premium Ocean Front Beach House ", "advanced")).toBe("SOROBON RESORT Premium Ocean Front Beach House");
  });
});
