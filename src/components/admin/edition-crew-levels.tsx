"use client";

import { useEffect, useState } from "react";
import { LEVELS, deriveSuggestedLevel } from "@/lib/member-level";
import type { EditionCrewLevels, EditionCrewMember } from "@/lib/portal-data";

/**
 * Per-trip batch level review. Lists the whole cohort; per rider you can approve
 * their self-rating in one click, suggest/verify a level, or expand to tick
 * skills — completing a tier auto-verifies the next level. Optimistic: every
 * click updates instantly and saves in the background. Bulk row ticks one skill
 * across selected riders.
 */
export function EditionCrewLevels({ editionId }: { editionId: string }) {
  const [data, setData] = useState<EditionCrewLevels | null>(null);
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

  // optimistic local patch + recompute reviewed count
  function patch(cid: string, p: Partial<EditionCrewMember>) {
    setData((d) => {
      if (!d) return d;
      const members = d.members.map((m) => (m.contactId === cid ? { ...m, ...p } : m));
      return { ...d, members, reviewed: members.filter((m) => m.reviewed).length };
    });
  }

  // fire a save in the background, then reconcile from the server (no blocking)
  function fire(url: string, payload: Record<string, unknown>) {
    setMsg("");
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json()).catch(() => ({}))
      .then((x) => {
        if (x?.levelUnavailable) setMsg("Apply migrations 036 + 039 to enable the level system.");
        else if (x?.error) setMsg(x.error);
        return fetch(`/api/admin/editions/${editionId}/levels`).then((r) => r.json());
      })
      .then((x) => { if (x && !x.error) setData(x); })
      .catch(() => {});
  }

  if (!data) return <p className="text-sm admin-faint">Loading…</p>;
  if (data.total === 0) return <p className="text-sm admin-faint">No participants on this edition yet.</p>;
  const catalog = data.catalog;

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const formEl: React.CSSProperties = { backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" };
  const statusChip = (s: string | null) =>
    s === "verified" ? "bg-green-500/15 text-green-400" : s === "suggested" ? "bg-amber-500/15 text-amber-400" : "admin-faint";

  function toggleSkill(m: EditionCrewMember, milestoneId: string, achieved: boolean) {
    const achievedIds = achieved ? [...new Set([...m.achievedIds, milestoneId])] : m.achievedIds.filter((x) => x !== milestoneId);
    const derived = deriveSuggestedLevel(catalog, new Set(achievedIds));
    patch(m.contactId, derived ? { achievedIds, coach_level: derived, level_status: "verified", reviewed: true } : { achievedIds });
    fire(`/api/admin/members/${m.contactId}/level`, { action: "toggle_milestone", milestone_id: milestoneId, achieved });
  }

  function bulk(achieved: boolean) {
    if (!bulkSkill || selected.size === 0) return;
    const ids = [...selected];
    setData((d) => {
      if (!d) return d;
      const members = d.members.map((m) => {
        if (!ids.includes(m.contactId)) return m;
        const achievedIds = achieved ? [...new Set([...m.achievedIds, bulkSkill])] : m.achievedIds.filter((x) => x !== bulkSkill);
        const derived = deriveSuggestedLevel(d.catalog, new Set(achievedIds));
        return derived ? { ...m, achievedIds, coach_level: derived, level_status: "verified" } : { ...m, achievedIds };
      });
      return { ...d, members, reviewed: members.filter((m) => m.reviewed).length };
    });
    fire(`/api/admin/editions/${editionId}/levels`, { action: "bulk_milestone", milestone_id: bulkSkill, contact_ids: ids, achieved });
  }

  return (
    <div>
      <p className="text-xs admin-faint mb-4">{data.total} rider{data.total !== 1 ? "s" : ""} · <span className="text-green-400">{data.reviewed} reviewed</span>{data.reviewed < data.total ? ` · ${data.total - data.reviewed} to review` : ""}</p>

      {catalog.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <span className="text-xs admin-muted">{selected.size} selected · bulk skill:</span>
          <select value={bulkSkill} onChange={(e) => setBulkSkill(e.target.value)} className="text-xs px-2 py-1 rounded" style={formEl}>
            <option value="">Skill…</option>
            {LEVELS.flatMap((t) => catalog.filter((m) => m.tier === t).map((m) => <option key={m.id} value={m.id}>{t} · {m.label}</option>))}
          </select>
          <button disabled={!bulkSkill || selected.size === 0} onClick={() => bulk(true)} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={{ backgroundColor: "rgba(10,163,199,0.18)", color: "#0aa3c7" }}>✓ Tick for selected</button>
          <button disabled={!bulkSkill || selected.size === 0} onClick={() => bulk(false)} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={formEl}>Untick</button>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
        {data.members.map((m) => {
          const achieved = new Set(m.achievedIds);
          const suggested = deriveSuggestedLevel(catalog, achieved);
          const pick = picks[m.contactId] ?? m.coach_level ?? suggested ?? "";
          return (
            <div key={m.contactId} style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <input type="checkbox" checked={selected.has(m.contactId)} onChange={() => toggleSel(m.contactId)} className="w-3.5 h-3.5 accent-[#0aa3c7]" />
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-medium admin-heading">{m.name}</p>
                  <p className="text-[11px] admin-faint">self: {m.self_level ?? "—"}{suggested ? ` · milestones → ${suggested}` : ""}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${statusChip(m.level_status)}`}>{m.coach_level ?? m.self_level ?? "—"}{m.level_status ? ` · ${m.level_status}` : ""}</span>
                <button disabled={!m.self_level} onClick={() => { patch(m.contactId, { coach_level: m.self_level, level_status: "verified", reviewed: true }); fire(`/api/admin/members/${m.contactId}/level`, { action: "approve_self" }); }} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "#22c55e" }} title="Verify at their self-rating">Approve self</button>
                <select value={pick} onChange={(e) => setPicks((p) => ({ ...p, [m.contactId]: e.target.value }))} className="text-xs px-2 py-1 rounded" style={formEl}>
                  <option value="">Level…</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button disabled={!pick} onClick={() => { patch(m.contactId, { coach_level: pick, level_status: "suggested", reviewed: false }); fire(`/api/admin/members/${m.contactId}/level`, { action: "set_level", level: pick }); }} className="text-xs px-2 py-1 rounded disabled:opacity-40" style={formEl}>Suggest</button>
                <button disabled={!pick} onClick={() => { patch(m.contactId, { coach_level: pick, level_status: "verified", reviewed: true }); fire(`/api/admin/members/${m.contactId}/level`, { action: "set_level", level: pick, verify: true }); }} className="text-xs px-2 py-1 rounded disabled:opacity-40 font-bold" style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>Verify</button>
                {catalog.length > 0 && (
                  <button onClick={() => setExpanded((e) => (e === m.contactId ? null : m.contactId))} className="text-xs admin-muted px-1.5 py-1">Skills {expanded === m.contactId ? "▴" : "▾"}</button>
                )}
              </div>
              {expanded === m.contactId && catalog.length > 0 && (
                <div className="px-4 pb-3 space-y-2">
                  {LEVELS.map((t) => {
                    const inTier = catalog.filter((c) => c.tier === t);
                    if (inTier.length === 0) return null;
                    return (
                      <div key={t}>
                        <p className="text-[10px] uppercase tracking-wider admin-faint mb-1">{t}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {inTier.map((c) => {
                            const on = achieved.has(c.id);
                            return (
                              <button key={c.id} title={c.description ?? c.label} onClick={() => toggleSkill(m, c.id, !on)}
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
