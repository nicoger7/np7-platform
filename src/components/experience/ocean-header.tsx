"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandSwitch } from "./brand-switch";
import { MemberButton } from "@/components/shared/member-button";
import { NP7_LOGO } from "@/components/shared/brand";

// re-exported for the many call sites that import it from here
export { NP7_LOGO };

const NAV = [
  { label: "Experiences", href: "/experience#experiences" },
  { label: "Destinations", href: "/experience#destinations" },
  { label: "Disciplines", href: "/experience#disciplines" },
  // right-aligned, next to the account button + CTA
  { label: "Magazine", href: "/blog?from=experience", side: "right" as const },
  { label: "About", href: "/about?from=experience", side: "right" as const },
];

const leftNav = NAV.filter((n) => n.side !== "right");
const rightNav = NAV.filter((n) => n.side === "right");
const navLink = "text-[12.5px] font-semibold text-white/70 hover:text-white transition-colors tracking-wide";

/**
 * Sticky header for the Experience sub-site.
 *
 * `variant="overlay"` (default) floats transparently over the water hero, then
 * frosts into translucent ocean-blue once the user scrolls past it.
 * `variant="docked"` is always solid and takes layout space — used inside the
 * member portal, where there's no hero to float over.
 *
 * Left: the parent-brand NP7 mark + the Experience ⇄ Hardware switch.
 * Right: in-page nav, the shared member button, and the booking CTA.
 */
export function OceanHeader({
  bookHref = "#experiences",
  variant = "overlay",
}: {
  bookHref?: string;
  variant?: "overlay" | "docked";
}) {
  const docked = variant === "docked";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (docked) return;
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [docked]);

  return (
    <header
      className={
        docked
          ? "sticky top-0 z-50 bg-[#00374a] border-b border-white/10"
          : `fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
              scrolled ? "bg-[#00374a]/80 backdrop-blur-lg" : "bg-transparent"
            }`
      }
    >
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* LEFT — brand + primary nav */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" aria-label="NP7 home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
          </Link>
          <span className="w-px h-6 bg-white/20 hidden sm:block" />
          <BrandSwitch active="experience" />
          <nav className="hidden lg:flex items-center gap-7 ml-1">
            {leftNav.map((n) => (
              <Link key={n.href} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
        </div>

        {/* RIGHT — secondary nav + account + CTA */}
        <div className="flex items-center gap-5">
          <nav className="hidden lg:flex items-center gap-7">
            {rightNav.map((n) => (
              <Link key={n.href} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
          <MemberButton section="experience" />
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
