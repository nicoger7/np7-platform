"use client";

import { PREVIEW_PARAM } from "@/lib/preview-const";

/**
 * Keeping the admin preview alive past the first click.
 *
 * The preview iframe loads its entry URL with `?__np7_preview=1`, and the
 * server honours the view-as cookie only when it sees that marker — without it
 * the cookie was ambient and leaked into the admin's own browsing.
 *
 * But portal links are plain `<Link href="/account/bookings/…">`, so the marker
 * is gone from the URL after one hop. The page itself still rendered (that RSC
 * request's Referer was the previous, marked page), and then every `fetch()`
 * made FROM that page carried an unmarked Referer — so add-ons, and anything
 * else loaded client-side, silently answered as the admin instead of the
 * member and came back empty. That is why a previewed trip reported "No
 * optional extras" while the add-ons existed.
 *
 * So remember it in the module rather than re-reading the URL. A client-side
 * navigation keeps this module alive; a full reload goes through the iframe
 * `src`, which carries the marker again. Either way the flag is right.
 *
 * This is scope, not security: the server still requires the view-as cookie AND
 * an active team member, so the header proves nothing on its own.
 */

let inPreview = false;
let patched = false;

export function isPreview(): boolean {
  return inPreview;
}

/**
 * Tag every same-origin portal request with the marker, once, for the life of
 * the iframe. Wrapping `fetch` centrally beats editing 27 call sites — and
 * means a fetch added later can't quietly reintroduce the bug.
 */
export function installPreviewFetch(): void {
  if (typeof window === "undefined") return;
  if (!window.location.search.includes(PREVIEW_PARAM)) return;
  inPreview = true;
  if (patched) return;
  patched = true;

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    let path = "";
    try {
      path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    } catch { /* leave blank — untagged is the safe default */ }
    if (!path.includes("/api/portal/")) return original(input, init);
    const headers = new Headers(init.headers);
    headers.set("x-np7-preview", "1");
    return original(input, { ...init, headers });
  };
}
