"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandSwitch } from "@/components/experience/brand-switch";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { MemberButton } from "@/components/shared/member-button";
import { CartBadge } from "@/components/hardware/cart";

const NAV = [
  // absolute paths so the links also work from /hardware/* subpages
  { label: "Boards", href: "/hardware#products", sub: "Freeride · slalom · wave — shaped on the bench" },
  { label: "Fins", href: "/hardware/fins", sub: "Slalom fins + the fin selector" },
  { label: "Workshop", href: "/hardware#workshop", sub: "Inside the build — carbon, layups, hand-finish" },
  // right-aligned, next to the account button + CTA
  { label: "Magazine", href: "/blog", side: "right" as const, sub: "Guides, tests & technique" },
  { label: "About", href: "/about?from=hardware", side: "right" as const, sub: "Nico Prien — GER-7" },
];

const leftNav = NAV.filter((n) => n.side !== "right");
const rightNav = NAV.filter((n) => n.side === "right");
const navLink = "text-[12px] font-bold uppercase tracking-[0.12em] text-white/55 hover:text-[#c2ff38] transition-colors font-mono";

/**
 * Hardware header — black/techy counterpart to the ocean header.
 * Main NP7 mark + Experience⇄Hardware switch, the shared member button, and a
 * neon-lime CTA. `variant="docked"` renders it always-solid and in-flow for the
 * member portal (no hero to float over).
 */
export function HardwareHeader({ variant = "overlay" }: { variant?: "overlay" | "docked" }) {
  const docked = variant === "docked";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (docked) return;
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [docked]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={docked ? "sticky top-0 z-50 bg-black" : "fixed top-0 inset-x-0 z-50"}
    >
      {/* Frost on a separate opacity-animated layer — toggling backdrop-filter
          on the header itself makes Safari blank out the BrandSwitch pill (its
          own backdrop-blur) during fast scrolls to the top. */}
      {!docked && (
        <div
          aria-hidden
          className={`absolute inset-0 bg-black/80 backdrop-blur-lg border-b border-white/10 transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0"}`}
        />
      )}
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* LEFT — brand + primary nav */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link href="/" aria-label="NP7 home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
          </Link>
          <span className="w-px h-6 bg-white/20 hidden sm:block" />
          <div className="origin-left max-[430px]:scale-[0.84] shrink-0"><BrandSwitch active="hardware" /></div>
          <nav className="hidden lg:flex items-center gap-7 ml-1">
            {leftNav.map((n, i) => (
              <Link key={i} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
        </div>

        {/* RIGHT — secondary nav + account + CTA */}
        <div className="flex items-center gap-2.5 sm:gap-5">
          <nav className="hidden lg:flex items-center gap-7">
            {rightNav.map((n, i) => (
              <Link key={i} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
          <Link
            href="#products"
            className="hidden sm:inline-block shrink-0 px-5 py-2.5 rounded-full text-[12.5px] font-bold text-black bg-[#c2ff38] shadow-[0_0_24px_rgba(194,255,56,0.45)] hover:bg-[#d4ff66] hover:-translate-y-0.5 transition-all"
          >
            Shop gear
          </Link>
          {/* cart — appears once something is in it */}
          <Link href="/hardware/cart" aria-label="Cart" className="shrink-0 flex items-center text-white/70 hover:text-[#c2ff38] transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <CartBadge />
          </Link>
          {/* account lives in the far-right corner, after the CTA */}
          <MemberButton section="hardware" />
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

      {/* MOBILE menu panel — an overview, not a bare link list: every entry
          carries a one-line descriptor so you know where it takes you */}
      {menuOpen && (
        <div className="relative lg:hidden border-t border-white/10 bg-black">
          <nav className="max-w-[1200px] mx-auto px-5 py-3 flex flex-col gap-1.5">
            {NAV.map((n, i) => (
              <Link key={i} href={n.href} onClick={() => setMenuOpen(false)}
                className="rounded-xl px-4 py-3 border border-white/8 bg-white/[0.03] hover:border-white/25 transition-colors">
                <span className="block text-[15px] font-bold text-white">{n.label}</span>
                {n.sub && <span className="block text-[12px] text-white/45 mt-0.5">{n.sub}</span>}
              </Link>
            ))}
            <Link href="/hardware#products" onClick={() => setMenuOpen(false)} className="mt-2 mb-1 inline-flex justify-center px-5 py-3.5 rounded-full text-[14.5px] font-bold text-black bg-[#c2ff38] shadow-[0_0_24px_rgba(194,255,56,0.45)]">
              Shop gear
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
