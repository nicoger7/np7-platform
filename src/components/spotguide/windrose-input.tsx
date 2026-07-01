"use client";

import { WIND_DIRECTIONS, WIND_QUALITY_META, type WindQuality } from "@/lib/spotguide";

/** Compact 8-direction windrose editor — click a direction to cycle
    best → works → no-go → clear. Used in the member "your visit" form. */
export function WindroseInput({ value, onChange, size = 150 }: { value: Record<string, string>; onChange: (w: Record<string, string>) => void; size?: number }) {
  const cycle: WindQuality[] = ["", "best", "good", "no"];
  const bump = (dir: string) => {
    const cur = (value[dir] ?? "") as WindQuality;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    const w = { ...value };
    if (next) w[dir] = next; else delete w[dir];
    onChange(w);
  };
  const grid = [["NW", "N", "NE"], ["W", "", "E"], ["SW", "S", "SE"]];
  const colorFor = (q: string) => WIND_QUALITY_META.find((m) => m.id === q)?.color ?? "#dcd3c2";

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="grid grid-cols-3 gap-1.5" style={{ width: size }}>
        {grid.flat().map((dir, i) =>
          dir === "" ? (
            <div key={i} className="aspect-square grid place-items-center text-[10px] text-[#c3b9a6]">↻</div>
          ) : (
            <button key={i} type="button" onClick={() => bump(dir)}
              className="aspect-square rounded-lg text-xs font-bold grid place-items-center transition-colors"
              style={{ backgroundColor: value[dir] ? `${colorFor(value[dir])}22` : "#fff", border: `1px solid ${value[dir] ? colorFor(value[dir]) : "#e2d8c6"}`, color: value[dir] ? colorFor(value[dir]) : "#8a9aa0" }}>
              {dir}
            </button>
          )
        )}
      </div>
      <ul className="space-y-1">
        {WIND_QUALITY_META.map((m) => (
          <li key={m.id} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#5a6b72]"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />{m.label}</li>
        ))}
        <li className="text-[10.5px] text-[#9aa6ac] pt-0.5">Tap a direction</li>
      </ul>
    </div>
  );
}
