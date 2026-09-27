/**
 * The "from €X" on a trip card is the cheapest package you can actually buy.
 *
 * Delete in the admin is a soft delete: it stamps archived_at and leaves the
 * status alone. So a package deleted while "active" still read as active, and
 * the cards (the /experience overview and the homepage tiles) would have
 * advertised its price. The detail page and the gift page already skipped
 * deleted packages; the cards now do too. Nothing was affected when this was
 * found, which is exactly why it is pinned here rather than noticed later.
 *
 * The second half runs the real getExperienceCards against an in-memory
 * database. The fake returns whole rows whatever the select asks for, so the
 * embed is checked by reading the select itself: a filter on archived_at is
 * worthless if the query never fetches the column.
 */
import { describe, it, expect, vi } from "vitest";
import { FakeSupabase } from "./stubs/fake-supabase";
import { cheapestCardPrice, type CardPackage } from "@/lib/experience-cards";

const state = vi.hoisted(() => ({
  db: null as unknown as { from: (t: string) => unknown },
  selects: [] as { table: string; cols: string }[],
}));

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return state.db;
  },
  createAdminClient: () => state.db,
}));
vi.mock("@/lib/availability", () => ({ availabilityFor: async () => new Map() }));
vi.mock("@/lib/flag-store", () => ({ customFlagRules: async () => [] }));

const pkg = (over: Partial<CardPackage>): CardPackage => ({
  price: 1000,
  status: "active",
  edition_id: null,
  website_visible: true,
  archived_at: null,
  ...over,
});

describe("cheapestCardPrice", () => {
  it("skips a deleted package that still reads active", () => {
    const list = [
      pkg({ price: 1500, edition_id: "ed1", archived_at: "2026-09-20T10:00:00Z" }),
      pkg({ price: 1800, edition_id: "ed1" }),
    ];
    expect(cheapestCardPrice(list, "ed1")).toBe(1800);
  });

  it("skips hidden and inactive packages", () => {
    const list = [
      pkg({ price: 900, website_visible: false }),
      pkg({ price: 950, status: "draft" }),
      pkg({ price: 2190 }),
    ];
    expect(cheapestCardPrice(list, "ed1")).toBe(2190);
  });

  it("prices only the week asked for, plus packages shared by every week", () => {
    const list = [
      pkg({ price: 2390, edition_id: "ed-2026" }),
      pkg({ price: 3990, edition_id: "ed-2027" }),
      pkg({ price: 4550, edition_id: null }),
    ];
    expect(cheapestCardPrice(list, "ed-2027")).toBe(3990);
    expect(cheapestCardPrice(list, "ed-other")).toBe(4550);
  });

  it("is null when nothing can be bought, never a made-up number", () => {
    expect(cheapestCardPrice([], "ed1")).toBeNull();
    expect(cheapestCardPrice([pkg({ archived_at: "2026-09-01T00:00:00Z" })], "ed1")).toBeNull();
    expect(cheapestCardPrice([pkg({ price: null })], "ed1")).toBeNull();
  });

  it("treats a package without the column (pre-migration) as not deleted", () => {
    const legacy = { price: 1200, status: "active", edition_id: null, website_visible: null } as CardPackage;
    expect(cheapestCardPrice([legacy], "ed1")).toBe(1200);
  });
});

describe("getExperienceCards", () => {
  it("fetches archived_at with the packages and leaves the deleted one off the card", async () => {
    const fake = new FakeSupabase({
      exp_experiences: [{
        id: "ex1",
        title: "NP7 Alaçatı",
        slug: "np7-alacati",
        location: "Alacati, Turkey",
        price: 999, // the legacy column: never the card's price
        currency: "EUR",
        description: null,
        hero_image: null,
        destination_id: null,
        page_template: "trip",
        status: "published",
        website_visible: true,
        exp_packages: [
          { price: 1500, status: "active", edition_id: "ed1", website_visible: true, archived_at: "2026-09-20T10:00:00Z" },
          { price: 1800, status: "active", edition_id: "ed1", website_visible: true, archived_at: null },
        ],
        exp_editions: [{
          id: "ed1", date_start: "2099-06-01", date_end: "2099-06-08", max_spots: 12, spots_taken: 0,
          status: "published", active: true, coaches: null, launch_discount_pct: null, launch_price_until: null,
          public_from: null, archived_at: null,
        }],
      }],
    });
    const from = fake.from.bind(fake);
    fake.from = ((table: string) => {
      const q = from(table) as unknown as { select: (cols?: string) => unknown };
      const select = q.select.bind(q);
      q.select = (cols?: string) => {
        state.selects.push({ table, cols: cols ?? "" });
        return select();
      };
      return q;
    }) as typeof fake.from;
    state.db = fake;

    const { getExperienceCards } = await import("@/lib/experience-cards");
    const { cards } = await getExperienceCards();

    const cardQuery = state.selects.find((s) => s.table === "exp_experiences" && s.cols.includes("exp_packages("));
    expect(cardQuery).toBeDefined();
    const embed = /exp_packages\(([^)]*)\)/.exec(cardQuery!.cols)?.[1] ?? "";
    expect(embed.split(",")).toContain("archived_at");

    expect(cards).toHaveLength(1);
    expect(cards[0].priceValue).toBe(1800);
    expect(cards[0].priceLabel).toBe("€1,800");
  });
});
