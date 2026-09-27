"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { googleAdsEnabled, loadGoogleAds, googleAdsPageView, googleAdsConsent } from "@/lib/google-ads";

/**
 * Loads the Google Ads tag and reports page views on every route change.
 * Completely inert unless every gate in src/lib/google-ads.ts passes
 * (marketing consent that names Google, production host, not opted out, not
 * /admin or the login-token page). Mounted once in the root layout, next to
 * the Meta Pixel.
 */
export function GoogleAdsTag() {
  const pathname = usePathname();

  // The banner can grant or withdraw consent at any moment.
  useEffect(() => {
    const onConsent = () => {
      if (googleAdsEnabled()) {
        loadGoogleAds();
        googleAdsConsent(true);
      } else {
        googleAdsConsent(false);
      }
    };
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, []);

  useEffect(() => {
    if (!googleAdsEnabled()) return;
    // The first load's config call already counted this page.
    if (!loadGoogleAds()) googleAdsPageView();
  }, [pathname]);

  return null;
}
