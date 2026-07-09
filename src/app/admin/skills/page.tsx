"use client";

import { useEffect, useMemo, useState } from "react";
import { CORE_DISCIPLINES, DISCIPLINE_LABEL, rankForDifficulty, RANKS } from "@/lib/progression";

type Skill = {
  id: string; key: string; label: string; description: string | null;
  tier: string | null; discipline: string | null; difficulty: number;
  prerequisite_key: string | null; sort_order: number; active: boolean;
};

const DISCIPLINES = [...CORE_DISCIPLINES, "side"] as const;
const disciplineLabel = (d: string | null) => DISCIPLINE_LABEL[(d as keyof typeof DISCIPLINE_LABEL)] ?? (d === "side" ? "Wave & Freestyle" : d ?? "—");
const RANK_TONE = ["#6b7280", "#2563eb", "#7c3aed", "#c2410c", "#be185d", "#b45309"];

const blank = { id: "", label: "", description: "", discipline: "freeride", difficulty: "10", prerequisite_key: "", sort_order: "", active: true };

export default function SkillsAdminPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const grouped = useMemo(() => {
    const by: Record<string, Skill[]> = {};
    for (const s of skills) (by[s.discipline || "side"] ||= []).push(s);
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.difficulty - b.difficulty || a.sort_order - b.sort_order);
    return by;
  }, [skills]);

  const startNew = (discipline = "freeride") => { setErr(null); setForm({ ...blank, discipline }); };
  const startEdit = (s: Skill) => {
    setErr(null);
    setForm({ id: s.id, label: s.label, description: s.description ?? "", discipline: s.discipline || "side", difficulty: String(s.difficulty), prerequisite_key: s.prerequisite_key ?? "", sort_order: String(s.sort_order ?? ""), active: s.active });
  };

  async function save() {
    if (!form) return;
    setSaving(true); setErr(null);
    const body = { ...form, difficulty: Number(form.difficulty), sort_order: form.sort_order === "" ? undefined : Number(form.sort_order) };
    const res = await fetch("/api/admin/skills", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(d?.error || "Couldn't save"); return; }
    setForm(null); load();
  }

  async function toggleActive(s: Skill) {
    await fetch("/api/admin/skills", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, label: s.label, description: s.description, discipline: s.discipline, difficulty: s.difficulty, prerequisite_key: s.prerequisite_key, sort_order: s.sort_order, active: !s.active }) });
    load();
  }

  // Prereq options = other skills in the same discipline (so the chain stays within a track).
  const prereqOptions = form ? skills.filter((s) => (s.discipline || "side") === form.discipline && s.id !== form.id) : [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Progress skills</h1>
          <p className="text-sm admin-muted">The skills riders climb on their Progress page. Rank is set by difficulty; each skill can require another first.</p>
        </div>
        {!form && <button onClick={() => startNew()} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New skill</button>}
      </div>

      {form && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold admin-heading">{form.id ? "Edit skill" : "New skill"}</h2>
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: `${RANK_TONE[RANKS.indexOf(rankForDifficulty(Number(form.difficulty) || 0) as (typeof RANKS)[number])] ?? "#6b7280"}22`, color: RANK_TONE[RANKS.indexOf(rankForDifficulty(Number(form.difficulty) || 0) as (typeof RANKS)[number])] ?? "#6b7280" }}>
              {rankForDifficulty(Number(form.difficulty) || 0)} band
            </span>
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
            <div><label className={labelClass}>Difficulty <span className="admin-faint">(1–110)</span></label>
              <input type="number" min={1} className={inputClass} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} /></div>
            <div><label className={labelClass}>Requires first <span className="admin-faint">(optional)</span></label>
              <select className={inputClass} value={form.prerequisite_key} onChange={(e) => setForm({ ...form, prerequisite_key: e.target.value })}>
                <option value="">— none —</option>
                {prereqOptions.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
              </select></div>
            <div><label className={labelClass}>Sort order <span className="admin-faint">(blank = by difficulty)</span></label>
              <input type="number" className={inputClass} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
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

      {loading ? (
        <p className="text-sm admin-muted">Loading…</p>
      ) : skills.length === 0 ? (
        <p className="text-sm admin-muted">No skills yet — add the first one.</p>
      ) : (
        <div className="space-y-8">
          {DISCIPLINES.filter((d) => grouped[d]?.length).map((d) => (
            <div key={d}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold admin-heading uppercase tracking-wide">{disciplineLabel(d)} <span className="admin-faint font-medium normal-case">· {grouped[d].length}</span></h2>
                <button onClick={() => startNew(d)} className="text-xs font-semibold text-[#0aa3c7] hover:underline">+ Add to {disciplineLabel(d)}</button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {grouped[d].map((s, i) => (
                  <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t" : ""} ${s.active ? "" : "opacity-55"}`} style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${RANK_TONE[RANKS.indexOf(rankForDifficulty(s.difficulty) as (typeof RANKS)[number])] ?? "#6b7280"}1f`, color: RANK_TONE[RANKS.indexOf(rankForDifficulty(s.difficulty) as (typeof RANKS)[number])] ?? "#6b7280" }} title={`Difficulty ${s.difficulty}`}>{s.difficulty}</span>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
