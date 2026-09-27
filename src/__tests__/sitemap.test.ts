/**
 * The sitemap lists a URL only when the page behind it answers 200.
 *
 * Every block asks the question its page asks before rendering. When the two
 * drift apart, Google is sent to 404s and redirects while live pages are left
 * out, and that is what the live sitemap was doing on 27 Sep 2026:
 *
 *   spotguide areas  → picked by `status` (the Experience world's column), so
 *                      a draft area 404'd from the sitemap and 15 live ones
 *                      were missing. The page reads `spotguide_status`.
 *   legacy posts     → two old `spotguide`-template magazine posts listed, both
 *                      only a redirect into /spotguide.
 *   SHOW_BLOG        → magazine and spotguide listed with no flag check, while
 *                      both layouts 404 without it.
 *   legal pages      → Impressum and Widerrufsbelehrung missing.
 *   clinics          → a clinic series with no run left 404s, but would stay
 *                      listed once SHOW_EXPERIENCE is on.
 *
 * Plus the destination page's trip cards, which must leave out a trip that is
 * switched off the website, the same way that trip's own page does.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const state = vi.hoisted(() => ({
  db: null as unknown as { from: (t: string) => unknown },
  flags: { showBlog: true, showAbout: false, showExperience: false },
  /** upcoming runs per event slug; "throw" makes the lookup fail */
  runs: {} as Record<string, number | "throw">,
  runLookups: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (t: string) => state.db.from(t) },
  createAdminClient: () => state.db,
}));
vi.mock("@/lib/flags", () => ({ flags: state.flags }));
vi.mock("@/lib/events", () => ({
  getEventRuns: async (slug: string) => {
    state.runLookups.push(slug);
    const n = state.runs[slug] ?? 0;
    if (n === "throw") throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return Array.from({ length: n }, (_, i) => ({ slug: `${slug}-run-${i}` }));
  },
}));

import sitemap from "@/app/sitemap";
import { listedTrips } from "@/lib/spotguide-data";

const SITE = "https://www.np-seven.com";

function setup(tables: { posts?: Row[]; dests?: Row[]; exps?: Row[] } = {}) {
  state.db = new FakeSupabase({
    exp_blog_posts: tables.posts ?? [],
    destinations: tables.dests ?? [],
    exp_experiences: tables.exps ?? [],
  }) as unknown as { from: (t: string) => unknown };
}

async function urls(): Promise<string[]> {
  return (await sitemap()).map((e) => e.url.replace(SITE, ""));
}

beforeEach(() => {
  state.flags.showBlog = true;
  state.flags.showAbout = false;
  state.flags.showExperience = false;
  state.runs = {};
  state.runLookups = [];
  setup();
});

describe("spotguide areas", () => {
  it("are picked by spotguide_status, the column the page checks, not by status", async () => {
    setup({
      dests: [
        // published for the Experience world, still a draft in the spotguide: the page 404s
        { slug: "volosko", status: "published", spotguide_status: "draft", updated_at: null },
        // the other way round: a live spotguide page the old filter left out
        { slug: "tarifa", status: "draft", spotguide_status: "published", updated_at: "2026-09-01T00:00:00Z" },
        { slug: "le-morne", status: null, spotguide_status: "published", updated_at: null },
        { slug: null, status: "published", spotguide_status: "published", updated_at: null },
      ],
    });

    const list = await urls();

    expect(list).toContain("/spotguide/tarifa");
    expect(list).toContain("/spotguide/le-morne");
    expect(list).not.toContain("/spotguide/volosko");
    expect(list.filter((u) => u.startsWith("/spotguide/"))).toHaveLength(2);
  });

  it("carry the row's own last change", async () => {
    setup({ dests: [{ slug: "tarifa", spotguide_status: "published", updated_at: "2026-09-01T00:00:00Z" }] });

    const entry = (await sitemap()).find((e) => e.url === `${SITE}/spotguide/tarifa`);

    expect(entry?.lastModified).toEqual(new Date("2026-09-01T00:00:00Z"));
  });
});

describe("magazine posts", () => {
  it("leave out the legacy spotguide template, which only redirects", async () => {
    setup({
      posts: [
        { slug: "tenerife-watersport-spot-guide", status: "published", template: "spotguide" },
        { slug: "fuerteventura-windsurf-spot-guide", status: "published", template: "spotguide", members_only: true },
        { slug: "carve-gybe", status: "published", template: "technique" },
      ],
    });

    const list = await urls();

    expect(list).toContain("/blog/carve-gybe");
    expect(list).not.toContain("/blog/tenerife-watersport-spot-guide");
    expect(list).not.toContain("/blog/fuerteventura-windsurf-spot-guide");
  });

  it("keep a post with no template at all (most of the magazine)", async () => {
    setup({ posts: [{ slug: "why-we-coach", status: "published", template: null }] });

    expect(await urls()).toContain("/blog/why-we-coach");
  });

  it("keep members-only posts on a normal template: the page serves them a teaser, with no noindex", async () => {
    setup({ posts: [{ slug: "insider-gear", status: "published", template: "gear", members_only: true }] });

    expect(await urls()).toContain("/blog/insider-gear");
  });

  it("leave out drafts", async () => {
    setup({ posts: [{ slug: "half-written", status: "draft", template: null }] });

    expect(await urls()).not.toContain("/blog/half-written");
  });
});

