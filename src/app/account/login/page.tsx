import Link from "next/link";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { AuthForm } from "@/components/shared/auth-form";

export const metadata = { title: "Log in — NP7" };

/**
 * Fallback auth page (the popup is the primary entry point). Reached by no-JS
 * users, direct URL, and expired-link redirects. Same password-first form as
 * the popup, in the branded ocean shell.
 *
 * A member arriving here from a dead login link is the one visitor who must NOT
 * see a password field first: they have no password, that is why they used a
 * link. The page said nothing at all about the expired link, so it read as
 * "your password is wrong". Now it says what happened and opens on "email me a
 * link".
 */
export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  // Optional round-trip target (e.g. an open survey link) — internal paths only.
  const { next, error } = await searchParams;
  const safeNext = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;
  const expired = error === "expired";
  return (
    <main className="min-h-[100svh] bg-[#00374a] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-8 w-auto invert mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white tracking-[-0.02em]">My NP7</h1>
          <p className="text-[14px] text-white/55 mt-1">Log in to manage your trips &amp; gear</p>
        </div>

        {expired && (
          <div className="mb-4 rounded-xl bg-[#ffb400]/15 border border-[#ffb400]/40 px-4 py-3">
            <p className="text-[13px] text-white font-semibold">That login link no longer works.</p>
            <p className="text-[12.5px] text-white/70 mt-1 leading-relaxed">
              A link can only be used once, and some company mail servers open it
              automatically before you do. Ask for a fresh one below, and if it
              keeps failing, use a private address.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-7">
          <AuthForm next={safeNext} initialMode={expired ? "magic" : "login"} />
        </div>

        <p className="text-center text-[12px] text-white/40 mt-6">
          Booked a trip but no account yet? <Link href="/experience" className="text-white/70 hover:text-white">Find your trip →</Link>
        </p>
      </div>
    </main>
  );
}
