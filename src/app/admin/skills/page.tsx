"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CORE_DISCIPLINES, DISCIPLINE_LABEL, rankForDifficulty, RANKS } from "@/lib/progression";

type Skill = {
  id: string; key: string; label: string; description: string | null;
  tier: string | null; rank: string | null; discipline: string | null; difficulty: number | null;
  prerequisite_key: string | null; sort_order: number; active: boolean;
};

const DISCIPLINES = [...CORE_DISCIPLINES, "side"] as const;
const disciplineLabel = (d: string | null) => DISCIPLINE_LABEL[(d as keyof typeof DISCIPLINE_LABEL)] ?? (d === "side" ? "Wave & Freestyle" : d ?? "—");
const RANK_TONE: Record<string, string> = { Beginner: "#6b7280", Intermediate: "#2563eb", Advanced: "#7c3aed", Amateur: "#c2410c", "Semi-Pro": "#be185d", Pro: "#b45309" };
const rankIndex = (r: string) => RANKS.indexOf(r as (typeof RANKS)[number]);
const isRank = (r: unknown): r is string => typeof r === "string" && RANKS.includes(r as (typeof RANKS)[number]);
// Stored rank wins; fall back to the legacy difficulty band for rows not yet migrated.
const rankOf = (s: Skill): string => (isRank(s.rank) ? s.rank : rankForDifficulty(s.difficulty ?? 10));

const blank = { id: "", label: "", description: "", discipline: "freeride", rank: "Beginner", prerequisite_key: "", active: true };

