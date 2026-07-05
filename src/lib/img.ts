/**
 * Serve storage images through on-the-fly transform endpoints.
 *
 * Supabase Storage: rewrites to `/render/image/...` so Supabase resizes and
 * auto-negotiates WebP/AVIF -- typically 60-80% smaller, without touching
 * the originals.
 *
 * Cloudflare R2 + Cloudflare Images: appends `?width=&quality=` query params
 * directly (no path rewrite needed -- R2 serves transforms via the CDN URL).
 *
 * Pass-through (returned unchanged) for: empty values, unrecognised URLs,
 * already-transformed URLs, and SVG/GIF.
 *
 * Usage: <img src={cdnImage(url, { width: 1000 })} />
 */

const SUPA_ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets`;
const R2_CDN = (process.env.NEXT_PUBLIC_R2_CDN_URL || "").replace(/\/$/, "");

/** Supabase-assets URL -> R2 CDN URL when R2 is configured; else returns the original URL. */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return url ?? "";
  if (!R2_CDN) return url;
  return url.startsWith(SUPA_ASSET_BASE) ? R2_CDN + url.slice(SUPA_ASSET_BASE.length) : url;
}

export function cdnImage(
  url: string | null | undefined,
  opts: { width?: number; quality?: number } = {}
): string {
  if (!url) return url ?? "";
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;

  const { width = 1200, quality = 75 } = opts;

  // -- Cloudflare R2 branch --------------------------------------------------
  if (R2_CDN && url.startsWith(R2_CDN + "/")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}width=${width}&quality=${quality}`;
  }

  // -- Supabase Storage branch -----------------------------------------------
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url; // external or already a render URL
  const transformed = url.replace(marker, "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=${quality}`;
}
