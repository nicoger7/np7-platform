/**
 * The spotguide's first-run fixes from Nico's new-user walkthrough (6 Oct 2026):
 *
 *   · one level vocabulary: the index filter offered four levels while the
 *     add-a-spot form offered six, so an "Expert" spot matched no pill
 *   · a welcome right after sign-up, once, for genuinely new accounts
 *   · "Be the first to rate" on ONE row instead of "No member ratings yet" on all
 *   · real photos before satellite tiles on destination cards, never an
 *     unreviewed member upload
 *   · "Add your home spot" on the member home, for riders without a booking,
 *     skippable
 *   · the welcome strip opens the add form by asking it, never by pressing
 *     whatever button the form shows first
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LEVELS } from "@/lib/member-level";
import {
  SPOT_LEVELS, destinationFitsLevel, levelFilterOptions, spotLevelIndex, isSpotLevel, normalizeSpotLevels,
} from "@/lib/spot-levels";
import {
  isFreshAccount, welcomeHeadline, welcomeSeenKey, firstUnratedSpotId,
  isSatelliteImage, pickRealPhoto, blogCoverFor, FRESH_ACCOUNT_HOURS,
  showHomeSpotStep, ADD_SPOT_ANCHOR, ADD_SPOT_OPEN_EVENT,
} from "@/lib/spotguide-nudge";
import { openAddSpotForm, onAddSpotOpenRequest } from "@/components/spotguide/add-spot-open";
import { satImage } from "@/lib/satellite";

describe("one level list for the form and the filter", () => {
  it("is the six-rung ladder the add-a-spot form's LevelPicker offers", () => {
    // level-picker.tsx renders LEVELS from member-level; the filter must match it
    expect([...SPOT_LEVELS]).toEqual([...LEVELS]);
    expect(SPOT_LEVELS).toBe(LEVELS);
    expect([...SPOT_LEVELS]).toEqual(["Beginner", "Intermediate", "Advanced", "Expert", "Semi-Pro", "Pro"]);
  });

  it("is also where the add form's checks live, so the form and the filter share one module", () => {
    expect(isSpotLevel("Semi-Pro")).toBe(true);
    expect(isSpotLevel("Shredder")).toBe(false);
    expect(isSpotLevel(3)).toBe(false);
    // known levels only, each once, ladder order
    expect(normalizeSpotLevels(["Pro", "Beginner", "Kook", "Pro", 7])).toEqual(["Beginner", "Pro"]);
    expect(normalizeSpotLevels("Pro")).toEqual([]);
  });

  it("offers Expert and Semi-Pro as filter pills when a destination's range covers them", () => {
    const opts = levelFilterOptions([{ level_min: "Advanced", level_max: "Pro" }]);
    expect(opts).toEqual(["Advanced", "Expert", "Semi-Pro", "Pro"]);
  });

  it("leaves out levels no destination fits", () => {
    expect(levelFilterOptions([{ level_min: "Beginner", level_max: "Intermediate" }])).toEqual(["Beginner", "Intermediate"]);
  });

  it("treats a missing or unknown end as open, so ungraded places never vanish", () => {
    expect(destinationFitsLevel({ level_min: null, level_max: null }, "Semi-Pro")).toBe(true);
    expect(destinationFitsLevel({ level_min: "Expert", level_max: null }, "Pro")).toBe(true);
    expect(destinationFitsLevel({ level_min: "Expert", level_max: null }, "Advanced")).toBe(false);
    expect(destinationFitsLevel({ level_min: "Kook", level_max: "Intermediate" }, "Beginner")).toBe(true);
  });

  it("filters nothing on a level it does not know", () => {
    expect(destinationFitsLevel({ level_min: "Pro", level_max: "Pro" }, "Shredder")).toBe(true);
    expect(spotLevelIndex("Shredder")).toBe(-1);
  });

  it("the index browser reads the shared list, not a hand-kept one", () => {
    const src = readFileSync("src/components/spotguide/spotguide-browser.tsx", "utf8");
    expect(src).toContain('from "@/lib/spot-levels"');
    expect(src).not.toMatch(/\["Beginner",\s*"Intermediate",\s*"Advanced",\s*"Pro"\]/);
  });
});

describe("the welcome after sign-up", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");

  it("greets an account made minutes ago, or within a slow-inbox day", () => {
    expect(isFreshAccount("2026-10-06T11:52:00Z", now)).toBe(true);
    expect(isFreshAccount("2026-10-05T13:00:00Z", now)).toBe(true);
  });

  it("does not greet a long-standing member as new", () => {
    expect(isFreshAccount("2026-10-05T11:00:00Z", now)).toBe(false);
    expect(isFreshAccount("2025-06-01T09:00:00Z", now)).toBe(false);
    expect(FRESH_ACCOUNT_HOURS).toBe(24);
  });

  it("tolerates a little clock skew but not a date from the future", () => {
    expect(isFreshAccount("2026-10-06T12:03:00Z", now)).toBe(true);
    expect(isFreshAccount("2026-10-07T12:00:00Z", now)).toBe(false);
  });

  it("says no when it cannot tell", () => {
    expect(isFreshAccount(null, now)).toBe(false);
    expect(isFreshAccount(undefined, now)).toBe(false);
    expect(isFreshAccount("not a date", now)).toBe(false);
  });

  it("uses the first name, and never leaves a stray comma", () => {
    expect(welcomeHeadline("Nico")).toBe("You're in, Nico.");
    expect(welcomeHeadline("  Anna Maria Lopez ")).toBe("You're in, Anna.");
    expect(welcomeHeadline("")).toBe("You're in.");
    expect(welcomeHeadline(null)).toBe("You're in.");
  });

  it("remembers per member, so a shared laptop still greets the second rider", () => {
    expect(welcomeSeenKey("a")).not.toBe(welcomeSeenKey("b"));
  });

  it("carries no long dashes in what a rider reads", () => {
    const strip = readFileSync("src/components/spotguide/welcome-strip.tsx", "utf8");
    const visible = strip.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
    expect(visible).not.toMatch(/[–—]/);
    expect(welcomeHeadline("Nico")).not.toMatch(/[–—]/);
  });
});

describe("Be the first to rate", () => {
  const spot = (id: string, count = 0, extra: Record<string, boolean> = {}) => ({ id, member: { count }, ...extra });

  it("goes on the first spot nobody has rated", () => {
    expect(firstUnratedSpotId([spot("a", 3), spot("b"), spot("c")], () => false)).toBe("b");
  });

  it("moves on once this member has rated that one", () => {
    expect(firstUnratedSpotId([spot("a"), spot("b")], (id) => id === "a")).toBe("b");
  });

  it("skips spots still under review", () => {
    expect(firstUnratedSpotId([spot("a", 0, { ownPending: true }), spot("b", 0, { teamPending: true }), spot("c")], () => false)).toBe("c");
  });

  it("is nowhere once every spot has a rating", () => {
    expect(firstUnratedSpotId([spot("a", 1), spot("b", 2)], () => false)).toBeNull();
    expect(firstUnratedSpotId([], () => false)).toBeNull();
  });

  it("the grey 'No member ratings yet' is gone from the spotguide", () => {
    const dir = "src/components/spotguide";
    // rendered text only (between tags); the WHY comments may still name it
    const hits = readdirSync(dir).filter((f) => />\s*No member ratings yet\s*</.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("card photos before satellite tiles", () => {
  it("knows a satellite tile, cached or raw", () => {
    expect(isSatelliteImage(satImage(28.05, -16.54))).toBe(true);
    expect(isSatelliteImage("https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=1")).toBe(true);
    expect(isSatelliteImage("https://media.np-seven.com/spots/tenerife.jpg")).toBe(false);
    expect(isSatelliteImage(null)).toBe(false);
  });

  it("prefers the destination's own gallery, then spot galleries, NP7 spot photos, a magazine cover", () => {
    expect(pickRealPhoto({ gallery: ["g.jpg"], spotGalleries: [["s.jpg"]], spotPhotos: ["p.jpg"], blogCover: "b.jpg" })).toBe("g.jpg");
    expect(pickRealPhoto({ gallery: [], spotGalleries: [null, ["s.jpg"]], spotPhotos: ["p.jpg"], blogCover: "b.jpg" })).toBe("s.jpg");
    expect(pickRealPhoto({ spotPhotos: ["p.jpg"], blogCover: "b.jpg" })).toBe("p.jpg");
    expect(pickRealPhoto({ blogCover: "b.jpg" })).toBe("b.jpg");
  });

  it("never picks a blank or another satellite tile", () => {
    expect(pickRealPhoto({ gallery: ["", "  ", "/api/sat?lat=1&lng=2"], spotPhotos: [null] })).toBeNull();
    expect(pickRealPhoto({})).toBeNull();
  });

  it("takes a magazine cover only from a post whose title names the place", () => {
    const posts = [
      { title: "Gear test: new fins", cover_image: "fins.jpg" },
      { title: "Ten days in TENERIFE", cover_image: null },
      { title: "Tenerife, the south coast", cover_image: "tf.jpg" },
    ];
    expect(blogCoverFor("Tenerife", posts)).toBe("tf.jpg");
    expect(blogCoverFor("Fehmarn", posts)).toBeNull();
    expect(blogCoverFor("Ria", [{ title: "Riad stays in Morocco", cover_image: "x.jpg" }])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* withRealCardPhotos against a fake Supabase                          */
