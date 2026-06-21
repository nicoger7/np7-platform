"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPageview, track } from "@/lib/analytics-client";

/**
 * Behaviour tracking, mounted once in the root layout. All calls go through
 * track(), which self-gates on analytics consent, so nothing fires without it.
 *
 *  - pageview on every route change (+ when consent is granted)
 *  - scroll depth (50% / 90%) once per page
 *  - delegated clicks: any element with a [data-track] attribute fires that event
 *
 * Reads only the pathname, so it needs no Suspense boundary.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  // Pageview on navigation.
  useEffect(() => {
    trackPageview();
  }, [pathname]);

  // Capture the page when consent is granted mid-visit.
  useEffect(() => {
    const onConsent = () => trackPageview();
    window.addEventListener("np7-consent", onConsent);
    return () => window.removeEventListener("np7-consent", onConsent);
  }, []);

  // Scroll depth — fire 50% and 90% once each, reset on route change. Skipped on
  // internal areas (admin/account) where scroll engagement isn't meaningful.
  useEffect(() => {
    if (/^\/(admin|account)/.test(pathname)) return;
    const fired = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = (window.scrollY / max) * 100;
      for (const t of [50, 90]) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          track("scroll_depth", { depth: t });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Delegated click tracking via data attributes:
  //   <button data-track="reserve_cta" data-track-label="hero">…</button>
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-track]") as HTMLElement | null;
      if (!el) return;
      const event = el.dataset.track;
      if (!event) return;
      const meta: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k.startsWith("track") && k !== "track" && v) {
          meta[k.slice(5).toLowerCase()] = v;
        }
      }
      track(event, Object.keys(meta).length ? meta : undefined);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
