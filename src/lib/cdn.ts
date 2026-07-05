/**
 * CDN helper — routes Supabase Storage requests through Vercel's edge CDN.
 *
 * Why: the `assets` bucket is public but has no caching layer between
 * Supabase and the browser. Every image request hits Supabase directly and
 * counts toward egress quota. By routing through /cdn/* we let Vercel's edge
 * cache the response (Supabase returns Cache-Control: max-age=3600; vercel.json
 * bumps that to 1 year for immutable assets), so Supabase sees only the first
 * request per edge region.
 *
 * Usage (relative, works on client + server within np-seven.com):
 *   cdn('logos/np7-logo.png')        → /cdn/assets/logos/np7-logo.png
 *
 * For absolute URLs (emails, PDFs, OG images):
 *   cdnAbsolute('logos/np7-logo.png') → https://np-seven.com/cdn/assets/...
 *   (requires NEXT_PUBLIC_APP_URL=https://np-seven.com in Vercel env)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export function cdn(path: string): string {
  // Strip leading slash if present so we don't double-slash
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `/cdn/assets/${clean}`;
}

export function cdnAbsolute(path: string): string {
  return `${APP_URL}${cdn(path)}`;
}
