/**
 * Who gets past the Experience gate while the world is still hidden.
 *
 * The gate used to live in app/experience/layout.tsx alone. Next renders the
 * layout, the page and generateMetadata side by side, so the layout's 307 to
 * the login page arrived with the whole trip page (prices, rooms) and hidden
 * trips' titles already rendered in its body. The decision now lives in
 * lib/member-gate.ts as experienceGateOpen(), which every page asks first and
 * the layout asks as the backstop. These pin its answers, because a wrong
 * "open" publishes a hidden trip and a wrong "shut" sends an ad click for
 * Bonaire or Alaçatı to a login page.
 *
 * canSeeExperienceWorld (flag, team, member) and the database are stubbed; the
 * link-only rule and the slug/path handling are the real thing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const state = vi.hoisted(() => ({
  flags: { showExperience: false },
  /** who is asking: the team (admin preview), a signed-in member, or nobody */
  viewer: null as "team" | "member" | null,
  db: null as unknown as { from: (t: string) => unknown },
  dbThrows: false,
  reads: [] as string[],
  seenFlag: [] as boolean[],
}));

vi.mock("@/lib/flags", () => ({ flags: state.flags }));
vi.mock("@/lib/auth", () => ({
  canSeeExperienceWorld: async (flagOn: boolean) => {
    state.seenFlag.push(flagOn);
    return flagOn || state.viewer !== null;
  },
}));
vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => {
    if (state.dbThrows) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return state.db;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { experienceGateOpen } from "@/lib/member-gate";

const EXPERIENCES: Row[] = [
  // link-only while hidden: the ad and newsletter landing pages
  { slug: "np7-bonaire", status: "published", website_visible: true, public_by_link: true },
  { slug: "np7-alacati", status: "published", website_visible: true, public_by_link: true },
  // a clinic series opened by link, reached through its per-edition URLs too
  { slug: "np7-coaching-clinics-usa", status: "published", website_visible: true, public_by_link: true },
  // published, on the website, but not link-only: members and team only
  { slug: "np7-tenerife-2026", status: "published", website_visible: true, public_by_link: false },
  // switched off the website: the box being ticked must not open it
  { slug: "np7-mauritius-madagascar-experience", status: "published", website_visible: false, public_by_link: true },
  // a draft: same
  { slug: "np7-croatia-2027", status: "draft", website_visible: true, public_by_link: true },
  // a slug that merely starts with "gift" is not the gift page
  { slug: "gift-week-2027", status: "published", website_visible: true, public_by_link: false },
];

function freshDb(): FakeSupabase {
  const fake = new FakeSupabase({ exp_experiences: EXPERIENCES.map((r) => ({ ...r })) });
  // Count the reads, so "decided without the database" is an assertion.
  const from = fake.from.bind(fake);
  fake.from = ((t: string) => {
    state.reads.push(t);
    return from(t);
  }) as typeof fake.from;
  return fake;
}

beforeEach(() => {
  state.flags.showExperience = false;
  state.viewer = null;
  state.dbThrows = false;
  state.reads = [];
  state.seenFlag = [];
  state.db = freshDb();
});

describe("experienceGateOpen, world hidden, logged out", () => {
  it("opens a link-only experience by its slug (what the page has)", async () => {
    expect(await experienceGateOpen("np7-alacati")).toBe(true);
    expect(await experienceGateOpen("np7-bonaire")).toBe(true);
  });

  it("opens it by its path too (what the layout has), query string and all", async () => {
    expect(await experienceGateOpen("/experience/np7-alacati")).toBe(true);
    expect(await experienceGateOpen("/experience/np7-bonaire?utm_source=google&gclid=abc")).toBe(true);
  });

  it("opens a link-only clinic series on its per-edition URL, judged by the series", async () => {
    expect(await experienceGateOpen("/experience/np7-coaching-clinics-usa/obx-oct-2026")).toBe(true);
  });

  it("keeps a published trip that is not link-only shut", async () => {
    expect(await experienceGateOpen("np7-tenerife-2026")).toBe(false);
    expect(await experienceGateOpen("/experience/np7-tenerife-2026")).toBe(false);
  });

  it("keeps a link-only trip shut once it is switched off the website", async () => {
    expect(await experienceGateOpen("np7-mauritius-madagascar-experience")).toBe(false);
  });

  it("keeps a link-only draft shut", async () => {
    expect(await experienceGateOpen("np7-croatia-2027")).toBe(false);
  });

  it("keeps an unknown slug shut", async () => {
    expect(await experienceGateOpen("np7-nowhere")).toBe(false);
  });

  it("keeps the overview shut, without asking the database", async () => {
    expect(await experienceGateOpen("/experience")).toBe(false);
    expect(state.reads).toEqual([]);
  });

  it("keeps anything deeper than a per-edition URL shut", async () => {
    expect(await experienceGateOpen("/experience/np7-alacati/a/b")).toBe(false);
  });

  it("keeps an empty or missing path shut (no middleware header)", async () => {
    expect(await experienceGateOpen("")).toBe(false);
    expect(state.reads).toEqual([]);
  });

  it("does not treat a slug with a slash in it as a slug", async () => {
    expect(await experienceGateOpen("np7-alacati/extra")).toBe(false);
    expect(state.reads).toEqual([]);
  });

  it("passes the real flag to the team/member check", async () => {
    await experienceGateOpen("np7-tenerife-2026");
    expect(state.seenFlag).toEqual([false]);
  });
});

describe("the gift page", () => {
  it("is always open, by path or by slug, and asks nobody", async () => {
    expect(await experienceGateOpen("/experience/gift")).toBe(true);
    expect(await experienceGateOpen("/experience/gift?value=500")).toBe(true);
    expect(await experienceGateOpen("gift")).toBe(true);
    expect(state.reads).toEqual([]);
    expect(state.seenFlag).toEqual([]);
  });

  it("does not lend its exception to a slug that only starts with 'gift'", async () => {
    expect(await experienceGateOpen("/experience/gift-week-2027")).toBe(false);
    expect(await experienceGateOpen("gift-week-2027")).toBe(false);
  });
});

describe("team, members and the public reveal", () => {
  it("lets the team through everywhere (the admin Preview page button)", async () => {
    state.viewer = "team";
    expect(await experienceGateOpen("/experience")).toBe(true);
    expect(await experienceGateOpen("np7-tenerife-2026")).toBe(true);
    expect(await experienceGateOpen("np7-mauritius-madagascar-experience")).toBe(true);
    expect(await experienceGateOpen("np7-croatia-2027")).toBe(true);
  });

  it("lets a signed-in member through", async () => {
    state.viewer = "member";
    expect(await experienceGateOpen("/experience")).toBe(true);
    expect(await experienceGateOpen("/experience/np7-tenerife-2026")).toBe(true);
  });

  it("opens everything once SHOW_EXPERIENCE is on, without a link-only lookup", async () => {
    state.flags.showExperience = true;
    expect(await experienceGateOpen("/experience")).toBe(true);
    expect(await experienceGateOpen("np7-tenerife-2026")).toBe(true);
    expect(state.reads).toEqual([]);
    expect(state.seenFlag.every((f) => f === true)).toBe(true);
  });
});

describe("when the database cannot answer", () => {
  it("stays shut on a failed read", async () => {
    (state.db as FakeSupabase).failOn("exp_experiences", "select");
    expect(await experienceGateOpen("np7-alacati")).toBe(false);
  });

  it("stays shut when there is no client at all", async () => {
    state.dbThrows = true;
    expect(await experienceGateOpen("np7-alacati")).toBe(false);
  });
});
