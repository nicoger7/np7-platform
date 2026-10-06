/**
 * The add-a-spot form, after Nico's new-rider walkthrough (6 Oct 2026).
 *
 * Three things a rider hit, pinned here:
 *   - the pin map opened on the whole world, even on the Tenerife page
 *   - the form's six levels were not the index filter's four
 *   - "your spot is in, only you can see it" was said even when it was live,
 *     and pointed at a spot the cached page had not loaded
 */
import { describe, it, expect } from "vitest";
import { SPOT_LEVELS, normalizeSpotLevels, isSpotLevel } from "@/lib/spot-levels";
import { LEVELS } from "@/lib/member-level";
import {
  areaView, countryView, startView, viewHolds, viewKey, nearbySpot,
  WORLD_VIEW, COUNTRY_VIEW_CODES, type PinView,
} from "@/lib/pin-view";
import { fitWithin, PHOTO_UPLOAD_CAP } from "@/lib/photo-shrink";
import { addedNotice, spotHref, type AddedSpot } from "@/lib/spot-add";

const inView = (v: PinView, p: { lat: number; lng: number }) => viewHolds(v, p);

describe("one level vocabulary", () => {
  it("is the member rank ladder, in order", () => {
    expect([...SPOT_LEVELS]).toEqual(["Beginner", "Intermediate", "Advanced", "Expert", "Semi-Pro", "Pro"]);
    expect(SPOT_LEVELS).toBe(LEVELS);
  });

  it("keeps every level the database already holds on spots", () => {
    // read from spots.levels on 6 Oct 2026: Expert and Semi-Pro are in use
    for (const l of ["Beginner", "Intermediate", "Advanced", "Expert", "Semi-Pro", "Pro"]) expect(isSpotLevel(l)).toBe(true);
  });

  it("still covers the four the index filter used to offer", () => {
    for (const l of ["Beginner", "Intermediate", "Advanced", "Pro"]) expect(isSpotLevel(l)).toBe(true);
  });

  it("cleans a submitted list into ladder order, once each", () => {
    expect(normalizeSpotLevels(["Pro", "Beginner", "Pro", "Advanced"])).toEqual(["Beginner", "Advanced", "Pro"]);
  });

  it("drops what is not a level, including the old 'Amateur'", () => {
    expect(normalizeSpotLevels(["Amateur", "beginner", 3, null, "Expert"])).toEqual(["Expert"]);
    expect(normalizeSpotLevels("Beginner")).toEqual([]);
    expect(normalizeSpotLevels(undefined)).toEqual([]);
  });
});

describe("the pin map opens on the destination", () => {
  // Tenerife-like: spots along the south and east coast, the admin's centre
  const tenerife = [
    { lat: 28.045, lng: -16.535 }, // El Médano
    { lat: 28.007, lng: -16.66 }, // Las Galletas
    { lat: 28.29, lng: -16.37 }, // east coast
    { lat: 28.55, lng: -16.35 }, // north east
  ];
  const centre = { lat: 28.29, lng: -16.6 };

  it("fits all of its spots", () => {
    const v = areaView(tenerife, centre);
    expect(v?.kind).toBe("bounds");
    for (const p of tenerife) expect(inView(v!, p)).toBe(true);
    expect(inView(v!, { lat: 52.52, lng: 13.4 })).toBe(false); // not Berlin
  });

  it("leaves out a spot pinned in another country by mistake", () => {
    const v = areaView([...tenerife, { lat: 54.0, lng: 10.0 }], centre)!;
    expect(v.kind).toBe("bounds");
    if (v.kind === "bounds") expect(v.north).toBeLessThan(29);
  });

  it("measures strays from the median spot when there is no centre", () => {
    const v = areaView([...tenerife, { lat: 54.0, lng: 10.0 }], null)!;
    if (v.kind === "bounds") expect(v.north).toBeLessThan(29);
    else throw new Error("expected bounds");
  });

  it("centres close on a single spot instead of zooming onto the sand", () => {
    const v = areaView([{ lat: 36.01, lng: -5.6 }], { lat: 36.01, lng: -5.6 });
    expect(v).toEqual({ kind: "centre", lat: 36.01, lng: -5.6, zoom: 12 });
  });

  it("uses the centre alone when there are no spots yet", () => {
    expect(areaView([], { lat: 12.15, lng: -68.27 })).toEqual({ kind: "centre", lat: 12.15, lng: -68.27, zoom: 11 });
  });

  it("has nothing to say with no spots and no centre", () => {
    expect(areaView([], null)).toBeNull();
    expect(areaView([{ lat: NaN, lng: 1 }, { lat: 95, lng: 0 }], undefined)).toBeNull();
  });

  it("never zooms an area in past the coastline", () => {
    const v = areaView(tenerife, centre)!;
    if (v.kind === "bounds") expect(v.maxZoom).toBeLessThanOrEqual(13);
  });
});

