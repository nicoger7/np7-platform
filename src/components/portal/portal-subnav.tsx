"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tone = "ocean" | "hardware";
type Tab = { href: string; label: string; exact?: boolean; flag?: "gear"; icon?: IconName };

// Desktop: full horizontal nav. Mobile: bottom tab bar (PRIMARY) + a "More" sheet.
// Cart is NOT a nav item — it's a contextual icon shown only on Hardware once the
// cart has something in it (never on Experience).
const DESKTOP_TABS: Tab[] = [
  { href: "/account", label: "Home", exact: true },
  { href: "/account/trips", label: "My trips" },
  { href: "/account/gear", label: "My gear", flag: "gear" },
  { href: "/account/level", label: "Progress" },
  { href: "/account/vouchers", label: "Gift vouchers" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/settings", label: "Account" },
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

  const showTab = (t: Tab) => (t.flag === "gear" ? showGear : true);
  const isActive = (t: Tab) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/"));

  useEffect(() => {
    let alive = true;
    fetch("/api/portal/cart").then((r) => r.json()).then((d) => { if (alive && typeof d?.count === "number") setCartCount(d.count); }).catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/account/login");
    router.refresh();
  }

  const bg = tone === "hardware" ? "bg-black" : "bg-[#00374a]";
  const accentText = tone === "hardware" ? "text-[#c2ff38]" : "text-[#37c9ef]";
  const accentBar = tone === "hardware" ? "bg-[#c2ff38]" : "bg-[#00afdb]";
  const accent = tone === "hardware" ? "#c2ff38" : "#00afdb";
  const badge = tone === "hardware" ? "bg-[#c2ff38] text-black" : "bg-[#00afdb] text-white";
  const moreActive = MORE.some((t) => isActive(t));
  // Cart: Hardware only, and only once something's in it.
  const showCartIcon = tone === "hardware" && cartCount > 0;

  return (
    <>
      {/* ── desktop: horizontal nav ── */}
      <nav className={`hidden sm:block sticky top-16 z-40 ${bg} border-t border-white/10`}>
        <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-12 flex items-center gap-1 overflow-x-auto">
          {DESKTOP_TABS.filter(showTab).map((t) => (
            <Link key={t.href} href={t.href}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 h-12 text-[13px] font-bold tracking-wide transition-colors ${isActive(t) ? accentText : "text-white/60 hover:text-white"}`}>
              {t.label}
              {isActive(t) && <span className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full ${accentBar}`} />}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-4 pl-3">
            {showCartIcon && (
              <Link href="/account/cart" className="relative shrink-0 text-white/70 hover:text-white transition-colors" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}>
                <Icon name="cart" />
                <span className={`absolute -top-1.5 -right-2 grid place-items-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black ${badge}`}>{cartCount}</span>
              </Link>
            )}
            <button onClick={logout} className="shrink-0 text-[13px] font-semibold text-white/55 hover:text-white transition-colors">Log out</button>
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
            {MORE.map((t) => (
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

type IconName = "home" | "trips" | "progress" | "gear" | "user" | "cart" | "more";
function Icon({ name }: { name: IconName }) {
  const p = "w-[22px] h-[22px]";
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home": return <svg className={p} viewBox="0 0 24 24" {...c}><path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" /></svg>;
    case "trips": return <svg className={p} viewBox="0 0 24 24" {...c}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
    case "progress": return <svg className={p} viewBox="0 0 24 24" {...c}><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7" /></svg>;
    case "gear": return <svg className={p} viewBox="0 0 24 24" {...c}><path d="M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12l8.7-4.5M12 12v9.5" /></svg>;
    case "user": return <svg className={p} viewBox="0 0 24 24" {...c}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "cart": return <svg className={p} viewBox="0 0 24 24" {...c}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L23 7H6" /></svg>;
    case "more": return <svg className={p} viewBox="0 0 24 24" {...c}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
  }
}
