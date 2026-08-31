"use client";

import { useState } from "react";

/**
 * The one Download button for a trip's media, expanding into a choice row:
 * "Just yours" / "Week memories" / "Everything". Born from a founder note —
 * the old pair of buttons ("my photos" + "all photos") collapsed to a lone
 * "all" whenever the member had no own uploads, which read as all-or-nothing.
 *
 * Choice semantics live with the caller; this component only encodes the
 * shared rule: a choice with `usesCredit` burns one of the booking's full
 * downloads (photos and videos each have their own 3), "just yours" never
 * does. A single available choice skips the chooser and downloads directly.
 */
export type DownloadChoice = {
  key: string;
  label: string;
  count: number;
  /** Burns one of the booking's full downloads (own media never does). */
  usesCredit?: boolean;
};

export function DownloadMenu({ label, unit, choices, remaining, busy, error, onPick }: {
  label: string;
  /** "photo" / "video" — for the counts in the choice chips. */
  unit: string;
  choices: DownloadChoice[];
  remaining: number;
  /** Progress text while a zip is being built — disables everything. */
  busy?: string;
  error?: string;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const real = choices.filter((c) => c.count > 0);
  if (real.length === 0) return null;
  const single = real.length === 1;
  const anyCredit = real.some((c) => c.usesCredit);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => (single ? onPick(real[0].key) : setOpen((v) => !v))}
          disabled={!!busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          {busy ? busy : label}
          {!busy && !single && (
            <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          )}
        </button>
        {anyCredit && (
          <span className="text-[12.5px] text-[#8a9aa0]">
            {remaining > 0 ? `${remaining} full download${remaining === 1 ? "" : "s"} left` : "No full downloads left"}
          </span>
        )}
      </div>
      {open && !single && !busy && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {real.map((c) => {
            const blocked = !!c.usesCredit && remaining <= 0;
            return (
              <button
                key={c.key}
                type="button"
                disabled={blocked}
                onClick={() => { setOpen(false); onPick(c.key); }}
                className="inline-flex items-baseline gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold border bg-white text-[#00374a] border-[#e2e9ec] hover:border-[#00afdb] disabled:opacity-45 disabled:hover:border-[#e2e9ec] transition-colors"
              >
                {c.label}
                <span className="opacity-60 tabular-nums font-semibold">{c.count} {unit}{c.count === 1 ? "" : "s"}</span>
                {c.usesCredit && <span className="text-[11px] font-semibold text-[#c4621a]/80">· uses a download</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-[12.5px] text-[#c4621a] mt-2">{error}</p>}
    </div>
  );
}
