"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tone = "ocean" | "hardware";

const ALL_TABS = [
  { href: "/account", label: "Home", exact: true },
  { href: "/account/trips", label: "My trips" },
  { href: "/account/gear", label: "My gear", flag: "gear" as const },
  { href: "/account/cart", label: "Cart", cart: true, flag: "cart" as const },
  { href: "/account/vouchers", label: "Gift vouchers" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/settings", label: "Account" },
];

/**
 * Member-portal submenu, shown directly under the section header. Tabs for
 * My trips / My gear / Cart / Profile (active by pathname), a live cart badge,
 * and log out. `tone` matches the surrounding section chrome. Gear/Cart tabs are
 * hidden until those surfaces are switched on (showGear / showCart).
 */
export function PortalSubnav({ tone, showGear = false, showCart = false }: { tone: Tone; showGear?: boolean; showCart?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const TABS = ALL_TABS.filter((t) => (t.flag === "gear" ? showGear : t.flag === "cart" ? showCart : true));

  useEffect(() => {
    let alive = true;
    fetch("/api/portal/cart")
      .then((r) => r.json())
      .then((d) => { if (alive && typeof d?.count === "number") setCartCount(d.count); })
      .catch(() => {});
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
  const accentBadge = tone === "hardware" ? "bg-[#c2ff38] text-black" : "bg-[#00afdb] text-white";

  return (
    <nav className={`sticky top-16 z-40 ${bg} border-t border-white/10`}>
      <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-12 flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative shrink-0 inline-flex items-center gap-1.5 px-3 h-12 text-[13px] font-bold tracking-wide transition-colors ${
                active ? `${accentText}` : "text-white/60 hover:text-white"
              }`}
            >
              {t.label}
              {t.cart && cartCount > 0 && (
                <span className={`grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black ${accentBadge}`}>
                  {cartCount}
                </span>
              )}
              {active && <span className={`absolute left-3 right-3 bottom-0 h-0.5 rounded-full ${accentBar}`} />}
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="ml-auto shrink-0 text-[13px] font-semibold text-white/55 hover:text-white transition-colors"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
