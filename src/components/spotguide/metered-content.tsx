"use client";

import { useSpotguide } from "./spotguide-provider";

/**
 * Metered access that stays SEO-safe AND reacts instantly to login. The children
 * are ALWAYS rendered into the (server) HTML so search engines index the full
 * guide — no cloaking. For anonymous visitors the section is clipped to a teaser
 * with a free-signup wall; the moment the member signs in (via the shared
 * provider AuthModal) `loggedIn` flips and the wall disappears — no page refresh.
 *
 * The wall is COMMUNITY-FORWARD and adapts to how much is here yet: early on
 * (few spots) it leads with the invitation to contribute — "a rider-built guide,
 * add your home spot" — which turns thin coverage into a reason to join rather
 * than a weakness. Once there's real volume it leads with that instead. Value
 * bullets are features (always true), so nothing is ever inflated.
 */
export function MeteredContent({ accent = "#00afdb", children, spotCount, destName }: { accent?: string; children: React.ReactNode; spotCount?: number; destName?: string | null }) {
  const sg = useSpotguide();
  if (sg.loggedIn) return <>{children}</>;

  // Few spots so far → invite people to build it; enough → sell the volume.
  const community = spotCount == null || spotCount < 8;
  const where = destName ? ` in ${destName}` : "";
  const heading = community ? "A rider-built spotguide" : `See all ${spotCount} spots — free`;
  const blurb = community
    ? `The NP7 spotguide is built by riders, for riders. Rate the spots you know and put your home spot${where} on the map — a free account and you're one tap in.`
    : `${spotCount} spots, rated by NP7 and the crew — with wind stats, crowd forecasts and the local tips you won't find on a map. Free account, no payment.`;

  const bullets = ["Rate the spots you know", "Add your home spot", "Wind stats & crowd forecasts", "Members' tips"];

  return (
    <div className="sg-gated relative">
      {/* Just a taste — the first couple of spots — then the wall. The full list
          stays in the DOM (below, clipped) so search engines still index it. */}
      <div className="relative max-h-[260px] sm:max-h-[300px] overflow-hidden">
        <div className="pointer-events-none select-none">{children}</div>
      </div>

      {/* fade + wall */}
      <div className="relative -mt-24 sm:-mt-28 pointer-events-none h-24 sm:h-28 bg-gradient-to-b from-transparent to-[#fff7ec]" />
      <div className="relative text-center rounded-3xl border border-[#ece3d3] bg-white px-6 py-10 sm:px-10 sm:py-12 shadow-[0_18px_44px_rgba(0,55,74,0.08)]">
        <span className="mx-auto mb-5 grid place-items-center w-14 h-14 rounded-2xl" style={{ backgroundColor: `${accent}1a`, color: accent }}>
          {community ? (
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
          ) : (
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          )}
        </span>
        <h2 className="text-2xl sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">{heading}</h2>
        <p className="mt-3 text-[15.5px] text-[#6a7a80] leading-relaxed max-w-[460px] mx-auto">{blurb}</p>

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold text-[#5a6b72]">
          {bullets.map((b) => (
            <li key={b} className="inline-flex items-center gap-1.5">
              <svg className="w-4 h-4" style={{ color: accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{b}
            </li>
          ))}
        </ul>

        {community && (
          <p className="mt-6 inline-flex items-center gap-2 text-[12.5px] font-bold rounded-full px-4 py-2" style={{ backgroundColor: `${accent}14`, color: accent }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            Be one of the first to put your spot{where} on the map
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => sg.needAuth("register")} className="w-full sm:w-auto px-8 py-3.5 rounded-full text-[14px] font-bold text-white transition-all hover:-translate-y-0.5" style={{ backgroundColor: accent, boxShadow: `0 8px 24px ${accent}66` }}>
            {community ? "Join & add your spot" : "Create free account"}
          </button>
          <button onClick={() => sg.needAuth("login")} className="text-[13.5px] font-bold text-[#5a6b72] hover:text-[#00374a] transition-colors">Already a member? Log in</button>
        </div>
        <p className="mt-3 text-[12px] text-[#9aa6ac]">Free — no payment, ever.</p>
      </div>
    </div>
  );
}
