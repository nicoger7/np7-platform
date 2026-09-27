/**
 * What the gift voucher form may offer (Nico, 27 Sep 2026).
 *
 * Three things went wrong on the live page, and each is pinned here:
 *
 *  - A clinic (NP7 Coaching Clinics USA) was sold as a voucher, but a clinic is
 *    booked through a card checkout that charges the whole ticket and has no
 *    voucher field. The voucher could never be used.
 *  - Packages from every week were merged under one name with the lowest
 *    price, and the form promised "they pick the week when they book". Every
 *    package is sold on one week only.
 *  - Lake Garda and Croatia, between seasons with nothing on sale, must still
 *    be giftable: a voucher is value, next season's week takes it.
 */
import { describe, it, expect } from "vitest";
import {
  buildGiftCatalog,
  giftWeekLabel,
  giftPackageName,
  type GiftExpRow,
  type GiftEditionRow,
  type GiftPackageRow,
} from "@/lib/gift-data";

const TODAY = "2026-09-27";

const exp = (id: string, title: string, extra: Partial<GiftExpRow> = {}): GiftExpRow => ({ id, title, currency: "EUR", ...extra });
const ed = (id: string, experience_id: string, extra: Partial<GiftEditionRow> = {}): GiftEditionRow => ({
  id, experience_id, status: "published", kind: "trip", date_start: "2026-11-30", date_end: "2026-12-06", archived_at: null, ...extra,
});
const pkg = (id: string, experience_id: string, edition_id: string | null, name: string, price: number | string | null, extra: Partial<GiftPackageRow> = {}): GiftPackageRow => ({
  id, experience_id, edition_id, name, price, status: "active", website_visible: true, archived_at: null, ...extra,
});

function catalog(experiences: GiftExpRow[], editions: GiftEditionRow[], packages: GiftPackageRow[]) {
  return buildGiftCatalog({ experiences, editions, packages, today: TODAY });
}

describe("which experiences can be gifted", () => {
  it("leaves out a clinic series whose live editions are all events", () => {
    const { experiences, packages } = catalog(
      [exp("obx", "NP7 Coaching Clinics USA"), exp("bon", "NP7 Experience Bonaire")],
      [ed("obx-oct", "obx", { kind: "event", date_start: "2026-10-10", date_end: "2026-10-11" }), ed("bon-w1", "bon")],
      [pkg("ticket", "obx", "obx-oct", "OBX Clinic — Ticket", 750), pkg("wanapa", "bon", "bon-w1", "WANAPA", 3990)],
    );
    expect(experiences.map((e) => e.id)).toEqual(["bon"]);
    expect(packages.map((p) => p.id)).toEqual(["wanapa"]);
  });

  it("leaves out an event-template experience even with no live edition", () => {
    const { experiences } = catalog([exp("race", "NP7 Race Clinic", { page_template: "event" })], [], []);
    expect(experiences).toEqual([]);
  });

  it("keeps a trip between seasons, with no package on sale (Lake Garda)", () => {
    const { experiences, packages } = catalog(
      [exp("gar", "NP7 Experience Lake Garda")],
      [ed("gar-2026", "gar", { date_start: "2026-05-24", date_end: "2026-05-31" }), ed("gar-2027", "gar", { status: "draft", date_start: "2027-05-23", date_end: "2027-05-30" })],
      [pkg("old", "gar", "gar-2026", "Standard", 2390)],
    );
    expect(experiences).toEqual([{ id: "gar", title: "NP7 Experience Lake Garda", currency: "EUR" }]);
    expect(packages).toEqual([]);
  });

  it("keeps a trip that also runs an event week, but not the event week's packages", () => {
    const { experiences, packages } = catalog(
      [exp("ala", "NP7 Experience Alaçatı")],
      [ed("ala-w1", "ala"), ed("ala-race", "ala", { kind: "event" })],
      [pkg("week", "ala", "ala-w1", "Beginner", 2750), pkg("race", "ala", "ala-race", "Race day", 400)],
    );
    expect(experiences.map((e) => e.id)).toEqual(["ala"]);
    expect(packages.map((p) => p.id)).toEqual(["week"]);
  });

  it("never sends the legacy experience price to the browser", () => {
    const { experiences } = catalog([{ ...exp("ten", "NP7 Experience Tenerife"), price: 3120 } as GiftExpRow], [], []);
    expect(Object.keys(experiences[0]).sort()).toEqual(["currency", "id", "title"]);
  });
});

