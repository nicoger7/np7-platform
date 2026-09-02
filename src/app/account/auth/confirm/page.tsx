import Link from "next/link";
import { redirect } from "next/navigation";
import { NP7_LOGO } from "@/components/experience/ocean-header";

/**
 * The landing page for every one-time link we email: member magic links, team
 * invites, admin password resets.
 *
 * It used to verify the token on GET and redirect straight in. That is exactly
 * what a corporate mail scanner breaks. Berliner Seilfabrik's gateway fetched
 * David Koehler's link 3 to 6 seconds after each of five emails left our
 * server, before he had opened the message at all. A Supabase OTP is single
 * use, so the scanner spent it, the session landed in the scanner and was
 * thrown away, and David reached a login form asking for a password he had
 * never set. Five links, five dead ends, one lost afternoon.
 *
 * So the GET no longer costs anything: it renders this page. The token is only
 * spent when a person presses the button, because scanners fetch URLs, they do
 * not submit forms. One extra tap for everyone, in exchange for the link
 * working at all behind a company mail server.
 */
export const metadata = {
  title: "Log in — NP7",
  // The token sits in the query string: keep it out of search engines and out
  // of the Referer header of anything this page links to.
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const tokenHash = sp.token_hash ?? "";
  const type = sp.type ?? "";
  if (!tokenHash || !type) redirect("/account/login");

  // Internal paths only (guards against open redirects).
  const next = typeof sp.next === "string" && /^\/(?!\/)/.test(sp.next) ? sp.next : "/account";
  const isReset = type === "recovery";
  const isAdmin = next.startsWith("/admin");

  return (
    <main className="min-h-[100svh] bg-[#00374a] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_LOGO} alt="NP7" className="h-8 w-auto invert mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white tracking-[-0.02em]">
            {isReset ? "Set a new password" : isAdmin ? "NP7 Admin" : "My NP7"}
          </h1>
        </div>

        <div className="bg-white rounded-2xl p-7 text-center">
          <p className="text-[15px] text-[#00374a] font-semibold">
            {isReset ? "Ready when you are." : "You're one tap away."}
          </p>
          <p className="text-[13.5px] text-[#5a6b72] mt-2 leading-relaxed">
            {isReset
              ? "Press the button to open the page where you choose your new password."
              : "Press the button below and we'll log you in. No password needed."}
          </p>

          <form action="/account/auth/confirm/verify" method="POST" className="mt-6">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="w-full rounded-xl bg-[#00afdb] text-white font-bold text-[15px] py-3.5 hover:bg-[#0098bd] transition-colors"
            >
              {isReset ? "Choose a new password" : "Log me in"}
            </button>
          </form>

          <p className="text-[11.5px] text-[#8a999f] mt-5 leading-relaxed">
            The link works once and only from this button, so nothing can use it
            before you do.
          </p>
        </div>

        <p className="text-center text-[12px] text-white/40 mt-6">
          Didn&apos;t ask for this?{" "}
          <Link href="/" className="text-white/70 hover:text-white">
            Ignore this page
          </Link>
        </p>
      </div>
    </main>
  );
}
