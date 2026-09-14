"use client";

import { GEAR_LABELS, type GearChoice, type GearOptions } from "@/lib/gear-shape";

/**
 * The three-way gear choice: the picker's hero toggle, and the quiet version
 * under each companion in the group roster.
 *
 * One component rather than two copies of the markup, because these are the
 * words a guest decides on: the payer and the friend they are booking for have
 * to be offered the same three things in the same three words, and a second
 * copy drifts. Still no prices on the pills themselves. The total adjusts, the
 * deltas stay backstage (Nico, 2026-08-27).
 */
export function GearPills({ options, value, rentalId, onChange, fmt, tone = "hero" }: {
  options: GearOptions;
  value: GearChoice;
  /** The chosen rental upgrade tier, null = the base tier. */
  rentalId: string | null;
  onChange: (gear: GearChoice, rentalId: string | null) => void;
  fmt: (n: number) => string;
  /** "hero" is the picker's full-size row; "quiet" is the roster's, sized to
   *  sit under a companion's package without competing with it. */
  tone?: "hero" | "quiet";
}) {
  const quiet = tone === "quiet";
  const pills: { key: GearChoice; label: string }[] = [
    ...(options.deltas.rental != null ? [{ key: "rental" as const, label: GEAR_LABELS.rental }] : []),
    ...(options.deltas.storage != null ? [{ key: "storage" as const, label: GEAR_LABELS.storage }] : []),
    { key: "none" as const, label: GEAR_LABELS.none },
  ];

  return (
    <div>
      <div className={`inline-flex rounded-full bg-white border border-[#e6eef0] shadow-sm ${quiet ? "p-0.5" : "p-1"}`}>
        {pills.map((opt) => (
          <button key={opt.key} type="button"
            /* The tier rides along untouched: flipping to own gear and back
               must not quietly drop the upgrade the guest had picked. */
            onClick={() => onChange(opt.key, rentalId)}
            className={`rounded-full font-bold transition-colors ${quiet ? "px-3 py-1.5 text-[12px]" : "px-4 sm:px-5 py-2 text-[13px]"} ${
              value === opt.key
                ? opt.key === "rental"
                  ? "text-[#00374a] font-extrabold shadow-sm"           /* premium: the sun gradient */
                  : "bg-[#eef7fa] text-[#00374a] border border-[#cde9f2]" /* the quiet, light versions */
                : "text-[#8a97a0] hover:text-[#00374a]"
            }`}
            style={value === opt.key && opt.key === "rental" ? { background: "linear-gradient(90deg,#ffc42e,#f0774a)" } : undefined}>
            {opt.key === "rental" ? "★ " : ""}{opt.label}
          </button>
        ))}
      </div>
      {value === "rental" && options.rentalTiers && (
        <div className={`flex flex-wrap gap-2 ${quiet ? "mt-2" : "mt-2.5"}`}>
          {options.rentalTiers.map((t, ti) => {
            const on = rentalId ? rentalId === t.id : ti === 0;
            return (
              <button key={t.id} type="button"
                onClick={() => onChange("rental", ti === 0 ? null : t.id)}
                className={`rounded-full font-bold border-2 transition-colors ${quiet ? "px-3 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12.5px]"} ${on ? "border-[#f0774a] bg-[#fff4ec] text-[#00374a]" : "border-[#e6eef0] bg-white text-[#5a6b72] hover:border-[#f5c9b2]"}`}>
                {t.name}{t.delta > 0 ? ` · +${fmt(t.delta)}` : " · included"}
              </button>
            );
          })}
        </div>
      )}
      <p className={`text-[#5a6b72] ${quiet ? "text-[11.5px] leading-snug mt-1.5" : "text-[12.5px] mt-2"}`}>
        {value === "rental" ? "Latest boards & sails for the whole week, all sorted for you."
          : value === "storage" ? "You bring your own kit, it stays rigged and stored at the centre."
          : "You bring and handle your own gear."}
      </p>
    </div>
  );
}
