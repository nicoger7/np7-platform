"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "./auth-modal";
import { createClient } from "@/lib/supabase/client";

type Me = { loggedIn: boolean; firstName?: string; lastName?: string; avatarUrl?: string | null };

/**
 * Shared account control — the avatar in the far-right corner of every header.
 *
 * Standard account-menu pattern (Airbnb / GitHub / Notion): clicking the avatar
 * opens a small menu. Logged-in → mini profile + quick links + log out.
 * Logged-out → Log in / Create account (both open the auth modal).
 */
export function MemberButton({
  section,
  tone = "onDark",
}: {
  section: "experience" | "hardware";
  tone?: "onDark" | "onLight";
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [auth, setAuth] = useState<null | "login" | "register">(null);
  const [me, setMe] = useState<Me | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((d) => { if (alive) setMe(d); })
      .catch(() => { if (alive) setMe({ loggedIn: false }); });
    return () => { alive = false; };
  }, []);

  // close on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const onLight = tone === "onLight";
  const ringIdle = onLight ? "ring-[#00374a]/15" : "ring-white/25";
  const ringHover = section === "hardware" ? "hover:ring-[#c2ff38]/70" : "hover:ring-[#00afdb]/70";
  const glyphBase = onLight ? "border-[#00374a]/15 text-[#00374a]/70" : "border-white/20 text-white/80";
  const glyphHover = section === "hardware" ? "hover:text-[#c2ff38] hover:border-[#c2ff38]/50" : "hover:text-[#00afdb] hover:border-[#00afdb]/60";
  const accent = section === "hardware" ? "#7bdb1e" : "#00afdb";

  function rememberSection() {
    document.cookie = `np7_section=${section}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    rememberSection();
    if (!me) {
      // still loading — resolve on the spot so the first tap always works
      const state = await fetch("/api/portal/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));
      setMe(state);
    }
    setMenuOpen((v) => !v);
  }

  async function logout() {
    setMenuOpen(false);
    await createClient().auth.signOut();
    setMe({ loggedIn: false });
    router.push("/");
    router.refresh();
  }

  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ");
  const initials =
    me?.loggedIn
      ? [me.firstName, me.lastName].filter(Boolean).map((s) => s![0]?.toUpperCase()).join("").slice(0, 2) || "•"
      : "";

  const avatar = (size: string, text: string) =>
    me?.avatarUrl ? (
      <span className={`block ${size} rounded-full bg-cover bg-center`} style={{ backgroundImage: `url('${me.avatarUrl}')` }} />
    ) : (
      <span className={`grid place-items-center ${size} rounded-full ${text} font-extrabold tracking-tight bg-[#00374a]/8 text-[#00374a]`}>{initials}</span>
    );

  const item = "flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] font-semibold text-[#334b55] hover:bg-[#f4f8f9] transition-colors";

  return (
    <div ref={ref} className="relative shrink-0">
      {/* trigger — plain anchor keeps a no-JS fallback to /account */}
      <a href="/account" aria-label="Account menu" aria-expanded={menuOpen} onClick={handleClick} className="block cursor-pointer">
        {me?.loggedIn ? (
          me.avatarUrl ? (
            <span
              className={`block w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-cover bg-center ring-2 transition-all ${ringIdle} ${ringHover}`}
              style={{ backgroundImage: `url('${me.avatarUrl}')` }}
            />
          ) : (
            <span className={`grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-[12.5px] font-extrabold tracking-tight ${onLight ? "bg-[#00374a]/8 text-[#00374a]" : "bg-white/12 text-white"} ring-2 transition-all ${ringIdle} ${ringHover}`}>
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

      {/* menu */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-2.5 w-[240px] rounded-2xl bg-white shadow-[0_18px_50px_rgba(0,20,30,0.22)] ring-1 ring-black/[0.06] overflow-hidden z-[60]">
          {me?.loggedIn ? (
            <>
              <Link href="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3.5 bg-[#fbf8f2] hover:bg-[#f6f1e6] transition-colors">
                {avatar("w-10 h-10", "text-[14px]")}
                <span className="min-w-0">
                  <span className="block text-[14px] font-extrabold text-[#00374a] truncate">{name || "My NP7"}</span>
                  <span className="block text-[12px] text-[#8a9aa0]">View your NP7 home</span>
                </span>
              </Link>
              <div className="py-1.5">
                <Link href="/account/trips" onClick={() => setMenuOpen(false)} className={item}>My trips</Link>
                <Link href="/account/memories" onClick={() => setMenuOpen(false)} className={item}>My memories</Link>
                <Link href="/account/level" onClick={() => setMenuOpen(false)} className={item}>Progress</Link>
                <Link href="/account/profile" onClick={() => setMenuOpen(false)} className={item}>Profile</Link>
                <Link href="/account/settings" onClick={() => setMenuOpen(false)} className={item}>Account settings</Link>
              </div>
              <div className="border-t border-[#f0ebe0]">
                <button type="button" onClick={logout} className={`${item} w-full text-left text-[#c4621a]`}>Log out</button>
              </div>
            </>
          ) : (
            <div className="p-4">
              <p className="text-[14px] font-extrabold text-[#00374a]">My NP7</p>
              <p className="text-[12.5px] text-[#8a9aa0] mt-0.5 mb-3">Trips, photos &amp; your progression — all in one place.</p>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setAuth("login"); }}
                className="w-full py-2.5 rounded-full text-[13.5px] font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setAuth("register"); }}
                className="w-full py-2.5 rounded-full text-[13.5px] font-bold mt-2 border transition-colors hover:bg-[#f4f8f9]"
                style={{ color: "#00374a", borderColor: "#dbe4e7" }}
              >
                Create account
              </button>
            </div>
          )}
        </div>
      )}

      {auth && <AuthModal initialMode={auth} onClose={() => setAuth(null)} />}
    </div>
  );
}
