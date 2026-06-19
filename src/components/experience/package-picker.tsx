"use client";

import { useMemo, useState } from "react";
import { ReserveModal, DEPOSIT_EUR, type ReserveContext } from "./reserve-modal";

export type RealPackage = {
  id: string;
  level: string;
  accommodation: string;
  price: number;
  hotelName?: string | null;
  hotelImage?: string | null;
  hotelImages?: string[] | null;
  hotelDescription?: string | null;
};

export type ReserveTarget = {
  experienceId: string;
  experienceTitle: string;
  editionId: string | null;
  editionLabel: string | null;
  editionDates: string | null;
};

type Props = {
  packages: RealPackage[];
  currency?: string;
  deposit?: number | null;
  reserve?: ReserveTarget;
};

/** Short "who's this for / what you'll learn" note per coaching level. */
function levelGuide(level: string): { title: string; blurb: string } | null {
  const l = (level || "").toLowerCase();
  if (/beginner|starter|first/.test(l))
    return {
      title: "Beginner",
      blurb: "Never windsurfed, or just a few lessons in — you'll nail the basics: getting going, steering and using the harness, with your own dedicated beginner coach (not the head coach).",
    };
  if (/advanced|pro|inter/.test(l))
    return {
      title: "Advanced",
      blurb: "You've got the basics down. Now level up: planing, footstraps, the power jibe, controlled and light-wind planing and more — plus deep-dive theory and gear & technique workshops with head coach Nico.",
    };
  return null;
}

const STANDARD_INCLUDES = [
  "6 days of pro coaching",
  "Daily video analysis",
  "Pro gear rental included",
  "Breakfast every morning",
  "Airport transfers on site",
];

/**
 * Live two-axis package picker driven by real exp_packages data.
 * Choose a coaching level, then an accommodation — the price updates instantly.
 * The page's primary conversion module.
 */
