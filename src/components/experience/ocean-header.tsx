"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandSwitch } from "./brand-switch";

export const NP7_LOGO =
  "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-logo.png";

const NAV = [
  { label: "Experiences", href: "/experience#experiences" },
  { label: "Destinations", href: "/experience#destinations" },
  { label: "Disciplines", href: "/experience#disciplines" },
  { label: "About", href: "/experience#vibe" },
];

/**
 * Sticky header that floats transparently over the water hero, then frosts
 * into translucent ocean-blue once the user scrolls past it.
 *
 * Left: the parent-brand NP7 mark (links to np-seven.com home) + the
 * Experience ⇄ Hardware switch. Right: in-page nav + booking CTA.
 */
export function OceanHeader({ bookHref = "#experiences" }: { bookHref?: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#00374a]/80 backdrop-blur-lg border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" aria-label="NP7 home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
          </Link>
          <span className="w-px h-6 bg-white/20 hidden sm:block" />
          <BrandSwitch active="experience" />
        </div>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[12.5px] font-semibold text-white/70 hover:text-white transition-colors tracking-wide"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/account"
            aria-label="My account"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </Link>
          <Link
            href={bookHref}
            className="shrink-0 px-5 py-2.5 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.4)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all"
          >
            Book a trip
          </Link>
        </div>
      </div>
    </header>
  );
}
