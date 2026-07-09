"use client";

import { useEffect } from "react";

/**
 * Makes in-page anchor links open a collapsed <details> section, not just scroll
 * to it. Powers the trip-page "at a glance" tiles + hero CTAs: tapping a tile
 * jumps to its section AND expands it in one tap. Also opens the section named
 * in the URL hash on load.
 */
export function AnchorOpener() {
  useEffect(() => {
    const openTarget = (hash: string) => {
      const el = document.getElementById(hash.replace(/^#/, ""));
      if (el && el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      const href = a?.getAttribute("href");
      if (href && href.length > 1) openTarget(href);
    };
    document.addEventListener("click", onClick);
    if (location.hash.length > 1) openTarget(location.hash);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
