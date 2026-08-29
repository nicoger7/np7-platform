"use client";

import { useState } from "react";
import { PackagePicker, type RealPackage, type BookingExtra } from "./package-picker";
import { useSelectedEdition } from "./selected-edition";

export type EditionLite = {
  id: string;
  label: string;
  dateRange: string;
  shortRange: string;
  spotsLeft: number | null;
  fromPrice: number | null;
  deposit: number | null;
  coaches: string | null;
  dateStart: string | null;
  going: number | null;
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
  extras = [],
  extrasByEdition,
  launchByEdition,
  currency = "EUR",
  experienceId,
  experienceTitle,
  heroImage,
  showAllTrips = true,
}: {
  editions: EditionLite[];
  packagesByEdition: Record<string, RealPackage[]>;
  extras?: BookingExtra[];
  /** Extras per week. A component pinned to one edition must not be sellable on
   *  another, so the list follows the week you picked rather than the week the
   *  page opened on; `extras` is the unscoped fallback. */
  extrasByEdition?: Record<string, BookingExtra[]>;
  launchByEdition?: Record<string, { pct: number; until?: string | null; label?: string } | null>;
  currency?: string;
  experienceId: string;
  experienceTitle: string;
  heroImage?: string | null;
  /** Is there a public experiences index to send people to? A page opened by
   *  direct link while the world is hidden has none, and the link would land a
   *  sold-out visitor on a login wall. */
  showAllTrips?: boolean;
}) {
  // The selected week is shared page-wide (see SelectedEditionProvider) so the
  // crew section below follows whichever week you pick here.
  const { id: sel, setId: setSel } = useSelectedEdition();
  const ed = editions.find((e) => e.id === sel) ?? editions[0];
  const packages = ed ? packagesByEdition[ed.id] ?? [] : [];
  const weekExtras = (ed && extrasByEdition?.[ed.id]) || extras;
  const multi = editions.length > 1;
  const selectedFull = ed?.spotsLeft != null && ed.spotsLeft <= 0;

  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-US")}`;

  // When a week's full, don't dead-end: surface the other bookable weeks — this
  // season's still-open weeks, and any FUTURE-year edition as an early-bird
  // pre-sale (same register + refundable-downpayment flow, no special code).
  const yearOf = (e: EditionLite) => (e.dateStart ? new Date(e.dateStart + "T00:00:00Z").getUTCFullYear() : new Date().getUTCFullYear());
  const currentYear = ed?.dateStart ? yearOf(ed) : new Date().getUTCFullYear();
  const openOthers = editions
    .filter((e) => e.id !== ed?.id && (e.spotsLeft == null || e.spotsLeft > 0))
    .sort((a, b) => ((a.dateStart ?? "") < (b.dateStart ?? "") ? -1 : 1));
  const sameSeason = openOthers.filter((e) => yearOf(e) <= currentYear);
  // "N left" is an urgency signal, not inventory — it only appears when it's
  // genuinely tight (or the week is gone). "12 left" on every card is noise.
  const SCARCE = 5;
  const nextSeason = openOthers.filter((e) => yearOf(e) > currentYear);

  return (
    <div>
      {multi && (
        <div className="mb-9">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-3.5 text-center">
            Choose your week
          </p>
          {Array.from(editions.reduce((m, e) => {
            const y = yearOf(e); if (!m.has(y)) m.set(y, [] as EditionLite[]); m.get(y)!.push(e); return m;
          }, new Map<number, EditionLite[]>())).sort((a, b) => a[0] - b[0]).map(([year, yearEditions], gi, groups) => (
          <div key={year} className={gi > 0 ? "mt-6" : undefined}>
          {groups.length > 1 && (
            <p className="text-[12px] font-extrabold tracking-[0.12em] text-[#9aa6ac] mb-2.5 max-w-[820px] mx-auto">{year}</p>
          )}
          <div className="grid sm:grid-cols-3 gap-3 max-w-[820px] mx-auto">
            {yearEditions.map((e) => {
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
                    {e.spotsLeft != null && (full || e.spotsLeft <= SCARCE) && (
                      <span className={`text-[11px] font-bold ${full ? "text-[#f47b20]" : "text-green-600"}`}>
                        {full ? "Fully booked" : `Only ${e.spotsLeft} left`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          </div>
          ))}
          {ed?.coaches && (
            <p className="text-center text-[13px] text-[#5a6b72] mt-4">
              Coaches this week: <span className="font-semibold text-[#00374a]">{ed.coaches}</span>
            </p>
          )}
        </div>
      )}

      {/* key forces a fresh picker (resets level/accommodation) when the week changes */}
      {selectedFull ? (
        <div className="max-w-[620px] mx-auto rounded-2xl border border-[#f0e6d6] bg-white p-6 sm:p-8">
          <div className="text-center">
            <span className="inline-block px-3 py-1 rounded-full text-[12px] font-bold text-white bg-[#f47b20] mb-3">Fully booked</span>
            <h3 className="text-[20px] font-black text-[#00374a] mb-1.5">{multi ? "This week is fully booked" : "This trip is fully booked"}</h3>
            <p className="text-[14px] text-[#5a6b72] leading-relaxed">Every spot is taken — but you&apos;ve still got options.</p>
          </div>

          {/* This season's other open weeks — book now, spot secured with the down-payment. */}
          {sameSeason.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac] mb-2">Weeks with space</p>
              <div className="space-y-2">
                {sameSeason.map((e) => (
                  <button key={e.id} onClick={() => setSel(e.id)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#e3e9ec] bg-white hover:border-[#9fd9e8] px-4 py-3 text-left transition-colors">
                    <span className="min-w-0"><span className="block font-bold text-[#00374a]">{e.label}</span><span className="text-[13px] text-[#5a6b72]">{e.shortRange}</span></span>
                    <span className="shrink-0 text-right">
                      {e.spotsLeft != null && e.spotsLeft <= 5 && <span className="block text-[11px] font-bold text-green-600">Only {e.spotsLeft} left</span>}
                      {e.fromPrice != null && <span className="text-[13px] font-bold text-[#00afdb]">from {fmt(e.fromPrice)} →</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Next-year edition = early-bird pre-sale: real, refundable down-payment now. */}
          {nextSeason.length > 0 && (
            <div className="mt-5 rounded-xl border-2 border-[#00afdb]/30 bg-[#00afdb]/[0.04] p-4">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0782a0] mb-1">Beat the rush · {yearOf(nextSeason[0])}</p>
              <p className="text-[15px] text-[#00374a] font-black mb-0.5">Secure your {yearOf(nextSeason[0])} spot early</p>
              <p className="text-[13px] text-[#5a6b72] mb-3">These weeks sell out. Lock yours in now with a fully-refundable down-payment.</p>
              <div className="space-y-2">
                {nextSeason.map((e) => (
                  <button key={e.id} onClick={() => setSel(e.id)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg bg-white border border-[#bfe8f3] hover:border-[#00afdb] px-4 py-3 text-left transition-colors">
                    <span className="min-w-0"><span className="block font-bold text-[#00374a]">{e.label}</span><span className="text-[13px] text-[#5a6b72]">{e.shortRange}</span></span>
                    <span className="shrink-0 text-[13px] font-bold text-[#00afdb]">{e.fromPrice != null ? `from ${fmt(e.fromPrice)} →` : "Secure →"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-[#f0e6d6] flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4 text-center">
            <a href={`mailto:experience@np-seven.com?subject=Waitlist: ${experienceTitle}${ed?.label ? " · " + ed.label : ""}`} className="text-[13px] font-bold text-[#5a6b72] hover:text-[#00374a] transition-colors">Waitlist this week — tell me if a spot opens</a>
            {showAllTrips && <span className="hidden sm:inline text-[#d3dbde]">·</span>}
            {showAllTrips && (
              <a href="/experience" className="text-[13px] font-bold text-[#00afdb] hover:underline">Explore other trips →</a>
            )}
          </div>
        </div>
      ) : packages.length > 0 ? (
        <PackagePicker
          key={ed?.id}
          packages={packages}
          extras={weekExtras}
          currency={currency}
          launch={launchByEdition?.[ed?.id ?? ""] ?? null}
          heroImage={heroImage}
          reserve={{
            experienceId,
            experienceTitle,
            editionId: ed?.id ?? null,
            editionLabel: multi ? ed?.label ?? null : null,
            editionDates: ed?.shortRange ?? null,
            spotsLeft: ed?.spotsLeft ?? null,
            going: ed?.going ?? null,
          }}
        />
      ) : (
        <WeekInterestForm experienceId={experienceId} editionId={ed?.id ?? null} />
      )}
    </div>
  );
}

/**
 * The "being finalised" dead end, turned into a lead.
 *
 * A week can be published before its packages are priced; the picker used to
 * say so and stop — a visitor ready to hand over their email had nowhere to
 * put it. Name + email here files a plain LEAD booking on that week, so the
 * follow-up lives in the admin pipeline like every other lead.
 */
function WeekInterestForm({ experienceId, editionId }: { experienceId: string; editionId: string | null }) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/week-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceId, editionId, firstName, email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-center text-[15px] font-bold text-[#00374a]">
        You&apos;re on the list — we&apos;ll email you the packages the moment this week opens for booking.
      </p>
    );
  }
  return (
    <div className="max-w-md mx-auto text-center">
      <p className="text-[#6a7a80]">Packages for this week are being finalised.</p>
      <p className="mt-1 text-[13px] text-[#5a6b72]">Leave your email and we&apos;ll send them to you the moment they&apos;re live.</p>
      <form onSubmit={submit} className="mt-3 flex flex-col sm:flex-row gap-2">
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="First name"
          className="flex-1 min-w-0 rounded-lg border border-[#d3dbde] px-3.5 py-2.5 text-[14px] text-[#00374a] placeholder:text-[#9aa8ad] focus:border-[#00afdb] focus:outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="Email"
          className="flex-1 min-w-0 rounded-lg border border-[#d3dbde] px-3.5 py-2.5 text-[14px] text-[#00374a] placeholder:text-[#9aa8ad] focus:border-[#00afdb] focus:outline-none" />
        <button type="submit" disabled={state === "busy"}
          className="shrink-0 rounded-lg bg-[#00afdb] hover:bg-[#0099c2] disabled:opacity-60 px-5 py-2.5 text-[14px] font-bold text-white transition-colors">
          {state === "busy" ? "Saving…" : "Keep me posted"}
        </button>
      </form>
      {state === "error" && <p className="mt-2 text-[12.5px] font-semibold text-[#c2410c]">Something went wrong — please try again.</p>}
      <p className="mt-2 text-[11.5px] text-[#8a9aa0]">No commitment — we&apos;ll only email you about this trip.</p>
    </div>
  );
}
