import Link from "next/link";
import { cdnImage } from "@/lib/img";

/**
 * Immersive trip hero: the trip's own cover photo, darkened for legible text,
 * with the title + dates and a big phase-aware countdown as the centrepiece —
 * "144 · DAYS TO GO" before, "On the water 🌊" during, "Wrapped" after — plus a
 * subtle wait-progress bar (booked → go). Falls back to an ocean gradient when
 * a trip has no cover image yet.
 */
export function TripHero({
  coverImage, title, dateLabel, statusLabel, phase, daysToGo, weeks, waitPct, eyebrow = "Your trip",
}: {
  coverImage: string | null;
  title: string;
  /** "Your trip" for a week, "Your event" for a clinic — an edition is either. */
  eyebrow?: string;
  dateLabel: string;
  statusLabel: string;
  phase: "before" | "during" | "after";
  daysToGo: number | null;
  weeks: number | null;
  waitPct: number | null;
}) {
  const overlay = "linear-gradient(to top, rgba(0,18,26,0.86) 6%, rgba(0,18,26,0.12) 46%, rgba(0,18,26,0.32) 100%)";
  const bg = coverImage
    ? `${overlay}, url('${cdnImage(coverImage, { width: 1280 })}')`
    : "linear-gradient(155deg,#075b7d,#00a0c9 42%,#67c9e6 66%,#ffd27f 100%)";

  return (
    <section className="relative rounded-[22px] overflow-hidden min-h-[340px] flex flex-col justify-between bg-cover bg-center" style={{ backgroundImage: bg }}>
      <div className="relative flex items-center justify-between p-4 sm:p-5">
        <Link href="/account/trips" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/90 hover:text-white transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          My trips
        </Link>
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/15 text-white border border-white/25 backdrop-blur-sm">{statusLabel}</span>
      </div>

      <div className="relative p-5 sm:p-7">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-white/70 mb-1.5">{eyebrow}</p>
            <h1 className="text-[26px] sm:text-[32px] font-black tracking-[-0.02em] text-white leading-[1.05]">{title}</h1>
            <p className="text-[13px] text-white/80 mt-1.5">{dateLabel}</p>
          </div>

          {phase === "before" && daysToGo != null ? (
            <div className="shrink-0 text-center px-5 py-3 rounded-2xl bg-[#00121a]/35 border border-white/20 backdrop-blur-sm">
              <p className="text-[46px] font-black leading-none tracking-[-0.03em]" style={{ background: "linear-gradient(180deg,#ffe1a6,#ffb454)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{daysToGo}</p>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80 mt-0.5">{daysToGo === 1 ? "day to go" : "days to go"}</p>
            </div>
          ) : phase !== "before" ? (
            <div className="shrink-0 text-center px-5 py-3 rounded-2xl bg-[#00121a]/35 border border-white/20 backdrop-blur-sm">
              <p className="text-[20px] font-black text-white leading-tight">{phase === "during" ? "On the water 🌊" : "Wrapped 🌊"}</p>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/75 mt-0.5">{phase === "during" ? "epic week" : "relive it below"}</p>
            </div>
          ) : null}
        </div>

        {phase === "before" && weeks != null && (
          <>
            <p className="text-[13.5px] font-semibold text-white mt-4">🌊 {weeks > 0 ? `${weeks} ${weeks === 1 ? "week" : "weeks"}` : `${daysToGo} days`} until you&apos;re on the water</p>
            {waitPct != null && (
              <>
                <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${waitPct}%`, background: "linear-gradient(90deg,#ffd27f,#ff9f43)" }} />
                </div>
                <p className="text-[10.5px] text-white/60 mt-1.5">the adventure is coming</p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
