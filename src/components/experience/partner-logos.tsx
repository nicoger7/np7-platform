"use client";

import { useState } from "react";
import type { Partner } from "@/lib/partners";

/**
 * One quiet row of partner logos, drawn white.
 *
 * Logos come in every shape: JP's is a long flat word mark (15:1), Surfcenter's
 * and NeilPryde's sit near 4:1. At one fixed height the long one runs three
 * times as wide and shouts. So each logo's height is set from its own shape,
 * height ∝ aspect^-0.65, a touch steeper than equal area: on a dark ground a
 * long thin word mark still reads bigger than its area says (Nico, 6 Oct 2026).
 */
const BASE_HEIGHT = 26;   // px, for a 4:1 logo
const REF_ASPECT = 4;
const MIN_H = 10;
const MAX_H = 30;

export function optimalLogoHeight(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return BASE_HEIGHT;
  const h = BASE_HEIGHT * Math.pow(REF_ASPECT / aspect, 0.65);
  return Math.round(Math.min(MAX_H, Math.max(MIN_H, h)));
}

function Logo({ p }: { p: Partner }) {
  const [h, setH] = useState(BASE_HEIGHT);
  /* eslint-disable-next-line @next/next/no-img-element */
  const img = (
    <img
      src={p.logo}
      alt={p.name}
      loading="lazy"
      onLoad={(e) => {
        const el = e.currentTarget;
        if (el.naturalWidth && el.naturalHeight) setH(optimalLogoHeight(el.naturalWidth / el.naturalHeight));
      }}
      style={{ height: h, width: "auto", filter: "brightness(0) invert(1)" }}
      className="block max-w-[200px] object-contain"
    />
  );
  return p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={p.name}>{img}</a> : img;
}

export function PartnerLogos({ partners }: { partners: Partner[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 sm:gap-x-14">
      {partners.map((p) => (
        <li key={p.logo} className="opacity-50 hover:opacity-90 transition-opacity">
          <Logo p={p} />
        </li>
      ))}
    </ul>
  );
}
