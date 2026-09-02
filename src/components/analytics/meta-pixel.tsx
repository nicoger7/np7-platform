"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { metaEnabled, loadMetaPixel, metaTrack, META_PIXEL_ID } from "@/lib/meta-pixel";

/**
 * Loads the Meta Pixel and fires PageView (and ViewContent on experience pages)
 * on every route change. Completely inert unless a Pixel id is configured AND the
 * visitor gave marketing consent — see src/lib/meta-pixel.ts. Mounted once in the
 * root layout, alongside the first-party AnalyticsTracker.
 */
export function MetaPixel() {
  const pathname = usePathname();
  /*
   * One page must never reach Meta: the login-link landing page carries a live
   * single-use token in its query string, and fbevents ships the full page URL
   * with every event. That would hand facebook.com a working key to the
   * member's account. Nothing loads here at all, not even the script.
   */
  const holdsLoginToken = pathname.startsWith("/account/auth");

  // Load the script as soon as it's allowed (and again if consent is granted later).
  useEffect(() => {
    if (holdsLoginToken) return;
    if (metaEnabled()) loadMetaPixel();
    const onConsent = () => { if (metaEnabled()) loadMetaPixel(); };
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, [holdsLoginToken]);

  // PageView (+ ViewContent for experience pages) on navigation.
  useEffect(() => {
    if (holdsLoginToken) return;
    if (!metaEnabled()) return;
    loadMetaPixel();
    metaTrack("PageView");
    const m = pathname.match(/^\/experience\/([^/]+)/);
    if (m && !["gift", "legal"].includes(m[1])) {
      metaTrack("ViewContent", { content_type: "product", content_ids: [m[1]] });
    }
  }, [pathname, holdsLoginToken]);

  // Nothing rendered when there's no Pixel id at all (keeps it provably off).
  if (!META_PIXEL_ID) return null;
  return null;
}