describe("SHOW_BLOG", () => {
  it("off: no magazine and no spotguide URL at all, because both layouts 404", async () => {
    state.flags.showBlog = false;
    setup({
      posts: [{ slug: "why-we-coach", status: "published", template: null }],
      dests: [{ slug: "tarifa", spotguide_status: "published", updated_at: null }],
    });

    const list = await urls();

    expect(list.some((u) => u.startsWith("/blog"))).toBe(false);
    expect(list.some((u) => u.startsWith("/spotguide"))).toBe(false);
    // the rest of the site does not ride on it
    expect(list).toContain("/");
    expect(list).toContain("/impressum");
  });

  it("on: the index pages are listed", async () => {
    const list = await urls();

    expect(list).toEqual(expect.arrayContaining(["/blog", "/blog/gear", "/blog/technique", "/spotguide"]));
    // /blog/spotguide is a 308 to /spotguide
    expect(list).not.toContain("/blog/spotguide");
  });
});

describe("legal pages", () => {
  it("lists all four, whatever the flags say", async () => {
    state.flags.showBlog = false;

    expect(await urls()).toEqual(expect.arrayContaining(["/privacy", "/terms", "/impressum", "/widerrufsbelehrung"]));
  });
});

describe("experience pages", () => {
  const exps: Row[] = [
    { slug: "np7-bonaire", status: "published", website_visible: true, page_template: "trip" },
    { slug: "np7-coaching-clinics-usa", status: "published", website_visible: true, page_template: "event" },
    { slug: "np7-mauritius-madagascar-experience", status: "published", website_visible: false, page_template: "trip" },
    { slug: "np7-wind-week-2027", status: "draft", website_visible: true, page_template: "trip" },
    { slug: "np7-tarifa", status: "published", website_visible: null, page_template: null },
  ];

  it("none while SHOW_EXPERIENCE is off, and no run lookups either", async () => {
    setup({ exps });

    const list = await urls();

    expect(list.some((u) => u.startsWith("/experience"))).toBe(false);
    expect(state.runLookups).toEqual([]);
  });

  it("a clinic series with no upcoming run is left out, since its page 404s", async () => {
    state.flags.showExperience = true;
    state.runs = { "np7-coaching-clinics-usa": 0 };
    setup({ exps });

    const list = await urls();

    expect(list).not.toContain("/experience/np7-coaching-clinics-usa");
    // trips are pages whether or not a week is left, and never pay for the lookup
    expect(list).toContain("/experience/np7-bonaire");
    expect(list).toContain("/experience/np7-tarifa");
    expect(state.runLookups).toEqual(["np7-coaching-clinics-usa"]);
  });

  it("a clinic series with a run still to come is listed", async () => {
    state.flags.showExperience = true;
    state.runs = { "np7-coaching-clinics-usa": 1 };
    setup({ exps });

    expect(await urls()).toContain("/experience/np7-coaching-clinics-usa");
  });

  it("a failed run lookup leaves that clinic out for the hour, not the whole sitemap", async () => {
    state.flags.showExperience = true;
    state.runs = { "np7-coaching-clinics-usa": "throw" };
    setup({ exps, posts: [{ slug: "why-we-coach", status: "published", template: null }] });

    const list = await urls();

    expect(list).not.toContain("/experience/np7-coaching-clinics-usa");
    expect(list).toContain("/experience/np7-bonaire");
    expect(list).toContain("/blog/why-we-coach");
  });

  it("hidden and unpublished trips stay out, as before", async () => {
    state.flags.showExperience = true;
    setup({ exps });

    const list = await urls();

    expect(list).toContain("/experience");
    expect(list).not.toContain("/experience/np7-mauritius-madagascar-experience");
    expect(list).not.toContain("/experience/np7-wind-week-2027");
  });
});

describe("a destination page's trip cards", () => {
  const trip = (over: Row): Row => ({ id: "t", title: "Trip", slug: "trip", hero_image: null, tagline: null, ...over });

  it("leave out a trip switched off the website", () => {
    const cards = listedTrips([
      trip({ id: "a", slug: "np7-mauritius-madagascar-experience", website_visible: false }),
      trip({ id: "b", slug: "np7-le-morne", website_visible: true }),
    ]);

    expect(cards.map((c) => c.slug)).toEqual(["np7-le-morne"]);
  });

  it("keep a trip whose flag was never set (NULL means visible)", () => {
    const cards = listedTrips([trip({ id: "a", website_visible: null }), trip({ id: "b" })]);

    expect(cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("carry only what a card shows", () => {
    expect(listedTrips([trip({ id: "a", website_visible: true, status: "published" })])).toEqual([
      { id: "a", title: "Trip", slug: "trip", hero_image: null, tagline: null },
    ]);
    expect(listedTrips(null)).toEqual([]);
  });
});
