"use client";

import { useEffect, useRef, useState } from "react";
import { LEVELS } from "@/lib/member-level";
import { mutate } from "@/lib/mutate";

type Detail = {
  self_level: string | null; coach_level: string | null; level_status: string | null;
  coach_can_manage_level: boolean; suggested: string | null;
  milestones: { id: string; key: string; label: string; tier: string; sort_order: number; achieved: boolean; via?: string | null }[];
  history: { level: string | null; status: string | null; source: string | null; created_at: string }[];
};

/** Coach controls on the admin member page: tick milestones (instant, optimistic),
    "Select all" per tier, and suggest or verify a level.
    Reads/writes /api/admin/members/[id]/level. */
export function AdminMemberLevel({ contactId }: { contactId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);   // only the level select/verify buttons
  const [saving, setSaving] = useState(false); // background milestone writes in flight
  const [msg, setMsg] = useState("");
  const [justVerified, setJustVerified] = useState<string | null>(null);
  const [congratsSent, setCongratsSent] = useState(false);
  const inFlight = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch(`/api/admin/members/${contactId}/level`);
      const x = await r.json();
      if (alive && !x.error) { setD(x); setPick((cur) => cur || x.coach_level || x.suggested || ""); }
    })();
    return () => { alive = false; };
  }, [contactId]);

  // Reconcile only the header (level / status / suggestion / history) from the
  // server — milestones stay as the optimistic local truth so ticks never flicker.
  async function reconcileHeader() {
    const r = await fetch(`/api/admin/members/${contactId}/level`);
    const x = await r.json().catch(() => ({}));
    if (x.error) return;
    setD((cur) => (cur ? { ...cur, coach_level: x.coach_level, level_status: x.level_status, suggested: x.suggested, history: x.history } : cur));
    setPick((cur) => cur || x.coach_level || x.suggested || "");
  }

  // Fire-and-forget write: no global disable, debounced reconcile when idle.
  // `undo` restores the ticks this write was optimistic about.
  async function bg(payload: Record<string, unknown>, undo?: () => void) {
    inFlight.current++; setSaving(true); setMsg("");
    // The old code read the JSON body but never res.ok, and a 401/403 returns an
    // HTML login page — so `x` came back {} and nothing was reported. A coach
    // whose session had expired could tick a whole tier, watch every chip turn
    // cyan, and leave: the header reconcile leaves milestones alone by design, so
    // the ticks survived on screen while the member's rank never moved.
    const r = await mutate<{ levelUnavailable?: boolean; error?: string } | null>(
      `/api/admin/members/${contactId}/level`,
      { method: "POST", body: payload },
    );
    if (!r.ok) { undo?.(); setMsg(r.error); }
    else if (r.data?.levelUnavailable) { undo?.(); setMsg("Apply migration 036 to enable the full level system."); }
    else if (r.data?.error) { undo?.(); setMsg(r.data.error); }
    inFlight.current--;
    if (inFlight.current === 0) { setSaving(false); reconcileHeader(); }
  }

  // Blocking write (level select / suggest / verify) — infrequent, so we wait.
  async function post(payload: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const r = await mutate<{ levelUnavailable?: boolean; error?: string } | null>(
      `/api/admin/members/${contactId}/level`,
      { method: "POST", body: payload },
    );
    setBusy(false);
    // Without this branch a rejected write fell through to the success arm below:
    // "✓ Verified as Advanced", plus the congrats-email prompt for a verification
    // the server refused. The coach tells the member they levelled up, and the
    // member's account still says otherwise.
    if (!r.ok) { setMsg(r.error); return; }
    if (r.data?.levelUnavailable) { setMsg("Apply migration 036 to enable the full level system."); }
    else if (r.data?.error) { setMsg(r.data.error); }
    else if (payload.verify && typeof payload.level === "string") {
      setMsg(`✓ Verified as ${payload.level}`);
      setJustVerified(payload.level); setCongratsSent(false);
    } else if (payload.action === "set_level") {
      setMsg(`✓ Suggested ${payload.level} to member`);
    } else setMsg("✓ Saved");
    await reconcileHeader();
  }

  async function sendCongrats() {
    if (!justVerified) return;
    setBusy(true);
    const r = await mutate(`/api/admin/members/${contactId}/congrats`, { method: "POST", body: { level: justVerified } });
    setBusy(false);
    // Marking it sent before knowing it sent removed the only "Send email" button
    // there is, so a failed send could never be retried — and a dropped connection
    // threw out of here entirely, leaving the buttons disabled with no message.
    if (!r.ok) { setMsg(r.error); return; }
    setCongratsSent(true);
    setMsg("🎉 Congrats email sent");
  }

  // A coach action resolves the "self-logged" state: ticking marks it via='coach'
  // (counts toward rank); unticking clears it.
  function applyLocal(ids: Set<string>, achieved: boolean, via: string | null) {
    setD((cur) => (cur ? { ...cur, milestones: cur.milestones.map((m) => (ids.has(m.id) ? { ...m, achieved, via } : m)) } : cur));
  }
  /** Optimistic tick + the undo that puts these exact milestones back if the write
      is refused. Only the ids this write touched are restored, so a failure can't
      wipe out a neighbouring tick that did save. */
  function applyLocalUndoable(ids: Set<string>, achieved: boolean, via: string | null) {
    const before = (d?.milestones ?? []).filter((m) => ids.has(m.id)).map((m) => ({ id: m.id, achieved: m.achieved, via: m.via ?? null }));
    applyLocal(ids, achieved, via);
    return () => setD((cur) => (cur ? { ...cur, milestones: cur.milestones.map((m) => {
      const p = before.find((b) => b.id === m.id);
      return p ? { ...m, achieved: p.achieved, via: p.via } : m;
    }) } : cur));
  }
  function toggleOne(m: Detail["milestones"][number]) {
    const next = !m.achieved;
    const undo = applyLocalUndoable(new Set([m.id]), next, next ? "coach" : null);
    bg({ action: "toggle_milestone", milestone_id: m.id, achieved: next }, undo);
  }
  function confirmOne(m: Detail["milestones"][number]) {
    const undo = applyLocalUndoable(new Set([m.id]), true, "coach");
    bg({ action: "toggle_milestone", milestone_id: m.id, achieved: true }, undo);
  }
  function confirmAllSelf() {
    if (!d) return;
    const ids = d.milestones.filter((m) => m.achieved && m.via === "self").map((m) => m.id);
    if (!ids.length) return;
    // Undo matters most here: "Confirm all" clears the amber self-logged banner,
    // so a failed write would hide the very skills still waiting for confirmation.
    const undo = applyLocalUndoable(new Set(ids), true, "coach");
    bg({ action: "set_milestones", milestone_ids: ids, achieved: true }, undo);
  }
  function setTier(tier: string, achieved: boolean) {
    if (!d) return;
    const ids = d.milestones.filter((m) => m.tier === tier).map((m) => m.id);
    if (!ids.length) return;
    const undo = applyLocalUndoable(new Set(ids), achieved, achieved ? "coach" : null);
    bg({ action: "set_milestones", milestone_ids: ids, achieved }, undo);
  }

  if (!d) return <p className="text-xs admin-faint">Loading…</p>;

  const ctl = "text-xs px-2 py-1 rounded";
  const formEl: React.CSSProperties = { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" };
  const selfCount = d.milestones.filter((m) => m.achieved && m.via === "self").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="admin-muted">Coach level:</span>
        <b className="admin-heading">{d.coach_level ?? "—"}</b>
        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${d.level_status === "verified" ? "bg-green-500/15 text-green-400" : d.level_status === "suggested" ? "bg-amber-500/15 text-amber-400" : "admin-faint"}`}>{d.level_status ?? "self"}</span>
        <span className="admin-faint">· self-rated: {d.self_level ?? "—"}</span>
        {d.coach_can_manage_level && <span className="text-green-400">· consent on</span>}
        {saving && <span className="admin-faint">· saving…</span>}
      </div>
      {d.suggested && <p className="text-xs admin-faint">Milestones suggest <b className="admin-heading">{d.suggested}</b>.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${ctl}`} style={formEl}>
          <option value="">Level…</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button disabled={busy || !pick} onClick={() => post({ action: "set_level", level: pick })} className={ctl} style={formEl}>Suggest to member</button>
        <button disabled={busy || !pick} onClick={() => post({ action: "set_level", level: pick, verify: true })} className={`${ctl} font-bold`} style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>{busy ? "Saving…" : "Set verified"}</button>
        {msg && <span className="text-xs font-semibold" style={{ color: msg.startsWith("✓") || msg.startsWith("🎉") ? "#22c55e" : "#f59e0b" }}>{msg}</span>}
      </div>

      {justVerified && !congratsSent && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <span className="admin-muted">🎉 Verified <b className="admin-heading">{justVerified}</b> — send a congrats email?</span>
          <button disabled={busy} onClick={sendCongrats} className="ml-auto px-2.5 py-1 rounded font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">Send email</button>
          <button onClick={() => setJustVerified(null)} className="px-2 py-1 admin-faint hover:admin-heading">Not now</button>
        </div>
      )}

      {selfCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid rgba(245,158,11,0.4)", backgroundColor: "rgba(245,158,11,0.08)" }}>
          <span style={{ color: "#f59e0b" }}>⬦ {selfCount} skill{selfCount > 1 ? "s" : ""} self-logged by the member — tap each to confirm, or</span>
          <button onClick={confirmAllSelf} className="ml-auto shrink-0 px-2.5 py-1 rounded font-bold" style={{ backgroundColor: "#f59e0b", color: "#0a0a0a" }}>Confirm all</button>
        </div>
      )}

      <div className="space-y-2 pt-1">
        {LEVELS.map((t) => {
          const inTier = d.milestones.filter((m) => m.tier === t);
          if (inTier.length === 0) return null;
          const doneCount = inTier.filter((m) => m.achieved).length;
          const allDone = doneCount === inTier.length;
          return (
            <div key={t}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] uppercase tracking-wider admin-faint">{t} <span className="admin-faint">· {doneCount}/{inTier.length}</span></p>
                <button
                  onClick={() => setTier(t, !allDone)}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ color: "var(--admin-accent)", backgroundColor: "var(--admin-accent-weak)" }}
                >
                  {allDone ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inTier.map((m) => {
                  if (m.achieved && m.via === "self") {
                    return (
                      <span key={m.id} className="inline-flex items-center rounded overflow-hidden text-xs" style={{ border: "1px solid rgba(245,158,11,0.5)" }}>
                        <button onClick={() => confirmOne(m)} className="px-2 py-1 font-semibold" style={{ backgroundColor: "rgba(245,158,11,0.14)", color: "#f59e0b" }}>⬦ {m.label} · confirm</button>
                        <button onClick={() => toggleOne(m)} title="Reject self-claim" className="px-1.5 py-1 border-l" style={{ backgroundColor: "rgba(245,158,11,0.14)", color: "#f59e0b", borderColor: "rgba(245,158,11,0.5)" }}>✕</button>
                      </span>
                    );
                  }
                  return (
                    <button key={m.id} onClick={() => toggleOne(m)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={m.achieved ? { backgroundColor: "rgba(10,163,199,0.18)", color: "#0aa3c7" } : formEl}>
                      {m.achieved ? "✓ " : ""}{m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="text-[10.5px] admin-faint pt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span style={{ color: "#f59e0b" }}>⬦ self-logged — tap to confirm</span>
          <span style={{ color: "#0aa3c7" }}>✓ verified (counts toward rank)</span>
        </p>
      </div>

      {d.history.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] uppercase tracking-wider admin-faint mb-1">History</p>
          <div className="space-y-0.5">
            {d.history.slice(0, 5).map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] admin-muted">
                <span className="admin-heading font-semibold">{h.level ?? "—"}</span>
                <span className="admin-faint">{h.status}{h.source ? ` · ${h.source}` : ""}</span>
                <span className="ml-auto admin-faint">{new Date(h.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-amber-400">{msg}</p>}
    </div>
  );
}
