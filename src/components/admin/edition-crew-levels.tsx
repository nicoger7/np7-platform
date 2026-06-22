"use client";

import { useEffect, useState } from "react";
import { LEVELS, deriveSuggestedLevel } from "@/lib/member-level";
import type { EditionCrewLevels, EditionCrewMember } from "@/lib/portal-data";

/**
 * Per-trip level review, as a master-detail split (matching the members page):
 * a full cohort list when nothing is selected, collapsing to a rail + a single
 * rider's full skill/level editor when you pick one. Per rider you can approve
 * their self-rating, suggest/verify a level, or tick skills — completing a tier
 * auto-verifies the next level. The bulk bar ticks one skill across the riders
 * checked in the list. Optimistic: every click saves in the background.
 */
export function EditionCrewLevels({ editionId }: { editionId: string }) {
  const [data, setData] = useState<EditionCrewLevels | null>(null);
  const [msg, setMsg] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // "Select all" / "Clear all" for one rider's whole tier — one bulk write.
  function setTier(m: EditionCrewMember, tier: string, achieved: boolean) {
    const tierIds = catalog.filter((c) => c.tier === tier).map((c) => c.id);
    if (!tierIds.length) return;
    const set = new Set(m.achievedIds);
    tierIds.forEach((id) => (achieved ? set.add(id) : set.delete(id)));
    const achievedIds = [...set];
    const derived = deriveSuggestedLevel(catalog, set);
    patch(m.contactId, derived ? { achievedIds, coach_level: derived, level_status: "verified", reviewed: true } : { achievedIds });
    fire(`/api/admin/members/${m.contactId}/level`, { action: "set_milestones", milestone_ids: tierIds, achieved });
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

  // The full per-rider editor — shown in the detail pane (always expanded).
  function riderDetail(m: EditionCrewMember) {
    const achieved = new Set(m.achievedIds);
    const suggested = deriveSuggestedLevel(catalog, achieved);
    const pick = picks[m.contactId] ?? m.coach_level ?? suggested ?? "";
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
        <div className="px-4 sm:px-5 py-4" style={{ borderBottom: catalog.length > 0 ? "1px solid var(--admin-border)" : undefined }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold admin-heading truncate">{m.name}</p>
              <p className="text-xs admin-faint truncate mt-0.5">self: {m.self_level ?? "—"}{suggested ? ` · milestones → ${suggested}` : ""}</p>
            </div>
            <span className={`shrink-0 px-2 py-1 rounded text-[11px] uppercase ${statusChip(m.level_status)}`}>{m.coach_level ?? m.self_level ?? "—"}{m.level_status ? ` · ${m.level_status}` : ""}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <button disabled={!m.self_level} onClick={() => { patch(m.contactId, { coach_level: m.self_level, level_status: "verified", reviewed: true }); fire(`/api/admin/members/${m.contactId}/level`, { action: "approve_self" }); }} className="text-xs px-2.5 py-1.5 rounded disabled:opacity-40" style={{ backgroundColor: "rgba(34,197,94,0.16)", color: "#22c55e" }} title="Verify at their self-rating">Approve self</button>
            <select value={pick} onChange={(e) => setPicks((p) => ({ ...p, [m.contactId]: e.target.value }))} className="text-xs px-2 py-1.5 rounded" style={formEl}>
              <option value="">Level…</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button disabled={!pick} onClick={() => { patch(m.contactId, { coach_level: pick, level_status: "suggested", reviewed: false }); fire(`/api/admin/members/${m.contactId}/level`, { action: "set_level", level: pick }); }} className="text-xs px-2.5 py-1.5 rounded disabled:opacity-40" style={formEl}>Suggest</button>
            <button disabled={!pick} onClick={() => { patch(m.contactId, { coach_level: pick, level_status: "verified", reviewed: true }); fire(`/api/admin/members/${m.contactId}/level`, { action: "set_level", level: pick, verify: true }); }} className="text-xs px-2.5 py-1.5 rounded disabled:opacity-40 font-bold" style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>Verify</button>
            {catalog.length > 0 && <span className="ml-auto text-xs admin-faint">{m.achievedIds.length}/{catalog.length} skills</span>}
          </div>
        </div>
        {catalog.length > 0 && (
          <div className="px-4 sm:px-5 py-4 space-y-3" style={{ backgroundColor: "var(--admin-surface)" }}>
            {LEVELS.map((t) => {
              const inTier = catalog.filter((c) => c.tier === t);
              if (inTier.length === 0) return null;
              const doneCount = inTier.filter((c) => achieved.has(c.id)).length;
              const allDone = doneCount === inTier.length;
              return (
                <div key={t}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-[10px] uppercase tracking-wider admin-faint">{t} <span className="admin-faint">· {doneCount}/{inTier.length}</span></p>
                    <button onClick={() => setTier(m, t, !allDone)} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: "var(--admin-accent)", backgroundColor: "var(--admin-accent-weak)" }}>{allDone ? "Clear all" : "Select all"}</button>
                  </div>
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
  }

  const selectedMember = selectedId ? data.members.find((m) => m.contactId === selectedId) : null;

  return (
    <div>
      <p className="text-xs admin-faint mb-4">{data.total} rider{data.total !== 1 ? "s" : ""} · <span className="text-green-400">{data.reviewed} reviewed</span>{data.reviewed < data.total ? ` · ${data.total - data.reviewed} to review` : ""}</p>

      {selectedMember ? (
        <div className="flex flex-col md:flex-row gap-4">
          {/* rail */}
          <div className="md:w-60 shrink-0 flex md:flex-col gap-1.5 md:max-h-[72vh] md:overflow-y-auto md:pr-1">
            <button onClick={() => setSelectedId(null)} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All riders
            </button>
            {data.members.map((m) => {
              const active = m.contactId === selectedId;
              return (
                <button key={m.contactId} onClick={() => setSelectedId(m.contactId)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                  <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{m.name}</span>
                  <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{m.coach_level ?? m.self_level ?? "—"}{m.level_status ? ` · ${m.level_status}` : ""}{m.reviewed ? " ✓" : ""}</span>
                </button>
              );
            })}
          </div>
          {/* detail */}
          <div className="flex-1 min-w-0">{riderDetail(selectedMember)}</div>
        </div>
      ) : (
        <>
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
              const suggested = deriveSuggestedLevel(catalog, new Set(m.achievedIds));
              return (
                <div key={m.contactId} className="flex items-center gap-2.5 px-3 sm:px-4 py-3 transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <input type="checkbox" checked={selected.has(m.contactId)} onChange={() => toggleSel(m.contactId)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-[#0aa3c7] shrink-0" title="Select for bulk skill" />
                  <button onClick={() => setSelectedId(m.contactId)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left group">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium admin-heading truncate group-hover:text-[var(--admin-accent)] transition-colors">{m.name}</span>
                      <span className="block text-[11px] admin-faint truncate">self: {m.self_level ?? "—"}{suggested ? ` · milestones → ${suggested}` : ""}{catalog.length > 0 ? ` · ${m.achievedIds.length}/${catalog.length} skills` : ""}</span>
                    </span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase ${statusChip(m.level_status)}`}>{m.coach_level ?? m.self_level ?? "—"}{m.level_status ? ` · ${m.level_status}` : ""}</span>
                    <svg className="w-4 h-4 shrink-0 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {msg && <p className="text-xs text-amber-400 mt-3">{msg}</p>}
    </div>
  );
}
