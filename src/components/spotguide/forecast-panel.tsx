"use client";

import { forecastLabel, forecastModel, type ForecastTally } from "@/lib/spotguide";
import { ForecastVoter } from "./raters";

/**
 * "Best forecast here." NP7's recommended model(s) + the crowd vote rendered
 * like the windrose: colour + placement show which model riders trust most, so
 * "most likely correct" reads at a glance. The VOTER lives right here too and
 * the panel renders on EVERY spot — members kept missing the vote when it was
 * buried in the contribute fold and hidden entirely on spots without NP7 models.
 */
export function ForecastPanel({ spotId, np7Models, tally, accent = "#00afdb" }: { spotId: string; np7Models: string[]; tally: ForecastTally[]; accent?: string }) {
  const top = tally[0];
  // Folded by default (like the wind statistics): the summary line already
  // carries the answer — NP7's pick or the crowd favourite — so most riders
  // never need to open it; the vote UI is one tap away.
  const teaser = np7Models.length
    ? `NP7 rides ${np7Models.map((id) => forecastLabel(id)).join(" + ")}`
    : top ? `Riders trust ${top.label}` : "No votes yet — be the first";
  return (
    <details className="group/fc rounded-xl bg-[#fdfaf3] border border-[#f0e9da] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
        <span className="min-w-0 flex items-baseline gap-2.5 truncate">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac]">Best forecast here</span>
          <span className="truncate text-[12px] font-semibold text-[#6a7a80]">{teaser}</span>
        </span>
        <svg className="shrink-0 w-4 h-4 text-[#c0ccd0] transition-transform group-open/fc:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="px-4 pb-4">

      {np7Models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] font-black uppercase tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${accent}1a`, color: accent }}>NP7</span>
          {np7Models.map((id) => (
            <span key={id} className="text-[12.5px] font-bold text-[#00374a] bg-white border border-[#ece3d3] rounded-full px-2.5 py-1" title={forecastModel(id)?.note}>{forecastLabel(id)}</span>
          ))}
        </div>
      )}

      {tally.length > 0 ? (
        <div>
          <p className="text-[12px] text-[#6a7a80] mb-2">
            Riders trust <b className="text-[#00374a]">{top.label}</b> most here{top.pct ? ` (${top.pct}% of votes)` : ""}.
          </p>
          <div className="space-y-1.5">
            {tally.map((t, i) => (
              <div key={t.model} className="flex items-center gap-2">
                <span className="w-24 sm:w-28 shrink-0 text-[12.5px] font-semibold truncate" style={{ color: i === 0 ? "#1f9e57" : "#5a6b72" }}>{t.label}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-[#e7ecee]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(t.pct, 4)}%`, backgroundColor: i === 0 ? "#1f9e57" : "#9bb0a4" }} />
                </div>
                <span className="w-10 text-right text-[11.5px] text-[#9aa6ac]">{t.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-[#9aa6ac]">No votes yet — be the first.</p>
      )}

      {/* vote right where the result shows — your pick is ticked, tap to change */}
      <ForecastVoter spotId={spotId} accent={accent} />
      </div>
    </details>
  );
}