describe("which view wins", () => {
  const area = { points: [{ lat: 28.045, lng: -16.535 }, { lat: 28.3, lng: -16.4 }], centre: null };

  it("a destination page beats everything", () => {
    const v = startView({ area, picked: { lat: 52, lng: 5 }, country: "DE" });
    expect(inView(v, { lat: 28.1, lng: -16.5 })).toBe(true);
  });

  it("a destination picked on the index beats the visitor's country", () => {
    expect(startView({ picked: { lat: 45.87, lng: 10.87 }, country: "DE" })).toEqual({ kind: "centre", lat: 45.87, lng: 10.87, zoom: 11 });
  });

  it("a new area opens on the visitor's country", () => {
    const v = startView({ country: "DE" });
    expect(v.kind).toBe("bounds");
    expect(inView(v, { lat: 52.52, lng: 13.4 })).toBe(true);
  });

  it("falls back to the world, as before", () => {
    expect(startView({})).toEqual(WORLD_VIEW);
    expect(startView({ country: null })).toEqual(WORLD_VIEW);
    expect(startView({ country: "XX" })).toEqual(WORLD_VIEW);
    expect(startView({ area: { points: [], centre: null }, country: "" })).toEqual(WORLD_VIEW);
  });
});

describe("country boxes", () => {
  it("are well formed and never cross the date line", () => {
    for (const code of COUNTRY_VIEW_CODES) {
      const v = countryView(code)!;
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(v.kind).toBe("bounds");
      if (v.kind !== "bounds") continue;
      expect(v.south).toBeLessThan(v.north);
      expect(v.west).toBeLessThan(v.east);
      expect(Math.abs(v.south) <= 90 && Math.abs(v.north) <= 90).toBe(true);
      expect(Math.abs(v.west) <= 180 && Math.abs(v.east) <= 180).toBe(true);
    }
  });

  // Places that are in the guide, plus where riders live. A wrong box would
  // open the form on the wrong country.
  it.each([
    ["DE", 54.03, 11.55], ["DE", 54.47, 9.9], ["DE", 52.52, 13.4],
    ["IT", 45.87, 10.87], ["IT", 40.2, 18.45],
    ["ES", 36.01, -5.6], ["NL", 52.4, 5.7], ["NL", 51.76, 3.85],
    ["NO", 58.03, 7.46], ["NO", 62.55, 6.1], ["NO", 59.13, 10.22],
    ["PT", 41.69, -8.83], ["DK", 56.09, 8.24], ["DK", 55.68, 12.57],
    ["MG", -12.25, 49.35], ["PE", -13.83, -76.25], ["MU", -20.45, 57.31],
    ["US", 45.71, -121.52], ["GR", 38.63, 20.6], ["TR", 38.28, 26.37],
    ["BQ", 12.15, -68.27], ["AT", 48.21, 16.37], ["CH", 47.37, 8.54],
    ["SE", 59.33, 18.07], ["GB", 51.51, -0.13], ["FR", 48.86, 2.35],
    ["AU", -33.87, 151.21], ["ZA", -33.92, 18.42], ["PL", 54.6, 18.8],
  ])("%s holds %s, %s", (code, lat, lng) => {
    expect(inView(countryView(code)!, { lat, lng })).toBe(true);
  });

  it("reads the code whatever its case", () => {
    expect(countryView("de")).toEqual(countryView("DE"));
    expect(countryView(" nl ")).toEqual(countryView("NL"));
  });

  it("does not open a tiny country closer than its coast", () => {
    const v = countryView("BQ")!;
    if (v.kind === "bounds") expect(v.maxZoom).toBeLessThanOrEqual(10);
  });
});

