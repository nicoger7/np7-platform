"use client";

import { useState } from "react";
import Link from "next/link";
import type { Progression, Track, ProgressSkill } from "@/lib/progression";

/* The member "Progress" view — Freeride/Freerace/Slalom tracks. Rank (Beginner →
   Pro) is earned by MASTERING skills, so the headline is always "N skills to <next
   rank>". Three verification tiers: coach on a trip (gold) → Wind Coach App video
   (purple) → self. Read-only: skills are verified by a coach or the Wind Coach App. */

const CYAN = "#00afdb", TEAL = "#00374a", PURPLE = "#7b61c9";
const GOLD = "#d4a017", GOLD_BG = "#f8efd6", GOLD_TX = "#6b5214";

function Ico({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const c = { width: size, height: size, viewBox: "0 0 24 24", style: color ? { color } : undefined, "aria-hidden": true } as const;
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "check": return <svg {...c}><g {...s}><circle cx="12" cy="12" r="9" /><path d="m8.4 12 2.4 2.4L15.6 9" /></g></svg>;
    case "circle": return <svg {...c}><circle cx="12" cy="12" r="9" {...s} /></svg>;
    case "lock": return <svg {...c}><g {...s}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g></svg>;
    case "video": return <svg {...c}><g {...s}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></g></svg>;
    case "trophy": return <svg {...c}><g {...s}><path d="M8 4h8v4a4 4 0 0 1-8 0z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" /></g></svg>;
    case "target": return <svg {...c}><g {...s}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></g></svg>;
    case "chev-down": return <svg {...c}><path {...s} d="m6 9 6 6 6-6" /></svg>;
    case "chev-up": return <svg {...c}><path {...s} d="m6 15 6-6 6 6" /></svg>;
    default: return null;
  }
}