export function PackagePicker({ packages, currency = "EUR", reserve }: Props) {
  const [showReserve, setShowReserve] = useState(false);
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-US")}`;

  // distinct levels, beginner pushed last
  const levels = useMemo(() => {
    const uniq = Array.from(new Set(packages.map((p) => p.level)));
    return uniq.sort((a, b) => {
      const ab = /beginner|starter/i.test(a) ? 1 : 0;
      const bb = /beginner|starter/i.test(b) ? 1 : 0;
      return ab - bb;
    });
  }, [packages]);

  const [level, setLevel] = useState(levels[0]);

  const accommodations = useMemo(
    () =>
      packages
        .filter((p) => p.level === level)
        .sort((a, b) => a.price - b.price),
    [packages, level]
  );

  const [accId, setAccId] = useState(accommodations[0]?.id);

  // keep accommodation valid when level changes
  const selected =
    accommodations.find((a) => a.id === accId) ?? accommodations[0];

  const onLevel = (lv: string) => {
    setLevel(lv);
    const first = packages
      .filter((p) => p.level === lv)
      .sort((a, b) => a.price - b.price)[0];
    setAccId(first?.id);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(330px,380px)] gap-6 lg:gap-8 items-start">
      <div className="space-y-8">
        {/* level */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">1 · Coaching level</p>
          <div role="tablist" className="flex flex-wrap gap-3">
            {levels.map((lv) => {
              const active = lv === level;
              return (
                <button
                  key={lv}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onLevel(lv)}
                  className={`px-5 py-3 rounded-xl border text-[14px] font-bold transition-all ${
                    active
                      ? "border-[#00afdb] bg-[#00afdb]/[0.06] text-[#00374a] shadow-[0_6px_20px_rgba(0,175,219,0.12)]"
                      : "border-[#e3e9ec] text-[#5a6b72] hover:border-[#bcd] bg-white"
                  }`}
                >
                  {lv}
                </button>
              );
            })}
          </div>
          {(() => {
            const info = levelGuide(level);
            return info ? (
              <div className="mt-3 rounded-xl bg-[#f7fbfc] border border-[#e6eef0] px-4 py-3">
                <p className="text-[13px] text-[#4a5b62] leading-relaxed"><span className="font-bold text-[#00374a]">{info.title}</span> — {info.blurb}</p>
              </div>
            ) : null;
          })()}
        </div>

        {/* accommodation */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3">2 · Accommodation</p>
          <div className="space-y-2.5">
            {accommodations.map((a) => {
              const active = a.id === selected?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccId(a.id)}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between gap-4 text-left px-4 py-3 rounded-xl border transition-all ${
                    active
                      ? "border-[#00afdb] bg-[#00afdb]/[0.05] shadow-[0_6px_20px_rgba(0,175,219,0.1)]"
                      : "border-[#e3e9ec] hover:border-[#bcd] bg-white"
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${active ? "border-[#00afdb]" : "border-[#cbd5d9]"}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-[#00afdb]" />}
                    </span>
                    {a.hotelImage && (
                      <span className="w-14 h-12 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${a.hotelImage}')` }} aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-[#1f3138] truncate">{a.hotelName || a.accommodation}</span>
                      {a.hotelName && a.accommodation && a.accommodation !== a.hotelName && (
                        <span className="block text-[12px] text-[#7a8a90] truncate">{a.accommodation}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-[14px] font-bold text-[#1f3138] shrink-0">{fmt(a.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* summary */}
      <aside className="lg:sticky lg:top-24 rounded-3xl bg-[#00374a] text-white shadow-[0_20px_60px_rgba(0,55,74,0.25)] overflow-hidden">
        {selected?.hotelImage && (
          <div className="relative h-36 bg-cover bg-center" style={{ backgroundImage: `url('${selected.hotelImage}')` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/30 to-transparent" />
            {selected.hotelName && (
              <span className="absolute bottom-3 left-7 text-[13px] font-bold text-white drop-shadow">🏨 {selected.hotelName}</span>
            )}
          </div>
        )}
        <div className="p-7">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/40 mb-1">Your package</p>
        <h3 className="text-xl font-extrabold tracking-[-0.02em]">{level}</h3>
        <p className="text-[13px] text-white/55 mb-1">{selected?.hotelName || selected?.accommodation}</p>
        {selected?.hotelDescription && <p className="text-[12px] text-white/40 mb-4 leading-relaxed">{selected.hotelDescription}</p>}
        {!selected?.hotelDescription && <div className="mb-4" />}

        <ul className="space-y-2 mb-6">
          {STANDARD_INCLUDES.map((inc) => (
            <li key={inc} className="flex items-start gap-2.5 text-[13.5px] text-white/80">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#00afdb]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              {inc}
            </li>
          ))}
        </ul>

        <div className="flex items-end justify-between border-t border-white/10 pt-5 mb-5">
          <span className="text-[13px] text-white/50">Total p.p.</span>
          <span className="text-3xl font-black tracking-[-0.02em] tabular-nums">{selected ? fmt(selected.price) : "—"}</span>
        </div>

        <button
          onClick={() => reserve && selected && setShowReserve(true)}
          disabled={!reserve || !selected}
          className="w-full px-7 py-4 rounded-full text-[14px] font-bold bg-[#00afdb] text-white shadow-[0_4px_20px_rgba(0,175,219,0.35)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all disabled:opacity-60"
        >
          Reserve my spot · {fmt(DEPOSIT_EUR)} deposit
        </button>
        <p className="text-[12px] text-white/40 text-center mt-3">
          Just your name &amp; contact — we sort the rest personally after payment
        </p>
        </div>
      </aside>

      {showReserve && reserve && selected && (
        <ReserveModal
          ctx={
            {
              ...reserve,
              packageId: selected.id,
              level,
              accommodation: selected.accommodation,
              price: selected.price,
              currency,
            } satisfies ReserveContext
          }
          onClose={() => setShowReserve(false)}
        />
      )}
    </div>
  );
}