export default function SkillsAdminPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<string>("freeride");
  const [form, setForm] = useState<typeof blank | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overRank, setOverRank] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/skills").then((r) => r.json()).then((d) => {
      setSkills(Array.isArray(d?.skills) ? d.skills : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const trackCount = (d: string) => skills.filter((s) => (s.discipline || "side") === d).length;

  // The current track's skills, ordered (rank ascending, then sort_order) and grouped by rank.
  const orderedTrack = useMemo(() =>
    skills.filter((s) => (s.discipline || "side") === track)
      .slice()
      .sort((a, b) => rankIndex(rankOf(a)) - rankIndex(rankOf(b)) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)),
    [skills, track]);
  const byRank = useMemo(() => {
    const m: Record<string, Skill[]> = {};
    for (const r of RANKS) m[r] = [];
    for (const s of orderedTrack) m[rankOf(s)].push(s);
    return m;
  }, [orderedTrack]);

  // Persist a new order for the current track: sequential sort_order + each skill's rank.
  async function persist(nextOrdered: Skill[]) {
    const updates = nextOrdered.map((s, i) => ({ id: s.id, rank: rankOf(s), sort_order: (i + 1) * 10 }));
    setSkills((prev) => prev.map((s) => {
      const u = updates.find((x) => x.id === s.id);
      return u ? { ...s, rank: u.rank, sort_order: u.sort_order } : s;
    }));
    setErr(null);
    const res = await fetch("/api/admin/skills", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d?.error || "Couldn't save order — is migration 077 applied?"); load(); }
  }

  // Drop onto a band → move skill there, appended at the end of that band.
  function moveToRank(id: string, targetRank: string) {
    if (!isRank(targetRank)) return;
    const cur = orderedTrack;
    const moved = cur.find((s) => s.id === id);
    if (!moved) return;
    if (rankOf(moved) === targetRank && byRank[targetRank].at(-1)?.id === id) return; // already last there
    const rest = cur.filter((s) => s.id !== id);
    const movedNew = { ...moved, rank: targetRank };
    const ti = rankIndex(targetRank);
    let at = rest.length;
    for (let i = 0; i < rest.length; i++) { if (rankIndex(rankOf(rest[i])) > ti) { at = i; break; } }
    persist([...rest.slice(0, at), movedNew, ...rest.slice(at)]);
  }

  // Drop onto a card → reorder before it (same band), or move to that band.
  function reorderBefore(id: string, beforeId: string) {
    if (id === beforeId) return;
    const cur = orderedTrack;
    const moved = cur.find((s) => s.id === id);
    const before = cur.find((s) => s.id === beforeId);
    if (!moved || !before) return;
    if (rankOf(moved) !== rankOf(before)) { moveToRank(id, rankOf(before)); return; }
    const rest = cur.filter((s) => s.id !== id);
    const idx = rest.findIndex((s) => s.id === beforeId);
    persist([...rest.slice(0, idx), { ...moved }, ...rest.slice(idx)]);
  }

  const startNew = (discipline = track, rank = "Beginner") => { setErr(null); setForm({ ...blank, discipline, rank }); };
  const startEdit = (s: Skill) => {
    setErr(null);
    setForm({ id: s.id, label: s.label, description: s.description ?? "", discipline: s.discipline || "side", rank: rankOf(s), prerequisite_key: s.prerequisite_key ?? "", active: s.active });
  };

  async function save() {
    if (!form) return;
    setSaving(true); setErr(null);
    const res = await fetch("/api/admin/skills", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(d?.error || "Couldn't save"); return; }
    setForm(null); load();
  }

  async function toggleActive(s: Skill) {
    await fetch("/api/admin/skills", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, label: s.label, description: s.description, discipline: s.discipline, rank: rankOf(s), prerequisite_key: s.prerequisite_key, active: !s.active }) });
    load();
  }

  // Prereq options = other skills in the same track (chain stays within a discipline).
  const prereqOptions = form ? skills.filter((s) => (s.discipline || "side") === form.discipline && s.id !== form.id) : [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Progress skills</h1>
          <p className="text-sm admin-muted">The skills riders climb on their Progress page. <strong>Drag a skill between bands</strong> to set its rank, drag within a band to reorder. No numbers.</p>
        </div>
        {!form && <button onClick={() => startNew()} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors shrink-0">New skill</button>}
      </div>

      {form && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold admin-heading">{form.id ? "Edit skill" : "New skill"}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className={labelClass}>Skill name</label>
              <input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Carve jibe" /></div>
            <div className="sm:col-span-2"><label className={labelClass}>Description <span className="admin-faint">(optional)</span></label>
              <input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Planing carve jibe" /></div>
            <div><label className={labelClass}>Track</label>
              <select className={inputClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value, prerequisite_key: "" })}>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{disciplineLabel(d)}</option>)}
              </select>
              <p className="text-[11px] admin-faint mt-1">Wave &amp; Freestyle skills don&apos;t move the core rank.</p></div>
            <div><label className={labelClass}>Requires first <span className="admin-faint">(optional)</span></label>
              <select className={inputClass} value={form.prerequisite_key} onChange={(e) => setForm({ ...form, prerequisite_key: e.target.value })}>
                <option value="">— none —</option>
                {prereqOptions.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
              </select></div>
            <div className="sm:col-span-2"><label className={labelClass}>Rank</label>
              <div className="flex flex-wrap gap-1.5">
                {RANKS.map((r) => {
                  const on = form.rank === r;
                  return (
                    <button key={r} type="button" onClick={() => setForm({ ...form, rank: r })}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                      style={on ? { background: RANK_TONE[r], color: "#fff", borderColor: RANK_TONE[r] } : { background: "transparent", color: RANK_TONE[r], borderColor: "var(--admin-border)" }}>
                      {r}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] admin-faint mt-1">You can also drag the skill into another band afterwards.</p></div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm admin-muted">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-[var(--admin-accent)]" />
              Active (shown to members)
            </label>
          </div>
          {err && <p className="text-sm text-red-500 mt-3">{err}</p>}
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={saving || !form.label.trim()} className="px-4 py-2 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg disabled:opacity-50">{saving ? "Saving…" : form.id ? "Save changes" : "Add skill"}</button>
            <button onClick={() => setForm(null)} className="px-4 py-2 admin-surface admin-muted text-sm font-semibold rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Track selector */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {DISCIPLINES.map((d) => {
          const on = track === d;
          return (
            <button key={d} onClick={() => setTrack(d)}
              className="px-3.5 py-2 rounded-full text-[13px] font-bold border transition-colors"
              style={on ? { background: "var(--admin-accent)", color: "var(--admin-accent-contrast)", borderColor: "var(--admin-accent)" } : { background: "var(--admin-surface)", color: "var(--admin-muted, #6a7a80)", borderColor: "var(--admin-border)" }}>
              {disciplineLabel(d)} <span className="opacity-70 font-semibold">{trackCount(d)}</span>
            </button>
          );
        })}
      </div>

      {!loading && err && !form && <p className="text-sm text-red-500 mb-3">{err}</p>}

      {loading ? (
        <p className="text-sm admin-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          {RANKS.map((r) => {
            const items = byRank[r] ?? [];
            const isOver = overRank === r;
            return (
              <div key={r}
                onDragOver={(e) => { e.preventDefault(); if (drag.current) setOverRank(r); }}
                onDragLeave={() => setOverRank((x) => (x === r ? null : x))}
                onDrop={() => { if (drag.current) moveToRank(drag.current, r); setOverRank(null); drag.current = null; setDragId(null); }}
                className="rounded-xl overflow-hidden transition-colors"
                style={{ border: `1px solid ${isOver ? RANK_TONE[r] : "var(--admin-border)"}`, background: isOver ? `${RANK_TONE[r]}0d` : "transparent" }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: items.length ? "1px solid var(--admin-border)" : "none" }}>
                  <span className="text-xs font-black uppercase tracking-wide" style={{ color: RANK_TONE[r] }}>{r}</span>
                  <span className="text-[11px] font-semibold admin-faint">{items.length}</span>
                  <button onClick={() => startNew(track, r)} className="ml-auto text-[11px] font-semibold text-[#0aa3c7] hover:underline shrink-0">+ Add</button>
                </div>
                {items.length === 0 ? (
                  <div className="px-4 py-3 text-[12px] admin-faint italic">{isOver ? "Drop here" : "— empty — drag a skill in"}</div>
                ) : (
                  <div>
                    {items.map((s, i) => (
                      <div key={s.id}
                        draggable
                        onDragStart={() => { drag.current = s.id; setDragId(s.id); }}
                        onDragEnd={() => { drag.current = null; setDragId(null); setOverRank(null); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.stopPropagation(); if (drag.current) reorderBefore(drag.current, s.id); setOverRank(null); drag.current = null; setDragId(null); }}
                        className={`flex items-center gap-2.5 px-4 py-2.5 cursor-grab active:cursor-grabbing ${i > 0 ? "border-t" : ""} ${s.active ? "" : "opacity-55"} ${dragId === s.id ? "opacity-40" : ""}`}
                        style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}>
                        <span className="admin-faint shrink-0 select-none" title="Drag to move rank / reorder" style={{ lineHeight: 1 }}>⠿</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold admin-heading truncate">{s.label}{!s.active && <span className="ml-2 text-[10px] uppercase admin-faint">retired</span>}</p>
                          {(s.description || s.prerequisite_key) && (
                            <p className="text-[11.5px] admin-faint truncate">
                              {s.description}
                              {s.prerequisite_key && <span> · needs {skills.find((x) => x.key === s.prerequisite_key)?.label ?? s.prerequisite_key}</span>}
                            </p>
                          )}
                        </div>
                        <button onClick={() => toggleActive(s)} className="text-[11px] font-semibold admin-muted hover:text-[#0aa3c7] shrink-0">{s.active ? "Retire" : "Restore"}</button>
                        <button onClick={() => startEdit(s)} className="text-[11px] font-semibold text-[#0aa3c7] hover:underline shrink-0">Edit</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
