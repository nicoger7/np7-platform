"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthModal } from "./auth-modal";

/**
 * Shared "My account" icon button — identical on both sub-sites, rendered next
 * to each header's primary CTA (Book a trip / Shop gear). Tone tints the hover
 * accent to match the section.
 *
 * Logged-in members go straight to the portal; everyone else gets the auth
 * popup (login-first). Clicking also records which brand you came from so the
 * portal keeps that section's header. The href is /account so it still works
 * with JS off (middleware redirects to the /account/login fallback page).
 */
export function MemberButton({ section }: { section: "experience" | "hardware" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accent = section === "hardware" ? "hover:text-[#c2ff38] hover:border-[#c2ff38]/50" : "hover:text-[#00afdb] hover:border-[#00afdb]/60";

  function rememberSection() {
    document.cookie = `np7_section=${section}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    rememberSection();
    // already signed in? go straight to the portal. otherwise open the popup.
    const me = await fetch("/api/portal/me").then((r) => r.json()).catch(() => null);
    if (me?.loggedIn) { router.push("/account"); return; }
    setOpen(true);
  }

  return (
    <>
      {/* plain anchor (not next/link): the modal is the JS path; the href is the
          no-JS fallback. A plain <a> reliably honours preventDefault. */}
      <a
        href="/account"
        aria-label="My account"
        onClick={handleClick}
        className={`shrink-0 grid place-items-center w-9 h-9 rounded-full border border-white/20 text-white/80 transition-colors cursor-pointer ${accent}`}
      >
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </a>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}