describe("which packages the form offers", () => {
  it("keeps each package on its own week, with the week in words", () => {
    const { packages } = catalog(
      [exp("bon", "NP7 Experience Bonaire")],
      [ed("w1", "bon"), ed("w2", "bon", { date_start: "2026-12-07", date_end: "2026-12-13" })],
      [pkg("a", "bon", "w1", "WANAPA", 3990), pkg("b", "bon", "w2", "No Hotel", 2390)],
    );
    expect(packages).toEqual([
      { id: "a", name: "WANAPA", price: 3990, experience_id: "bon", week: "30 Nov - 6 Dec 2026", week_start: "2026-11-30" },
      { id: "b", name: "No Hotel", price: 2390, experience_id: "bon", week: "7 - 13 Dec 2026", week_start: "2026-12-07" },
    ]);
  });

  it("does not hide a dearer package behind a cheaper one of the same name on another week", () => {
    const { packages } = catalog(
      [exp("ala", "NP7 Experience Alaçatı")],
      [ed("low", "ala", { date_start: "2027-05-02", date_end: "2027-05-08" }), ed("high", "ala", { date_start: "2027-08-01", date_end: "2027-08-07" })],
      [pkg("l", "ala", "low", "Beginner – Standard Room", 2750), pkg("h", "ala", "high", "Beginner – Standard Room", 3450)],
    );
    expect(packages.map((p) => [p.id, p.price, p.week])).toEqual([
      ["l", 2750, "2 - 8 May 2027"],
      ["h", 3450, "1 - 7 Aug 2027"],
    ]);
  });

  it("collapses only true duplicates: same week, same name, same price", () => {
    const { packages } = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon")],
      [pkg("first", "bon", "w1", "BON1 - WANAPA", 3990), pkg("again", "bon", "w1", "WANAPA", 3990), pkg("dearer", "bon", "w1", "WANAPA", 4200)],
    );
    expect(packages.map((p) => p.id)).toEqual(["first", "dearer"]);
  });

  it("drops what the booking flow would not sell", () => {
    const { packages } = catalog(
      [exp("bon", "Bonaire")],
      [ed("w1", "bon"), ed("past", "bon", { date_start: "2025-11-30", date_end: "2025-12-06" }), ed("draft", "bon", { status: "draft" }), ed("gone", "bon", { archived_at: "2026-09-01" })],
      [
        pkg("ok", "bon", "w1", "WANAPA", 3990),
        pkg("draftPkg", "bon", "w1", "Premium Ocean Front", 6090, { status: "draft" }),
        pkg("hidden", "bon", "w1", "Kas Chicitu", 5864, { website_visible: false }),
        pkg("archived", "bon", "w1", "Old", 3000, { archived_at: "2026-08-01" }),
        pkg("free", "bon", "w1", "Free", 0),
        pkg("unpriced", "bon", "w1", "Unpriced", null),
        pkg("pastWeek", "bon", "past", "Last year", 2800),
        pkg("draftWeek", "bon", "draft", "Not yet", 2800),
        pkg("archivedWeek", "bon", "gone", "Archived week", 2800),
        pkg("otherExp", "hidden-exp", "w1", "Elsewhere", 2800),
      ],
    );
    expect(packages.map((p) => p.id)).toEqual(["ok"]);
  });

  it("keeps a package with no week, and says so with a null week", () => {
    const { packages } = catalog([exp("bon", "Bonaire")], [], [pkg("any", "bon", null, "Coaching only", "1450")]);
    expect(packages).toEqual([{ id: "any", name: "Coaching only", price: 1450, experience_id: "bon", week: null, week_start: null }]);
  });

  it("counts a week that has started but not ended as live", () => {
    const { packages } = catalog(
      [exp("bon", "Bonaire")],
      [ed("now", "bon", { date_start: "2026-09-24", date_end: "2026-09-30" })],
      [pkg("p", "bon", "now", "WANAPA", 3990)],
    );
    expect(packages.map((p) => p.id)).toEqual(["p"]);
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
});