/* ------------------------------------------------------------------ */

const tables: Record<string, unknown[] | null> = {};
let failFrom = false;
vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (failFrom) throw new Error("db down");
      // eq() filters for real on the columns a fake row carries, so a test can
      // tell which rows the query lets through; everything else passes all.
      const eqs: [string, unknown][] = [];
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "not", "or", "limit"]) b[m] = () => b;
      b.eq = (col: string, v: unknown) => { eqs.push([col, v]); return b; };
      b.then = (res: (v: { data: unknown[] | null }) => unknown) => res({
        data: ((tables[table] ?? []) as Record<string, unknown>[])
          .filter((r) => eqs.every(([c, v]) => !(c in r) || r[c] === v)),
      });
      return b;
    },
  }),
}));

describe("withRealCardPhotos", () => {
  beforeEach(() => {
    failFrom = false;
    for (const k of Object.keys(tables)) delete tables[k];
  });

  const sat = satImage(28.05, -16.54);

  it("swaps a satellite card for a real photo and leaves photo cards alone", async () => {
    const { withRealCardPhotos } = await import("@/lib/spotguide-card-photos");
    tables.destinations = [{ id: "tf", gallery: [] }];
    tables.spots = [{ id: "s1", destination_id: "tf", gallery: [] }];
    tables.spot_photos = [{ spot_id: "s1", url: "np7.jpg", source: "np7", status: "approved" }];
    const out = await withRealCardPhotos([
      { id: "tf", name: "Tenerife", image: sat },
      { id: "bon", name: "Bonaire", image: "bonaire.jpg" },
    ]);
    expect(out.map((c) => c.image)).toEqual(["np7.jpg", "bonaire.jpg"]);
  });

  it("never makes an unreviewed member upload the face of a destination", async () => {
    // the photo route stores every member upload as 'approved' straight away
    const { withRealCardPhotos } = await import("@/lib/spotguide-card-photos");
    tables.spots = [{ id: "s1", destination_id: "tf", gallery: [] }];
    tables.spot_photos = [{ spot_id: "s1", url: "anyone.jpg", source: "member", status: "approved" }];
    expect((await withRealCardPhotos([{ id: "tf", name: "Tenerife", image: sat }]))[0].image).toBe(sat);
    // a magazine cover still beats the satellite tile
    tables.exp_blog_posts = [{ title: "Tenerife in winter", cover_image: "cover.jpg" }];
    expect((await withRealCardPhotos([{ id: "tf", name: "Tenerife", image: sat }]))[0].image).toBe("cover.jpg");
  });

  it("says so in the query, not only in a comment", () => {
    const src = readFileSync("src/lib/spotguide-card-photos.ts", "utf8");
    expect(src).toMatch(/from\("spot_photos"\)[\s\S]*?\.eq\("source", "np7"\)/);
  });

  it("keeps the satellite tile when we hold no photo of the place", async () => {
    const { withRealCardPhotos } = await import("@/lib/spotguide-card-photos");
    tables.exp_blog_posts = [{ title: "Somewhere else entirely", cover_image: "x.jpg" }];
    const out = await withRealCardPhotos([{ id: "tf", name: "Tenerife", image: sat }]);
    expect(out[0].image).toBe(sat);
  });

  it("falls back to a magazine cover named after the place", async () => {
    const { withRealCardPhotos } = await import("@/lib/spotguide-card-photos");
    tables.exp_blog_posts = [{ title: "Tenerife in winter", cover_image: "cover.jpg" }];
    const out = await withRealCardPhotos([{ id: "tf", name: "Tenerife", image: sat }]);
    expect(out[0].image).toBe("cover.jpg");
  });

  it("returns the cards untouched when the database is unreachable", async () => {
    const { withRealCardPhotos } = await import("@/lib/spotguide-card-photos");
    failFrom = true;
    const cards = [{ id: "tf", name: "Tenerife", image: sat }];
    expect(await withRealCardPhotos(cards)).toEqual(cards);
  });
});

