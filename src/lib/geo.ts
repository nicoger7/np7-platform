/**
 * Distance between two points on the planet.
 *
 * Haversine, on the mean Earth radius. Checked against a WGS84 inverse over
 * every same-destination pair in the spotguide: the worst disagreement on
 * sub-kilometre pairs is 0.3%, which is 76 cm at the 250 m duplicate threshold.
 * Nothing here needs an ellipsoid.
 */

export type LatLng = { lat: number; lng: number };

/** IUGG mean radius, metres. */
const R = 6_371_008.8;

export function haversineM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Kilometres, for anything user-facing. */
export const haversineKm = (a: LatLng, b: LatLng): number => haversineM(a, b) / 1000;
