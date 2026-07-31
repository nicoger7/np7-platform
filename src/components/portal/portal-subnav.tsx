"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Signing out must also end any admin member-preview. The view-as cookie
 *  outlived the session, so logging back in dropped you straight into the
 *  previewed customer's account again. */
async function endPreviewSession() {
  try { await fetch("/api/portal/end-preview", { method: "POST" }); } catch { /* best effort */ }
}


type Tone = "ocean" | "hardware";
type Tab = { href: string; label: string; exact?: boolean; flag?: "gear"; icon?: IconName };

// Desktop: core destinations inline + a right-aligned "More" dropdown for the
// occasional/account items, so the row never overflows into a horizontal scroll.
// Mobile: bottom tab bar (PRIMARY) + a "More" sheet.
// Cart is NOT a nav item — it's a contextual icon shown only on Hardware once the
// cart has something in it (never on Experience).
const DESK_MAIN: Tab[] = [
  { href: "/account", label: "Home", exact: true, icon: "home" },
  { href: "/account/trips", label: "My trips", icon: "trips" },
  { href: "/account/gear", label: "My gear", flag: "gear", icon: "gear" },
  { href: "/account/level", label: "Progress", icon: "progress" },
  { href: "/account/profile", label: "Profile", icon: "user" },
];
// Folded into the desktop "More" dropdown (Log out is appended in the menu).
const DESK_MORE: Tab[] = [
  { href: "/account/vouchers", label: "Gift vouchers", icon: "gift" },
  { href: "/account/settings", label: "Account", icon: "cog" },
];
const PRIMARY: Tab[] = [
  { href: "/account", label: "Home", exact: true, icon: "home" },
  { href: "/account/trips", label: "Trips", icon: "trips" },
  { href: "/account/gear", label: "Gear", flag: "gear", icon: "gear" },
  { href: "/account/profile", label: "Profile", icon: "user" },
];
const MORE: Tab[] = [
  { href: "/account/level", label: "Progress" },
  { href: "/account/vouchers", label: "Gift vouchers" },
  { href: "/account/settings", label: "Account" },
];

