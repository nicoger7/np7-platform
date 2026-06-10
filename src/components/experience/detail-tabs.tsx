"use client";

import { useState } from "react";

export type DetailTab = { id: string; label: string; content: React.ReactNode };

/**
 * Tabbed details module — collapses the long stack of detail sections
 * (Overview, The spot, Perfect week, The crew, FAQ) into one tabbed panel so
 * the event page stops being an endless scroll. Server-rendered content is
 * passed in per tab; only the active one is shown.
 */
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      {/* tab bar */}
      <div className="sticky top-0 z-30 bg-white/92 backdrop-blur-lg border-b border-[#ebebeb]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-8">
          <div role="tablist" className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((t) => {
              const on = t.id === active;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(t.id)}
                  className={`shrink-0 px-4 sm:px-5 py-4 text-[13px] sm:text-[13.5px] font-bold whitespace-nowrap border-b-2 transition-colors ${
                    on ? "border-[#00afdb] text-[#00374a]" : "border-transparent text-[#9aa6ac] hover:text-[#00374a]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* active panel */}
      <div key={current?.id} className="dt-panel">
        {current?.content}
      </div>

      <style>{`
        @keyframes dtIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .dt-panel { animation: dtIn .35s ease; }
        @media (prefers-reduced-motion: reduce) { .dt-panel { animation: none; } }
      `}</style>
    </div>
  );
}
