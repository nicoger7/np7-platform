"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlyDiagram, PlyLegend, plyTotals } from "@/components/admin/ply-diagram";
import {
  groupPliesByStack, plyOrientation, shortMaterialName,
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
const PLY_GRID = "60px minmax(120px,1.4fr) 92px 60px 76px minmax(80px,1fr) 28px";

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
//
// This is a DOCUMENT, not a form. It is read far more often than it is edited —
// you open it to check a ply length or quote a construction, not to retype the
// stack. So it renders as a typeset spec sheet and only becomes editable when
// you say so; eighteen rows of live dropdowns is what made the first version
// unreadable.
//
// The other half of "annoying to use" is creation. A sheet is a variation on
// another sheet — 8.3 and 8.6 differ by a few lengths — so new sheets are born
// by copying, and a stack can be pasted straight out of the supplier's email
// rather than typed row by row.

function LayupsTab({ bundle, onChanged }: { bundle: Bundle; onChanged: () => void }) {
  const sp = useSearchParams();
  const router = useRouter();
  const selectedId = sp.get("layup") ?? bundle.layups[0]?.id ?? null;
  const [compare, setCompare] = useState(false);
  const [adding, setAdding] = useState(false);

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

  const globalMax = Math.max(1, ...bundle.plies.map((p) => Number(p.length_cm) || 0));

  // Pairs that could still have a sheet. The ones already taken aren't offered —
  // the unique constraint is the matrix, so the UI shouldn't invite a 409.
  const taken = new Set(bundle.layups.map((l) => `${l.construction_id}/${l.mold_id}`));
  const openPairs = bundle.constructions.flatMap((c) =>
    bundle.molds.filter((m) => m.kind === "blade").map((m) => ({ c, m })).filter(({ m }) => !taken.has(`${c.id}/${m.id}`))
  );

  if (bundle.layups.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm admin-muted mb-1">No build sheets yet.</p>
        <p className="text-xs admin-faint max-w-md mx-auto">
          A sheet is one construction in one mold. Add a construction and a blade mold on the Tooling tab,
          and the pair becomes available here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs admin-faint max-w-lg leading-relaxed">
          One sheet per construction × mold. The pairs with no sheet are combinations this model
          doesn&apos;t build — that absence is part of the record.
        </p>
        <div className="flex items-center gap-2">
          {openPairs.length > 0 && (
            <button onClick={() => setAdding(true)}
              className="text-xs px-3 py-1.5 rounded-lg admin-muted hover:text-[var(--admin-accent)] whitespace-nowrap"
              style={{ border: "1px solid var(--admin-border)" }}>
              + New sheet
            </button>
          )}
          <button onClick={() => setCompare(!compare)}
            className="text-xs px-3 py-1.5 rounded-lg admin-muted hover:text-[var(--admin-accent)] whitespace-nowrap"
            style={{ border: "1px solid var(--admin-border)" }}>
            {compare ? "Single sheet" : "Compare all"}
          </button>
        </div>
      </div>

      {adding && selected && (
        <NewSheetCard
          pairs={openPairs}
          layups={bundle.layups}
          constructionById={constructionById}
          moldById={moldById}
          pliesByLayup={pliesByLayup}
          defaultCopyFrom={selected.id}
          onClose={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); onChanged(); select(id); }}
        />
      )}

      {compare ? (
        <CompareSheets bundle={bundle} pliesByLayup={pliesByLayup}
          constructionById={constructionById} moldById={moldById} globalMax={globalMax} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[228px_1fr] gap-6">
          <SheetRail
            layups={bundle.layups} selectedId={selectedId} onSelect={select}
            constructionById={constructionById} moldById={moldById}
            pliesByLayup={pliesByLayup} materials={bundle.materials} globalMax={globalMax}
          />
          {selected && (
            <BuildSheet
              key={selected.id}
              layup={selected}
              project={bundle}
              construction={constructionById.get(selected.construction_id)}
              mold={moldById.get(selected.mold_id)}
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

// ─── Left rail — a sheet is identified by its mold, so lead with the mold ────

function SheetRail({
  layups, selectedId, onSelect, constructionById, moldById, pliesByLayup, materials, globalMax,
}: {
  layups: PdLayup[]; selectedId: string | null; onSelect: (id: string) => void;
  constructionById: Map<string, PdConstruction>; moldById: Map<string, PdMold>;
  pliesByLayup: Map<string, PdPly[]>; materials: PdMaterial[]; globalMax: number;
}) {
  return (
    <nav className="rounded-xl overflow-hidden self-start" style={{ border: "1px solid var(--admin-border)" }}>
      {layups.map((l) => {
        const plies = pliesByLayup.get(l.id) ?? [];
        const mold = moldById.get(l.mold_id);
        const active = l.id === selectedId;
        return (
          <button key={l.id} onClick={() => onSelect(l.id)}
            className={`w-full text-left px-3.5 py-3 transition-colors ${active ? "admin-surface" : "hover:bg-[var(--admin-surface-hover)]"}`}
            style={{ borderBottom: "1px solid var(--admin-border)", borderLeft: active ? "3px solid var(--admin-accent)" : "3px solid transparent" }}>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold admin-heading tabular-nums">{mold?.name ?? "—"}</span>
              <span className="text-[10px] admin-faint">mm</span>
              {l.is_reference && <span className="ml-auto text-[10px] text-[var(--admin-accent)] font-bold">REF</span>}
            </span>
            <span className="block text-xs admin-muted truncate">{constructionById.get(l.construction_id)?.name ?? ""}</span>
            {/* A five-bar echo of the stack — enough to tell two sheets apart at a glance. */}
            <span className="flex items-end gap-px h-3 mt-1.5" aria-hidden>
              {plies.length === 0
                ? <span className="text-[10px] admin-faint leading-none">no plies yet</span>
                : plies.filter((_, i) => i % Math.ceil(plies.length / 14) === 0).map((p) => {
                    const mat = materials.find((m) => m.id === p.material_id);
                    return <span key={p.id} className="w-1 rounded-sm"
                      style={{ height: `${Math.max(15, ((Number(p.length_cm) || 0) / globalMax) * 100)}%`,
                               backgroundColor: mat?.diagram_color || "var(--admin-border-strong)" }} />;
                  })}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── New sheet — copy an existing stack rather than typing 18 rows ───────────

function NewSheetCard({
  pairs, layups, constructionById, moldById, pliesByLayup, defaultCopyFrom, onClose, onCreated,
}: {
  pairs: { c: PdConstruction; m: PdMold }[]; layups: PdLayup[];
  constructionById: Map<string, PdConstruction>; moldById: Map<string, PdMold>;
  pliesByLayup: Map<string, PdPly[]>; defaultCopyFrom: string;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [pair, setPair] = useState(0);
  const [copyFrom, setCopyFrom] = useState(defaultCopyFrom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = pairs[pair];
  const sourcePlies = (pliesByLayup.get(copyFrom) ?? []).length;

  async function create() {
    if (!target) return;
    setBusy(true); setError("");
    const name = `${target.c.name} · ${target.m.name}`;
    const res = await fetch(`/api/admin/product-dev/layups/${copyFrom}/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ construction_id: target.c.id, mold_id: target.m.id, name }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || res.status === 207) onCreated(j.id);
    else setError(j.error || "Couldn't create that sheet.");
  }

  return (
    <div className="mb-5 p-4 rounded-xl" style={{ border: "1px solid var(--admin-accent)", backgroundColor: "var(--admin-surface)" }}>
      <h3 className="text-sm font-bold admin-heading mb-1">New build sheet</h3>
      <p className="text-xs admin-faint mb-4">
        It starts as a copy of an existing stack — change the lengths that differ instead of re-entering all of them.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label className={labelClass}>For</label>
          <select className={inputClass} value={pair} onChange={(e) => setPair(Number(e.target.value))}>
            {pairs.map((p, i) => <option key={`${p.c.id}/${p.m.id}`} value={i}>{p.c.name} · {p.m.name} mm</option>)}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className={labelClass}>Copy plies from</label>
          <select className={inputClass} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {layups.map((l) => (
              <option key={l.id} value={l.id}>
                {constructionById.get(l.construction_id)?.name} · {moldById.get(l.mold_id)?.name} ({(pliesByLayup.get(l.id) ?? []).length} plies)
              </option>
            ))}
          </select>
        </div>
        <button onClick={create} disabled={busy || !target}
          className="px-4 py-2 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg disabled:opacity-40">
          {busy ? "Creating…" : `Create with ${sourcePlies} plies`}
        </button>
        <button onClick={onClose} className="px-3 py-2 admin-muted text-sm">Cancel</button>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── The sheet ───────────────────────────────────────────────────────────────

type DraftPly = Omit<PdPly, "created_at" | "updated_at">;

function BuildSheet({
  layup, project, construction, mold, plies, materials, maxLengthCm, onChanged,
}: {
  layup: PdLayup; project: Bundle; construction?: PdConstruction; mold?: PdMold;
  plies: PdPly[]; materials: PdMaterial[]; maxLengthCm: number; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftPly[]>(plies);
  const [header, setHeader] = useState({
    name: layup.name, ref: layup.ref ?? "",
    resin_pct_min: String(layup.resin_pct_min ?? ""), resin_pct_max: String(layup.resin_pct_max ?? ""),
    is_reference: layup.is_reference,
    geometry: { ...(layup.geometry ?? {}) } as Record<string, string | number | null>,
  });
  const [pasting, setPasting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const geometryFields = GEOMETRY_FIELDS[project.kind] ?? [];
  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const pliesDirty = JSON.stringify(draft.map(stripPly)) !== JSON.stringify(plies.map(stripPly));
  const headerDirty =
    header.name !== layup.name || header.ref !== (layup.ref ?? "") ||
    header.is_reference !== layup.is_reference ||
    header.resin_pct_min !== String(layup.resin_pct_min ?? "") ||
    header.resin_pct_max !== String(layup.resin_pct_max ?? "") ||
    JSON.stringify(header.geometry) !== JSON.stringify(layup.geometry ?? {});
  const dirty = pliesDirty || headerDirty;

  function stripPly(p: DraftPly | PdPly) {
    return { m: p.material_id, o: p.orientation, t: p.template_ref, l: p.length_cm, s: p.stack, n: p.note };
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      if (headerDirty) {
        const res = await fetch(`/api/admin/product-dev/layups/${layup.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: header.name, ref: header.ref, is_reference: header.is_reference,
            resin_pct_min: header.resin_pct_min === "" ? null : Number(header.resin_pct_min),
            resin_pct_max: header.resin_pct_max === "" ? null : Number(header.resin_pct_max),
            geometry: header.geometry,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save the sheet.");
      }
      if (pliesDirty) {
        const res = await fetch(`/api/admin/product-dev/layups/${layup.id}/plies`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plies: draft.map((p) => ({
            material_id: p.material_id, orientation: p.orientation, template_ref: p.template_ref,
            length_cm: p.length_cm == null ? null : Number(p.length_cm),
            width_mm: p.width_mm, stack: p.stack, note: p.note,
          })) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save the plies.");
      }
      setMsg("Saved"); setEditing(false); onChanged();
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(plies);
    setHeader({
      name: layup.name, ref: layup.ref ?? "",
      resin_pct_min: String(layup.resin_pct_min ?? ""), resin_pct_max: String(layup.resin_pct_max ?? ""),
      is_reference: layup.is_reference, geometry: { ...(layup.geometry ?? {}) },
    });
    setEditing(false); setMsg("");
  }

  const shown = editing ? draft : plies;
  const groups = groupPliesByStack(shown as PdPly[]);
  const diagramPlies = shown.map((p, i) => ({ ...p, ply_index: i + 1, created_at: "", updated_at: "" })) as PdPly[];

  return (
    <div className="pb-20">
      {/* Title + spec strip. Reads as a document header, not a row of form fields. */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          {editing ? (
            <input className={`${inputClass} text-lg font-bold`} value={header.name}
              onChange={(e) => setHeader({ ...header, name: e.target.value })} />
          ) : (
            <h2 className="text-xl font-bold admin-heading flex items-center gap-2">
              {layup.name}
              {layup.is_reference && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
                  QUOTING REFERENCE
                </span>
              )}
            </h2>
          )}
          <p className="text-xs admin-faint mt-0.5">
            {construction?.name}{mold ? ` · ${mold.name} mm mold` : ""}{layup.ref ? ` · ref ${layup.ref}` : ""}
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg admin-muted hover:text-[var(--admin-accent)] whitespace-nowrap"
            style={{ border: "1px solid var(--admin-border)" }}>
            Edit sheet
          </button>
        )}
      </div>

      <SpecStrip
        editing={editing} header={header} setHeader={setHeader}
        geometryFields={geometryFields} plyCount={shown.length}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_330px] gap-6 mt-5">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase">Plies</h3>
            {editing && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPasting(!pasting)} className="text-xs admin-muted hover:text-[var(--admin-accent)]">
                  Paste a stack
                </button>
                <button onClick={() => setDraft(addPly(draft, layup.id, materials))} className="text-xs admin-muted hover:text-[var(--admin-accent)]">
                  + Add ply
                </button>
              </div>
            )}
          </div>

          {pasting && editing && (
            <PasteStack materials={materials}
              onCancel={() => setPasting(false)}
              onParsed={(rows) => { setDraft(rows.map((r, i) => ({ ...r, id: `new-${i}`, layup_id: layup.id, ply_index: i + 1 }))); setPasting(false); }} />
          )}

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="gap-3 px-4 py-2 admin-surface" style={{ display: "grid", gridTemplateColumns: PLY_GRID, borderBottom: "1px solid var(--admin-border)" }}>
              {["#", "Material", "Orientation", "Tpl", "Length", "Note", ""].map((h, i) => (
                <span key={i} className={`text-[10px] font-bold tracking-[0.08em] admin-faint uppercase ${i === 4 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {groups.map((g, gi) => (
              <div key={`${g.stack ?? "none"}-${gi}`}>
                {groups.length > 1 && (
                  <div className="px-4 py-1.5 flex items-baseline gap-2 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <span className="text-[10px] font-bold tracking-[0.08em] admin-heading uppercase">
                      Stack {g.stack ?? "—"}
                    </span>
                    <span className="text-[10px] admin-faint">
                      {g.plies.length} plies · {g.plies[0]?.length_cm ?? "—"}–{g.plies[g.plies.length - 1]?.length_cm ?? "—"} cm
                    </span>
                  </div>
                )}
                {g.plies.map((p) => {
                  const i = shown.findIndex((x) => x.id === p.id);
                  const mat = matById.get(p.material_id);
                  const ori = plyOrientation(p, mat);
                  return (
                    <div key={p.id} className="gap-3 px-4 py-2 items-center"
                      style={{ display: "grid", gridTemplateColumns: PLY_GRID, borderBottom: "1px solid var(--admin-border)" }}>
                      <span className="flex items-center gap-2 text-xs admin-faint tabular-nums">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: mat?.diagram_color || "var(--admin-border-strong)" }} />
                        {p.ply_index}
                      </span>
                      {editing ? (
                        <select className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.material_id}
                          onChange={(e) => setDraft(patchPly(draft, i, { material_id: e.target.value }))}>
                          {materials.map((m) => <option key={m.id} value={m.id}>{shortMaterialName(m)}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs admin-heading truncate" title={mat?.name}>{shortMaterialName(mat)}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.orientation ?? ""}
                          placeholder={mat?.default_orientation ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { orientation: e.target.value || null }))} />
                      ) : (
                        // An inherited value is shown as the real value, dimmed —
                        // a grey placeholder read as "empty" in the first version.
                        <span className={`text-xs tabular-nums ${ori.inherited ? "admin-faint" : "admin-muted"}`}>{ori.value}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.template_ref ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { template_ref: e.target.value || null }))} />
                      ) : (
                        <span className="text-xs admin-muted tabular-nums">{p.template_ref ?? "—"}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full text-right" type="number" step="0.1"
                          value={p.length_cm ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { length_cm: e.target.value === "" ? null : Number(e.target.value) }))} />
                      ) : (
                        <span className="text-xs admin-heading tabular-nums text-right">{p.length_cm ?? "—"}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.note ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { note: e.target.value || null }))} />
                      ) : (
                        <span className="text-xs admin-faint truncate">{p.note ?? ""}</span>
                      )}
                      {editing
                        ? <button onClick={() => setDraft(removePly(draft, i))} className="text-xs admin-faint hover:text-red-400">✕</button>
                        : <span />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="mt-2 text-[11px] admin-faint leading-relaxed">
            Lengths are the bend curve and restart at each stack — the sequence is not meant to descend
            all the way down.
          </p>
        </section>

        <section className="xl:sticky xl:top-4 self-start">
          <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2">Diagram</h3>
          <div className="p-3 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <PlyDiagram plies={diagramPlies} materials={materials} maxLengthCm={maxLengthCm} />
            <PlyLegend plies={diagramPlies} materials={materials} />
          </div>
          <dl className="mt-3 space-y-1">
            {plyTotals(diagramPlies, materials).map((t) => (
              <div key={t.label} className="flex justify-between text-[11px]">
                <dt className="admin-faint">{t.label}</dt>
                <dd className="admin-muted tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* One save bar, and only when there is something to save. */}
      {editing && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-5 py-3 flex items-center justify-end gap-3"
          style={{ backgroundColor: "var(--admin-surface)", borderTop: "1px solid var(--admin-border)" }}>
          {msg && <span className={`text-xs mr-auto ${msg === "Saved" ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
          {!msg && dirty && <span className="text-xs admin-faint mr-auto">Unsaved changes</span>}
          <label className="flex items-center gap-2 text-xs admin-muted cursor-pointer select-none mr-2">
            <input type="checkbox" checked={header.is_reference}
              onChange={(e) => setHeader({ ...header, is_reference: e.target.checked })} />
            Quoting reference
          </label>
          <button onClick={discard} className="px-3 py-2 text-sm admin-muted rounded-lg">
            {dirty ? "Discard" : "Done"}
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className="px-4 py-2 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function patchPly(rows: DraftPly[], i: number, patch: Partial<DraftPly>): DraftPly[] {
  return rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
}
function removePly(rows: DraftPly[], i: number): DraftPly[] {
  return rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, ply_index: idx + 1 }));
}
function addPly(rows: DraftPly[], layupId: string, materials: PdMaterial[]): DraftPly[] {
  const last = rows[rows.length - 1];
  return [...rows, {
    id: `new-${Date.now()}`, layup_id: layupId, ply_index: rows.length + 1,
    material_id: last?.material_id ?? materials[0]?.id ?? "", orientation: null,
    template_ref: null, length_cm: null, width_mm: null, stack: last?.stack ?? null, note: null,
  }];
}

// ─── Spec strip — the numbers you actually look this sheet up for ────────────

function SpecStrip({
  editing, header, setHeader, geometryFields, plyCount,
}: {
  editing: boolean;
  header: { ref: string; resin_pct_min: string; resin_pct_max: string; geometry: Record<string, string | number | null> };
  setHeader: (h: never) => void;
  geometryFields: { key: string; label: string; unit?: string; step?: number }[];
  plyCount: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (patch: Record<string, unknown>) => (setHeader as any)({ ...header, ...patch });
  const resin = header.resin_pct_min || header.resin_pct_max
    ? `${header.resin_pct_min || "?"}–${header.resin_pct_max || "?"}%` : null;

  if (!editing) {
    const items = [
      ...geometryFields.map((f) => ({ label: f.label, value: header.geometry[f.key] != null ? `${header.geometry[f.key]}${f.unit ?? ""}` : null })),
      { label: "Resin", value: resin },
      { label: "Plies", value: String(plyCount) },
    ].filter((i) => i.value);
    if (!items.length) return null;
    return (
      <dl className="flex flex-wrap gap-x-6 gap-y-1 mt-3 px-4 py-2.5 rounded-lg"
        style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        {items.map((i) => (
          <div key={i.label} className="flex items-baseline gap-1.5">
            <dt className="text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">{i.label}</dt>
            <dd className="text-sm admin-heading tabular-nums font-semibold">{i.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
      <div><label className={labelClass}>Reference</label>
        <input className={inputClass} value={header.ref} placeholder="357"
          onChange={(e) => set({ ref: e.target.value })} /></div>
      <div><label className={labelClass}>Resin %</label>
        <div className="flex items-center gap-1">
          <input className={inputClass} value={header.resin_pct_min} placeholder="40"
            onChange={(e) => set({ resin_pct_min: e.target.value })} />
          <span className="admin-faint text-xs">–</span>
          <input className={inputClass} value={header.resin_pct_max} placeholder="45"
            onChange={(e) => set({ resin_pct_max: e.target.value })} />
        </div></div>
      {geometryFields.map((f) => (
        <div key={f.key}>
          <label className={labelClass}>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
          <input className={inputClass} type="number" step={f.step ?? 1}
            value={(header.geometry[f.key] ?? "") as string | number}
            onChange={(e) => set({ geometry: { ...header.geometry, [f.key]: e.target.value === "" ? null : Number(e.target.value) } })} />
        </div>
      ))}
    </div>
  );
}

// ─── Paste a stack ───────────────────────────────────────────────────────────
//
// The stacks arrive as a table in an email or a spreadsheet. Retyping eighteen
// rows to get them in is the definition of busywork, so accept the paste and
// parse it: one ply per line, "template  length  [material]" in any whitespace
// or comma separation. Material matches loosely against the catalog.

function PasteStack({
  materials, onParsed, onCancel,
}: {
  materials: PdMaterial[];
  onParsed: (rows: Omit<DraftPly, "id" | "layup_id" | "ply_index">[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [stack, setStack] = useState("");

  const parsed = useMemo(() => {
    return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const parts = line.split(/[\t,;]|\s{2,}|\s+/).filter(Boolean);
      const nums = parts.filter((p) => /^[\d.]+$/.test(p));
      const words = parts.filter((p) => !/^[\d.]+$/.test(p)).join(" ").toLowerCase();
      const match = materials.find((m) => words && (
        shortMaterialName(m).toLowerCase().includes(words) || words.includes(m.slug) ||
        m.name.toLowerCase().includes(words) || words.includes(shortMaterialName(m).toLowerCase())
      ));
      return {
        template_ref: nums[0] ?? null,
        length_cm: nums[1] != null ? Number(nums[1]) : null,
        material_id: match?.id ?? materials[0]?.id ?? "",
        matched: Boolean(match),
        orientation: null, width_mm: null, stack: stack || null, note: null,
      };
    });
  }, [text, materials, stack]);

  const unmatched = parsed.filter((p) => !p.matched).length;

  return (
    <div className="mb-3 p-3 rounded-xl" style={{ border: "1px solid var(--admin-accent)", backgroundColor: "var(--admin-surface)" }}>
      <p className="text-xs admin-muted mb-2">
        One ply per line: <code className="admin-faint">template &nbsp; length &nbsp; material</code>.
        Tabs, commas or spaces all work. <strong>This replaces the whole stack.</strong>
      </p>
      <textarea className={`${inputClass} min-h-[120px] font-mono text-xs`} value={text} autoFocus
        placeholder={"1\t37\tcarbon plain 200\n3\t37\tcarbon plain 200\n5\t36.8\tglass plain 350"}
        onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <div className="flex items-center gap-2">
          <label className="text-xs admin-muted">Stack</label>
          <input className={`${inputClass} w-16`} value={stack} placeholder="a" onChange={(e) => setStack(e.target.value)} />
        </div>
        <span className="text-xs admin-faint">
          {parsed.length} row{parsed.length !== 1 ? "s" : ""}
          {unmatched > 0 && <span className="text-amber-400"> · {unmatched} without a material match — set those after</span>}
        </span>
        <button onClick={() => onParsed(parsed.map(({ matched, ...r }) => { void matched; return r; }))}
          disabled={!parsed.length}
          className="ml-auto px-3 py-1.5 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg disabled:opacity-40">
          Use these {parsed.length} plies
        </button>
        <button onClick={onCancel} className="px-2 py-1.5 admin-muted text-xs">Cancel</button>
      </div>
    </div>
  );
}

// ─── Compare ─────────────────────────────────────────────────────────────────

function CompareSheets({
  bundle, pliesByLayup, constructionById, moldById, globalMax,
}: {
  bundle: Bundle; pliesByLayup: Map<string, PdPly[]>;
  constructionById: Map<string, PdConstruction>; moldById: Map<string, PdMold>; globalMax: number;
}) {
  return (
    <div className="flex gap-6 overflow-x-auto pb-2">
      {bundle.layups.map((l) => {
        const plies = pliesByLayup.get(l.id) ?? [];
        return (
          <div key={l.id} className="min-w-[290px] flex-shrink-0">
            <h3 className="text-sm font-bold admin-heading">
              {moldById.get(l.mold_id)?.name} mm {l.is_reference && <span className="text-[var(--admin-accent)]">★</span>}
            </h3>
            <p className="text-[11px] admin-faint mb-2">{constructionById.get(l.construction_id)?.name}</p>
            {plies.length === 0
              ? <p className="text-xs admin-faint py-6 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>No plies yet</p>
              : <PlyDiagram plies={plies} materials={bundle.materials} maxLengthCm={globalMax} />}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {plyTotals(plies, bundle.materials).map((t) => (
                <span key={t.label} className="text-[11px] admin-faint">{t.label}: <span className="admin-muted tabular-nums">{t.value}</span></span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
