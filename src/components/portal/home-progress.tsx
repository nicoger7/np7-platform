import Link from "next/link";
import { type Progression, skillStateCounts } from "@/lib/progression";
import { SkillBar, SkillBarLegend } from "@/components/portal/skill-bar";

/**
 * Home-dashboard progression feature — a full-width teaser that mirrors the
 * Progress page's dark-teal rank hero (rank + 6-rung ladder + per-discipline
 * bars) so the ladder gets real emphasis on the home. The discipline bars are
 * LAYERED (coach gold / Wind Coach purple / self-rated grey) so a rider who's
 * only self-rated sees grey to "fill up" via coaching — never a dead empty bar.
 * The whole card links to the full Progress page. Presentational.
 */
const GOLD = "#e9c973";

function Trophy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" /></svg>;
}
function Target({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>;
}

function TrackMini({ label, coach, windcoach, self, total, side = false }: { label: string; coach: number; windcoach: number; self: number; total: number; side?: boolean }) {
  const verified = coach + windcoach;
  return (
    <div className={`rounded-xl border p-3 ${side ? "border-dashed border-white/15 bg-white/[0.03]" : "border-white/10 bg-white/[0.06]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12.5px] font-bold truncate ${side ? "text-[#cde4ec]" : "text-white"}`}>{label}</span>
        <span className="shrink-0 text-[11px] font-semibold text-[#9fc9d6]">{verified}/{total}</span>
      </div>
      <SkillBar dark coach={coach} windcoach={windcoach} self={self} total={total} className="mt-2" />
    </div>
  );
}

export function HomeProgress({ progression, selfLevel, avatarUrl, initials }: { progression: Progression; selfLevel?: string | null; avatarUrl?: string | null; initials?: string }) {
  const { level, nextLevel, toNext, pct, mastered, ladder, coachCount, windcoachCount, tracks, side } = progression;

  // No verified rank yet → don't shame with "Beginner · 0": lead with their own
  // self-rating and frame the ladder as the path ahead. Someone who's only
  // self-logged still gets the layered (grey) bars — a pure newbie gets the
  // invitation.
  const hasSelfLogged = tracks.some((t) => t.skills.some((s) => s.state === "self")) || !!(side && side.skills.some((s) => s.state === "self"));
  const noVerifiedRank = coachCount === 0 && windcoachCount === 0 && !mastered;
  const notStarted = noVerifiedRank && !hasSelfLogged;
  const headlineLevel = noVerifiedRank && selfLevel ? selfLevel : level;

  const statusLabel = mastered
    ? "Every core skill mastered"
    : noVerifiedRank
      ? "Your journey starts here"
      : nextLevel
        ? `${toNext} ${toNext === 1 ? "skill" : "skills"} to ${nextLevel}`
        : `${toNext} ${toNext === 1 ? "skill" : "skills"} to full mastery`;

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
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-white/15" />
          ) : (
            <span className="w-12 h-12 rounded-full grid place-items-center font-black text-[15px] shrink-0" style={{ background: "linear-gradient(145deg,#22c3ea,#00afdb)", color: "#00374a" }}>{initials || "·"}</span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7fa6b3]">Your rank</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[26px] sm:text-[30px] font-black leading-none">{headlineLevel}</span>
              {noVerifiedRank && selfLevel && <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7fa6b3] shrink-0">self-rated</span>}
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
          <div key={r.name} className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: r.done ? "#00afdb" : "rgba(255,255,255,.14)" }}>
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
        /* Pure newbie — nothing logged or verified: an invitation, not a wall of empty bars. */
        <>
          <p className="mt-4 text-[13px] text-[#cde4ec] leading-relaxed">
            <strong className="text-white">Log what you can already do</strong> to start filling your ladder — then a coach on the water (or the <strong className="text-white">Wind Coach App</strong>) makes it count toward your rank.
          </p>
          <div className="flex items-center justify-between gap-4 mt-4 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <span className="text-[12px] text-[#9fc9d6]">6 ranks to climb — Beginner → Pro</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-white group-hover:gap-2 transition-all">
              Start now
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </>
      ) : (
        <>
          {/* per-discipline LAYERED breakdown */}
          {(tracks.length > 0 || side) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {tracks.map((t) => { const c = skillStateCounts(t.skills); return <TrackMini key={t.discipline} label={t.label} coach={c.coach} windcoach={c.windcoach} self={c.self} total={t.total} />; })}
              {side && (() => { const c = skillStateCounts(side.skills); return <TrackMini label={side.label} coach={c.coach} windcoach={c.windcoach} self={c.self} total={side.total} side />; })()}
            </div>
          )}

          <SkillBarLegend dark className="mt-3" />

          {noVerifiedRank ? (
            /* Self-rated but nothing verified: the grey is theirs to "fill up". */
            <div className="flex items-center justify-between gap-4 mt-3 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
              <span className="text-[12px] text-[#cde4ec] leading-snug">Grey = self-rated. Get them <strong className="text-white">coach-verified</strong> on a trip to climb.</span>
              <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-bold text-white group-hover:gap-2 transition-all">
                See how
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          ) : (
            <>
              {mastered && side && sideRemaining > 0 && (
                <p className="mt-3 text-[12.5px] text-[#cde4ec] flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 shrink-0" style={{ color: GOLD }} />
                  Next challenge: <span className="font-bold text-white">{side.label}</span> — {sideRemaining} to go
                </p>
              )}
              <div className="flex items-center justify-between gap-4 mt-3 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
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
        </>
      )}
    </Link>
  );
}