describe("the map follows a new view only when the pin is not in it", () => {
  it("the world view holds any pin", () => {
    expect(viewHolds(WORLD_VIEW, { lat: -40, lng: 170 })).toBe(true);
  });
  it("a centred view holds a pin nearby, not one far away", () => {
    const v: PinView = { kind: "centre", lat: 45.87, lng: 10.87, zoom: 11 };
    expect(viewHolds(v, { lat: 45.9, lng: 10.85 })).toBe(true);
    expect(viewHolds(v, { lat: 28.05, lng: -16.53 })).toBe(false);
  });
  it("keys are stable for equal views and differ otherwise", () => {
    expect(viewKey(countryView("DE"))).toBe(viewKey(countryView("de")));
    expect(viewKey(countryView("DE"))).not.toBe(viewKey(countryView("NL")));
    expect(viewKey(null)).toBe("");
  });
});

describe("a pin on top of a spot already in the guide", () => {
  const spots = [
    { lat: 28.045, lng: -16.535, name: "El Médano", key: "el-medano" },
    { lat: 28.007, lng: -16.66, name: "Las Galletas", key: "las-galletas" },
  ];
  it("names the spot it lands on", () => {
    expect(nearbySpot(spots, { lat: 28.0455, lng: -16.5355 })?.key).toBe("el-medano");
  });
  it("stays quiet a beach away", () => {
    expect(nearbySpot(spots, { lat: 28.06, lng: -16.535 })).toBeNull(); // ~1.7 km north
  });
  it("stays quiet with no pin", () => {
    expect(nearbySpot(spots, null)).toBeNull();
  });
});

describe("photo sizing", () => {
  it("shrinks the long side to the limit and keeps the shape", () => {
    expect(fitWithin(4032, 3024, 2400)).toEqual({ w: 2400, h: 1800 });
    expect(fitWithin(3024, 4032, 2400)).toEqual({ w: 1800, h: 2400 });
  });
  it("never upscales, never returns zero", () => {
    expect(fitWithin(800, 600, 2400)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(0, 0, 2400)).toEqual({ w: 1, h: 1 });
  });
  it("stays under Vercel's request body limit", () => {
    expect(PHOTO_UPLOAD_CAP).toBeLessThan(4_500_000);
  });
});

describe("after the spot is saved", () => {
  const base: AddedSpot = { id: "u-1", slug: "el-medano-2", destSlug: "tenerife", destDraft: false, verification: "pending", photo: "none" };

  it("links to the spot itself, by slug", () => {
    expect(spotHref(base)).toBe("/spotguide/tenerife#spot-el-medano-2");
    expect(spotHref({ ...base, slug: null })).toBe("/spotguide/tenerife#spot-u-1");
  });
  it("links a rider-proposed area to its members-only page", () => {
    expect(spotHref({ ...base, destSlug: "prasonisi-ab12", destDraft: true })).toBe("/spotguide/proposed/prasonisi-ab12#spot-el-medano-2");
  });
  it("has no link without a destination", () => {
    expect(spotHref({ ...base, destSlug: null })).toBeNull();
  });

  it("a waiting spot says only you can see it", () => {
    const n = addedNotice(base);
    expect(n.title).toMatch(/is in/);
    expect(n.lines.join(" ")).toMatch(/Only you can see it/);
  });
  it("a live spot does not claim it is hidden", () => {
    const n = addedNotice({ ...base, verification: "community" });
    expect(n.title).toMatch(/live/);
    expect(n.lines.join(" ")).not.toMatch(/Only you/);
  });
  it("an auto-published spot says its words wait for a check", () => {
    expect(addedNotice({ ...base, verification: "community", wordsHeld: true }).lines.join(" ")).toMatch(/description shows once/);
  });
  it("a new area is never called live", () => {
    const n = addedNotice({ ...base, verification: "community", destDraft: true });
    expect(n.title).not.toMatch(/live/);
    expect(n.lines.join(" ")).toMatch(/new area/);
  });
  it("the photo follows the spot", () => {
    expect(addedNotice({ ...base, photo: "posted" }).lines).toContain("Your photo goes live with it.");
    expect(addedNotice({ ...base, verification: "np7", photo: "posted" }).lines).toContain("Your photo is up too.");
    expect(addedNotice({ ...base, photo: "failed" }).lines.join(" ")).toMatch(/did not upload/);
    expect(addedNotice(base).lines.join(" ")).not.toMatch(/photo/i);
  });
  it("uses no long dashes", () => {
    for (const v of ["pending", "community"]) for (const photo of ["none", "posted", "failed"] as const) for (const destDraft of [false, true]) {
      const n = addedNotice({ ...base, verification: v, photo, destDraft, wordsHeld: true });
      expect([n.title, ...n.lines].join(" ")).not.toMatch(/[–—]/);
    }
  });
});
