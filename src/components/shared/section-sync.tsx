"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

// Layout effect so a client navigation repaints with the right world in the same
// commit; useEffect can land after the browser has already painted.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps `<html data-np7-section>` honest across client navigations.
 *
 * The inline script in the root layout only runs on a full document load, but a
 * reader crosses worlds without one: /blog → footer → /hardware → Magazine is
 * three soft navigations. Middleware keeps the np7_section cookie current on
 * each of them, so re-reading it per route change is enough.
 *
 * Deliberately NOT useSearchParams — that opts every page rendering this (i.e.
 * all of them) out of static generation, which is the thing this whole mechanism
 * exists to protect.
 */
export function SectionSync() {
  const pathname = usePathname();
  useIsoLayoutEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    const cookie = /(?:^|; )np7_section=([^;]*)/.exec(document.cookie)?.[1];
    const section = from || (cookie ? decodeURIComponent(cookie) : "");
    const html = document.documentElement;
    if (section === "hardware") html.setAttribute("data-np7-section", "hardware");
    else html.removeAttribute("data-np7-section");
  }, [pathname]);
  return null;
}
