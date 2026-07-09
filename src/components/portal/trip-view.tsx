"use client";

import { useEffect, useState } from "react";

type Tone = "coral" | "amber" | "green" | "cyan";
export type TripTile = { key: string; label: string; value: string; sub?: string; tone: Tone; tab?: string };
export type TripTab = { key: string; label: string; attention?: boolean; content: React.ReactNode };

const LBL: Record<Tone, string> = { coral: "#993c1d", amber: "#9a6b16", green: "#0f6e56", cyan: "#0782a0" };

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

  return (
    <>
      {hero}

      {/* at-a-glance tiles — persistent; each jumps to its tab. Action tiles
          (coral/amber) get a warm border so they clearly pop. */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {tiles.map((t) => {
          const attention = t.tone === "coral" || t.tone === "amber";
          const inner = (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: LBL[t.tone] }}>{t.label}</p>
              <p className="text-[15px] font-black text-[#00374a] mt-1 leading-tight">{t.value}</p>
              {t.sub && <p className="text-[11px] text-[#9aa6ac] mt-0.5">{t.sub}</p>}
            </>
          );
          const base = `text-left rounded-2xl border p-3.5 block w-full ${attention ? "bg-[#fffaf4] border-[#f3c9a0]" : "bg-white border-[#f0e6d6]"}`;
          return t.tab ? (
            <button key={t.key} onClick={() => t.tab && setActive(t.tab)} className={`${base} transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,55,74,0.07)]`}>{inner}</button>
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
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${on ? "bg-[#00374a] text-white" : "bg-white border border-[#e7dcc9] text-[#5a6b72] hover:text-[#00374a]"}`}
              >
                {t.label}
                {t.attention && !on && <span className="w-1.5 h-1.5 rounded-full bg-[#f47b20]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 bg-white rounded-2xl border border-[#f0e6d6] p-6">{current?.content}</div>
    </>
  );
}
