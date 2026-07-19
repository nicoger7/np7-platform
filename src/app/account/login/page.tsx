import Link from "next/link";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { AuthForm } from "@/components/shared/auth-form";

export const metadata = { title: "Log in — NP7" };

/**
 * Fallback auth page (the popup is the primary entry point). Reached by no-JS
 * users, direct URL, and expired-link redirects. Same password-first form as
 * the popup, in the branded ocean shell.
 */
export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Optional round-trip target (e.g. an open survey link) — internal paths only.
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;
  return (
    <main className="min-h-[100svh] bg-[#00374a] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-8 w-auto invert mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white tracking-[-0.02em]">My NP7</h1>
          <p className="text-[14px] text-white/55 mt-1">Log in to manage your trips &amp; gear</p>
        </div>

        <div className="bg-white rounded-2xl p-7">
          <AuthForm next={safeNext} />
        </div>

        <p className="text-center text-[12px] text-white/40 mt-6">
          Booked a trip but no account yet? <Link href="/experience" className="text-white/70 hover:text-white">Find your trip →</Link>
        </p>
      </div>
    </main>
  );
}
