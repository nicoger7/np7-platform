/**
 * What the head of /experience/[slug] may say, and to whom (review follow-up,
 * 28 Sep 2026).
 *
 * generateMetadata renders alongside the layout, not after it, so the
 * layout's redirect never stopped it. Two leaks came out of that: while the
 * Experience world was hidden, the 307 to the login page carried each trip's
 * real title and description in its head, off-website trips included, and a
 * trip switched off the website still printed its title once the gate was
 * open. Both were closed in the page, and nothing pinned them: a refactor that
 * moved the read above the gate, or dropped the website_visible branch, would
 * have brought the leak back with every test still green.
 *
 * Pinned here: a shut gate answers with the generic title and touches no
 * data at all; an off-website trip reads as not found; a live trip gets its
 * real title; and the team, previewing a draft or an off-website trip, gets
 * the real title too, read through the service role, never indexed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const state = vi.hoisted(() => ({
  gateOpen: false,
  team: null as null | { userId: string; email: string; teamMemberId: string; role: string | null },
  rows: [] as Record<string, unknown>[],
  /** Every table read, by which client: the anon one or the service role. */
  reads: [] as string[],
  teamLookups: 0,
  flags: { showExperience: false },
}));

/** A client over the fixture rows that records every table it is asked for. */
function recording(label: "anon" | "admin") {
  const db = new FakeSupabase({ exp_experiences: state.rows as Row[] });
  return {
    from(table: string) {
      state.reads.push(`${label}:${table}`);
      return db.from(table);
    },
  };
}

vi.mock("@/lib/member-gate", () => ({
  experienceGateOpen: async () => state.gateOpen,
  redirectToMemberLogin: async () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === "from" ? (t: string) => recording("anon").from(t) : undefined) }),
  createAdminClient: () => recording("admin"),
}));
vi.mock("@/lib/auth", () => ({
  getTeamMember: async () => {
    state.teamLookups++;
    return state.team;
  },
  getPortalUser: async () => null,
}));
vi.mock("@/lib/flags", () => ({ flags: state.flags }));

import { generateMetadata } from "@/app/experience/[slug]/page";

const meta = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

const NOINDEX = { index: false, follow: false };
const TEAM = { userId: "u-nico", email: "nico@np-seven.com", teamMemberId: "tm-nico", role: "owner" };

const bonaire = {
  slug: "np7-bonaire", title: "Bonaire", description: "Flat water, steady trades.", location: "Bonaire",
  status: "published", website_visible: true, public_by_link: true,
};
const mauritius = {
  slug: "np7-mauritius-madagascar-experience", title: "Mauritius & Madagascar", description: "Not on sale.",
  location: "Mauritius", status: "published", website_visible: false, public_by_link: false,
};
const croatiaDraft = {
  slug: "np7-croatia", title: "Croatia", description: "Still being built.", location: "Croatia",
  status: "draft", website_visible: true, public_by_link: false,
};

beforeEach(() => {
  state.gateOpen = false;
  state.team = null;
  state.rows = [bonaire, mauritius, croatiaDraft];
  state.reads = [];
  state.teamLookups = 0;
  state.flags.showExperience = false;
});

describe("experience page metadata", () => {
  it("gate shut: the generic noindex title, and not a single data query", async () => {
    for (const slug of [bonaire.slug, mauritius.slug, croatiaDraft.slug, "no-such-trip"]) {
      const got = await meta(slug);
      expect(got, slug).toEqual({ title: { absolute: "NP7 Experience" }, robots: NOINDEX });
    }
    expect(state.reads).toEqual([]);
    expect(state.teamLookups).toBe(0);
  });

  it("gate open, trip switched off the website: reads as not found, noindex", async () => {
    state.gateOpen = true;
    const got = await meta(mauritius.slug);
    expect(got).toEqual({ title: { absolute: "Experience not found · NP7" }, robots: NOINDEX });
    // Nothing of the trip leaks, title or description.
    expect(JSON.stringify(got)).not.toMatch(/Mauritius|Not on sale/);
    // The public never gets a service-role read.
    expect(state.reads.filter((r) => r.startsWith("admin:"))).toEqual([]);
  });

  it("gate open, a draft or an unknown slug: not found for the public too", async () => {
    state.gateOpen = true;
    expect(await meta(croatiaDraft.slug)).toEqual({ title: { absolute: "Experience not found · NP7" }, robots: NOINDEX });
    expect(await meta("no-such-trip")).toEqual({ title: { absolute: "Experience not found · NP7" }, robots: NOINDEX });
    expect(state.reads.filter((r) => r.startsWith("admin:"))).toEqual([]);
  });

  it("gate open, a live trip: the real title and description", async () => {
    state.gateOpen = true;
    state.flags.showExperience = true;
    const got = await meta(bonaire.slug);
    expect(got).toEqual({ title: { absolute: "Bonaire · NP7 Experience" }, description: "Flat water, steady trades." });
    // A public visitor on a live trip costs no team lookup.
    expect(state.teamLookups).toBe(0);
  });

  it("a link-only trip opened while the world is hidden keeps its title but stays out of search", async () => {
    state.gateOpen = true;
    const got = await meta(bonaire.slug);
    expect(got.title).toEqual({ absolute: "Bonaire · NP7 Experience" });
    expect(got.robots).toEqual(NOINDEX);
  });

  it("the team previewing a draft gets its real title, through the service role, noindex", async () => {
    state.gateOpen = true;
    state.team = TEAM;
    const got = await meta(croatiaDraft.slug);
    expect(got).toEqual({ title: { absolute: "Croatia · NP7 Experience" }, robots: NOINDEX });
    expect(state.reads).toContain("admin:exp_experiences");
  });

  it("the team previewing an off-website trip gets its real title, noindex", async () => {
    state.gateOpen = true;
    state.team = TEAM;
    expect(await meta(mauritius.slug)).toEqual({ title: { absolute: "Mauritius & Madagascar · NP7 Experience" }, robots: NOINDEX });
  });

  it("the team on a slug that matches nothing still reads not found", async () => {
    state.gateOpen = true;
    state.team = TEAM;
    expect(await meta("no-such-trip")).toEqual({ title: { absolute: "Experience not found · NP7" }, robots: NOINDEX });
  });
});
