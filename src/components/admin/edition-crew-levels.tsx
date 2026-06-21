"use client";

import { useEffect, useState } from "react";
import { LEVELS } from "@/lib/member-level";
import type { EditionCrewLevels } from "@/lib/portal-data";

/**
 * Per-trip batch level review. Lists the whole cohort; per rider you can approve
 * their self-rating in one click, set/verify a level, or expand to tick skills —
 * plus a bulk "tick a skill for selected riders". Reuses /api/admin/members/[id]/
 * level per rider and /api/admin/editions/[id]/levels for the roster + bulk.
 */
export function EditionCrewLevels({ editionId }: { editionId: string }) {
  const [data, setData] = useState<EditionCrewLevels | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSkill, setBulkSkill] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => { const r = await fetch(`/api/admin/editions/${editionId}/levels`); const x = await r.json(); if (alive && !x.error) setData(x); })();
    return () => { alive = false; };
  }, [editionId]);

  async function refresh() { const r = await fetch(`/api/admin/editions/${editionId}/levels`); const x = await r.json(); if (!x.error) setData(x); }

  async function run(url: string, payload: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const x = await r.json().catch(() => ({}));
    setBusy(false);
    if (x.levelUnavailable) setMsg("Apply migration 036 to enable the level system.");
    else if (x.error) setMsg(x.error);
    await refresh();
  }
  const member = (cid: string, p: Record<string, unknown>) => run(`/api/admin/members/${cid}/level`, p);

  if (!data) return <p className="text-sm admin-faint">Loading…</p>;
  if (data.total === 0) return <p className="text-sm admin-faint">No participants on this edition yet.</p>;

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const formEl: React.CSSProperties = { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" };
  const statusChip = (s: string | null) =>
    s === "verified" ? "bg-green-500/15 text-green-400" : s === "suggested" ? "bg-amber-500/15 text-amber-400" : "admin-faint";

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs admin-faint">{data.total} rider{data.total !== 1 ? "s" : ""} · <span className="text-green-400">{data.reviewed} reviewed</span>{data.reviewed < data.total ? ` · ${data.total - data.reviewed} to review` : ""}</p>
      </div>

      {/* bulk bar */}
      {data.catalog.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <span className="text-xs admin-muted">{selected.size} selected · bulk skill:</span>
          <select value={bulkSkill} onChange={(e) => setBulkSkill(e.target.value)} className="text-xs px-2 py-1 rounded" style={formEl}>
            <option value="">Skill…</option>
            {LEVELS.flatMap((t) => data.catalog.filter((m) => m.tier === t).map((m) => <option key={m.id} value={m.id}>{t} · {m.label}</option>))}
          </select>
          <button disabled={busy || !bulkSkill || selected.size === 0} onClick={() => run(`/api/admin/editions/${editionId}/levels`, { action: "bulk_milestone", milestone_id: bulkSkill, contact_ids: [...selected], achieved: true })} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={{ backgroundColor: "rgba(10,163,199,0.18)", color: "#0aa3c7" }}>✓ Tick for selected</button>
          <button disabled={busy || !bulkSkill || selected.size === 0} onClick={() => run(`/api/admin/editions/${editionId}/levels`, { action: "bulk_milestone", milestone_id: bulkSkill, contact_ids: [...selected], achieved: false })} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={formEl}>Untick</button>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
        {data.members.map((m) => {
          const achieved = new Set(m.achievedIds);
          const pick = picks[m.contactId] ?? m.coach_level ?? m.suggested ?? "";
          return (
            <div key={m.contactId} style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <input type="checkbox" checked={selected.has(m.contactId)} onChange={() => toggleSel(m.contactId)} className="w-3.5 h-3.5 accent-[#0aa3c7]" />
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-medium admin-heading">{m.name}</p>
                  <p className="text-[11px] admin-faint">self: {m.self_level ?? "—"}{m.suggested ? ` · milestones → ${m.suggested}` : ""}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${statusChip(m.level_status)}`}>{m.coach_level ?? m.self_level ?? "—"}{m.level_status ? ` · ${m.level_status}` : ""}</span>
                <button disabled={busy || !m.self_level} onClick={() => member(m.contactId, { action: "approve_self" })} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "#22c55e" }} title="Verify at their self-rating">Approve self</button>
                <select value={pick} onChange={(e) => setPicks((p) => ({ ...p, [m.contactId]: e.target.value }))} className="text-xs px-2 py-1 rounded" style={formEl}>
                  <option value="">Level…</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button disabled={busy || !pick} onClick={() => member(m.contactId, { action: "set_level", level: pick })} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={formEl}>Suggest</button>
                <button disabled={busy || !pick} onClick={() => member(m.contactId, { action: "set_level", level: pick, verify: true })} className="text-xs px-2 py-1 rounded disabled:opacity-40 font-bold" style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>Verify</button>
                {data.catalog.length > 0 && (
                  <button onClick={() => setExpanded((e) => (e === m.contactId ? null : m.contactId))} className="text-xs admin-muted px-1.5 py-1">Skills {expanded === m.contactId ? "▴" : "▾"}</button>
                )}
              </div>
              {expanded === m.contactId && data.catalog.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {LEVELS.map((t) => {
                    const inTier = data.catalog.filter((c) => c.tier === t);
                    if (inTier.length === 0) return null;
                    return (
                      <div key={t}>
                        <p className="text-[10px] uppercase tracking-wider admin-faint mb-1">{t}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {inTier.map((c) => {
                            const on = achieved.has(c.id);
                            return (
                              <button key={c.id} disabled={busy} onClick={() => member(m.contactId, { action: "toggle_milestone", milestone_id: c.id, achieved: !on })}
                                className="text-xs px-2 py-1 rounded" style={on ? { backgroundColor: "rgba(10,163,199,0.18)", color: "#0aa3c7" } : formEl}>
                                {on ? "✓ " : ""}{c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-xs text-amber-400 mt-3">{msg}</p>}
    </div>
  );
}
