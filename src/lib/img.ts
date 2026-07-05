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
export function cdnImage(
  url: string | null | undefined,
  opts: { width?: number; quality?: number } = {}
): string {
  if (!url) return url ?? "";
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;

  const { width = 1200, quality = 75 } = opts;

  // -- Cloudflare R2 branch --------------------------------------------------
  const r2Base = (process.env.NEXT_PUBLIC_R2_CDN_URL || "").replace(/\/$/, "");
  if (r2Base && url.startsWith(r2Base + "/")) {
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
