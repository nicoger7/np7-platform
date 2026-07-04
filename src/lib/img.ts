/**
 * Central image-URL helper. Two backends, chosen by env at runtime:
 *
 *  • Supabase (default): rewrites public Storage URLs to the on-the-fly transform
 *    endpoint (`/render/image/...`) for a resized WebP/AVIF.
 *  • Cloudflare R2 (when NEXT_PUBLIC_R2_PUBLIC_URL is set): serves from R2's
 *    zero-egress CDN. Small widths use a pre-generated `_thumb/` variant; larger
 *    ones serve the (already ≤2560px) main file.
 *
 * With R2 unset this behaves EXACTLY as before, so it's safe to ship ahead of the
 * migration. NEXT_PUBLIC_* so it works in client components too.
 */

const SUPA_ASSET_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets`;
const R2_PUBLIC = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");

export const r2Enabled = (): boolean => !!R2_PUBLIC;

/** Supabase-assets URL → R2 public URL when R2 is on; else unchanged. */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return url ?? "";
  if (!R2_PUBLIC) return url;
  return url.startsWith(SUPA_ASSET_BASE) ? R2_PUBLIC + url.slice(SUPA_ASSET_BASE.length) : url;
}

/** The path inside the assets bucket (e.g. "memories/x/foo.jpg"), or null if external. */
function relPath(url: string): string | null {
  if (url.startsWith(SUPA_ASSET_BASE)) return url.slice(SUPA_ASSET_BASE.length + 1);
  if (R2_PUBLIC && url.startsWith(R2_PUBLIC)) return url.slice(R2_PUBLIC.length + 1);
  return null;
}

/**
 * Resized image URL. Usage: <img src={cdnImage(url, { width: 500 })} />.
 * Pass-through for empty/external values and (on Supabase) SVG/GIF.
 */
export function cdnImage(url: string | null | undefined, opts: { width?: number; quality?: number } = {}): string {
  if (!url) return url ?? "";
  const { width = 1200, quality = 75 } = opts;

  if (R2_PUBLIC) {
    const rel = relPath(url);
    if (!rel) return url; // external / already absolute non-asset
    if (/\.(svg|gif)$/i.test(rel)) return `${R2_PUBLIC}/${rel}`;
    // Small requests get the pre-generated thumbnail; bigger ones the main file.
    return width <= 800 ? `${R2_PUBLIC}/_thumb/${rel}` : `${R2_PUBLIC}/${rel}`;
  }

  // Supabase transform endpoint (default).
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;
  const transformed = url.replace(marker, "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${width}&quality=${quality}`;
}
