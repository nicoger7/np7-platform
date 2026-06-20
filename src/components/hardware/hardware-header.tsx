"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandSwitch } from "@/components/experience/brand-switch";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { MemberButton } from "@/components/shared/member-button";

const NAV = [
  { label: "Boards", href: "#products" },
  { label: "Fins", href: "#products" },
  { label: "Shop", href: "#products" },
  { label: "Workshop", href: "#workshop" },
  // right-aligned, next to the account button + CTA
  { label: "Magazine", href: "/blog", side: "right" as const },
  { label: "About", href: "/about", side: "right" as const },
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
          ? "sticky top-0 z-50 bg-black border-b border-white/10"
          : `fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
              scrolled ? "bg-black/80 backdrop-blur-lg border-b border-white/10" : "bg-transparent"
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
          <BrandSwitch active="hardware" />
          <nav className="hidden lg:flex items-center gap-7 ml-1">
            {leftNav.map((n, i) => (
              <Link key={i} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
        </div>

        {/* RIGHT — secondary nav + account + CTA */}
        <div className="flex items-center gap-5">
          <nav className="hidden lg:flex items-center gap-7">
            {rightNav.map((n, i) => (
              <Link key={i} href={n.href} className={navLink}>{n.label}</Link>
            ))}
          </nav>
          <MemberButton section="hardware" />
          <Link
            href="#products"
            className="shrink-0 px-5 py-2.5 rounded-full text-[12.5px] font-bold text-black bg-[#c2ff38] shadow-[0_0_24px_rgba(194,255,56,0.45)] hover:bg-[#d4ff66] hover:-translate-y-0.5 transition-all"
          >
            Shop gear
          </Link>
        </div>
      </div>
    </header>
  );
}