/* ------------------------------------------------------------------ */
/* "Add your home spot" on the member home                             */
/* ------------------------------------------------------------------ */

describe("the home spot step", () => {
  const base = { spotguideLive: true, bookingCount: 0, skipped: false };

  it("is there for a rider without a booking, who joined for the guide", () => {
    expect(showHomeSpotStep(base)).toBe(true);
  });

  it("never brings the setup strip back for a trip guest", () => {
    expect(showHomeSpotStep({ ...base, bookingCount: 1 })).toBe(false);
  });

  it("is gone after one Not now", () => {
    expect(showHomeSpotStep({ ...base, skipped: true })).toBe(false);
  });

  it("is not there while the spotguide is hidden, since it links into it", () => {
    expect(showHomeSpotStep({ ...base, spotguideLive: false })).toBe(false);
  });

  it("the member home wires the skip cookie the step reads", () => {
    const page = readFileSync("src/app/account/page.tsx", "utf8");
    expect(page).toContain("SPOT_STEP_SKIP_COOKIE");
    expect(page).toMatch(/skipCookie: SPOT_STEP_SKIP_COOKIE/);
    const strip = readFileSync("src/components/portal/setup-progress.tsx", "utf8");
    expect(strip).toContain("s.skipCookie");
  });
});

/* ------------------------------------------------------------------ */
/* Opening the add form from outside                                   */
/* ------------------------------------------------------------------ */

