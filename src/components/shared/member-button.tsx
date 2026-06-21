"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthModal } from "./auth-modal";

type Me = { loggedIn: boolean; firstName?: string; lastName?: string; avatarUrl?: string | null };

/**
 * Shared account control — rendered in the far-right corner of each header,
 * after the primary CTA (the universal "account lives top-right" pattern).
 *
 * Logged-out: a neutral person glyph that opens the auth popup (login-first).
 * Logged-in: the member's photo, or their initials in a frosted chip — so the
 * header reflects *you*, the way Airbnb / GitHub / Notion do. Tapping it always
 * goes straight to the portal, and records which brand you came from so the
 * portal keeps that section's header.
 */
export function MemberButton({
  section,
  tone = "onDark",
}: {
  section: "experience" | "hardware";
  tone?: "onDark" | "onLight";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((d) => { if (alive) setMe(d); })
      .catch(() => { if (alive) setMe({ loggedIn: false }); });
    return () => { alive = false; };
  }, []);

  const onLight = tone === "onLight";
  const ringIdle = onLight ? "ring-[#00374a]/15" : "ring-white/25";
  const ringHover = section === "hardware" ? "hover:ring-[#c2ff38]/70" : "hover:ring-[#00afdb]/70";
  const glyphBase = onLight ? "border-[#00374a]/15 text-[#00374a]/70" : "border-white/20 text-white/80";
  const glyphHover = section === "hardware" ? "hover:text-[#c2ff38] hover:border-[#c2ff38]/50" : "hover:text-[#00afdb] hover:border-[#00afdb]/60";

  function rememberSection() {
    document.cookie = `np7_section=${section}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    rememberSection();
    // use what we already know; if state is still loading, re-check on the spot
    const state = me ?? (await fetch("/api/portal/me").then((r) => r.json()).catch(() => ({ loggedIn: false })));
    if (state?.loggedIn) { router.push("/account"); return; }
    setOpen(true);
  }

  const initials =
    me?.loggedIn
      ? [me.firstName, me.lastName].filter(Boolean).map((s) => s![0]?.toUpperCase()).join("").slice(0, 2) || "•"
      : "";

  return (
    <>
      {/* plain anchor (not next/link): the modal is the JS path; the href is the
          no-JS fallback. A plain <a> reliably honours preventDefault. */}
      <a
        href="/account"
        aria-label={me?.loggedIn ? "My account" : "Sign in"}
        onClick={handleClick}
        className="shrink-0 cursor-pointer"
      >
        {me?.loggedIn ? (
          me.avatarUrl ? (
            <span
              className={`block w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-cover bg-center ring-2 transition-all ${ringIdle} ${ringHover}`}
              style={{ backgroundImage: `url('${me.avatarUrl}')` }}
            />
          ) : (
            <span
              className={`grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-[12.5px] font-extrabold tracking-tight ${onLight ? "bg-[#00374a]/8 text-[#00374a]" : "bg-white/12 text-white"} ring-2 transition-all ${ringIdle} ${ringHover}`}
            >
              {initials}
            </span>
          )
        ) : (
          <span className={`grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border transition-colors ${glyphBase} ${glyphHover}`}>
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
        )}
      </a>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}
