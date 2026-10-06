"use client";

import { useState } from "react";
import { LEVEL_DESCRIPTIONS, type Level } from "@/lib/member-level";
import { SPOT_LEVELS } from "@/lib/spot-levels";

/** The spotguide's one level list (form, filter and spot rows), re-exported
    for client components. Server code imports it from @/lib/spot-levels. */
export { SPOT_LEVELS, normalizeSpotLevels, type SpotLevel } from "@/lib/spot-levels";

/** Modern, on-brand level selector — pill buttons + a one-line definition of the
    picked level. Single-select by default (value/onChange); pass `multiple` with
    values/onValues to let a spot suit several levels (toggle any number). */
export function LevelPicker({ value, onChange, values, onValues, multiple = false, accent = "#00afdb" }: {
  value?: string; onChange?: (v: string) => void;
  values?: string[]; onValues?: (v: string[]) => void;
  multiple?: boolean; accent?: string;
}) {
  const sel = multiple ? (values ?? []) : (value ? [value] : []);
  // Six levels only help if a rider can tell Expert from Semi-Pro, and the
  // definitions lived in a hover title a phone never shows (Nico, 6 Oct 2026).
  // In multi-select, the level just tapped on explains itself under the pills.
  const [lastOn, setLastOn] = useState<string | null>(null);
  const toggle = (l: string) => {
    if (multiple) {
      const has = sel.includes(l);
      setLastOn(has ? null : l);
      onValues?.(has ? sel.filter((x) => x !== l) : [...sel, l]);
    } else { onChange?.(value === l ? "" : l); }
  };
  const explain = multiple ? (lastOn && sel.includes(lastOn) ? lastOn : null) : value || null;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {SPOT_LEVELS.map((l) => {
          const on = sel.includes(l);
          return (
            <button key={l} type="button" onClick={() => toggle(l)} title={LEVEL_DESCRIPTIONS[l]} aria-pressed={on}
              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
              style={on ? { backgroundColor: accent, color: "#fff" } : { border: "1px solid #e2d8c6", color: "#5a6b72" }}>
              {l}
            </button>
          );
        })}
      </div>
      {explain && LEVEL_DESCRIPTIONS[explain as Level] && (
        <p className="text-[11.5px] text-[#9aa6ac] mt-1.5 leading-snug">
          {multiple && <b className="font-semibold text-[#6a7a80]">{explain}: </b>}{LEVEL_DESCRIPTIONS[explain as Level]}
        </p>
      )}
    </div>
  );
}
