/**
 * Keyless satellite imagery (Esri World Imagery export) — a real overhead view of
 * a place, used as a photo fallback for a destination / spot / trip that has no
 * picture yet. Pure function (no server deps) so client + server can both import it.
 */
export function satelliteHero(lat: number, lng: number, opts?: { dLat?: number; w?: number; h?: number }): string {
  const dLat = opts?.dLat ?? 0.06;
  const w = opts?.w ?? 1600, h = opts?.h ?? 700;
  const dLon = dLat * (w / h); // keep the bbox aspect matched to the image
  const bbox = `${lng - dLon},${lat - dLat},${lng + dLon},${lat + dLat}`;
  return `https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=${w},${h}&format=jpg&f=image`;
}

/** UI-facing satellite URL: goes through our cache (/api/sat) so it's generated
    once and then served from our CDN. Use this everywhere in the app — never the
    raw Esri URL (that's only for the cache route to fetch). */
export function satImage(lat: number, lng: number, opts?: { dLat?: number; w?: number; h?: number }): string {
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts?.w) p.set("w", String(opts.w));
  if (opts?.h) p.set("h", String(opts.h));
  if (opts?.dLat) p.set("d", String(opts.dLat));
  return `/api/sat?${p.toString()}`;
}
