"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandSwitch } from "./brand-switch";
import { MemberButton } from "@/components/shared/member-button";
import { NP7_LOGO } from "@/components/shared/brand";

// re-exported for the many call sites that import it from here
export { NP7_LOGO };

type NavItem = { label: string; href: string; side?: "right"; need?: "experience" | "blog" };
// `need` gates each link on a visibility flag, so with only SHOW_BLOG live the
// header shows just Magazine — the experience links stay hidden until that world reveals.
const NAV: NavItem[] = [
  { label: "Experiences", href: "/experience#experiences", need: "experience" },
  { label: "Destinations", href: "/experience#destinations", need: "experience" },
  { label: "Disciplines", href: "/experience#disciplines", need: "experience" },
  // right-aligned, next to the account button + CTA
  { label: "Magazine", href: "/blog?from=experience", side: "right", need: "blog" },
  { label: "About", href: "/about?from=experience", side: "right", need: "experience" },
];
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
  showExperience = true,
  showBlog = true,
}: {
  bookHref?: string;
  variant?: "overlay" | "docked";
  showExperience?: boolean;
  showBlog?: boolean;
}) {
  const docked = variant === "docked";
  const visibleNav = NAV.filter((n) => (n.need === "blog" ? showBlog : n.need === "experience" ? showExperience : true));
  const leftNav = visibleNav.filter((n) => n.side !== "right");
  const rightNav = visibleNav.filter((n) => n.side === "right");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (docked) return;
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [docked]);

  // close the mobile menu once the viewport reaches the desktop nav breakpoint
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={
        docked
          ? "sticky top-0 z-50 bg-[#00374a]"
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
        <div className="flex items-center gap-2.5 sm:gap-5">
          <nav className="hidden lg:flex items-center gap-7">
            {rightNav.map((n) => (
              <Link key={n.href} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
          {showExperience && (
            <Link
              href={bookHref}
              className="hidden sm:inline-block shrink-0 px-5 py-2.5 rounded-full text-[12.5px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.4)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all"
            >
              Book a trip
            </Link>
          )}
          {/* account lives in the far-right corner, after the CTA */}
          <MemberButton section="experience" />
          {/* mobile menu toggle — the nav links are desktop-only otherwise */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="lg:hidden shrink-0 -mr-1 w-9 h-9 grid place-items-center text-white"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* MOBILE menu panel */}
      {menuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#00374a]">
          <nav className="max-w-[1200px] mx-auto px-5 py-2 flex flex-col">
            {visibleNav.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="py-3.5 text-[15px] font-semibold text-white/85 hover:text-white border-b border-white/5">
                {n.label}
              </Link>
            ))}
            {showExperience && (
              <Link href={bookHref} onClick={() => setMenuOpen(false)} className="mt-3 mb-1 inline-flex justify-center px-5 py-3 rounded-full text-[14px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.4)]">
                Book a trip
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
