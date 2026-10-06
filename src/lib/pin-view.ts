import { haversineKm, haversineM, type LatLng } from "@/lib/geo";

/**
 * Where the add-a-spot map opens (Nico, 6 Oct 2026).
 *
 * It opened on the whole world, on every page. A rider on the Tenerife page who
 * wanted to add a beach had to zoom across the planet to find the island they
 * were already reading about, and that was the biggest reason spots did not get
 * added. Now the map starts where the rider already is:
 *
 *   destination page   the area's spots (or its centre)
 *   index, area picked that destination
 *   index, new area    the country the visitor browses from (GET /api/geo)
 *   nothing known      the world, as before
 *
 * Pure, so the rules are tested without a map.
 */

export type { LatLng };
/** A spot already in the guide, drawn faint on the map. `key` is its anchor (slug or id). */
export type PinPoint = LatLng & { name?: string; key?: string };

export type PinView =
  | { kind: "bounds"; south: number; west: number; north: number; east: number; maxZoom: number }
  | { kind: "centre"; lat: number; lng: number; zoom: number };

export const WORLD_VIEW: PinView = { kind: "centre", lat: 30, lng: 0, zoom: 2 };

/** One spot alone: close enough to see the beaches either side of it. */
const SINGLE_ZOOM = 12;
/** Only the destination's centre is known: the town and its coast. */
const CENTRE_ZOOM = 11;
/** Never zoom an area in further than this; past it the rider loses the coastline. */
const AREA_MAX_ZOOM = 13;
/** A country never opens closer than this (Bonaire, Malta), so the coast still reads. */
const COUNTRY_MAX_ZOOM = 10;
/**
 * A spot pinned further than this from its area is a mistake, not part of the
 * area (the guide's widest area, Fuerteventura, spans 43 km from its centre).
 * Fitting the map around it would zoom out to a continent and undo the point.
 */
const OUTLIER_KM = 150;

const valid = (p: Partial<LatLng> | null | undefined): p is LatLng =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat as number) <= 90 && Math.abs(p.lng as number) <= 180;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Frame a destination: its spots, with any stray far-off pin left out, plus
 * its centre. null when there is nothing to frame.
 */
export function areaView(points: Partial<LatLng>[], centre?: Partial<LatLng> | null): PinView | null {
  const pts = points.filter(valid);
  const c = valid(centre) ? centre : null;
  if (!pts.length) return c ? { kind: "centre", lat: c.lat, lng: c.lng, zoom: CENTRE_ZOOM } : null;

  // Measure strays from the centre the admin set; without one, from the
  // median spot, which a single bad pin cannot drag the way a mean would.
  const anchor = c ?? { lat: median(pts.map((p) => p.lat)), lng: median(pts.map((p) => p.lng)) };
  const kept = pts.filter((p) => haversineKm(anchor, p) <= OUTLIER_KM);
  if (!kept.length) return { kind: "centre", lat: anchor.lat, lng: anchor.lng, zoom: CENTRE_ZOOM };
  if (c) kept.push(c);

  const lats = kept.map((p) => p.lat), lngs = kept.map((p) => p.lng);
  const south = Math.min(...lats), north = Math.max(...lats);
  const west = Math.min(...lngs), east = Math.max(...lngs);
  // One spot (or several on one beach): fitting a box that small would zoom
  // to the sand. Centre on it instead.
  if (north - south < 0.01 && east - west < 0.01) {
    return { kind: "centre", lat: (south + north) / 2, lng: (west + east) / 2, zoom: SINGLE_ZOOM };
  }
  return { kind: "bounds", south, west, north, east, maxZoom: AREA_MAX_ZOOM };
}

/**
 * Rough boxes [south, west, north, east] for the countries NP7's riders browse
 * from and ride in. Mainland only where a country has far-flung territory
 * (France without its overseas regions, the US without Alaska and Hawaii,
 * Spain without the Canaries), because a box around all of it is nearly the
 * world view again, and most people live on the mainland. A country that is
 * not listed falls back to the world view, which is what everyone had before.
 */
