"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlyDiagram, PlyLegend, plyTotals } from "@/components/admin/ply-diagram";
import {
  GEOMETRY_FIELDS, PD_KINDS, PD_MOLD_KINDS, PD_MOLD_STATUSES, PD_STATUSES,
  type PdConstruction, type PdKind, type PdLayup, type PdMaterial, type PdMold,
  type PdPly, type PdProcess, type PdProcessStep, type PdProject, type PdSource,
} from "@/lib/product-dev";

type Bundle = PdProject & {
  constructions: PdConstruction[];
  molds: PdMold[];
  layups: PdLayup[];
  plies: PdPly[];
  processes: PdProcess[];
  steps: PdProcessStep[];
  sources: PdSource[];
  materials: PdMaterial[];
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tooling", label: "Tooling" },
  { key: "layups", label: "Build sheets" },
] as const;

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";
const PLY_GRID = "44px 1fr 96px 90px 84px 70px 1fr 36px";

export default function ProductDevProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get("tab") ?? "overview") as (typeof TABS)[number]["key"];

  const [d, setD] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/admin/product-dev/projects/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((data) => { setD(data); setLoading(false); })
      .catch(() => { setError("Couldn't load that project."); setLoading(false); });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setTab(next: string) {
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", next);
    router.replace(`/admin/product-dev/projects/${id}?${q.toString()}`, { scroll: false });
  }

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;
  if (error || !d) return <div className="py-12 text-center text-sm text-red-400">{error || "Not found."}</div>;

  return (
    <div>
      <div className="mb-5">
        <Link href="/admin/product-dev/projects" className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors">
          ← R&amp;D projects
        </Link>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold admin-heading">{d.name}</h1>
            <p className="text-sm admin-muted">
              {d.kind} · {d.layups.length} build sheet{d.layups.length !== 1 ? "s" : ""} · {d.molds.length} mold{d.molds.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 overflow-x-auto" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? "admin-heading" : "admin-faint hover:admin-muted"
            }`}
            style={tab === t.key ? { borderBottom: "2px solid var(--admin-accent)", marginBottom: "-1px" } : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={d} onSaved={load} />}
      {tab === "tooling" && <ToolingTab bundle={d} onChanged={load} />}
      {tab === "layups" && <LayupsTab bundle={d} onChanged={load} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ project, onSaved }: { project: PdProject; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: project.name, kind: project.kind, status: project.status,
    summary: project.summary ?? "", notes: project.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/projects/${project.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { setMsg("Saved."); onSaved(); setTimeout(() => setMsg(""), 2000); }
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed — your changes are NOT stored.");
  }

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="sm:col-span-3"><label className={labelClass}>Name</label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={labelClass}>Kind</label>
          <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PdKind })}>
            {PD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className={labelClass}>Status</label>
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PdProject["status"] })}>
            {PD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select></div>
      </div>
      <div className="mb-4"><label className={labelClass}>Summary</label>
        <textarea className={`${inputClass} min-h-[90px]`} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="What this program is and where it stands." /></div>
      <div className="mb-4"><label className={labelClass}>Internal notes</label>
        <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className={`text-xs ${msg === "Saved." ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── Tooling ─────────────────────────────────────────────────────────────────

function ToolingTab({ bundle, onChanged }: { bundle: Bundle; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addConstruction() {
    const name = prompt("Construction name (e.g. Carbon)");
    if (!name) return;
    const code = prompt("Short code (e.g. carbon)", name.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
    if (!code) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/product-dev/constructions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: bundle.id, code, name, sort_order: bundle.constructions.length + 1 }),
    });
    setBusy(false);
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Couldn't add that.");
  }

  async function addMold() {
    const name = prompt("Mold name (e.g. 8.6)");
    if (!name) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/product-dev/molds", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: bundle.id, name, kind: "blade", key_dimension_mm: Number(name) || null }),
    });
    setBusy(false);
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Couldn't add that.");
  }

  async function patchMold(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/molds/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Save failed.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {error && <div className="lg:col-span-2 text-xs text-red-400">{error}</div>}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold admin-heading">Constructions</h2>
          <button onClick={addConstruction} disabled={busy} className="text-xs admin-muted hover:text-[var(--admin-accent)]">+ Add</button>
        </div>
        <p className="text-xs admin-faint mb-3 leading-relaxed">
          The commercial variants. Descriptions stay in the supplier&apos;s own words — if no percentage was
          quoted, none is invented here.
        </p>
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {bundle.constructions.length === 0 ? (
            <p className="px-5 py-6 text-xs admin-faint">None yet.</p>
          ) : bundle.constructions.map((c) => (
            <div key={c.id} className="px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium admin-heading">{c.name}</span>
                <code className="text-[10px] admin-faint">{c.code}</code>
              </div>
              {c.description && <p className="text-xs admin-muted mt-1">{c.description}</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold admin-heading">Molds</h2>
          <button onClick={addMold} disabled={busy} className="text-xs admin-muted hover:text-[var(--admin-accent)]">+ Add</button>
        </div>
        <p className="text-xs admin-faint mb-3 leading-relaxed">
          Physical tooling. <strong>Holder</strong> is who has it right now — molds travel between partners.
        </p>
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {bundle.molds.length === 0 ? (
            <p className="px-5 py-6 text-xs admin-faint">None yet.</p>
          ) : bundle.molds.map((m) => (
            <div key={m.id} className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm font-medium admin-heading min-w-[70px]">{m.name}</span>
              <span className="text-xs admin-muted">
                {m.key_dimension_mm != null ? `${m.key_dimension_mm} mm` : "—"}
                <span className="admin-faint"> · {m.key_dimension_label}</span>
              </span>
              <select className="text-xs admin-input border rounded px-2 py-1 ml-auto" value={m.kind}
                onChange={(e) => patchMold(m.id, { kind: e.target.value })}>
                {PD_MOLD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <select className="text-xs admin-input border rounded px-2 py-1" value={m.status}
                onChange={(e) => patchMold(m.id, { status: e.target.value })}>
                {PD_MOLD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Build sheets ────────────────────────────────────────────────────────────

function LayupsTab({ bundle, onChanged }: { bundle: Bundle; onChanged: () => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const selectedId = sp.get("layup") ?? bundle.layups[0]?.id ?? null;
  const [compare, setCompare] = useState(false);

  const constructionById = useMemo(() => new Map(bundle.constructions.map((c) => [c.id, c])), [bundle.constructions]);
  const moldById = useMemo(() => new Map(bundle.molds.map((m) => [m.id, m])), [bundle.molds]);
  const pliesByLayup = useMemo(() => {
    const m = new Map<string, PdPly[]>();
    for (const p of bundle.plies) {
      const arr = m.get(p.layup_id) ?? [];
      arr.push(p); m.set(p.layup_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.ply_index - b.ply_index);
    return m;
  }, [bundle.plies]);

  const selected = bundle.layups.find((l) => l.id === selectedId) ?? null;

  function select(layupId: string) {
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", "layups"); q.set("layup", layupId);
    router.replace(`/admin/product-dev/projects/${bundle.id}?${q.toString()}`, { scroll: false });
  }

  const label = (l: PdLayup) =>
    [constructionById.get(l.construction_id)?.name, moldById.get(l.mold_id)?.name].filter(Boolean).join(" · ") || l.name;

  if (bundle.layups.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm admin-faint mb-1">No build sheets yet.</p>
        <p className="text-xs admin-faint">Add a construction and a mold on the Tooling tab first — a build sheet is the pair of them.</p>
      </div>
    );
  }

  // The scale is shared across every sheet so a compare view doesn't lie by
  // rescaling each diagram to its own longest ply.
  const globalMax = Math.max(1, ...bundle.plies.map((p) => Number(p.length_cm) || 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs admin-faint max-w-xl leading-relaxed">
          One sheet per (construction × mold). The pairs with no sheet are the combinations the factory
          doesn&apos;t build — that absence is the record, not an omission.
        </p>
        <button onClick={() => setCompare(!compare)}
          className="text-xs px-3 py-1.5 rounded-lg admin-muted hover:text-[var(--admin-accent)] whitespace-nowrap"
          style={{ border: "1px solid var(--admin-border)" }}>
          {compare ? "Single sheet" : "Compare all"}
        </button>
      </div>

      {compare ? (
        <div className="flex gap-6 overflow-x-auto pb-2">
          {bundle.layups.map((l) => {
            const plies = pliesByLayup.get(l.id) ?? [];
            return (
              <div key={l.id} className="min-w-[300px] flex-shrink-0">
                <h3 className="text-sm font-bold admin-heading mb-0.5">{label(l)}</h3>
                <p className="text-[11px] admin-faint mb-2">{l.name}</p>
                <PlyDiagram plies={plies} materials={bundle.materials} maxLengthCm={globalMax} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {plyTotals(plies, bundle.materials).map((t) => (
                    <span key={t.label} className="text-[11px] admin-faint">{t.label}: <span className="admin-muted">{t.value}</span></span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <nav className="rounded-xl admin-tablecard self-start" style={{ border: "1px solid var(--admin-border)" }}>
            {bundle.layups.map((l) => (
              <button key={l.id} onClick={() => select(l.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${l.id === selectedId ? "admin-surface" : ""}`}
                style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="block text-sm font-medium admin-heading truncate">
                  {label(l)} {l.is_reference && <span className="text-[var(--admin-accent)]">★</span>}
                </span>
                <span className="block text-[11px] admin-faint truncate">
                  {l.ref ? `ref ${l.ref} · ` : ""}{(pliesByLayup.get(l.id) ?? []).length} plies
                </span>
              </button>
            ))}
          </nav>

          {selected && (
            <LayupEditor
              key={selected.id}
              layup={selected}
              project={bundle}
              plies={pliesByLayup.get(selected.id) ?? []}
              materials={bundle.materials}
              maxLengthCm={globalMax}
              onChanged={onChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── One build sheet: header fields + the ply grid + the diagram ─────────────

type DraftPly = Omit<PdPly, "created_at" | "updated_at"> & { _new?: boolean };

function LayupEditor({
  layup, project, plies, materials, maxLengthCm, onChanged,
}: {
  layup: PdLayup; project: Bundle; plies: PdPly[]; materials: PdMaterial[]; maxLengthCm: number; onChanged: () => void;
}) {
  const geometryFields = GEOMETRY_FIELDS[project.kind] ?? [];
  const [header, setHeader] = useState({
    name: layup.name, ref: layup.ref ?? "",
    resin_pct_min: layup.resin_pct_min ?? "", resin_pct_max: layup.resin_pct_max ?? "",
    is_reference: layup.is_reference,
    geometry: { ...(layup.geometry ?? {}) } as Record<string, string | number | null>,
  });
  const [draft, setDraft] = useState<DraftPly[]>(plies);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(plies);

  function setPly(i: number, patch: Partial<DraftPly>) {
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addPly() {
    const last = draft[draft.length - 1];
    setDraft((rows) => [...rows, {
      id: `new-${Date.now()}-${rows.length}`, layup_id: layup.id, ply_index: rows.length + 1,
      material_id: last?.material_id ?? materials[0]?.id ?? "", orientation: null,
      template_ref: null, length_cm: null, width_mm: null, stack: last?.stack ?? null, note: null, _new: true,
    }]);
  }

  function removePly(i: number) {
    setDraft((rows) => rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, ply_index: idx + 1 })));
  }

  async function saveHeader() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/layups/${layup.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: header.name, ref: header.ref, is_reference: header.is_reference,
        resin_pct_min: header.resin_pct_min === "" ? null : Number(header.resin_pct_min),
        resin_pct_max: header.resin_pct_max === "" ? null : Number(header.resin_pct_max),
        geometry: header.geometry,
      }),
    });
    setSaving(false);
    if (res.ok) { setMsg("Saved."); onChanged(); setTimeout(() => setMsg(""), 2000); }
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed — your changes are NOT stored.");
  }

  async function savePlies() {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/layups/${layup.id}/plies`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plies: draft.map((p) => ({
          material_id: p.material_id, orientation: p.orientation, template_ref: p.template_ref,
          length_cm: p.length_cm === null || p.length_cm === undefined ? null : Number(p.length_cm),
          width_mm: p.width_mm, stack: p.stack, note: p.note,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) { setMsg("Plies saved."); onChanged(); setTimeout(() => setMsg(""), 2000); }
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed — your changes are NOT stored.");
  }

  const diagramPlies = draft.map((p, i) => ({ ...p, ply_index: i + 1, created_at: "", updated_at: "" })) as PdPly[];

  return (
    <div>
      {/* Header fields */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="col-span-2"><label className={labelClass}>Name</label>
          <input className={inputClass} value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} /></div>
        <div><label className={labelClass}>Reference</label>
          <input className={inputClass} value={header.ref} onChange={(e) => setHeader({ ...header, ref: e.target.value })} placeholder="357" /></div>
        <div><label className={labelClass}>Resin %</label>
          <div className="flex items-center gap-1">
            <input className={inputClass} value={header.resin_pct_min} onChange={(e) => setHeader({ ...header, resin_pct_min: e.target.value })} placeholder="40" />
            <span className="admin-faint text-xs">–</span>
            <input className={inputClass} value={header.resin_pct_max} onChange={(e) => setHeader({ ...header, resin_pct_max: e.target.value })} placeholder="45" />
          </div></div>
        {geometryFields.map((f) => (
          <div key={f.key}>
            <label className={labelClass}>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
            <input className={inputClass} type="number" step={f.step ?? 1}
              value={(header.geometry[f.key] ?? "") as string | number}
              onChange={(e) => setHeader({ ...header, geometry: { ...header.geometry, [f.key]: e.target.value === "" ? null : Number(e.target.value) } })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-6">
        <label className="flex items-center gap-2 text-xs admin-muted cursor-pointer select-none">
          <input type="checkbox" checked={header.is_reference} onChange={(e) => setHeader({ ...header, is_reference: e.target.checked })} />
          Quoting reference
        </label>
        <button onClick={saveHeader} disabled={saving}
          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-40">
          Save sheet
        </button>
        {msg && <span className={`text-xs ${msg.includes("failed") ? "text-red-400" : "text-green-400"}`}>{msg}</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        {/* The ply grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold admin-heading">Plies</h3>
            <div className="flex items-center gap-2">
              <button onClick={addPly} className="text-xs admin-muted hover:text-[var(--admin-accent)]">+ Add ply</button>
              <button onClick={savePlies} disabled={saving || !dirty}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-40">
                {dirty ? "Save plies" : "Saved"}
              </button>
            </div>
          </div>

          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="gap-2 px-3 py-2 admin-surface" style={{ display: "grid", gridTemplateColumns: PLY_GRID, borderBottom: "1px solid var(--admin-border)" }}>
              {["#", "Material", "Orientation", "Template", "Length cm", "Stack", "Note", ""].map((h, i) => (
                <span key={i} className="text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">{h}</span>
              ))}
            </div>
            {draft.map((p, i) => {
              const mat = materials.find((m) => m.id === p.material_id);
              const prevStack = i > 0 ? draft[i - 1].stack ?? null : null;
              const isBoundary = i > 0 && (p.stack ?? null) !== prevStack;
              return (
                <div key={p.id} className="gap-2 px-3 py-1.5 items-center"
                  style={{
                    display: "grid", gridTemplateColumns: PLY_GRID,
                    borderBottom: "1px solid var(--admin-border)",
                    borderTop: isBoundary ? "2px solid var(--admin-border-strong)" : undefined,
                  }}>
                  <span className="flex items-center gap-1.5 text-xs admin-faint">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: mat?.diagram_color || "var(--admin-border-strong)" }} />
                    {i + 1}
                  </span>
                  <select className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.material_id}
                    onChange={(e) => setPly(i, { material_id: e.target.value })}>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.orientation ?? ""}
                    placeholder={mat?.default_orientation ?? ""}
                    onChange={(e) => setPly(i, { orientation: e.target.value || null })} />
                  <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.template_ref ?? ""}
                    onChange={(e) => setPly(i, { template_ref: e.target.value || null })} />
                  <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" type="number" step="0.1"
                    value={p.length_cm ?? ""} onChange={(e) => setPly(i, { length_cm: e.target.value === "" ? null : Number(e.target.value) })} />
                  <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.stack ?? ""}
                    placeholder="a" onChange={(e) => setPly(i, { stack: e.target.value || null })} />
                  <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.note ?? ""}
                    onChange={(e) => setPly(i, { note: e.target.value || null })} />
                  <button onClick={() => removePly(i)} className="text-xs admin-faint hover:text-red-400">✕</button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] admin-faint leading-relaxed">
            The lengths are the bend curve. They restart at each stack boundary, so the sequence is
            <strong> not</strong> meant to descend all the way down — don&apos;t &quot;fix&quot; it.
          </p>
        </div>

        {/* The diagram, drawn from the rows above */}
        <div>
          <h3 className="text-sm font-bold admin-heading mb-2">Diagram</h3>
          <div className="p-3 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <PlyDiagram plies={diagramPlies} materials={materials} maxLengthCm={maxLengthCm} />
            <PlyLegend plies={diagramPlies} materials={materials} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {plyTotals(diagramPlies, materials).map((t) => (
              <span key={t.label} className="text-[11px] admin-faint">{t.label}: <span className="admin-muted">{t.value}</span></span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
