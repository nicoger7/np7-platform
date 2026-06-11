"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NP7_LOGO } from "@/components/experience/ocean-header";

export function PortalHeader({ name }: { name?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/account/login");
    router.refresh();
  }

  const link = (href: string, label: string) => {
    const active = pathname === href || (href !== "/account" && pathname.startsWith(href));
    return (
      <Link href={href} className={`text-[13px] font-semibold transition-colors ${active ? "text-white" : "text-white/60 hover:text-white"}`}>
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-[#00374a] border-b border-white/10">
      <div className="max-w-[1000px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/account" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert" />
          <span className="text-[11px] font-bold tracking-[0.25em] text-white hidden sm:block">MY NP7</span>
        </Link>
        <nav className="flex items-center gap-6">
          {link("/account", "My trips")}
          {link("/account/profile", "Profile")}
          <button onClick={logout} className="text-[13px] font-semibold text-white/60 hover:text-white transition-colors">Log out</button>
        </nav>
      </div>
      {name && (
        <div className="bg-[#00afdb] text-white text-center py-1.5 text-[11px] font-semibold tracking-wide sm:hidden">
          {name}
        </div>
      )}
    </header>
  );
}
