"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageview } from "@/lib/analytics-client";

/**
 * Fires a pageview on every route change (consent-gated inside track()). Also
 * captures the current page the moment the visitor accepts analytics, so the
 * page they were on when they clicked "Accept all" isn't lost.
 *
 * Mounted once in the root layout. Reads only the pathname (UTM/referrer are read
 * from window inside the tracker), so it needs no Suspense boundary.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackPageview();
  }, [pathname]);

  useEffect(() => {
    // On any consent change, attempt a pageview — trackPageview() self-gates on
    // analytics consent, so it only sends when analytics was actually granted.
    const onConsent = () => trackPageview();
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, []);

  return null;
}
