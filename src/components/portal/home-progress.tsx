import Link from "next/link";
import { type Progression } from "@/lib/progression";

/**
 * Home-dashboard progression feature — a full-width teaser that mirrors the
 * Progress page's dark-teal rank hero (rank + 6-rung ladder + coach/Wind-Coach
 * counts) and adds a per-discipline breakdown, so the ladder gets real emphasis
 * on the home instead of a small chip in the corner. The whole card links to the
 * full Progress page. Presentational; the Progress engine is the source of truth.
 */
const CYAN = "#00afdb", GOLD = "#e9c973";

function Trophy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" /></svg>;
}
function Target({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>;
}

function TrackMini({ label, verified, total, side = false }: { label: string; verified: number; total: number; side?: boolean }) {
  const pct = total ? Math.round((verified / total) * 100) : 0;
  const complete = total > 0 && verified >= total;
  return (
    <div className={`rounded-xl border p-3 ${side ? "border-dashed border-white/15 bg-white/[0.03]" : "border-white/10 bg-white/[0.06]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12.5px] font-bold truncate ${side ? "text-[#cde4ec]" : "text-white"}`}>{label}</span>
        <span className="shrink-0 text-[11px] font-semibold text-[#9fc9d6]">{verified}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(complete ? 100 : 4, pct)}%`, background: complete ? "#1aa851" : "linear-gradient(90deg,#ffc42e,#f47b20 55%,#00afdb)" }} />
      </div>
    </div>
  );
}

export function HomeProgress({ progression, selfLevel }: { progression: Progression; selfLevel?: string | null }) {
  const { level, nextLevel, toNext, pct, mastered, ladder, coachCount, windcoachCount, tracks, side } = progression;

  // "Not started" = nothing verified yet. Most members who never join a trip live
  // here — so we DON'T shame them with "Beginner · 0". We lead with their own
  // self-rating (if any) and frame the ladder as the path ahead, not a deficit.
  const notStarted = coachCount === 0 && windcoachCount === 0 && !mastered;
  const headlineLevel = notStarted && selfLevel ? selfLevel : level;

  const statusLabel = mastered
    ? "Every core skill mastered"
    : notStarted
      ? "Your journey starts here"
      : nextLevel
        ? `${toNext} ${toNext === 1 ? "skill" : "skills"} to ${nextLevel}`
        : `${toNext} ${toNext === 1 ? "skill" : "skills"} to full mastery`;

  // Once the core ranks are done, the Wave & Freestyle side quest is the live goal.
  const sideRemaining = side ? side.total - side.verified : 0;

  return (
    <Link
      href="/account/level"
      className="group block rounded-[24px] p-5 sm:p-6 text-white shadow-[0_14px_40px_rgba(0,55,74,0.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(0,55,74,0.24)]"
      style={{ background: "linear-gradient(155deg,#00485f 0%,#00323f 55%,#012732 100%)" }}
    >
      {/* Stack on mobile (chip below the rank) so a long status label never
          collides with the big rank headline; side-by-side from sm up. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-full grid place-items-center font-black text-[15px] shrink-0" style={{ background: "linear-gradient(145deg,#22c3ea,#00afdb)", color: "#00374a" }}>NP</span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7fa6b3]">Your rank</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[26px] sm:text-[30px] font-black leading-none">{headlineLevel}</span>
              {notStarted && selfLevel && <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7fa6b3] shrink-0">self-rated</span>}
            </div>
          </div>
        </div>
        <div className="shrink-0 sm:ml-auto">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5" style={{ background: "rgba(255,255,255,.1)", color: "#cdeaf3" }}>
            {mastered ? <Trophy className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
            {statusLabel}
          </span>
        </div>
      </div>

      {/* rank ladder — 6 segments; the current one fills sun→sea as you master its band */}
      <div className="flex gap-1 mt-4">
        {ladder.map((r) => (
          <div key={r.name} className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: r.done ? CYAN : "rgba(255,255,255,.14)" }}>
            {r.current && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20 55%,#00afdb)" }} />}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[10.5px] text-[#7fa6b3]">
        {ladder.map((r) => (
          <span key={r.name} className="flex-1 text-center truncate px-0.5" style={r.current ? { color: "#fff", fontWeight: 700 } : r.done ? { color: "#9fc9d6" } : undefined}>{r.name}</span>
        ))}
      </div>

      {notStarted ? (
        /* Not started — the invitational state (no "0/N" walls of empty bars). */
        <>
          <p className="mt-4 text-[13px] text-[#cde4ec] leading-relaxed">
            Your skills get <strong className="text-white">verified by a coach on the water</strong> — your ladder starts filling from your very first trip. Between trips, the <strong className="text-white">Wind Coach App</strong> can verify them too.
          </p>
          <div className="flex items-center justify-between gap-4 mt-4 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <span className="text-[12px] text-[#9fc9d6]">6 ranks to climb — Beginner → Pro</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-white group-hover:gap-2 transition-all">
              See how it works
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </>
      ) : (
        <>
          {/* per-discipline breakdown */}
          {(tracks.length > 0 || side) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {tracks.map((t) => <TrackMini key={t.discipline} label={t.label} verified={t.verified} total={t.total} />)}
              {side && <TrackMini label={side.label} verified={side.verified} total={side.total} side />}
            </div>
          )}

          {/* mastered nudge: point at the side quest as the next goal */}
          {mastered && side && sideRemaining > 0 && (
            <p className="mt-3 text-[12.5px] text-[#cde4ec] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
              Next challenge: <span className="font-bold text-white">{side.label}</span> — {sideRemaining} to go
            </p>
          )}

          <div className="flex items-center justify-between gap-4 mt-4 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <div className="flex gap-4 text-[12px] text-[#9fc9d6]">
              <span><b className="text-[15px]" style={{ color: GOLD }}>{coachCount}</b> coach-verified</span>
              <span><b className="text-[15px]" style={{ color: "#c3b6ec" }}>{windcoachCount}</b> Wind Coach App</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-white group-hover:gap-2 transition-all">
              Open your progress
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </>
      )}
    </Link>
  );
}