function SkillRow({ s }: { s: ProgressSkill }) {
  const icon =
    s.state === "coach" ? <Ico name="check" size={21} color={GOLD} />
    : s.state === "windcoach" ? <Ico name="check" size={21} color={PURPLE} />
    : s.state === "self" ? <Ico name="check" size={21} color="#b8c2c6" />
    : s.state === "available" ? <Ico name="circle" size={20} color="#c9d3d6" />
    : <Ico name="lock" size={18} color="#c0ccd0" />;
  const sub =
    s.state === "coach" ? "coach-verified" : s.state === "windcoach" ? "Wind Coach App verified"
    : s.state === "self" ? "logged — get it verified" : s.state === "available" ? "ready to learn"
    : `needs ${s.prereqLabel ?? "a prerequisite"}`;
  const badge =
    s.state === "coach" ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-[3px] rounded-full" style={{ background: GOLD_BG, color: GOLD_TX }}><Ico name="check" size={13} color={GOLD} />Coach</span>
    : s.state === "windcoach" ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-[3px] rounded-full" style={{ background: "#efeafb", color: "#4a3b7a" }}><Ico name="video" size={13} color={PURPLE} />Wind Coach App</span>
    : s.state === "self" ? <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-[#f1efe8] text-[#8a9aa0]">unverified</span>
    : null;
  return (
    <div className="flex items-center gap-[11px] px-3 py-2.5 rounded-[11px] border border-[#f0e6d6] bg-[#fffdf9]" style={{ opacity: s.state === "locked" ? 0.6 : 1 }}>
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-bold text-[#00374a]">{s.label}</span>
        <span className="block text-[12px] text-[#9aa6ac]">{sub}</span>
      </span>
      {badge && <span className="shrink-0">{badge}</span>}
    </div>
  );
}

function TrackCard({ track }: { track: Track }) {
  const next = track.skills.find((s) => s.state === "available" || s.state === "self") ?? track.skills.find((s) => s.state === "locked");
  return (
    <div className="bg-white border border-[#f0e6d6] rounded-2xl p-3.5">
      <div className="text-[13.5px] text-[#6a7a80] mb-0.5">
        <span className="font-black text-[15px] text-[#00374a]">{track.label}</span> &nbsp;·&nbsp; {track.verified}/{track.total} mastered
      </div>
      <div className="text-[11.5px] text-[#9aa6ac] mb-2.5">Verified by a coach on a trip, or via the Wind Coach App.</div>
      <div className="flex flex-col gap-1.5">
        {track.skills.map((s) => <SkillRow key={s.id} s={s} />)}
      </div>
      {next && (
        <div className="mt-3 pt-2.5 border-t border-[#f4ecdd] text-[12px] text-[#8a9aa0] flex items-center gap-1.5">
          <Ico name="target" size={14} color={CYAN} /> Next up: <span className="font-bold text-[#00374a]">{next.label}</span> — get it coach-verified on a trip
        </div>
      )}
    </div>
  );
}

export function ProgressionView({ progression }: { progression: Progression }) {
  const { level, nextLevel, toNext, pct, mastered, ladder, coachCount, windcoachCount, tracks, side } = progression;
  const [active, setActive] = useState<string>(tracks[0]?.discipline ?? "side");
  const [showSide, setShowSide] = useState(false);
  const shown = active === "side" ? side : tracks.find((t) => t.discipline === active) ?? tracks[0];

  const toNextLabel = mastered
    ? "Every core skill mastered — you're at the top"
    : nextLevel
      ? `${toNext} ${toNext === 1 ? "skill" : "skills"} to ${nextLevel}`
      : `${toNext} ${toNext === 1 ? "skill" : "skills"} to full mastery`;

  return (
    <div>
      {/* hero — rank + the ladder to the next milestone */}
      <div className="rounded-2xl px-5 py-4 text-white" style={{ background: TEAL }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full grid place-items-center font-black text-[15px] shrink-0" style={{ background: CYAN, color: TEAL }}>NP</div>
          <div className="min-w-0">
            <div className="text-[13px]" style={{ color: "#9fc9d6" }}>Your rank</div>
            <div className="text-[26px] font-black leading-none">{level}</div>
          </div>
          <div className="ml-auto text-right shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5" style={{ background: "rgba(255,255,255,.1)", color: "#cdeaf3" }}>
              <Ico name={mastered ? "trophy" : "target"} size={14} color={mastered ? GOLD : CYAN} /> {toNextLabel}
            </div>
          </div>
        </div>
        {/* rank ladder — 6 segments, the current one fills as you master its band */}
        <div className="flex gap-1 mt-3.5">
          {ladder.map((r) => (
            <div key={r.name} className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: r.done ? CYAN : "rgba(255,255,255,.14)" }}>
              {r.current && <div className="h-full" style={{ width: `${pct}%`, background: CYAN }} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10.5px]" style={{ color: "#7fa6b3" }}>
          {ladder.map((r) => (
            <span key={r.name} className="flex-1 text-center truncate px-0.5" style={r.current ? { color: "#fff", fontWeight: 700 } : r.done ? { color: "#9fc9d6" } : undefined}>{r.name}</span>
          ))}
        </div>
        <div className="flex gap-4 mt-3 pt-3 text-[12px]" style={{ borderTop: "1px solid rgba(255,255,255,.12)", color: "#9fc9d6" }}>
          <span><b className="text-[15px]" style={{ color: "#e9c973" }}>{coachCount}</b> coach-verified</span>
          <span><b className="text-[15px]" style={{ color: "#c3b6ec" }}>{windcoachCount}</b> Wind Coach App</span>
        </div>
      </div>

      {/* coach = gold standard (sells trips) */}
      <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mt-3" style={{ background: GOLD_BG, border: "1px solid #ecdcae" }}>
        <span className="shrink-0"><Ico name="check" size={20} color={GOLD} /></span>
        <span className="text-[12.5px] flex-1" style={{ color: GOLD_TX }}>Coach-verified on an NP7 trip is the gold standard — the surest way to climb the ranks.</span>
        <Link href="/experience" className="text-[12px] font-bold text-white rounded-full px-3 py-1.5 whitespace-nowrap" style={{ background: CYAN }}>Book a trip</Link>
      </div>

      {/* discipline pills */}
      <div className="flex gap-1.5 flex-wrap my-3">
        {tracks.map((t) => {
          const on = active === t.discipline;
          return (
            <button key={t.discipline} type="button" onClick={() => setActive(t.discipline)}
              className="px-3.5 py-2 rounded-full text-[13px] font-bold border"
              style={on ? { background: CYAN, color: "#fff", borderColor: CYAN } : { background: "#fff", color: TEAL, borderColor: "#e7ddcb" }}>
              {t.label} <span className="font-semibold opacity-80">{t.verified}/{t.total}</span>
            </button>
          );
        })}
      </div>

      {shown && <TrackCard track={shown} />}

      {/* Wave & Freestyle — one de-emphasised group */}
      {side && (
        <div className="mt-3">
          <button type="button" onClick={() => { const next = !showSide; setShowSide(next); setActive(next ? "side" : (tracks[0]?.discipline ?? "side")); }}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#6a7a80]">
            <Ico name={showSide ? "chev-up" : "chev-down"} size={16} />
            Wave &amp; Freestyle ({side.verified}/{side.total})
          </button>
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[11.5px] text-[#9aa6ac] items-center">
        <span className="inline-flex items-center gap-1"><Ico name="check" size={13} color={GOLD} /> coach-verified (trip)</span>
        <span className="inline-flex items-center gap-1"><Ico name="video" size={13} color={PURPLE} /> Wind Coach App video</span>
        <span className="inline-flex items-center gap-1"><Ico name="lock" size={13} /> needs a prerequisite</span>
      </div>
    </div>
  );
}
