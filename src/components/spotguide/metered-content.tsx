"use client";

import { useSpotguide } from "./spotguide-provider";

/**
 * Metered access that stays SEO-safe AND reacts instantly to login. The children
 * are ALWAYS rendered into the (server) HTML so search engines index the full
 * guide — no cloaking. For anonymous visitors the section is clipped to a teaser
 * with a free-signup wall; the moment the member signs in (via the shared
 * provider AuthModal) `loggedIn` flips and the wall disappears — no page refresh.
 */
export function MeteredContent({ accent = "#00afdb", children }: { accent?: string; children: React.ReactNode }) {
  const sg = useSpotguide();
  if (sg.loggedIn) return <>{children}</>;

  return (
    <div className="sg-gated relative">
      <div className="relative max-h-[540px] overflow-hidden">
        <div className="pointer-events-none select-none">{children}</div>
      </div>

      {/* fade + wall */}
      <div className="relative -mt-28 sm:-mt-36 pointer-events-none h-28 sm:h-36 bg-gradient-to-b from-transparent to-[#fff7ec]" />
      <div className="relative text-center rounded-3xl border border-[#ece3d3] bg-white px-6 py-10 sm:px-10 sm:py-12 shadow-[0_18px_44px_rgba(0,55,74,0.08)]">
        <span className="mx-auto mb-5 grid place-items-center w-14 h-14 rounded-2xl" style={{ backgroundColor: `${accent}1a`, color: accent }}>
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        </span>
        <h2 className="text-2xl sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">Keep reading — it&apos;s free</h2>
        <p className="mt-3 text-[15.5px] text-[#6a7a80] leading-relaxed max-w-[440px] mx-auto">
          Create a free NP7 account to see every spot, rate them and unlock the full guide. No payment — you&apos;re one tap in.
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[#5a6b72]">
          {["Every spot in full", "Rate & add spots", "Members-only guides"].map((b) => (
            <li key={b} className="inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" style={{ color: accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{b}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={sg.needAuth} className="w-full sm:w-auto px-8 py-3.5 rounded-full text-[14px] font-bold text-white transition-all hover:-translate-y-0.5" style={{ backgroundColor: accent, boxShadow: `0 8px 24px ${accent}66` }}>Create free account</button>
          <button onClick={sg.needAuth} className="text-[13.5px] font-bold text-[#5a6b72] hover:text-[#00374a] transition-colors">Already a member? Log in</button>
        </div>
      </div>
    </div>
  );
}
