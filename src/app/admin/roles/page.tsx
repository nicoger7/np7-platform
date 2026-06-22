"use client";

import { useEffect, useMemo, useState } from "react";
import {
  WORLDS, SECTIONS, FIELDS, accessLeaks, type WorldId, type SectionLevel, type RoleAccess, normalizeAccess,
} from "@/lib/access";

type Role = { id: string; name: string; description: string | null; access: RoleAccess; is_system?: boolean };

const LEVELS: { key: SectionLevel; label: string }[] = [
  { key: "none", label: "None" },
  { key: "view", label: "View" },
  { key: "edit", label: "Edit" },
];

const emptyForm = () => ({ name: "", description: "", worlds: new Set<WorldId>(), sections: {} as Record<string, SectionLevel>, fields: {} as Record<string, boolean> });

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [selId, setSelId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/admin/roles").then((r) => r.json()).then((d) => {
      setRoles(d.roles ?? []);
      setMigrationNeeded(!!d.migrationNeeded);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  function openNew() {
    setSelId("new"); setErr(""); setForm(emptyForm());
  }
  function openRole(r: Role) {
    const a = normalizeAccess(r.access);
    setSelId(r.id); setErr("");
    setForm({
      name: r.name, description: r.description ?? "",
      worlds: new Set(a.worlds),
      sections: { ...a.sections },
      fields: { ...a.fields } as Record<string, boolean>,
    });
  }
  function close() { setSelId(null); setErr(""); }

  function toggleWorld(w: WorldId) {
    setForm((f) => {
      const worlds = new Set(f.worlds);
      if (worlds.has(w)) worlds.delete(w); else worlds.add(w);
      return { ...f, worlds };
    });
  }
  function setSection(key: string, lvl: SectionLevel) {
    setForm((f) => ({ ...f, sections: { ...f.sections, [key]: lvl } }));
  }
  function toggleField(key: string) {
    setForm((f) => ({ ...f, fields: { ...f.fields, [key]: !f.fields[key] } }));
  }

  async function save() {
    if (!form.name.trim()) { setErr("Give the role a name."); return; }
    setSaving(true); setErr("");
    // Only persist section levels for worlds that are enabled.
    const sections: Record<string, SectionLevel> = {};
    for (const s of SECTIONS) if (form.worlds.has(s.world) && form.sections[s.key] && form.sections[s.key] !== "none") sections[s.key] = form.sections[s.key];
    const access: RoleAccess = { worlds: [...form.worlds], sections, fields: form.fields };
    const payload = { name: form.name.trim(), description: form.description.trim() || null, access };
    const res = selId === "new"
      ? await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/admin/roles/${selId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) { const e = await res.json().catch(() => ({})); setErr(e.error || "Could not save the role."); return; }
    close(); load();
  }
  async function remove() {
    if (selId === "new" || !selId) return;
    if (!confirm("Delete this role? Members using it fall back to their owner/manager tier.")) return;
    const res = await fetch(`/api/admin/roles/${selId}`, { method: "DELETE" });
    if (!res.ok) { const e = await res.json().catch(() => ({})); setErr(e.error || "Could not delete."); return; }
    close(); load();
  }

  // Sections grouped by world → group, for the editor.
  const grouped = useMemo(() => {
    const byWorld: Record<string, { group: string; items: typeof SECTIONS }[]> = {};
    for (const w of WORLDS) {
      const groups: Record<string, typeof SECTIONS> = {};
      for (const s of SECTIONS.filter((x) => x.world === w.id)) (groups[s.group] ||= []).push(s);
      byWorld[w.id] = Object.entries(groups).map(([group, items]) => ({ group, items }));
    }
    return byWorld;
  }, []);

  const labelClass = "block text-xs font-medium admin-muted mb-1.5";
  const inputClass = "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";

  function summarize(r: Role): string {
    const a = normalizeAccess(r.access);
    const ws = a.worlds.length;
    const secs = Object.values(a.sections).filter((v) => v !== "none").length;
    return `${ws} world${ws !== 1 ? "s" : ""} · ${secs} section${secs !== 1 ? "s" : ""}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Roles</h1>
          <p className="text-sm admin-muted mt-0.5">Define what each team member can reach and see. Assign a role from the Employees page.</p>
        </div>
        {!selId && <button onClick={openNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New role</button>}
      </div>

      {migrationNeeded && (
        <div className="mb-4 p-3 rounded-lg text-xs" style={{ border: "1px solid var(--admin-border)", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
          Apply migration <strong>045_team_roles</strong> in the Supabase SQL editor to start saving roles.
        </div>
      )}

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : selId ? (
        <div className="flex flex-col md:flex-row gap-4">
          {/* rail */}
          <div className="md:w-56 shrink-0 flex md:flex-col gap-1.5">
            <button onClick={close} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All roles
            </button>
            {roles.map((r) => {
              const active = r.id === selId;
              return (
                <button key={r.id} onClick={() => openRole(r)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                  <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{r.name}</span>
                  <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{summarize(r)}</span>
                </button>
              );
            })}
          </div>

          {/* editor */}
          <div className="flex-1 min-w-0 space-y-5">
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelClass}>Role name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Photographer" /></div>
                <div><label className={labelClass}>Description</label><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this role is for" /></div>
              </div>
            </div>

            {/* Worlds */}
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-1">Environments</h3>
              <p className="text-xs admin-faint mb-3">Which worlds this role can enter.</p>
              <div className="flex flex-wrap gap-2">
                {WORLDS.map((w) => {
                  const on = form.worlds.has(w.id);
                  return (
                    <button key={w.id} onClick={() => toggleWorld(w.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={on ? { background: "var(--admin-accent)", color: "var(--admin-accent-contrast)", border: "1px solid transparent" } : { border: "1px solid var(--admin-border)" }}>
                      {on ? "✓ " : ""}{w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sections per enabled world */}
            {WORLDS.filter((w) => form.worlds.has(w.id)).map((w) => (
              <div key={w.id} className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <h3 className="text-sm font-bold admin-heading mb-3">{w.label} · sections</h3>
                <div className="space-y-4">
                  {grouped[w.id].map(({ group, items }) => (
                    <div key={group}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] admin-faint mb-2">{group}</p>
                      <div className="space-y-1.5">
                        {items.map((s) => {
                          const cur = form.sections[s.key] ?? "none";
                          return (
                            <div key={s.key} className="flex items-center justify-between gap-3">
                              <span className="text-sm admin-muted">{s.label}</span>
                              <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--admin-border)" }}>
                                {LEVELS.map((l) => {
                                  const sel = cur === l.key;
                                  return (
                                    <button key={l.key} onClick={() => setSection(s.key, l.key)} className="px-2.5 py-1 text-[11px] font-semibold transition-colors" style={sel ? { background: l.key === "none" ? "var(--admin-surface-hover)" : "var(--admin-accent)", color: l.key === "none" ? "var(--admin-text-muted)" : "var(--admin-accent-contrast)" } : { color: "var(--admin-text-muted)" }}>{l.label}</button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Field redaction */}
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-1">Sensitive data</h3>
              <p className="text-xs admin-faint mb-3">Within the sections above, which sensitive figures this role may see. Unchecked = hidden everywhere.</p>
              <div className="space-y-2">
                {FIELDS.map((fl) => (
                  <label key={fl.key} className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer" style={{ border: "1px solid var(--admin-border)" }}>
                    <input type="checkbox" checked={!!form.fields[fl.key]} onChange={() => toggleField(fl.key)} className="w-4 h-4 mt-0.5 accent-[#0aa3c7] shrink-0" />
                    <span>
                      <span className="block text-sm font-medium admin-heading">{fl.label}</span>
                      <span className="block text-xs admin-faint mt-0.5">{fl.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* Honesty warning: sections this role can reach that still show a hidden field group */}
              {(() => {
                const enabled: Record<string, SectionLevel> = {};
                for (const s of SECTIONS) if (form.worlds.has(s.world) && form.sections[s.key] && form.sections[s.key] !== "none") enabled[s.key] = form.sections[s.key];
                const leaks = accessLeaks({ worlds: [...form.worlds], sections: enabled, fields: form.fields });
                if (!leaks.length) return null;
                const fieldLabel = (k: string) => (FIELDS.find((f) => f.key === k)?.label || k).toLowerCase();
                return (
                  <div className="mt-3 p-3 rounded-lg text-xs" style={{ border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
                    <p className="font-semibold mb-1.5">⚠ Heads up — these sections can still show data you’ve hidden (redaction isn’t wired there yet):</p>
                    <ul className="space-y-0.5">
                      {leaks.map((l) => <li key={l.key}>• <strong>{l.label}</strong> may still show {l.fields.map(fieldLabel).join(", ")}</li>)}
                    </ul>
                    <p className="mt-1.5 opacity-80">Bookings are fully redacted. To be safe, set those sections to <strong>None</strong> for this role.</p>
                  </div>
                );
              })()}
            </div>

            {err && <p className="text-xs text-red-400">{err}</p>}
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{saving ? "Saving…" : selId === "new" ? "Create role" : "Save role"}</button>
              <button onClick={close} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              {selId !== "new" && <button onClick={remove} className="ml-auto px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete role</button>}
            </div>
          </div>
        </div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No custom roles yet. Create one — e.g. a “Photographer” who only sees participants, the gallery and website content.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {roles.map((r) => (
            <button key={r.id} onClick={() => openRole(r)} className="text-left p-4 rounded-xl transition-colors hover:border-[var(--admin-accent)]" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold admin-heading">{r.name}</span>
                {r.is_system && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase admin-surface admin-faint">Built-in</span>}
              </div>
              {r.description && <p className="text-xs admin-muted mt-1 line-clamp-2">{r.description}</p>}
              <p className="text-[11px] admin-faint mt-2">{summarize(r)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
