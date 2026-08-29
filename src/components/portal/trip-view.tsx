"use client";

import { useEffect, useState } from "react";

type Tone = "coral" | "amber" | "green" | "cyan";
export type TripTile = {
  key: string; label: string; value: string; sub?: string; tone: Tone; tab?: string;
  attention?: boolean; done?: boolean; cta?: string;
  /**
   * Section to scroll to after the tab switches.
   *
   * Switching alone is invisible when the section already lives in the tab you
   * are on — the Crew tile sat inside the Trip tab, so on a trip whose Trip tab
   * was already open, tapping "16 going · meet them" did nothing at all.
   */
  anchor?: string;
};
export type TripTab = { key: string; label: string; attention?: boolean; content: React.ReactNode };

const LBL: Record<Tone, string> = { coral: "#993c1d", amber: "#9a6b16", green: "#0f6e56", cyan: "#0782a0" };

/** Icon per trip section, so the tab bar reads as app navigation (not filters). */
function tabIcon(key: string) {
  const p = { className: "w-[18px] h-[18px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (key) {
    case "payment": return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
    case "prep": return <svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    case "trip": return <svg {...p}><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>;
    case "docs": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case "photos": return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

/**
 * App-like trip shell: a persistent header (the next-step hero + at-a-glance
 * tiles) over a tab bar that swaps the detail below — no long scroll, one
 * section at a time. Tiles jump to their tab; tabs with a pending action carry
 * an attention dot so it's obvious what needs you.
 */
export function TripView({ hero, tiles, tabs, initial, title, statusLabel }: { hero: React.ReactNode; tiles: TripTile[]; tabs: TripTab[]; initial?: string; title?: string; statusLabel?: string }) {
  const [active, setActive] = useState<string>(() => (initial && tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key));
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 340);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  // In-page hash links (hero CTAs, "see how to pay") point at tabs, e.g.
  // href="#payment". Those tabs are swapped in and out of the DOM, so a native
  // anchor jump can't reach them — intercept the click and switch tab instead.
  // A few anchors target a section that lives inside a tab (e.g. #crew is in the
  // Trip tab): switch to that tab, then scroll to the section.
  const SUB_ANCHOR: Record<string, string> = { crew: "trip" };
  function handleHashNav(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const hash = (a.getAttribute("href") ?? "").slice(1);
    if (!hash) return;
    if (tabs.some((t) => t.key === hash)) {
      e.preventDefault();
      setActive(hash);
      requestAnimationFrame(() => document.getElementById("trip-content")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else if (SUB_ANCHOR[hash] && tabs.some((t) => t.key === SUB_ANCHOR[hash])) {
      e.preventDefault();
      setActive(SUB_ANCHOR[hash]);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <div onClickCapture={handleHashNav}>
      {hero}

      {/* at-a-glance tiles — three unambiguous states so it's instantly clear
          what needs the member vs what's handled:
            · attention → warm amber card, pulse dot + a "do it" verb
            · done      → calm card with a green check
            · info      → plain card, no cue                                   */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {tiles.map((t) => {
          const labelColor = t.done ? "#0f6e56" : t.attention ? "#9a6b16" : LBL[t.tone];
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: labelColor }}>{t.label}</p>
                {t.done ? (
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[#d8f3e7] text-[#0f6e56] grid place-items-center text-[9px] font-black leading-none">✓</span>
                ) : t.attention ? (
                  <span className="shrink-0 mt-0.5 w-2 h-2 rounded-full bg-[#f47b20] animate-pulse" />
                ) : null}
              </div>
              <p className="text-[15px] font-black text-[#00374a] mt-1 leading-tight">{t.value}</p>
              {t.sub && <p className="text-[11px] text-[#9aa6ac] mt-0.5">{t.sub}</p>}
              {t.attention && t.cta && (
                <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#c4621a]">
                  {t.cta}
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              )}
            </>
          );
          const base = `text-left rounded-2xl border p-3.5 block w-full ${
            t.attention ? "bg-[#fff8ef] border-[#f4c99a] shadow-[0_2px_10px_rgba(244,123,32,0.08)]" : t.done ? "bg-white border-[#e4efe9]" : "bg-white border-[#f0e6d6]"
          }`;
          return t.tab ? (
            <button
              key={t.key}
              onClick={() => {
                if (t.tab) setActive(t.tab);
                // After the tab has rendered — same two-step the hash links use.
                if (t.anchor) {
                  requestAnimationFrame(() =>
                    document.getElementById(t.anchor as string)?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  );
                }
              }}
              className={`${base} transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,55,74,0.07)]`}
            >{inner}</button>
          ) : (
            <div key={t.key} className={base}>{inner}</div>
          );
        })}
      </div>

      {/* sticky tab bar — sits just under the docked portal header (h-16). Once
          you scroll past the hero, a compact trip label slides in above the tabs
          so you always know which trip you're in without scrolling back up. */}
      <div className="mt-5 sticky top-16 z-20 -mx-5 sm:-mx-8 px-5 sm:px-8 py-2.5 bg-[#fff7ec]/95 backdrop-blur-sm border-b border-[#f0e6d6]">
        {title && (
          <div className={`flex items-center gap-2.5 overflow-hidden transition-all duration-300 ${scrolled ? "max-h-8 opacity-100 mb-2" : "max-h-0 opacity-0 mb-0"}`}>
            <span className="text-[13.5px] font-black text-[#00374a] truncate">{title}</span>
            {statusLabel && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-[#fdebd0] text-[#9a6b16]">{statusLabel}</span>
            )}
          </div>
        )}
        <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-[#f4ece0] p-1">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${on ? "bg-white shadow-[0_2px_8px_rgba(0,55,74,0.09)] text-[#00374a]" : "text-[#82909a] hover:text-[#00374a]"}`}
              >
                <span className="relative">
                  {tabIcon(t.key)}
                  {t.attention && !on && <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-[#f47b20]" />}
                </span>
                <span className="text-[11px] font-bold leading-none tracking-[-0.01em]">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div id="trip-content" className="mt-5 scroll-mt-28 bg-white rounded-2xl border border-[#f0e6d6] p-6">{current?.content}</div>
    </div>
  );
}
