"use client";

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
 * The choice lives in SelectedEditionProvider rather than in this component,
 * because three things follow it: this panel, the crew section further down,
 * and the date chips up in the hero. One shared value keeps them from
 * disagreeing about which clinic the visitor is looking at.
 *
 * Every run's panel is rendered on the server and handed here as `panels`; this
 * component only decides which one is visible. That keeps the ticket box —
 * prices, deposits, balance dates — server-rendered and identical to what
 * checkout will charge.
 */
export type ClinicRun = {
  /** Edition id — the shared key the crew and the hero chips also select on. */
  editionId: string | null;
  place: string | null;
  dateLabel: string;
  slug: string | null;
};

/** Which run is on screen. Falls back to the first when the shared id is a week
 *  this series does not have (a trip edition, or nothing selected yet). */
export function runIndex(runs: ClinicRun[], id: string | null): number {
  const i = runs.findIndex((r) => r.editionId && r.editionId === id);
  return i === -1 ? 0 : i;
}

export function ClinicEditions({
  runs, panels,
}: { runs: ClinicRun[]; panels: React.ReactNode[] }) {
  const { id, setId } = useSelectedEdition();
  const sel = runIndex(runs, id);

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
          <div role="tablist" aria-label="Choose a clinic" className="flex flex-wrap justify-center gap-2.5">
            {runs.map((r, i) => {
              const on = i === sel;
              return (
                <button
                  key={r.slug ?? i}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => r.editionId && setId(r.editionId)}
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
      <div>{panels[sel]}</div>
    </div>
  );
}

/**
 * The hero's run chips — place and date together, which is the pair that tells
 * you whether a clinic is for you.
 *
 * They replace a summary line ("2 clinics · Avon, Oct 2026 · Hood River, Sept
 * 2027") that spent the most valuable line on the page counting things. A chip
 * selects its run and takes you to it, so the hero is a way IN to the clinics
 * rather than a sentence about them.
 */
export function ClinicDateChips({ runs }: { runs: ClinicRun[] }) {
  const { id, setId } = useSelectedEdition();
  if (runs.length === 0) return null;
  const sel = runIndex(runs, id);

  return (
    <div className="flex flex-wrap gap-2.5 mb-7">
      {runs.map((r, i) => {
        const on = runs.length > 1 && i === sel;
        return (
          <a
            key={r.slug ?? i}
            href="#packages"
            onClick={() => r.editionId && setId(r.editionId)}
            /* The trip hero's own pill language — the cyan "2 weeks" chip and
               the white-outline review pill. A clinic hero is meant to read as
               the same header, so the picked run uses the cyan treatment that
               already exists rather than inventing a warm variant. */
            className={`group inline-flex items-baseline gap-2 rounded-full border px-4 py-2.5 transition-all ${
              on
                ? "border-[#00afdb]/30 bg-[#00afdb]/15 text-white"
                : "border-white/30 text-white/85 hover:border-white/60 hover:bg-white/10"
            }`}
          >
            <span className={`text-[13.5px] font-black tracking-[-0.01em] ${on ? "text-[#5fd0e8]" : ""}`}>{r.place || "NP7 clinic"}</span>
            <span className="text-[13px] text-white/65 group-hover:text-white/85">{r.dateLabel}</span>
          </a>
        );
      })}
    </div>
  );
}
