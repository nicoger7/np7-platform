import type { EventInfo } from "@/lib/events";

/**
 * The other runs of this clinic — a series is several clinics, in several
 * PLACES, on several dates.
 *
 * "NP7 Coaching Clinics USA" is a format, not a venue: Hatteras in October and
 * somewhere else in spring. The series URL sells whichever runs next, so
 * without this a buyer landing on the wrong one has no way to find theirs
 * except the browser's back button — and no way to learn the others exist.
 *
 * Location leads, because with several venues the place is the thing being
 * chosen; the date only distinguishes two runs at the SAME venue.
 */
function fmtRange(start: string | null, end: string | null): string {
  if (!start) return "Dates to come";
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const s = new Date(start);
  if (!end || end === start) return `${d(s)} ${s.getUTCFullYear()}`;
  const e = new Date(end);
  return `${d(s)} – ${d(e)} ${e.getUTCFullYear()}`;
}

export function ClinicOtherDates({ event }: { event: EventInfo }) {
  const others = event.siblings ?? [];
  if (others.length === 0) return null;

  // Two venues or one? With one, the place is a repeated label and the dates
  // carry the choice; with several, the place IS the choice.
  const places = new Set(others.map((s) => s.location).filter(Boolean));
  const manyPlaces = places.size > 1 || (event.location && !places.has(event.location));

  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-[1000px] mx-auto px-6 sm:px-8">
        <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">
          {manyPlaces ? "MORE CLINICS" : "OTHER DATES"}
        </p>
        <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-2">
          {manyPlaces ? "Can’t make this one? We run it elsewhere." : "Another date suits you better?"}
        </h2>
        <p className="text-[15.5px] text-[#6a7a80] mb-7 max-w-[58ch]">
          Same coaching, same small group — {manyPlaces ? "a different spot and week." : "a different week."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((sib) => (
            <a
              key={sib.slug}
              href={`/experience/${event.slug}/${sib.slug}`}
              className="group flex items-center justify-between gap-4 rounded-2xl border border-[#e3e9ec] bg-white px-5 py-4 hover:border-[#00afdb] hover:shadow-[0_8px_28px_rgba(0,55,74,0.08)] transition-all"
            >
              <span className="min-w-0">
                <span className="block text-[16px] font-black text-[#00374a] truncate">
                  {sib.location || sib.label || "NP7 clinic"}
                </span>
                <span className="block text-[13.5px] text-[#6a7a80] mt-0.5">
                  {fmtRange(sib.date_start, sib.date_end)}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-bold text-[#0aa3c7] inline-flex items-center gap-1.5">
                See it
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