const COUNTRY_BOXES: Record<string, readonly [number, number, number, number]> = {
  // Europe
  AD: [42.43, 1.41, 42.66, 1.79], AL: [39.64, 19.27, 42.66, 21.06], AT: [46.37, 9.53, 49.02, 17.16],
  BA: [42.56, 15.73, 45.28, 19.62], BE: [49.5, 2.54, 51.51, 6.41], BG: [41.24, 22.36, 44.22, 28.61],
  CH: [45.82, 5.96, 47.81, 10.49], CY: [34.57, 32.26, 35.71, 34.6], CZ: [48.55, 12.09, 51.06, 18.86],
  DE: [47.27, 5.87, 55.06, 15.04], DK: [54.56, 8.07, 57.75, 15.2], EE: [57.51, 21.76, 59.68, 28.21],
  ES: [35.95, -9.39, 43.79, 4.33], FI: [59.81, 20.55, 70.09, 31.59], FR: [41.33, -5.14, 51.09, 9.56],
  GB: [49.96, -8.65, 60.86, 1.77], GR: [34.8, 19.37, 41.75, 29.65], HR: [42.39, 13.49, 46.56, 19.45],
  HU: [45.74, 16.11, 48.59, 22.9], IE: [51.42, -10.48, 55.39, -5.99], IS: [63.3, -24.55, 66.57, -13.5],
  IT: [36.62, 6.63, 47.09, 18.52], LI: [47.05, 9.47, 47.27, 9.64], LT: [53.9, 20.94, 56.45, 26.84],
  LU: [49.45, 5.73, 50.18, 6.53], LV: [55.67, 20.97, 58.08, 28.24], MC: [43.72, 7.41, 43.75, 7.44],
  ME: [41.85, 18.43, 43.56, 20.36], MK: [40.85, 20.45, 42.37, 23.03], MT: [35.79, 14.18, 36.08, 14.58],
  NL: [50.75, 3.36, 53.56, 7.23], NO: [57.9, 4.65, 71.19, 31.08], PL: [49.0, 14.12, 54.84, 24.15],
  PT: [36.96, -9.53, 42.15, -6.19], RO: [43.62, 20.26, 48.27, 29.69], RS: [42.23, 18.82, 46.19, 23.01],
  SE: [55.34, 11.03, 69.06, 24.17], SI: [45.42, 13.38, 46.88, 16.61], SK: [47.73, 16.83, 49.61, 22.57],
  TR: [35.81, 25.66, 42.11, 44.82], UA: [44.39, 22.14, 52.38, 40.23],
  // Africa and the Middle East
  AE: [22.63, 51.58, 26.08, 56.38], CV: [14.8, -25.36, 17.21, -22.66], EG: [22.0, 24.7, 31.67, 36.9],
  IL: [29.5, 34.27, 33.33, 35.9], KE: [-4.68, 33.91, 5.03, 41.91], MA: [27.66, -13.17, 35.92, -0.99],
  MG: [-25.61, 43.22, -11.95, 50.48], MU: [-20.53, 57.28, -19.98, 57.81], OM: [16.65, 52.0, 26.39, 59.84],
  QA: [24.48, 50.75, 26.15, 51.64], RE: [-21.39, 55.21, -20.87, 55.84], SN: [12.3, -17.54, 16.69, -11.36],
  TN: [30.23, 7.52, 37.35, 11.6], TZ: [-11.75, 29.33, -0.99, 40.44], ZA: [-34.84, 16.45, -22.13, 32.89],
  // The Americas
  AR: [-55.06, -73.56, -21.78, -53.64], AW: [12.41, -70.06, 12.63, -69.87], BQ: [12.02, -68.42, 12.31, -68.19],
  BR: [-33.75, -73.99, 5.27, -34.79], CA: [41.68, -141.0, 70.0, -52.62], CL: [-55.98, -75.64, -17.5, -66.42],
  CO: [-4.23, -79.0, 12.46, -66.87], CR: [8.03, -85.95, 11.22, -82.55], CW: [12.03, -69.17, 12.39, -68.73],
  DO: [17.47, -72.0, 19.93, -68.32], MX: [14.53, -118.4, 32.72, -86.7], PE: [-18.35, -81.33, -0.04, -68.65],
  US: [24.52, -124.77, 49.38, -66.95], UY: [-34.95, -58.44, -30.08, -53.07], VE: [0.65, -73.35, 12.2, -59.8],
  // Asia and Oceania
  AU: [-43.64, 113.34, -10.67, 153.57], CN: [18.2, 73.5, 53.56, 134.77], HK: [22.15, 113.83, 22.56, 114.41],
  ID: [-10.36, 95.29, 5.48, 141.03], IN: [6.75, 68.18, 35.5, 97.4], JP: [30.97, 129.4, 45.55, 145.82],
  KR: [33.11, 124.61, 38.61, 130.93], LK: [5.92, 79.65, 9.84, 81.88], NZ: [-47.29, 166.43, -34.39, 178.55],
  PH: [4.59, 116.93, 21.12, 126.6], SG: [1.16, 103.6, 1.47, 104.09], TH: [5.61, 97.34, 20.46, 105.64],
  VN: [8.56, 102.14, 23.39, 109.46],
};

