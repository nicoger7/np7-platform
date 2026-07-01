/**
 * Serve Supabase Storage images through the on-the-fly image transform endpoint
 * (`/render/image/...`) instead of shipping the full-size original. Supabase
 * resizes to the requested width and auto-negotiates WebP/AVIF from the
 * browser's Accept header — typically 60–80% smaller, and it works on files
 * ALREADY in storage without touching the originals.
 *
 * Pass-through (returned unchanged) for: empty values, non-Supabase URLs
 * (e.g. external/squarespace), already-transformed URLs, and SVG/GIF (which
 * shouldn't be rasterised).
 *
 * Usage: <img src={cdnImage(url, { width: 1000 })} />
 */
export function cdnImage(
  url: string | null | undefined,
  opts: { width?: number; quality?: number } = {}
): string {
  if (!url) return url ?? "";
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url; // external or already a render URL
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;
  const { width = 1200, quality = 75 } = opts;
  const transformed = url.replace(marker, "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=${quality}`;
}
