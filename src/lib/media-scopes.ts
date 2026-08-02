/**
 * Storage roots that belong to one admin section and must not leak into the
 * shared media library.
 *
 * The `assets` bucket is one flat namespace shared by every world, and
 * `/api/admin/images` walks the whole tree — `image-picker-modal` opens on that
 * recursive view by default. So without a filter, a photo of a mold ends up in
 * the picker you use to choose a hero image for a trip page.
 *
 * The filter is UNCONDITIONAL — it applies to Owner too. The requirement is
 * discoverability ("not to be found in files of experience"), and the person
 * most affected is the Owner, who would otherwise see every R&D photo in every
 * Experience picker. A scoped root is simply not part of the shared API's
 * universe; access to it lives on that section's own route.
 *
 * ⚠ This is discoverability, NOT access control. The bucket is public and there
 * are four unauthenticated URL paths to any object in it (Supabase object,
 * Supabase render, media.np-seven.com, and /cdn/assets/… which is rewritten
 * outside the middleware matcher). Real protection needs a private bucket.
 */

export type ScopedRoot = {
  /** First path segment that is reserved. */
  root: string;
  /** The SECTIONS key whose own API may read and write it. */
  section: string;
  label: string;
};

export const SCOPED_ROOTS: ScopedRoot[] = [
  { root: "product-dev", section: "pd_library", label: "Product Development" },
];

/**
 * First path segment only.
 *
 * Exact segment matching is load-bearing: a `startsWith("product-dev")` would
 * also swallow a future `product-development/` or `product-dev-archive/`
 * folder, hiding it from everyone with no way to tell why.
 */
function firstSegment(p: string): string {
  return p.replace(/^\/+/, "").split("/")[0] ?? "";
}

export function scopedRootFor(p: string): ScopedRoot | undefined {
  const seg = firstSegment(p);
  return SCOPED_ROOTS.find((r) => r.root === seg);
}

export function isScopedPath(p: string): boolean {
  return scopedRootFor(p) !== undefined;
}

/** True when a move would cross a scope boundary in either direction. */
export function crossesScope(from: string, to: string): boolean {
  return firstSegment(from) !== firstSegment(to) && (isScopedPath(from) || isScopedPath(to));
}