/** The codes with a box, for the tests. */
export const COUNTRY_VIEW_CODES = Object.keys(COUNTRY_BOXES);

/** The visitor's country (two-letter code from /api/geo) as a map view, or null. */
export function countryView(code: string | null | undefined): PinView | null {
  const box = code ? COUNTRY_BOXES[code.trim().toUpperCase()] : undefined;
  if (!box) return null;
  const [south, west, north, east] = box;
  return { kind: "bounds", south, west, north, east, maxZoom: COUNTRY_MAX_ZOOM };
}

/**
 * The one decision the form makes. A fixed destination (its page) wins, then
 * the destination picked on the index, then the visitor's country, then the
 * world.
 */
export function startView(opts: {
  area?: { points: Partial<LatLng>[]; centre?: Partial<LatLng> | null } | null;
  picked?: Partial<LatLng> | null;
  country?: string | null;
}): PinView {
  if (opts.area) {
    const v = areaView(opts.area.points, opts.area.centre);
    if (v) return v;
  }
  if (opts.picked) {
    const v = areaView([], opts.picked);
    if (v) return v;
  }
  return countryView(opts.country) ?? WORLD_VIEW;
}

/**
 * Does this view already show the pin? Moving the map away from a pin the
 * rider just dropped would hide their work, so the map only follows a new view
 * (a different destination picked) when the pin is not in it.
 */
export function viewHolds(view: PinView, p: LatLng): boolean {
  if (view.kind === "bounds") return p.lat >= view.south && p.lat <= view.north && p.lng >= view.west && p.lng <= view.east;
  if (view.zoom <= 3) return true; // the world view holds everything
  return haversineKm(view, p) <= 30;
}

/** A stable string for a view, so a component can tell when it really changed. */
export function viewKey(view: PinView | null | undefined): string {
  if (!view) return "";
  return view.kind === "bounds"
    ? `b:${view.south},${view.west},${view.north},${view.east},${view.maxZoom}`
    : `c:${view.lat},${view.lng},${view.zoom}`;
}

/**
 * The spot already in the guide that a new pin lands on, if any. 250 m is the
 * guide's own duplicate distance (lib/geo.ts); inside it, the rider is most
 * likely adding a spot that exists, and is better pointed to it.
 */
export function nearbySpot<T extends PinPoint>(points: T[], pin: LatLng | null, withinM = 250): T | null {
  if (!pin) return null;
  let best: T | null = null, bestM = withinM;
  for (const p of points) {
    if (!valid(p)) continue;
    const m = haversineM(pin, p);
    if (m <= bestM) { best = p; bestM = m; }
  }
  return best;
}
