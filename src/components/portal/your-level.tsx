"use client";

import { useState } from "react";
import { LEVELS } from "@/lib/member-level";
import type { MemberLevelDetail } from "@/lib/portal-data";

/**
 * The member's level: set your own, grant standing consent for a coach to
 * set+verify it, accept/decline a pending suggestion, and see your milestone
 * progress + history. A "suggested" status is private to this screen — it never
 * shows on the public community profile until accepted.
 */
export function YourLevel({ detail }: { detail: MemberLevelDetail }) {
  const [selfLevel, setSelfLevel] = useState(detail.self_level ?? "");
  const [status, setStatus] = useState(detail.level_status ?? "self");
  const [consent, setConsent] = useState(detail.coach_can_manage_level);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [showAllHistory, setShowAllHistory] = useState(false);

  const coachLevel = detail.coach_level;
  const pending = status === "suggested" && !!coachLevel;
  const verified = status === "verified" && !!coachLevel;
  const shown = verified ? coachLevel : selfLevel || null;
  const hasCatalog = detail.milestones.length > 0;

  async function call(payload: Record<string, unknown>) {
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch("/api/portal/level", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && !d.levelUnavailable) { setSaved(true); setTimeout(() => setSaved(false), 2000); return true; }
    setErr(d.levelUnavailable ? "Level saving isn't switched on yet." : d.error ?? "Couldn't save. Please try again.");
    return false;
  }

  const field = "px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb]";
  const label = "block text-[12px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-1.5";

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb]">Your level</h2>
        {shown && (
          verified
            ? <span className="inline-flex items-center gap-1.5 text-[12px] font-bold bg-[#e1f5ee] text-[#0f6e56] px-3 py-1 rounded-full"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 1.9 3.2-.2 1 3 2.6 1.8-1 3 1 3-2.6 1.8-1 3-3.2-.2L12 23l-2.6-1.9-3.2.2-1-3L2.6 16.5l1-3-1-3 2.6-1.8 1-3 3.2.2z" /><path d="M10.5 13.5l-2-2-1.4 1.4 3.4 3.4 6-6-1.4-1.4z" fill="#fff" /></svg>{shown} · coach-verified</span>
            : <span className="text-[12px] font-bold bg-[#eef3f4] text-[#5a6b72] px-3 py-1 rounded-full">{shown}</span>
        )}
      </div>

      {/* pending coach suggestion — private to the member */}
      {pending && (
        <div className="rounded-xl border border-[#bfe6f2] bg-[#f3fbfe] p-4 mb-5">
          <p className="text-[14px] text-[#00374a]"><span className="font-bold">Your coach suggests {coachLevel}.</span> Accept it to show a coach-verified badge, or keep your own.</p>
          <div className="flex gap-2 mt-3">
            <button disabled={busy} onClick={async () => { if (await call({ action: "accept" })) setStatus("verified"); }}
              className="px-4 py-2 rounded-full text-[13px] font-bold text-white bg-[#1aa851] hover:bg-[#16944a] disabled:opacity-60">Accept — make it verified</button>
            <button disabled={busy} onClick={async () => { if (await call({ action: "decline" })) setStatus("self"); }}
              className="px-4 py-2 rounded-full text-[13px] font-bold text-[#5a6b72] bg-[#eef3f4] hover:bg-[#e2eaec] disabled:opacity-60">Keep my own</button>
          </div>
        </div>
      )}

      {/* self-set */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={label}>I&apos;d rate myself</label>
          <select className={field} value={selfLevel} onChange={(e) => setSelfLevel(e.target.value)} disabled={verified && consent}>
            <option value="">Select…</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button disabled={busy} onClick={async () => { if (await call({ self_level: selfLevel })) setStatus("self"); }}
          className="px-5 py-3 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60">Save</button>
        {saved && <span className="text-[13px] font-semibold text-green-700">Saved ✓</span>}
        {err && <span className="text-[13px] font-semibold text-[#c4621a]">{err}</span>}
      </div>

      {/* consent */}
      <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
        <input type="checkbox" checked={consent} className="mt-0.5 w-4 h-4 accent-[#00afdb]"
          onChange={(e) => { setConsent(e.target.checked); call({ coach_can_manage_level: e.target.checked }).then((ok) => { if (ok && e.target.checked && coachLevel) setStatus("verified"); }); }} />
        <span className="text-[13px] text-[#6a7a80] leading-relaxed">Let my coach set &amp; verify my level — I trust their call, no need to confirm each change.</span>
      </label>

      {/* milestone progress — the actual skills, grouped by tier */}
      {hasCatalog && (
        <div className="mt-6 pt-5 border-t border-[#f3ede2]">
          <p className="text-[13px] font-bold text-[#00374a] mb-3">Your progress</p>
          <div className="space-y-3.5">
            {LEVELS.map((tier) => {
              const inTier = detail.milestones.filter((m) => m.tier === tier);
              if (inTier.length === 0) return null;
              const done = inTier.filter((m) => m.achieved).length;
              return (
                <div key={tier}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-semibold text-[#00374a]">{tier}</span>
                    <span className="text-[12px] text-[#9aa6ac] tabular-nums">{done}/{inTier.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {inTier.map((m) => (
                      <span key={m.id} className={`text-[12px] px-2.5 py-1 rounded-full border ${m.achieved ? "border-[#9fe1cb] bg-[#e1f5ee] text-[#0f6e56]" : "border-[#e6eef0] text-[#9aa6ac]"}`}>
                        {m.achieved ? "✓ " : ""}{m.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-[#9aa6ac] mt-3">Your coach ticks these off as you progress — completing a tier suggests your next level.</p>
        </div>
      )}

      {/* history */}
      {detail.history.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[#f3ede2]">
          <p className="text-[13px] font-bold text-[#00374a] mb-3">History</p>
          <ul className="space-y-1.5">
            {(showAllHistory ? detail.history : detail.history.slice(0, 4)).map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-[12.5px] text-[#6a7a80]">
                <span className="font-semibold text-[#00374a]">{h.level ?? "—"}</span>
                <span className="text-[#9aa6ac]">· {h.status}{h.source ? ` · ${h.source}` : ""}</span>
                <span className="ml-auto text-[#9aa6ac]">{new Date(h.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </li>
            ))}
          </ul>
          {detail.history.length > 4 && (
            <button type="button" onClick={() => setShowAllHistory((s) => !s)} className="mt-2.5 text-[12.5px] font-bold text-[#00afdb] hover:underline">
              {showAllHistory ? "Show less" : `Show all ${detail.history.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
