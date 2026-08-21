/**
 * Serve storage images through the right transform path per provider.
 *
 * Supabase Storage: rewrites to `/render/image/...` so Supabase resizes and
 * auto-negotiates WebP/AVIF -- typically 60-80% smaller, without touching
 * the originals.
 *
 * Cloudflare R2: R2 has no native image transforms. Instead, upload routes
 * pre-generate a thumbnail at `_thumb/{key}` (400x400, resize=cover) and
 * store it alongside the original. cdnImage() serves `_thumb/{path}` for
 * small display widths (< THUMB_BREAKPOINT) and the raw original for large
 * ones. No fake `?width=` params -- those do nothing on plain R2.
 *
 * Pass-through (returned unchanged) for: empty values, unrecognised URLs,
 * already-transformed URLs, and SVG/GIF.
 *
 * Usage: <img src={cdnImage(url, { width: 1000 })} />
 */

const SUPA_ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets`;
// Both spellings accepted (NEXT_PUBLIC_* is inlined at build time either way).
const R2_CDN = (process.env.NEXT_PUBLIC_R2_CDN_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");

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
  // R2 has no on-the-fly transforms. For thumbnail-sized display use the
  // pre-generated _thumb/ variant; for full-size display serve the original.
  const THUMB_BREAKPOINT = 600;
  if (R2_CDN && url.startsWith(R2_CDN + "/")) {
    if (width < THUMB_BREAKPOINT) {
      const rel = url.slice(R2_CDN.length + 1); // strip leading slash
      if (!rel.startsWith("_thumb/")) return `${R2_CDN}/_thumb/${rel}`;
    }
    return url; // original, no fake transform params
  }

  // -- Supabase Storage branch -----------------------------------------------
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url; // external or already a render URL
  const transformed = url.replace(marker, "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  // resize=contain is load-bearing: with only ?width, Supabase CROPS the width
  // and keeps the original height — a 2048×1365 photo came back as a 200×1365
  // sliver (measured), which is what made thumbnails look "super zoomed".
  return `${transformed}${sep}width=${width}&quality=${quality}&resize=contain`;
}
