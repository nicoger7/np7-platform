"use client";

import { useEffect, useRef, useState } from "react";
import { LEVELS } from "@/lib/member-level";

type Detail = {
  self_level: string | null; coach_level: string | null; level_status: string | null;
  coach_can_manage_level: boolean; suggested: string | null;
  milestones: { id: string; key: string; label: string; tier: string; sort_order: number; achieved: boolean }[];
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
  async function bg(payload: Record<string, unknown>) {
    inFlight.current++; setSaving(true); setMsg("");
    try {
      const r = await fetch(`/api/admin/members/${contactId}/level`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const x = await r.json().catch(() => ({}));
      if (x.levelUnavailable) setMsg("Apply migration 036 to enable the full level system.");
      else if (x.error) setMsg(x.error);
    } catch {
      setMsg("Couldn't save — check your connection.");
    } finally {
      inFlight.current--;
      if (inFlight.current === 0) { setSaving(false); reconcileHeader(); }
    }
  }

  // Blocking write (level select / suggest / verify) — infrequent, so we wait.
  async function post(payload: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/admin/members/${contactId}/level`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (x.levelUnavailable) setMsg("Apply migration 036 to enable the full level system.");
    else if (x.error) setMsg(x.error);
    await reconcileHeader();
  }

  function applyLocal(ids: Set<string>, achieved: boolean) {
    setD((cur) => (cur ? { ...cur, milestones: cur.milestones.map((m) => (ids.has(m.id) ? { ...m, achieved } : m)) } : cur));
  }
  function toggleOne(m: Detail["milestones"][number]) {
    applyLocal(new Set([m.id]), !m.achieved);
    bg({ action: "toggle_milestone", milestone_id: m.id, achieved: !m.achieved });
  }
  function setTier(tier: string, achieved: boolean) {
    if (!d) return;
    const ids = d.milestones.filter((m) => m.tier === tier).map((m) => m.id);
    if (!ids.length) return;
    applyLocal(new Set(ids), achieved);
    bg({ action: "set_milestones", milestone_ids: ids, achieved });
  }

  if (!d) return <p className="text-xs admin-faint">Loading…</p>;

  const ctl = "text-xs px-2 py-1 rounded";
  const formEl: React.CSSProperties = { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" };

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
        <button disabled={busy || !pick} onClick={() => post({ action: "set_level", level: pick, verify: true })} className={`${ctl} font-bold`} style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>Set verified</button>
      </div>

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
                {inTier.map((m) => (
                  <button key={m.id} onClick={() => toggleOne(m)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={m.achieved ? { backgroundColor: "rgba(10,163,199,0.18)", color: "#0aa3c7" } : formEl}>
                    {m.achieved ? "✓ " : ""}{m.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
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