describe("opening the add form from the welcome strip", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, raf: g.requestAnimationFrame };
  let target: EventTarget;
  let clicked: number;
  let scrolled: number;

  beforeEach(() => {
    target = new EventTarget();
    clicked = 0;
    scrolled = 0;
    // a form box whose first button is "Open my spot", as after a submit
    const firstButton = { click: () => { clicked++; } };
    const root = {
      querySelector: () => firstButton,
      scrollIntoView: () => { scrolled++; },
    };
    g.window = target;
    g.document = { getElementById: (id: string) => (id === ADD_SPOT_ANCHOR ? root : null) };
    g.requestAnimationFrame = (cb: () => void) => { cb(); return 1; };
    return () => { g.window = saved.window; g.document = saved.document; g.requestAnimationFrame = saved.raf; };
  });

  it("asks the form to open and presses nothing", () => {
    let asked = 0;
    const off = onAddSpotOpenRequest(() => { asked++; });
    expect(openAddSpotForm()).toBe(true);
    expect(asked).toBe(1);
    expect(clicked).toBe(0);
    expect(scrolled).toBe(1);
    off();
    openAddSpotForm();
    expect(asked).toBe(1);
  });

  it("returns false on a page without the form, so the caller can go to one", () => {
    g.document = { getElementById: () => null };
    let asked = 0;
    const off = onAddSpotOpenRequest(() => { asked++; });
    expect(openAddSpotForm()).toBe(false);
    expect(asked).toBe(0);
    off();
  });

  it("uses one event name on both sides", () => {
    let heard = 0;
    target.addEventListener(ADD_SPOT_OPEN_EVENT, () => { heard++; });
    openAddSpotForm();
    expect(heard).toBe(1);
  });

  it("the form listens, and nothing simulates a click on it any more", () => {
    const form = readFileSync("src/components/spotguide/add-spot.tsx", "utf8");
    expect(form).toContain("useAddSpotOpenRequest(");
    for (const f of ["src/components/spotguide/welcome-strip.tsx", "src/components/spotguide/spotguide-provider.tsx", "src/components/spotguide/add-spot-open.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/\.click\(\)/);
    }
  });
});
