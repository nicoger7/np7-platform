"use client";

import { useEffect, useState } from "react";
import { useSelectedEdition } from "@/components/experience/selected-edition";

/**
 * The selector that splits a clinic series page in half.
 *
 * Above it the page explains the FORMAT — one series, one set of ideas about
 * coaching, whichever coast it lands on. Below it everything belongs to one run:
 * its place, its dates, its coach, its price, its ticket.
 *
 * It switches in place rather than navigating. A series is one page that sits
 * next to the trips, so comparing two runs should cost a click, not a page load
 * — and a visitor who came to read about the coaching should never be thrown
 * back to the top of a fresh page for choosing a date.
 *
 * Every run's panel is rendered on the server and handed here as `panels`; this
 * component only decides which one is visible. That keeps the ticket box —
 * prices, deposits, balance dates — server-rendered and identical to what
 * checkout will charge.
 */
export type ClinicRun = {
  /** Edition id, so the rest of the page (the crew) follows the same choice. */
  editionId: string | null;
  place: string | null;
  dateLabel: string;
  slug: string | null;
};

export function ClinicEditions({
  runs, panels, initialSlug = null,
}: { runs: ClinicRun[]; panels: React.ReactNode[]; initialSlug?: string | null }) {
  const start = Math.max(0, initialSlug ? runs.findIndex((r) => r.slug === initialSlug) : 0);
  const [sel, setSel] = useState(start);
  const { setId } = useSelectedEdition();
  const run = runs[sel];

  /* The crew section lives further down the page and follows the shared
     selection, so choosing a run here has to publish it. */
  useEffect(() => {
    const id = runs[sel]?.editionId;
    if (id) setId(id);
  }, [sel, runs, setId]);

  if (runs.length === 0) return null;
  const places = new Set(runs.map((r) => r.place).filter(Boolean));
  const travels = places.size > 1;

  return (
    <div>
      {runs.length > 1 && (
        <div className="mb-9">
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3 text-center">
            {travels ? "PICK YOUR CLINIC" : "PICK YOUR DATE"}
          </p>
          <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-2 text-center">
            {travels ? "Same coaching, different coast" : "Which one suits you?"}
          </h2>
          <p className="text-[15.5px] text-[#6a7a80] mb-7 text-center max-w-[54ch] mx-auto">
            Everything below — the spot, the dates, your coach and the price — changes with the one you pick.
          </p>
          <div
            role="tablist"
            aria-label="Choose a clinic"
            className="flex flex-wrap justify-center gap-2.5"
          >
            {runs.map((r, i) => {
              const on = i === sel;
              return (
                <button
                  key={r.slug ?? i}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => setSel(i)}
                  className={`rounded-2xl border px-5 py-3 text-left transition-all ${
                    on
                      ? "border-[#00afdb] bg-white shadow-[0_8px_28px_rgba(0,55,74,0.10)]"
                      : "border-[#e3e9ec] bg-white/70 hover:border-[#00afdb] hover:bg-white"
                  }`}
                >
                  <span className={`block text-[15.5px] font-black ${on ? "text-[#00374a]" : "text-[#4a5b62]"}`}>
                    {r.place || "NP7 clinic"}
                  </span>
                  <span className="block text-[13px] text-[#6a7a80] mt-0.5">{r.dateLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Only the chosen run is mounted: a hidden ticket box is still a form,
          and two of them on one page is two ways to buy the wrong clinic. */}
      <div key={run?.slug ?? sel}>{panels[sel]}</div>
    </div>
  );
}
