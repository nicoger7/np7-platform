"use client";

import { useState } from "react";
import { PackagePicker, type RealPackage } from "./package-picker";

export type EditionLite = {
  id: string;
  label: string;
  dateRange: string;
  shortRange: string;
  spotsLeft: number | null;
  fromPrice: number | null;
  deposit: number | null;
  coaches: string | null;
};

/**
 * Booking block for an experience. When the experience has multiple editions
 * (weeks), shows a "Choose your week" selector that drives a per-week package
 * picker — so each week only ever shows its own packages (no cross-week dupes).
 * For a single edition, it just renders that week's picker.
 */
export function EditionBooking({
  editions,
  packagesByEdition,
  currency = "EUR",
  experienceId,
  experienceTitle,
}: {
  editions: EditionLite[];
  packagesByEdition: Record<string, RealPackage[]>;
  currency?: string;
  experienceId: string;
  experienceTitle: string;
}) {
  const [sel, setSel] = useState(editions[0]?.id);
  const ed = editions.find((e) => e.id === sel) ?? editions[0];
  const packages = ed ? packagesByEdition[ed.id] ?? [] : [];
  const multi = editions.length > 1;
  const selectedFull = ed?.spotsLeft != null && ed.spotsLeft <= 0;

  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-US")}`;

  return (
    <div>
      {multi && (
        <div className="mb-9">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3.5 text-center">
            Choose your week
          </p>
          <div className="grid sm:grid-cols-3 gap-3 max-w-[820px] mx-auto">
            {editions.map((e) => {
              const on = e.id === sel;
              const full = e.spotsLeft != null && e.spotsLeft <= 0;
              return (
                <button
                  key={e.id}
                  onClick={() => !full && setSel(e.id)}
                  aria-pressed={on}
                  disabled={full}
                  className={`relative text-left rounded-2xl border p-4 transition-all ${
                    on
                      ? "border-[#00afdb] bg-[#00afdb]/[0.05] shadow-[0_8px_24px_rgba(0,175,219,0.12)]"
                      : "border-[#e3e9ec] bg-white hover:border-[#9fd9e8]"
                  } ${full ? "opacity-55 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[#00374a] tracking-[-0.01em]">{e.label}</span>
                    {on && (
                      <span className="shrink-0 w-5 h-5 rounded-full bg-[#00afdb] text-white grid place-items-center">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                  </div>
                  <span className="block text-[13px] text-[#5a6b72] mt-0.5">{e.shortRange}</span>
                  <div className="flex items-center justify-between mt-3">
                    {e.fromPrice != null ? (
                      <span className="text-[13px] font-bold text-[#00374a]">from {fmt(e.fromPrice)}</span>
                    ) : <span />}
                    {e.spotsLeft != null && (
                      <span className={`text-[11px] font-bold ${full ? "text-[#f47b20]" : "text-green-600"}`}>
                        {full ? "Fully booked" : `${e.spotsLeft} left`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {ed?.coaches && (
            <p className="text-center text-[13px] text-[#5a6b72] mt-4">
              Coaches this week: <span className="font-semibold text-[#00374a]">{ed.coaches}</span>
            </p>
          )}
        </div>
      )}

      {/* key forces a fresh picker (resets level/accommodation) when the week changes */}
      {selectedFull ? (
        <div className="max-w-[560px] mx-auto text-center rounded-2xl border border-[#f0e6d6] bg-white p-8">
          <span className="inline-block px-3 py-1 rounded-full text-[12px] font-bold text-white bg-[#f47b20] mb-4">Fully booked</span>
          <h3 className="text-[20px] font-black text-[#00374a] mb-2">{multi ? "This week is fully booked" : "This trip is fully booked"}</h3>
          <p className="text-[14px] text-[#5a6b72] leading-relaxed mb-6">
            {multi ? "Pick another week above, or join the waitlist" : "Every spot is taken"} — plans change and places free up. Join the waitlist and we&apos;ll reach out the moment one opens.
          </p>
          <a
            href={`mailto:experience@np-seven.com?subject=Waitlist: ${experienceTitle}${multi && ed?.label ? " · " + ed.label : ""}`}
            className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] transition-colors"
          >
            Join the waitlist
          </a>
        </div>
      ) : packages.length > 0 ? (
        <PackagePicker
          key={ed?.id}
          packages={packages}
          currency={currency}
          reserve={{
            experienceId,
            experienceTitle,
            editionId: ed?.id ?? null,
            editionLabel: multi ? ed?.label ?? null : null,
            editionDates: ed?.shortRange ?? null,
          }}
        />
      ) : (
        <p className="text-center text-[#6a7a80]">Packages for this week are being finalised.</p>
      )}
    </div>
  );
}
