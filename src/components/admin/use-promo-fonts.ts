"use client";

import { useEffect, useState } from "react";
import type { PromoFonts } from "@/lib/promo-render";

/**
 * The two families the promo canvas draws with, as Canvas2D can name them.
 *
 * next/font hashes its family names (`__Anton_a1b2c3`), so nothing may hardcode
 * "Anton": the CSS variables are the only place the real names exist. And a
 * canvas silently substitutes a fallback for a face the document has not loaded
 * yet — quietly, on a poster, at 186px — so the weights actually drawn are
 * requested up front and the caller is told when they land.
 *
 * Shared because the studio and the overview have to agree: a thumbnail drawn
 * in the fallback face is a thumbnail of a different poster.
 */
const FALLBACK: PromoFonts = { anton: "Anton", poppins: "Poppins" };
let resolved: PromoFonts | null = null;

/** The resolved names, read from the document once and remembered. Safe to call
 *  during render: it is a lookup, and after the first call not even that. */
export function promoFonts(): PromoFonts {
  if (resolved) return resolved;
  if (typeof document === "undefined") return FALLBACK;
  const css = getComputedStyle(document.body);
  resolved = {
    anton: css.getPropertyValue("--font-display").trim() || FALLBACK.anton,
    poppins: css.getPropertyValue("--font-inter").trim() || FALLBACK.poppins,
  };
  return resolved;
}

/** …plus a counter that changes when the faces have finished loading, so a
 *  component that draws to a canvas knows to draw again. */
export function usePromoFonts(): { fonts: PromoFonts; ready: number } {
  const [ready, setReady] = useState(0);

  useEffect(() => {
    let alive = true;
    const f = promoFonts();
    const first = (list: string) => list.split(",")[0].trim();
    const loads = [
      `400 100px ${first(f.anton)}`,
      ...["500", "600", "700", "800"].map((w) => `${w} 100px ${first(f.poppins)}`),
      `italic 500 100px ${first(f.poppins)}`,
    ].map((spec) => document.fonts.load(spec).catch(() => []));
    Promise.all(loads).then(() => { if (alive) setReady((t) => t + 1); });
    return () => { alive = false; };
  }, []);

  return { fonts: promoFonts(), ready };
}