export function PortalSubnav({ tone, showGear = false }: { tone: Tone; showGear?: boolean; showCart?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deskMore, setDeskMore] = useState(false);

  const showTab = (t: Tab) => (t.flag === "gear" ? showGear : true);
  const isActive = (t: Tab) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/"));

  useEffect(() => {
    let alive = true;
    fetch("/api/portal/cart").then((r) => r.json()).then((d) => { if (alive && typeof d?.count === "number") setCartCount(d.count); }).catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  // Close the desktop "More" menu on navigation.
  useEffect(() => { setDeskMore(false); }, [pathname]);

  async function logout() {
    // No-op inside an admin "view as member" preview — otherwise the team member
    // would sign out their own session from the iframe.
    if (typeof document !== "undefined" && document.cookie.includes("np7_preview=1")) return;
    await endPreviewSession();
    await createClient().auth.signOut();
    router.push("/account/login");
    router.refresh();
  }

  const accent = tone === "hardware" ? "#c2ff38" : "#00afdb"; // mobile bottom-bar + sheet active
  const badge = tone === "hardware" ? "bg-[#c2ff38] text-black" : "bg-[#00afdb] text-white";
  // Desktop = a light section tab bar that sits on the cream content, distinct
  // from the dark global header above. Active tab uses a tone accent that reads
  // on light (cyan for Experience, black ink for Hardware) + an underline.
  const deskActive = tone === "hardware" ? "text-[#0a0a0a]" : "text-[#00374a]";
  const deskBar = tone === "hardware" ? "bg-[#0a0a0a]" : "bg-[#00afdb]";
  const moreActive = MORE.some((t) => isActive(t));
  const deskMoreActive = DESK_MORE.some((t) => isActive(t));
  // Cart: Hardware only, and only once something's in it.
  const showCartIcon = tone === "hardware" && cartCount > 0;

  return (
    <>
      {/* ── desktop: light section tab bar (sits on the cream content, distinct from the dark global header above) ── */}
      <nav className="hidden sm:block sticky top-16 z-40 bg-[#fff7ec] border-b border-[#ece2d2]">
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-12 flex items-center gap-1">
          {DESK_MAIN.filter(showTab).map((t) => (
            <Link key={t.href} href={t.href}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-2.5 h-12 text-[13px] font-bold tracking-wide transition-colors ${isActive(t) ? deskActive : "text-[#6a7a80] hover:text-[#00374a]"}`}>
              {t.icon && <Icon name={t.icon} size={17} />}
              {t.label}
              {isActive(t) && <span className={`absolute left-2.5 right-2.5 bottom-0 h-0.5 rounded-full ${deskBar}`} />}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-2 pl-3">
            {showCartIcon && (
              <Link href="/account/cart" className="relative shrink-0 text-[#6a7a80] hover:text-[#00374a] transition-colors" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}>
                <Icon name="cart" />
                <span className={`absolute -top-1.5 -right-2 grid place-items-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black ${badge}`}>{cartCount}</span>
              </Link>
            )}
            {/* More: gift vouchers · account · log out — keeps the row from ever scrolling */}
            <div className="relative shrink-0">
              <button type="button" onClick={() => setDeskMore((v) => !v)} aria-expanded={deskMore} aria-haspopup="menu"
                className={`inline-flex items-center gap-1.5 pl-3 pr-2 h-9 rounded-full text-[13px] font-bold transition-colors ${deskMore || deskMoreActive ? `${deskActive} bg-[#f1e9db]` : "text-[#6a7a80] hover:text-[#00374a] hover:bg-[#f5efe3]"}`}>
                <Icon name="more" size={17} /> More
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${deskMore ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {deskMore && (
                <>
                  <div className="fixed inset-0 z-[45]" onClick={() => setDeskMore(false)} aria-hidden />
                  <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-[46] w-56 rounded-2xl bg-white border border-[#ece2d2] shadow-[0_12px_34px_rgba(0,55,74,0.14)] p-1.5">
                    {DESK_MORE.filter(showTab).map((t) => (
                      <Link key={t.href} href={t.href} role="menuitem" onClick={() => setDeskMore(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold hover:bg-[#f7f1e6] transition-colors"
                        style={{ color: isActive(t) ? accent : "#00374a" }}>
                        {t.icon && <Icon name={t.icon} size={18} />}{t.label}
                      </Link>
                    ))}
                    <div className="my-1 mx-2 border-t border-[#f0e8d8]" />
                    <button type="button" role="menuitem" onClick={() => { setDeskMore(false); logout(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-[#c4621a] hover:bg-[#f7f1e6] transition-colors">
                      <Icon name="logout" size={18} /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── mobile: bottom tab bar ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#ece2d2]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-stretch">
          {PRIMARY.filter(showTab).map((t) => {
            const active = isActive(t);
            return (
              <Link key={t.href} href={t.href} className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2.5" style={{ color: active ? accent : "#9aa6ac" }}>
                <Icon name={t.icon!} />
                <span className="text-[10px] font-semibold">{t.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-2.5" style={{ color: moreOpen || moreActive ? accent : "#9aa6ac" }}>
            <Icon name="more" />
            <span className="text-[10px] font-semibold">More</span>
          </button>
        </div>
      </nav>

      {/* mobile: floating cart (Hardware + items only), above the bottom bar */}
      {showCartIcon && (
        <Link href="/account/cart" aria-label={`Cart, ${cartCount} items`}
          className="sm:hidden fixed right-4 z-50 w-12 h-12 rounded-full bg-black text-[#c2ff38] grid place-items-center shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}>
          <Icon name="cart" />
          <span className="absolute -top-1 -right-1 grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-[#c2ff38] text-black">{cartCount}</span>
        </Link>
      )}

      {/* spacer so the fixed bottom bar never covers content on mobile */}
      <style>{`@media (max-width: 639px){ body { padding-bottom: 4.75rem; } }`}</style>

      {/* ── "More" sheet ── */}
      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-9 h-1 rounded-full bg-[#e0d8c8] mb-3" />
            {MORE.filter(showTab).map((t) => (
              <Link key={t.href} href={t.href} onClick={() => setMoreOpen(false)} className="flex items-center justify-between px-3 py-3.5 rounded-xl active:bg-[#f3ede2]" style={{ color: isActive(t) ? accent : "#00374a" }}>
                <span className="text-[15px] font-semibold">{t.label}</span>
                <span className="text-[#c9d4d8]">›</span>
              </Link>
            ))}
            <button onClick={logout} className="w-full text-left px-3 py-3.5 rounded-xl text-[15px] font-semibold text-[#c4621a] active:bg-[#f3ede2]">Log out</button>
          </div>
        </div>
      )}
    </>
  );
}

type IconName = "home" | "trips" | "progress" | "gear" | "user" | "cart" | "more" | "gift" | "cog" | "logout";
function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const c = { width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home": return <svg viewBox="0 0 24 24" {...c}><path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" /></svg>;
    case "trips": return <svg viewBox="0 0 24 24" {...c}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case "progress": return <svg viewBox="0 0 24 24" {...c}><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7" /></svg>;
    case "gear": return <svg viewBox="0 0 24 24" {...c}><path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12l8.7-4.5M12 12v9.5" /></svg>;
    case "user": return <svg viewBox="0 0 24 24" {...c}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "gift": return <svg viewBox="0 0 24 24" {...c}><rect x="3" y="8" width="18" height="4" /><path d="M12 8v13M20 12v9H4v-9" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" /></svg>;
    case "cog": return <svg viewBox="0 0 24 24" {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" /></svg>;
    case "cart": return <svg viewBox="0 0 24 24" {...c}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L23 7H6" /></svg>;
    case "more": return <svg viewBox="0 0 24 24" {...c}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
    case "logout": return <svg viewBox="0 0 24 24" {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>;
  }
}
