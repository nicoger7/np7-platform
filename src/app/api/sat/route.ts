import { NextRequest, after } from "next/server";
import { satelliteHero } from "@/lib/satellite";
import { r2Enabled, r2CdnBase, r2Has, uploadToR2 } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Cached satellite imagery. `satImage(lat,lng)` points here; we generate the Esri
 * export ONCE, store it in R2, and serve every later hit straight from our CDN —
 * so visitors get an instant image and Esri is hit once per location, not once per
 * visitor. Falls straight through to Esri when R2 isn't configured.
 *
 * GET /api/sat?lat=&lng=&w=&h=&d=   (d = latitude half-span in degrees)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  const w = Math.min(2000, Math.max(200, Number(sp.get("w")) || 1600));
  const h = Math.min(2000, Math.max(200, Number(sp.get("h")) || 700));
  const dLat = Math.min(1, Math.max(0.005, Number(sp.get("d")) || 0.06));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return new Response("bad coords", { status: 400 });

  const esri = satelliteHero(lat, lng, { w, h, dLat });
  const cdn = r2CdnBase();

  // No R2 → just hand back Esri directly (still works, just uncached).
  if (!r2Enabled() || !cdn) return Response.redirect(esri, 302);

  const key = `_sat/${w}x${h}/${lat.toFixed(4)}_${lng.toFixed(4)}_${dLat}.jpg`;
  const cachedUrl = `${cdn}/${key}`;

  // Already cached → redirect to the CDN (browsers cache the redirect for a week).
  if (await r2Has(key)) {
    return new Response(null, { status: 302, headers: { Location: cachedUrl, "Cache-Control": "public, max-age=604800" } });
  }

  // First hit for this location: fetch Esri, stream it back now, cache in R2 after.
  try {
    const res = await fetch(esri, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return Response.redirect(esri, 302);
    const buf = Buffer.from(await res.arrayBuffer());
    after(async () => { try { await uploadToR2(buf, key, "image/jpeg"); } catch { /* it'll retry next miss */ } });
    return new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } });
  } catch {
    return Response.redirect(esri, 302);
  }
}
