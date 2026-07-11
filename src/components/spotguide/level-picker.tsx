"use client";

import { LEVELS, LEVEL_DESCRIPTIONS, type Level } from "@/lib/member-level";

/** Modern, on-brand level selector — pill buttons + a one-line definition of the
    picked level. Single-select by default (value/onChange); pass `multiple` with
    values/onValues to let a spot suit several levels (toggle any number). */
export function LevelPicker({ value, onChange, values, onValues, multiple = false, accent = "#00afdb" }: {
  value?: string; onChange?: (v: string) => void;
  values?: string[]; onValues?: (v: string[]) => void;
  multiple?: boolean; accent?: string;
}) {
  const sel = multiple ? (values ?? []) : (value ? [value] : []);
  const toggle = (l: string) => {
    if (multiple) { const has = sel.includes(l); onValues?.(has ? sel.filter((x) => x !== l) : [...sel, l]); }
    else { onChange?.(value === l ? "" : l); }
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {LEVELS.map((l) => {
          const on = sel.includes(l);
          return (
            <button key={l} type="button" onClick={() => toggle(l)} title={LEVEL_DESCRIPTIONS[l]}
              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
              style={on ? { backgroundColor: accent, color: "#fff" } : { border: "1px solid #e2d8c6", color: "#5a6b72" }}>
              {l}
            </button>
          );
        })}
      </div>
      {!multiple && value && LEVEL_DESCRIPTIONS[value as Level] && (
        <p className="text-[11.5px] text-[#9aa6ac] mt-1.5 leading-snug">{LEVEL_DESCRIPTIONS[value as Level]}</p>
      )}
    </div>
  );
}
