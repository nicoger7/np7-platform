import Link from "next/link";
import type { MemberGuideSummary } from "@/lib/portal-data";

/**
 * A guide, as a card, in one place.
 *
 * It was written twice before this: once on the trip page and once nowhere
 * else, which is why the home had nothing to show. The guide is the most
 * personal thing NP7 produces, so it keeps the guide page's own language
 * wherever it appears, deep ocean and a sun hairline, rather than sitting in a
 * white box like a link to a settings screen.
 *
 * `unread` is the only difference between the two moods. New, it says so and
 * carries the invitation. Read, it is the same card doing less: no badge, no
 * call to action, a line of what is inside.
 */
export function GuideCard({ guide, unread, showTrip = true }: { guide: MemberGuideSummary; unread: boolean; showTrip?: boolean }) {
  const n = guide.focusPointCount;
  return (
    <Link
      href={`/account/guides/${guide.id}`}
      className="group relative block rounded-2xl overflow-hidden p-5 transition-transform hover:scale-[1.01]"
      style={{ background: "linear-gradient(155deg,#00232f,#00374a 55%,#075b7d)" }}
    >
      <span className="absolute top-0 inset-x-0 h-[3px]" style={{ background: "linear-gradient(90deg,#ffc42e,#f0774a 55%,#00afdb)" }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {unread && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.14em] uppercase text-[#ffc42e] mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffc42e]" />
              New
            </span>
          )}
          <p className="text-[15px] font-black text-white tracking-tight truncate">
            {unread ? "Your focus points are ready" : (guide.trip_label ?? "Your training guide")}
          </p>
          {showTrip && unread && guide.trip_label && (
            <p className="text-[12.5px] text-white/70 mt-0.5 truncate">{guide.trip_label}</p>
          )}
        </div>
        <span className="shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white border border-white/25">
          {n} {n === 1 ? "point" : "points"}
        </span>
      </div>

      {guide.focusTitles.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {guide.focusTitles.map((t, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[13px] text-white/85">
              <span className="shrink-0 font-black tabular-nums text-[#ffc42e]">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-semibold truncate">{t}</span>
            </li>
          ))}
          {n > guide.focusTitles.length && (
            <li className="text-[12px] text-white/60 pl-7">+ {n - guide.focusTitles.length} more</li>
          )}
        </ul>
      )}

      <p className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#8fe6f2] group-hover:text-white transition-colors">
        {unread ? "Read them" : "Open your guide"}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </p>
    </Link>
  );
}
