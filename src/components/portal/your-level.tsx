"use client";

import { useState } from "react";
import { LEVELS, displayLevel, levelProgress, nextTierFrom } from "@/lib/member-level";
import type { MemberLevelDetail } from "@/lib/portal-data";

/**
 * The member's level — a progression view: a level hero with a forward pull, a
 * per-tier track, the skills you've earned up front, and the not-yet skills
 * folded away. Below: self-rate, coach consent, a pending suggestion, history.
 * A "suggested" status stays private until accepted.
 */
export function YourLevel({ detail }: { detail: MemberLevelDetail }) {
  const [selfLevel, setSelfLevel] = useState(detail.self_level ?? "");
  const [status, setStatus] = useState(detail.level_status ?? "self");
  const [consent, setConsent] = useState(detail.coach_can_manage_level);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showAllEarned, setShowAllEarned] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const coachLevel = detail.coach_level;
  const pending = status === "suggested" && !!coachLevel;
  const verified = status === "verified" && !!coachLevel;
  const shown = displayLevel({ self_level: selfLevel || null, level: coachLevel, level_status: status }).level;

  const { tiers, earned, total } = levelProgress(detail.milestones);
  const { nextTier, toNext, pct } = nextTierFrom(shown, tiers); // tier above current level
  const hasCatalog = total > 0;
  const ringColor = verified ? "#1aa851" : "#00afdb";
  const earnedSkills = detail.milestones.filter((m) => m.achieved);
  const nextSkills = detail.milestones.filter((m) => !m.achieved); // catalog order = Beginner→Pro
  const earnedShown = showAllEarned ? earnedSkills : earnedSkills.slice(0, 12);

  async function call(payload: Record<string, unknown>) {
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch("/api/portal/level", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && !d.levelUnavailable) { setSaved(true); setTimeout(() => setSaved(false), 2000); return true; }
    setErr(d.levelUnavailable ? "Level saving isn't switched on yet." : d.error ?? "Couldn't save. Please try again.");
    return false;
  }

  const chipEarned = "inline-flex items-center gap-1 text-[12px] font-semibold bg-[#e1f5ee] text-[#0f6e56] px-2.5 py-1 rounded-full";
  const chipLocked = "text-[12px] border border-dashed border-[#dde6e9] text-[#9aa6ac] px-2.5 py-1 rounded-full";

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
      {/* ── hero: a ring toward the next level + the headline ── */}
      <div className="rounded-2xl bg-gradient-to-br from-[#eef9fc] via-white to-[#fff7ec] border border-[#e9f0f2] p-5 flex items-center gap-5">
        <Ring pct={pct} size={128} stroke={11} color={ringColor}>
          <div className="text-center px-2">
            <p className="text-[19px] leading-none font-black tracking-[-0.02em] text-[#00374a]">{shown ?? "—"}</p>
            {verified ? (
              <p className="text-[9.5px] font-bold text-[#0f6e56] mt-1 inline-flex items-center gap-0.5"><svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 1.9 3.2-.2 1 3 2.6 1.8-1 3 1 3-2.6 1.8-1 3-3.2-.2L12 23l-2.6-1.9-3.2.2-1-3L2.6 16.5l1-3-1-3 2.6-1.8 1-3 3.2.2z" /><path d="M10.5 13.5l-2-2-1.4 1.4 3.4 3.4 6-6-1.4-1.4z" fill="#fff" /></svg>verified</p>
            ) : shown ? <p className="text-[9.5px] font-semibold text-[#9aa6ac] mt-1">self-rated</p> : null}
          </div>
        </Ring>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb]">Your level</p>
          {hasCatalog ? (
            nextTier ? (
              <>
                <p className="text-[18px] font-black tracking-[-0.01em] text-[#00374a] mt-1 leading-tight">{toNext} {toNext === 1 ? "skill" : "skills"} to {nextTier}</p>
                <p className="text-[12.5px] text-[#6a7a80] mt-0.5">{earned} of {total} skills · {Math.round(pct)}% through {nextTier}</p>
              </>
            ) : earned === total && total > 0 ? (
              <p className="text-[18px] font-black text-[#0f6e56] mt-1">Every skill ticked 🎉</p>
            ) : (
              <p className="text-[16px] font-black text-[#00374a] mt-1">{earned} of {total} skills earned</p>
            )
          ) : (
            <p className="text-[14px] text-[#6a7a80] mt-1 leading-relaxed">Set your level below — or your coach will tick it off on your next trip.</p>
          )}
        </div>
      </div>

      {/* ── tier journey: a ring per stage ── */}
      {hasCatalog && (
        <div className="flex justify-between gap-1 mt-5">
          {tiers.map((t) => {
            const full = t.total > 0 && t.done === t.total;
            const tpct = t.total ? (t.done / t.total) * 100 : 0;
            const isNext = t.tier === nextTier;
            return (
              <div key={t.tier} className="flex flex-col items-center gap-1.5 flex-1">
                <Ring pct={tpct} size={50} stroke={5} color={full ? "#1aa851" : "#00afdb"}>
                  {full
                    ? <svg className="w-4 h-4 text-[#1aa851]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    : <span className="text-[11px] font-bold tabular-nums text-[#5a6b72]">{t.done}/{t.total}</span>}
                </Ring>
                <span className={`text-[10.5px] ${isNext || full ? "text-[#00374a] font-semibold" : "text-[#9aa6ac]"}`}>{t.tier}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── earned skills ── */}
      {hasCatalog && (
        <div className="mt-5">
          <p className="text-[13px] font-bold text-[#00374a] mb-2.5">Skills you&apos;ve earned {earned > 0 && <span className="text-[#9aa6ac] font-normal">· {earned}</span>}</p>
          {earned === 0 ? (
            <p className="text-[13px] text-[#9aa6ac]">No skills logged yet — your coach ticks these off on trips. Here&apos;s the path:</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {earnedShown.map((m) => (
                <span key={m.id} title={m.description ?? m.label} className={chipEarned}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{m.label}
                </span>
              ))}
              {earnedSkills.length > 12 && (
                <button type="button" onClick={() => setShowAllEarned((s) => !s)} className="text-[12px] font-semibold text-[#00afdb] px-2.5 py-1">
                  {showAllEarned ? "Show less" : `+${earnedSkills.length - 12} more`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── what's next — one row by default, rest unfolds ── */}
      {hasCatalog && nextSkills.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#f3ede2]">
          <p className="text-[13px] font-semibold text-[#00374a] mb-2.5">What&apos;s next <span className="text-[#9aa6ac] font-normal">— {nextSkills.length} to unlock{nextTier ? `, next: ${nextTier}` : ""}</span></p>
          <div className="flex flex-wrap gap-1.5">
            {(showNext ? nextSkills : nextSkills.slice(0, 6)).map((m) => (
              <span key={m.id} title={m.description ?? m.label} className={chipLocked}>{m.label}</span>
            ))}
            {nextSkills.length > 6 && (
              <button type="button" onClick={() => setShowNext((s) => !s)} className="text-[12px] font-semibold text-[#00afdb] px-2.5 py-1">
                {showNext ? "Show less" : `+${nextSkills.length - 6} more`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── pending coach suggestion (private) ── */}
      {pending && (
        <div className="rounded-xl border border-[#bfe6f2] bg-[#f3fbfe] p-4 mt-5">
          <p className="text-[14px] text-[#00374a]"><span className="font-bold">Your coach suggests {coachLevel}.</span> Accept it for a coach-verified badge, or keep your own.</p>
          <div className="flex gap-2 mt-3">
            <button disabled={busy} onClick={async () => { if (await call({ action: "accept" })) setStatus("verified"); }} className="px-4 py-2 rounded-full text-[13px] font-bold text-white bg-[#1aa851] hover:bg-[#16944a] disabled:opacity-60">Accept</button>
            <button disabled={busy} onClick={async () => { if (await call({ action: "decline" })) setStatus("self"); }} className="px-4 py-2 rounded-full text-[13px] font-bold text-[#5a6b72] bg-[#eef3f4] hover:bg-[#e2eaec] disabled:opacity-60">Keep my own</button>
          </div>
        </div>
      )}

      {/* ── self-rate + consent (compact footer) ── */}
      <div className="mt-5 pt-5 border-t border-[#f3ede2]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#9aa6ac]">Rate yourself</span>
          <select className="px-3 py-2 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#00afdb]" value={selfLevel} onChange={(e) => setSelfLevel(e.target.value)} disabled={verified && consent}>
            <option value="">Select…</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button disabled={busy} onClick={async () => { if (await call({ self_level: selfLevel })) setStatus("self"); }} className="px-4 py-2 rounded-full text-[13px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60">Save</button>
          {saved && <span className="text-[13px] font-semibold text-green-700">Saved ✓</span>}
          {err && <span className="text-[13px] font-semibold text-[#c4621a]">{err}</span>}
        </div>
        <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
          <input type="checkbox" checked={consent} className="mt-0.5 w-4 h-4 accent-[#00afdb]"
            onChange={(e) => { setConsent(e.target.checked); call({ coach_can_manage_level: e.target.checked }).then((ok) => { if (ok && e.target.checked && coachLevel) setStatus("verified"); }); }} />
          <span className="text-[13px] text-[#6a7a80] leading-relaxed">Let my coach set &amp; verify my level — I trust their call, no need to confirm each change.</span>
        </label>
      </div>

      {/* ── history (folded by default) ── */}
      {detail.history.length > 0 && (
        <div className="mt-5 pt-5 border-t border-[#f3ede2]">
          <button type="button" onClick={() => setShowHistory((s) => !s)} className="flex items-center gap-1.5 text-[13px] font-bold text-[#00374a]">
            <svg className={`w-4 h-4 text-[#00afdb] transition-transform ${showHistory ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            History <span className="font-normal text-[#9aa6ac]">· {detail.history.length}</span>
          </button>
          {showHistory && (
            <ul className="space-y-1.5 mt-3">
              {detail.history.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-[12.5px] text-[#6a7a80]">
                  <span className="font-semibold text-[#00374a]">{h.level ?? "—"}</span>
                  <span className="text-[#9aa6ac]">· {h.status}{h.source ? ` · ${h.source}` : ""}</span>
                  <span className="ml-auto text-[#9aa6ac]">{new Date(h.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A circular progress ring with centered content. */
function Ring({ pct, size, stroke, color, children }: { pct: number; size: number; stroke: number; color: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef3f4" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
