"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlyDiagram, PlyFins, PlyLegend, plyTotals } from "@/components/admin/ply-diagram";
import { LayupBuilder } from "@/components/admin/layup-builder";
import { BuildProcess } from "@/components/admin/build-process";
import {
  groupPliesByStack, plyOrientation, resolveModelName, shortMaterialName,
  GEOMETRY_FIELDS, PD_KINDS, PD_MOLD_KINDS, PD_MOLD_STATUSES, PD_STATUSES,
  type PdConstruction, type PdKind, type PdLayup, type PdMaterial, type PdMold,
  type PdPly, type PdProcess, type PdProcessStep, type PdProject, type PdSize, type PdSource,
} from "@/lib/product-dev";
import {
  AddInline, Card, Chip, ChipSelect, Empty, Fact, Icon, InfoTip, KIND_META, KindChip, METHOD_META,
  MOLD_KIND_META, MOLD_STATUS_META, PageHeader, SaveNote, STATUS_META, StatusTrack, Tabs, Tag,
  btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, btnSmall, inputCls, labelCls, toneVars,
  type TabDef, type Tone,
} from "@/components/admin/pd-ui";
import { FinThumb, KindGlyph } from "@/components/admin/pd-thumbs";

type Bundle = PdProject & {
  constructions: PdConstruction[];
  molds: PdMold[];
  layups: PdLayup[];
  plies: PdPly[];
  processes: PdProcess[];
  steps: PdProcessStep[];
  sources: PdSource[];
  materials: PdMaterial[];
  sizes?: PdSize[];
};

type TabKey = "overview" | "tooling" | "layups" | "building";

const inputClass = inputCls;
const labelClass = labelCls;
const PLY_GRID = "56px minmax(110px,1.4fr) 84px 52px 64px minmax(60px,1fr) 24px";

/** Constructions have no colour of their own, so each gets one by position,
 *  from hues no section on this page uses. Glass stays the same colour on
 *  every tab. */
const CONSTRUCTION_TONES: Tone[] = ["indigo", "pink", "lime", "orange", "blue", "red"];
const constructionTone = (bundle: Pick<Bundle, "constructions">, id: string | null | undefined): Tone => {
  const i = bundle.constructions.findIndex((c) => c.id === id);
  return i < 0 ? "slate" : CONSTRUCTION_TONES[i % CONSTRUCTION_TONES.length];
};

/** The sheet a project is drawn from: the quoting reference, else the first. */
function referenceSheet(b: Bundle): PdLayup | null {
  return b.layups.find((l) => l.is_reference) ?? b.layups[0] ?? null;
}
function finPlies(b: Pick<Bundle, "plies" | "materials">, layupId: string) {
  const colour = new Map(b.materials.map((m) => [m.id, m.diagram_color]));
  return b.plies.filter((p) => p.layup_id === layupId).sort((a, c) => a.ply_index - c.ply_index)
    .map((p) => ({ l: Number(p.length_cm) || 0, c: colour.get(p.material_id) ?? null }));
}

/**
 * Numbers or picture, and it remembers which.
 *
 * The layup sheets have always been drawn as fin outlines, and that view answers
 * a different question from the table: not "what is ply 9" but "what shape is
 * this stack". Neither is the real one, so neither is a mode you have to keep
 * re-choosing.
 */
type SheetView = "numbers" | "graphic";
const VIEW_KEY = "np7-pd-sheet-view";

function useSheetView(): [SheetView, (v: SheetView) => void] {
  const [view, setView] = useState<SheetView>(() => {
    if (typeof window === "undefined") return "numbers";
    try { return localStorage.getItem(VIEW_KEY) === "graphic" ? "graphic" : "numbers"; } catch { return "numbers"; }
  });
  function set(v: SheetView) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }
  return [view, set];
}

function ViewToggle({ view, onChange }: { view: SheetView; onChange: (v: SheetView) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-lg" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}>
      {(["numbers", "graphic"] as const).map((v) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={view === v}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${view === v ? "admin-heading" : "admin-muted"}`}
          style={view === v ? { backgroundColor: "var(--admin-surface)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : undefined}>
          <Icon name={v === "numbers" ? "steps" : "fin"} className="w-3.5 h-3.5" />
          {v === "numbers" ? "Numbers" : "Graphic"}
        </button>
      ))}
    </div>
  );
}

export default function ProductDevProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") ?? "overview") as TabKey;

  const [d, setD] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  // True while a build sheet holds unsaved edits. A ref, not state: navigation
  // guards read it at click time and none of this should re-render the tree.
  const sheetDirtyRef = useRef(false);

  function load() {
    fetch(`/api/admin/product-dev/projects/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((data) => { setD(data); setLoading(false); })
      .catch(() => { setError("Couldn't load that project."); setLoading(false); });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(next: TabKey, extra?: Record<string, string>) {
    if (sheetDirtyRef.current && !confirm("You have unsaved build-sheet changes. Leave and lose them?")) return;
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", next);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  async function setStatus(status: PdProject["status"]) {
    if (!d) return;
    setD({ ...d, status });
    const res = await fetch(`/api/admin/product-dev/projects/${d.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (res.ok) { setStatusMsg("Saved"); load(); setTimeout(() => setStatusMsg(""), 1500); }
    else { setStatusMsg((await res.json().catch(() => ({}))).error || "Status not saved"); load(); }
  }

  if (loading) return <div className="py-12 text-center text-sm admin-faint">Loading…</div>;
  if (error || !d) return <div className="py-12 text-center text-sm text-red-500">{error || "Not found."}</div>;

  const ref = referenceSheet(d);
  const kind = KIND_META[d.kind] ?? KIND_META.accessory;
  const tabs: TabDef<TabKey>[] = [
    { key: "overview", label: "Overview", icon: "overview", tone: "slate" },
    { key: "tooling", label: "Tooling", icon: "mold", tone: "amber", count: d.molds.length },
    { key: "layups", label: "Build sheets", icon: "layers", tone: "violet", count: d.layups.length },
    { key: "building", label: "Building", icon: "steps", tone: "teal", count: d.processes.length },
  ];

  return (
    <div>
      <PageHeader
        back={{ href: "/admin/product-dev/projects", label: "Projects" }}
        thumb={
          <div className="pd-tone w-[72px] h-[72px] rounded-2xl flex items-center justify-center" style={{ ...toneVars(kind.tone), backgroundColor: "var(--tone-bg)" }}>
            {d.kind === "fin" && ref && finPlies(d, ref.id).length
              ? <FinThumb plies={finPlies(d, ref.id)} className="h-16" />
              : <KindGlyph kind={d.kind} className="w-9 h-9" />}
          </div>
        }
        title={d.name}
        chips={
          <>
            <KindChip kind={d.kind} />
            <ChipSelect value={d.status} options={PD_STATUSES} meta={STATUS_META} onChange={setStatus} title="Where this project stands" />
            <StatusTrack status={d.status} className="ml-1" />
            <SaveNote msg={statusMsg} />
          </>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={(k) => go(k)} />

      {tab === "overview" && <OverviewTab bundle={d} onSaved={load} go={go} />}
      {tab === "tooling" && <ToolingTab bundle={d} onChanged={load} />}
      {tab === "layups" && <LayupsTab bundle={d} onChanged={load} dirtyRef={sheetDirtyRef} />}
      {tab === "building" && (
        <BuildProcess owner={{ kind: "project", id: d.id }} processes={d.processes} steps={d.steps} onChanged={load} />
      )}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
// Read first: what this is, what exists for it, where it stands. The form is
// one click away instead of being the page.

function OverviewTab({ bundle, onSaved, go }: { bundle: Bundle; onSaved: () => void; go: (t: TabKey, extra?: Record<string, string>) => void }) {
  const [editing, setEditing] = useState(false);
  const sizes = bundle.sizes ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
      <div className="space-y-5 min-w-0">
        {editing ? (
          <AboutForm project={bundle} onDone={(saved) => { setEditing(false); if (saved) onSaved(); }} />
        ) : (
          <Card title="About" icon="note" tone="slate"
            actions={<button onClick={() => setEditing(true)} className={btnSmall}><Icon name="edit" className="w-3.5 h-3.5" />Edit</button>}>
            {bundle.summary
              ? <p className="text-sm admin-heading leading-relaxed whitespace-pre-wrap">{bundle.summary}</p>
              : <p className="text-sm admin-faint">No summary yet. One or two sentences on what this is and where it stands.</p>}
            {bundle.notes && (
              <div className="mt-4 p-3 rounded-xl text-xs admin-muted leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: "var(--admin-bg)" }}>
                <span className="block text-[11px] font-semibold admin-faint mb-1">Internal notes</span>
                {bundle.notes}
              </div>
            )}
          </Card>
        )}

        <Card title="Build sheets" icon="layers" tone="violet" subtitle="One per construction and mold"
          actions={<button onClick={() => go("layups")} className={btnSmall}>Open<Icon name="chevron" className="w-3.5 h-3.5" /></button>}>
          {bundle.layups.length === 0 ? (
            <p className="text-sm admin-faint">No build sheets yet. Add a construction and a blade mold on Tooling first.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {bundle.layups.map((l) => {
                const mold = bundle.molds.find((m) => m.id === l.mold_id);
                const con = bundle.constructions.find((c) => c.id === l.construction_id);
                const plies = finPlies(bundle, l.id);
                return (
                  <button key={l.id} onClick={() => go("layups", { layup: l.id })}
                    className="text-left rounded-xl p-3 transition-colors hover:bg-[var(--admin-surface-hover)]"
                    style={{ border: "1px solid var(--admin-border)" }}>
                    <div className="h-24 flex items-center justify-center mb-2">
                      {plies.length ? <FinThumb plies={plies} className="h-24" /> : <KindGlyph icon="layers" tone="violet" className="w-8 h-8" />}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold admin-heading tabular-nums">{mold?.name ?? "?"}</span>
                      <span className="text-[11px] admin-faint">mm</span>
                      {l.is_reference && <Chip tone="violet" solid className="ml-auto">REF</Chip>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {con && <Chip tone={constructionTone(bundle, con.id)}>{con.name}</Chip>}
                    </div>
                    <p className="text-[11px] admin-faint mt-1">{plies.length} plies</p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5 min-w-0">
        <Card title="Tooling" icon="mold" tone="amber"
          actions={<button onClick={() => go("tooling")} className={btnSmall}>Open<Icon name="chevron" className="w-3.5 h-3.5" /></button>}>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold admin-faint mb-1.5">Constructions</p>
              {bundle.constructions.length === 0 ? <p className="text-xs admin-faint">None yet</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {bundle.constructions.map((c) => <Chip key={c.id} tone={constructionTone(bundle, c.id)} dot>{c.name}</Chip>)}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold admin-faint mb-1.5">Molds</p>
              {bundle.molds.length === 0 ? <p className="text-xs admin-faint">None yet</p> : (
                <ul className="space-y-1.5">
                  {bundle.molds.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="text-sm font-semibold admin-heading tabular-nums min-w-[48px]">{m.name}</span>
                      <span className="text-[11px] admin-faint">{MOLD_KIND_META[m.kind]?.label ?? m.kind}</span>
                      <span className="ml-auto"><Chip tone={MOLD_STATUS_META[m.status]?.tone ?? "slate"} dot>{MOLD_STATUS_META[m.status]?.label ?? m.status}</Chip></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card title="Sizes" icon="tag" tone="sky"
          actions={<button onClick={() => go("tooling")} className={btnSmall}>Open<Icon name="chevron" className="w-3.5 h-3.5" /></button>}>
          {sizes.length === 0 ? <p className="text-xs admin-faint">No sizes yet</p> : (
            <ul className="space-y-1.5">
              {sizes.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold admin-heading truncate">{s.label}</span>
                  <span className="ml-auto flex gap-1">
                    {s.rake_deg != null && <Tag>{s.rake_deg}° rake</Tag>}
                    {s.back_end_mm != null && <Tag>{s.back_end_mm} mm back</Tag>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Building" icon="steps" tone="teal"
          actions={<button onClick={() => go("building")} className={btnSmall}>Open<Icon name="chevron" className="w-3.5 h-3.5" /></button>}>
          {bundle.processes.length === 0 ? <p className="text-xs admin-faint">No stages yet</p> : (
            <ol className="space-y-2">
              {[...bundle.processes].sort((a, b) => a.stage_order - b.stage_order).map((p) => {
                const n = bundle.steps.filter((s) => s.process_id === p.id).length;
                const m = METHOD_META[p.method];
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="pd-tone w-5 h-5 rounded-full shrink-0 inline-flex items-center justify-center text-[10px] font-bold"
                      style={{ ...toneVars(m?.tone ?? "slate"), backgroundColor: "var(--tone-bg)", color: "var(--tone)" }}>{p.stage_order}</span>
                    <span className="text-xs font-semibold admin-heading truncate flex-1">{p.name}</span>
                    <span className="text-[11px] admin-faint shrink-0">{n} step{n === 1 ? "" : "s"}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function AboutForm({ project, onDone }: { project: PdProject; onDone: (saved: boolean) => void }) {
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
    if (res.ok) onDone(true);
    else setMsg((await res.json().catch(() => ({}))).error || "Save failed. Your changes are NOT stored.");
  }

  return (
    <Card title="Edit project" icon="edit" tone="violet">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-4">
        <div><label className={labelClass}>Name</label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={labelClass}>Status</label>
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PdProject["status"] })}>
            {PD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select></div>
      </div>
      <div className="mb-4">
        <label className={labelClass}>Kind</label>
        <div className="flex flex-wrap gap-1.5">
          {PD_KINDS.map((k) => {
            const on = form.kind === k;
            const m = KIND_META[k];
            return (
              <button key={k} onClick={() => setForm({ ...form, kind: k as PdKind })} aria-pressed={on}
                className="pd-tone inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  ...toneVars(m.tone),
                  ...(on ? { backgroundColor: "var(--tone-bg)", color: "var(--tone)", border: "1px solid var(--tone-line)" }
                    : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }),
                }}>
                <Icon name={m.icon} className="w-4 h-4" style={{ color: "var(--tone)" }} />{m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-4"><label className={labelClass}>Summary</label>
        <textarea className={`${inputClass} min-h-[90px]`} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="What this program is and where it stands." /></div>
      <div className="mb-4"><label className={labelClass}>Internal notes</label>
        <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className={btnPrimary} style={btnPrimaryStyle}>{saving ? "Saving…" : "Save"}</button>
        <button onClick={() => onDone(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
        <SaveNote msg={msg} />
      </div>
    </Card>
  );
}

// ─── Tooling ─────────────────────────────────────────────────────────────────

function ToolingTab({ bundle, onChanged }: { bundle: Bundle; onChanged: () => void }) {
  const [error, setError] = useState("");

  async function addConstruction(name: string) {
    setError("");
    const code = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "construction";
    const res = await fetch("/api/admin/product-dev/constructions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: bundle.id, code, name, sort_order: bundle.constructions.length + 1 }),
    });
    if (res.ok) { onChanged(); return true; }
    setError((await res.json().catch(() => ({}))).error || "Couldn't add that.");
    return false;
  }

  async function addMold(name: string) {
    setError("");
    const res = await fetch("/api/admin/product-dev/molds", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: bundle.id, name, kind: "blade", key_dimension_mm: Number(name.replace(",", ".")) || null }),
    });
    if (res.ok) { onChanged(); return true; }
    setError((await res.json().catch(() => ({}))).error || "Couldn't add that.");
    return false;
  }

  async function patchConstruction(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/constructions/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Save failed.");
  }

  async function patchMold(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/molds/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Save failed.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {error && <div className="lg:col-span-2 text-xs text-red-500">{error}</div>}

      <Card title="Constructions" icon="fabric" tone="indigo" flush
        subtitle="The models: glass and carbon off one mold are two products"
        info={<>Name the model here and every sheet under this construction inherits it. Descriptions stay in the supplier&apos;s own words: if no percentage was quoted, none is invented here.</>}
        actions={<AddInline label="Add" placeholder="e.g. Carbon" onAdd={addConstruction} />}>
        {bundle.constructions.length === 0 ? (
          <p className="px-4 py-6 text-xs admin-faint">None yet.</p>
        ) : bundle.constructions.map((c, i) => (
          <div key={c.id} className="px-4 py-3 flex gap-3" style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined }}>
            <span className="pd-tone w-1 self-stretch rounded-full shrink-0" style={{ ...toneVars(constructionTone(bundle, c.id)), backgroundColor: "var(--tone)" }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold admin-heading">{c.name}</span>
                <code className="text-[10px] admin-faint">{c.code}</code>
              </div>
              {c.description && <p className="text-xs admin-muted mt-0.5 line-clamp-2" title={c.description}>{c.description}</p>}
              <label className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-semibold admin-faint shrink-0">Model</span>
                <input
                  className="flex-1 min-w-0 px-2 py-1 rounded-md text-xs admin-heading bg-transparent border border-transparent hover:border-[var(--admin-border)] focus:outline-none placeholder:italic"
                  defaultValue={c.model_name ?? ""} placeholder={`not named, sheets show "${bundle.name}"`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.model_name ?? "")) patchConstruction(c.id, { model_name: v || null }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </label>
            </div>
          </div>
        ))}
      </Card>

      <Card title="Molds" icon="mold" tone="amber" flush
        subtitle="Physical tooling, and where it is"
        info={<>Molds travel between partners. The status says whether a mold is planned, ordered, in use, shipped or retired; click the coloured chip to change it.</>}
        actions={<AddInline label="Add" placeholder="e.g. 8.6" onAdd={addMold} />}>
        {bundle.molds.length === 0 ? (
          <p className="px-4 py-6 text-xs admin-faint">None yet.</p>
        ) : bundle.molds.map((m, i) => (
          <div key={m.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined }}>
            <div className="min-w-[88px]">
              <span className="text-lg font-bold admin-heading tabular-nums leading-none">{m.name}</span>
              <span className="block text-[11px] admin-faint mt-0.5">
                {m.key_dimension_mm != null ? `${m.key_dimension_mm} mm ${m.key_dimension_label}` : m.key_dimension_label !== "n/a" ? m.key_dimension_label : ""}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <ChipSelect value={m.kind} options={PD_MOLD_KINDS} meta={MOLD_KIND_META} onChange={(v) => patchMold(m.id, { kind: v })} title="Kind of mold" />
              <ChipSelect value={m.status} options={PD_MOLD_STATUSES} meta={MOLD_STATUS_META} onChange={(v) => patchMold(m.id, { status: v })} title="Status" />
            </div>
          </div>
        ))}
      </Card>

      <SizesSection bundle={bundle} onChanged={onChanged} setError={setError} />
    </div>
  );
}

// ─── Sizes ───────────────────────────────────────────────────────────────────
// Rake and back end live HERE, per sellable size: the 37 TT (27 mm / 6°) and
// the 44 DTT (20 mm / 4°) come off the same ply stack, so the layup cannot
// carry them. One blade, many fins.

const SIZE_GRID = "minmax(120px,1.4fr) 84px 70px 70px 84px minmax(90px,1fr) 28px";

function SizesSection({ bundle, onChanged, setError }: { bundle: Bundle; onChanged: () => void; setError: (e: string) => void }) {
  const sizes = bundle.sizes ?? [];

  async function addSize(label: string) {
    setError("");
    const guessedLen = Number((label.match(/\d+(\.\d+)?/) ?? [])[0]) || null;
    const res = await fetch("/api/admin/product-dev/sizes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: bundle.id, label, length_cm: guessedLen }),
    });
    if (res.ok) { onChanged(); return true; }
    setError((await res.json().catch(() => ({}))).error || "Couldn't add that size.");
    return false;
  }

  async function patchSize(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/product-dev/sizes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Save failed.");
  }

  async function removeSize(s: PdSize) {
    if (!confirm(`Remove size "${s.label}"?`)) return;
    const res = await fetch(`/api/admin/product-dev/sizes/${s.id}`, { method: "DELETE" });
    if (res.ok) onChanged(); else setError((await res.json().catch(() => ({}))).error || "Couldn't remove that.");
  }

  // Borderless until touched: a table of numbers, not a wall of boxes.
  const cell = "text-xs admin-heading tabular-nums rounded-md px-1.5 py-1 w-full bg-transparent border border-transparent hover:border-[var(--admin-border)] focus:outline-none";
  const numCell = (s: PdSize, key: "length_cm" | "rake_deg" | "back_end_mm") => (
    <input className={cell} type="number" step="0.5" defaultValue={s[key] ?? ""} placeholder="-"
      onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== s[key]) patchSize(s.id, { [key]: v }); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );

  return (
    <Card className="lg:col-span-2" title="Sizes" icon="tag" tone="sky" flush
      subtitle="The sellable sizes, each with its own rake and back end"
      info={<>One pressed blade is trimmed into all of these, which is why these numbers don&apos;t live on the build sheet. Supplier drawings often state the trailing-edge angle instead: 84° drawn = rake 6°.</>}
      actions={<AddInline label="Add size" placeholder='e.g. 37 NP7 TT BOX' onAdd={addSize} />}>
      <div className="admin-tablecard">
        <div className="gap-3 px-4 py-2" style={{ display: "grid", gridTemplateColumns: SIZE_GRID, backgroundColor: "var(--admin-bg)" }}>
          {["Size", "Length cm", "Box", "Rake °", "Back end mm", "Notes", ""].map((h, i) => (
            <span key={i} className="text-[11px] font-semibold admin-faint">{h}</span>
          ))}
        </div>
        {sizes.length === 0 ? (
          <p className="px-4 py-5 text-xs admin-faint">No sizes yet. Add the ones the partner quoted.</p>
        ) : sizes.map((s) => (
          <div key={s.id} className="gap-3 px-4 py-1.5 items-center group" style={{ display: "grid", gridTemplateColumns: SIZE_GRID, borderTop: "1px solid var(--admin-border)" }}>
            <span className="text-sm font-semibold admin-heading truncate" title={s.label}>{s.label}</span>
            {numCell(s, "length_cm")}
            <input className={cell} defaultValue={s.box ?? ""} placeholder="TT"
              onBlur={(e) => { const v = e.target.value || null; if (v !== s.box) patchSize(s.id, { box: v }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            {numCell(s, "rake_deg")}
            {numCell(s, "back_end_mm")}
            <input className={cell} defaultValue={s.notes ?? ""} placeholder="-"
              onBlur={(e) => { const v = e.target.value || null; if (v !== s.notes) patchSize(s.id, { notes: v }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <button onClick={() => removeSize(s)} title="Remove" className="admin-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}


// ─── Build sheets ────────────────────────────────────────────────────────────
//
// This is a DOCUMENT, not a form. It is read far more often than it is edited:
// you open it to check a ply length or quote a construction, not to retype the
// stack. So it renders as a typeset spec sheet and only becomes editable when
// you say so; eighteen rows of live dropdowns is what made the first version
// unreadable.
//
// The other half of "annoying to use" is creation. A sheet is a variation on
// another sheet (8.3 and 8.6 differ by a few lengths), so new sheets are born
// by copying, and a stack can be pasted straight out of the supplier's email
// rather than typed row by row.

function LayupsTab({ bundle, onChanged, dirtyRef }: { bundle: Bundle; onChanged: () => void; dirtyRef: React.MutableRefObject<boolean> }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
    if (layupId !== selectedId && dirtyRef.current && !confirm("You have unsaved changes on this sheet. Switch and lose them?")) return;
    const q = new URLSearchParams(Array.from(sp.entries()));
    q.set("tab", "layups"); q.set("layup", layupId);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  const globalMax = Math.max(1, ...bundle.plies.map((p) => Number(p.length_cm) || 0));

  // Pairs that could still have a sheet. The ones already taken aren't offered:
  // the unique constraint is the matrix, so the UI shouldn't invite a 409.
  const taken = new Set(bundle.layups.map((l) => `${l.construction_id}/${l.mold_id}`));
  const openPairs = bundle.constructions.flatMap((c) =>
    bundle.molds.filter((m) => m.kind === "blade").map((m) => ({ c, m })).filter(({ m }) => !taken.has(`${c.id}/${m.id}`))
  );

  if (bundle.layups.length === 0) {
    return (
      <Empty icon="layers" tone="violet" title="No build sheets yet">
        A sheet is one construction in one mold. Add a construction and a blade mold on the Tooling tab, and the pair becomes available here.
      </Empty>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs admin-muted">
          One sheet per construction and mold
          <InfoTip>The pairs with no sheet are combinations this model doesn&apos;t build. That absence is part of the record.</InfoTip>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {openPairs.length > 0 && (
            <button onClick={() => setAdding(true)} className={btnSecondary} style={btnSecondaryStyle}>
              <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />New sheet
            </button>
          )}
          <button onClick={() => { if (!compare && dirtyRef.current && !confirm("You have unsaved changes on this sheet. Leave and lose them?")) return; setCompare(!compare); }}
            className={btnSecondary} style={btnSecondaryStyle}>
            <Icon name="compare" className="w-4 h-4" />{compare ? "One sheet" : "Compare all"}
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
        <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] gap-5">
          <SheetRail
            bundle={bundle} layups={bundle.layups} selectedId={selectedId} onSelect={select}
            constructionById={constructionById} moldById={moldById}
            pliesByLayup={pliesByLayup} materials={bundle.materials}
          />
          {selected && (
            <BuildSheet
              key={selected.id}
              dirtyRef={dirtyRef}
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

// ─── Left rail: a sheet is identified by its mold, so lead with the mold ─────

function SheetRail({
  bundle, layups, selectedId, onSelect, constructionById, moldById, pliesByLayup, materials,
}: {
  bundle: Bundle; layups: PdLayup[]; selectedId: string | null; onSelect: (id: string) => void;
  constructionById: Map<string, PdConstruction>; moldById: Map<string, PdMold>;
  pliesByLayup: Map<string, PdPly[]>; materials: PdMaterial[];
}) {
  const colour = new Map(materials.map((m) => [m.id, m.diagram_color]));
  return (
    <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible self-start">
      {layups.map((l) => {
        const plies = pliesByLayup.get(l.id) ?? [];
        const mold = moldById.get(l.mold_id);
        const con = constructionById.get(l.construction_id);
        const active = l.id === selectedId;
        return (
          <button key={l.id} onClick={() => onSelect(l.id)}
            className="shrink-0 w-[190px] lg:w-full text-left rounded-xl p-2.5 flex items-center gap-3 transition-colors hover:bg-[var(--admin-surface-hover)]"
            style={{
              backgroundColor: "var(--admin-surface)",
              border: active ? "1.5px solid var(--admin-accent)" : "1px solid var(--admin-border)",
              boxShadow: active ? "0 0 0 3px var(--admin-accent-weak)" : undefined,
            }}>
            <span className="w-9 h-12 shrink-0 flex items-center justify-center">
              {plies.length
                ? <FinThumb plies={plies.map((p) => ({ l: Number(p.length_cm) || 0, c: colour.get(p.material_id) ?? null }))} className="h-12" />
                : <Icon name="layers" className="w-5 h-5 admin-faint" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1">
                <span className="text-base font-bold admin-heading tabular-nums">{mold?.name ?? "?"}</span>
                <span className="text-[10px] admin-faint">mm</span>
                {l.is_reference && <Chip tone="violet" solid className="ml-auto">REF</Chip>}
              </span>
              {con && <Chip tone={constructionTone(bundle, con.id)} className="mt-1 max-w-full"><span className="truncate">{con.name}</span></Chip>}
              <span className="block text-[11px] admin-faint mt-1">{plies.length ? `${plies.length} plies` : "no plies yet"}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── New sheet: copy an existing stack rather than typing 18 rows ────────────

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
    <Card title="New build sheet" icon="plus" tone="violet" className="mb-5"
      subtitle="Starts as a copy: change the lengths that differ instead of re-entering all of them">
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
        <button onClick={create} disabled={busy || !target} className={btnPrimary} style={btnPrimaryStyle}>
          {busy ? "Creating…" : `Create with ${sourcePlies} plies`}
        </button>
        <button onClick={onClose} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
      </div>
      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
    </Card>
  );
}

// ─── The sheet ───────────────────────────────────────────────────────────────

type DraftPly = Omit<PdPly, "created_at" | "updated_at">;

function BuildSheet({
  layup, project, construction, mold, plies, materials, maxLengthCm, onChanged, dirtyRef,
}: {
  layup: PdLayup; project: Bundle; construction?: PdConstruction; mold?: PdMold;
  plies: PdPly[]; materials: PdMaterial[]; maxLengthCm: number; onChanged: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [view, setView] = useSheetView();
  const [draft, setDraft] = useState<DraftPly[]>(plies);
  const [header, setHeader] = useState({
    name: layup.name, ref: layup.ref ?? "", model_name: layup.model_name ?? "",
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
    header.model_name !== (layup.model_name ?? "") ||
    header.is_reference !== layup.is_reference ||
    header.resin_pct_min !== String(layup.resin_pct_min ?? "") ||
    header.resin_pct_max !== String(layup.resin_pct_max ?? "") ||
    JSON.stringify(header.geometry) !== JSON.stringify(layup.geometry ?? {});
  const dirty = pliesDirty || headerDirty;

  // Publish the dirty state for the navigation guards (rail, compare, tabs),
  // and hold the browser itself at the door: a reload or tab-close with a
  // half-pasted stack is the same silent loss as a mis-click.
  useEffect(() => {
    dirtyRef.current = editing && dirty;
    return () => { dirtyRef.current = false; };
  }, [editing, dirty, dirtyRef]);
  useEffect(() => {
    if (!(editing && dirty)) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, dirty]);

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
            model_name: header.model_name.trim() || null,
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
      name: layup.name, ref: layup.ref ?? "", model_name: layup.model_name ?? "",
      resin_pct_min: String(layup.resin_pct_min ?? ""), resin_pct_max: String(layup.resin_pct_max ?? ""),
      is_reference: layup.is_reference, geometry: { ...(layup.geometry ?? {}) },
    });
    setEditing(false); setMsg("");
  }

  // Reindex by ARRAY order before anything reads ply_index: the Baukasten
  // reorders rows, so a draft's stored indices go stale until save renumbers
  // them, and groupPliesByStack sorts by ply_index, which would scramble the
  // table mid-edit.
  const shown = (editing ? draft : plies).map((p, i) => ({ ...p, ply_index: i + 1 }));
  const groups = groupPliesByStack(shown as PdPly[]);
  const diagramPlies = shown.map((p) => ({ ...p, created_at: "", updated_at: "" })) as PdPly[];
  const model = resolveModelName(layup, construction, project);

  return (
    <div className="pb-20 min-w-0">
      {/* Title + spec strip. Reads as a document header, not a row of form fields. */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {editing ? (
            <input className={`${inputClass} text-lg font-bold`} value={header.name}
              onChange={(e) => setHeader({ ...header, name: e.target.value })} />
          ) : (
            <h2 className="text-xl font-bold admin-heading flex flex-wrap items-center gap-2">
              {layup.name}
              {layup.is_reference && <Chip tone="violet" solid icon="check">Quoting reference</Chip>}
            </h2>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {construction && <Chip tone={constructionTone(project, construction.id)} icon="fabric">{construction.name}</Chip>}
            {mold && <Chip tone="amber" icon="mold">{mold.name} mm mold</Chip>}
            {layup.ref && <Tag>ref {layup.ref}</Tag>}
          </div>
          {/* Which MODEL this sheet is: the question the sheet's own name (a
              factory reference) never answered. Resolved most-specific first. */}
          {editing ? (
            <input className={`${inputClass} mt-2 max-w-sm text-xs`} value={header.model_name}
              placeholder={`Model: leave empty to inherit "${resolveModelName(null, construction, project).name}"`}
              onChange={(e) => setHeader({ ...header, model_name: e.target.value })} />
          ) : (
            <p className="text-xs mt-1.5 inline-flex items-center gap-1.5">
              <span className="font-semibold admin-heading">Model: {model.name}</span>
              <InfoTip>
                {model.from === "layup" ? "Named on this sheet." : model.from === "construction" ? "Inherited from the construction." : "Not named yet, so it falls back to the project name. Name it on the construction (Tooling) or on this sheet."}
              </InfoTip>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* The toggle stays available while editing: Numbers edits the table,
              Graphic edits the Baukasten. Same draft either way. */}
          <ViewToggle view={view} onChange={setView} />
          {!editing && (
            <button onClick={() => setEditing(true)} className={btnSecondary} style={btnSecondaryStyle}>
              <Icon name="edit" className="w-4 h-4" />Edit sheet
            </button>
          )}
        </div>
      </div>

      <SpecStrip
        editing={editing} header={header} setHeader={setHeader}
        geometryFields={geometryFields} plyCount={shown.length}
      />

      {view === "graphic" && editing ? (
        <div className="mt-5">
          <LayupBuilder
            plies={draft}
            materials={materials}
            maxLengthCm={maxLengthCm}
            onChange={setDraft}
          />
        </div>
      ) : view === "graphic" ? (
        <div className="mt-5">
          <Card flush>
            <div className="p-4">
              <PlyFins plies={diagramPlies} materials={materials} maxLengthCm={maxLengthCm} />
              <div className="flex flex-wrap items-end justify-between gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
                <PlyLegend plies={diagramPlies} materials={materials} />
                <div className="text-right">
                  <p className="text-sm font-black admin-heading tracking-tight">NP7</p>
                  <p className="text-xs admin-muted uppercase tracking-wide">{layup.name}</p>
                </div>
              </div>
            </div>
          </Card>
          <Totals plies={diagramPlies} materials={materials} className="mt-3" />
        </div>
      ) : (
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_340px] gap-5 mt-5">
        <Card title="Plies" icon="layers" tone="violet" flush className="min-w-0"
          subtitle={`${shown.length} plies${groups.length > 1 ? ` in ${groups.length} stacks` : ""}`}
          info={<>Lengths are the bend curve and restart at each stack: the sequence is not meant to descend all the way down.</>}
          actions={editing ? (
            <>
              <button onClick={() => setPasting(!pasting)} className={btnSmall}><Icon name="paste" className="w-3.5 h-3.5" />Paste a stack</button>
              <button onClick={() => setDraft(addPly(draft, layup.id, materials))} className={btnSmall}><Icon name="plus" className="w-3.5 h-3.5" />Add ply</button>
            </>
          ) : undefined}>
          {pasting && editing && (
            <div className="p-3">
              <PasteStack materials={materials}
                onCancel={() => setPasting(false)}
                onParsed={(rows) => { setDraft(rows.map((r, i) => ({ ...r, id: `new-${i}`, layup_id: layup.id, ply_index: i + 1 }))); setPasting(false); }} />
            </div>
          )}

          <div className="admin-tablecard">
            <div className="gap-2 px-4 py-2" style={{ display: "grid", gridTemplateColumns: PLY_GRID, backgroundColor: "var(--admin-bg)" }}>
              {["#", "Material", "Orientation", "Tpl", "Length", "Note", ""].map((h, i) => (
                <span key={i} className={`text-[11px] font-semibold admin-faint ${i === 4 ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {groups.map((g, gi) => (
              <div key={`${g.stack ?? "none"}-${gi}`}>
                {groups.length > 1 && (
                  <div className="px-4 py-1.5 flex items-center gap-2" style={{ borderTop: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                    <Chip tone="violet">Stack {g.stack ?? "-"}</Chip>
                    <span className="text-[11px] admin-faint">
                      {g.plies.length} plies · {g.plies[0]?.length_cm ?? "-"} to {g.plies[g.plies.length - 1]?.length_cm ?? "-"} cm
                    </span>
                  </div>
                )}
                {g.plies.map((p) => {
                  const i = shown.findIndex((x) => x.id === p.id);
                  const mat = matById.get(p.material_id);
                  const ori = plyOrientation(p, mat);
                  return (
                    <div key={p.id} className="gap-2 px-4 py-1.5 items-center"
                      style={{ display: "grid", gridTemplateColumns: PLY_GRID, borderTop: "1px solid var(--admin-border)" }}>
                      <span className="flex items-center gap-2 text-xs admin-faint tabular-nums">
                        <span className="inline-block w-3 h-3 rounded-[3px] flex-shrink-0"
                          style={{ backgroundColor: mat?.diagram_color || "var(--admin-border-strong)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }} />
                        {p.ply_index}
                      </span>
                      {editing ? (
                        <select className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.material_id}
                          onChange={(e) => setDraft(patchPly(draft, i, { material_id: e.target.value }))}>
                          {materials.map((m) => <option key={m.id} value={m.id}>{shortMaterialName(m)}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs font-medium admin-heading truncate" title={mat?.name}>{shortMaterialName(mat)}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.orientation ?? ""}
                          placeholder={mat?.default_orientation ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { orientation: e.target.value || null }))} />
                      ) : (
                        // An inherited value is shown as the real value, dimmed:
                        // a grey placeholder read as "empty" in the first version.
                        <span className={`text-xs tabular-nums ${ori.inherited ? "admin-faint" : "admin-muted"}`}>{ori.value}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.template_ref ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { template_ref: e.target.value || null }))} />
                      ) : (
                        <span className="text-xs admin-muted tabular-nums">{p.template_ref ?? "-"}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full text-right" type="number" step="0.1"
                          value={p.length_cm ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { length_cm: e.target.value === "" ? null : Number(e.target.value) }))} />
                      ) : (
                        <span className="text-xs font-semibold admin-heading tabular-nums text-right">{p.length_cm ?? "-"}</span>
                      )}
                      {editing ? (
                        <input className="text-xs admin-input border rounded px-1.5 py-1 w-full" value={p.note ?? ""}
                          onChange={(e) => setDraft(patchPly(draft, i, { note: e.target.value || null }))} />
                      ) : (
                        <span className="text-xs admin-faint truncate" title={p.note ?? undefined}>{p.note ?? ""}</span>
                      )}
                      {editing
                        ? <button onClick={() => setDraft(removePly(draft, i))} className="admin-faint hover:text-red-500" title="Remove"><Icon name="x" className="w-3.5 h-3.5" /></button>
                        : <span />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <div className="2xl:sticky 2xl:top-4 self-start min-w-0">
          <Card title="Diagram" icon="fin" tone="violet" flush>
            <div className="p-3">
              <PlyDiagram plies={diagramPlies} materials={materials} maxLengthCm={maxLengthCm} />
              <PlyLegend plies={diagramPlies} materials={materials} />
            </div>
          </Card>
          <Totals plies={diagramPlies} materials={materials} className="mt-3" />
        </div>
      </div>
      )}

      {/* One save bar, and only when there is something to save. */}
      {editing && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-5 py-3 flex items-center justify-end gap-3"
          style={{ backgroundColor: "var(--admin-surface)", borderTop: "1px solid var(--admin-border)", boxShadow: "0 -6px 20px rgba(0,0,0,0.06)" }}>
          <span className="mr-auto">{msg ? <SaveNote msg={msg} /> : dirty ? <span className="text-xs admin-faint">Unsaved changes</span> : null}</span>
          <label className="flex items-center gap-2 text-xs admin-muted cursor-pointer select-none mr-2">
            <input type="checkbox" checked={header.is_reference}
              onChange={(e) => setHeader({ ...header, is_reference: e.target.checked })} />
            Quoting reference
          </label>
          <button onClick={discard} className={btnSecondary} style={btnSecondaryStyle}>{dirty ? "Discard" : "Done"}</button>
          <button onClick={save} disabled={saving || !dirty} className={btnPrimary} style={btnPrimaryStyle}>{saving ? "Saving…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

/** The quick sanity numbers under a diagram, as small tiles. */
function Totals({ plies, materials, className = "" }: { plies: PdPly[]; materials: PdMaterial[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-3 gap-2 ${className}`}>
      {plyTotals(plies, materials).map((t) => (
        <div key={t.label} className="px-3 py-2 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <dt className="text-[10px] font-medium admin-faint truncate">{t.label}</dt>
          <dd className="text-sm font-bold admin-heading tabular-nums">{t.value}</dd>
        </div>
      ))}
    </dl>
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

// ─── Spec strip: the numbers you actually look this sheet up for ─────────────

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
    ? `${header.resin_pct_min || "?"} to ${header.resin_pct_max || "?"}%` : null;

  if (!editing) {
    const items = [
      ...geometryFields.map((f) => ({ label: f.label, value: header.geometry[f.key] != null ? `${header.geometry[f.key]}${f.unit ?? ""}` : null })),
      { label: "Resin", value: resin },
      { label: "Plies", value: String(plyCount) },
    ].filter((i) => i.value);
    if (!items.length) return null;
    return (
      <dl className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 rounded-xl"
        style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        {items.map((i) => <Fact key={i.label} label={i.label} value={i.value} />)}
      </dl>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div><label className={labelClass}>Reference</label>
        <input className={inputClass} value={header.ref} placeholder="357"
          onChange={(e) => set({ ref: e.target.value })} /></div>
      <div><label className={labelClass}>Resin %</label>
        <div className="flex items-center gap-1">
          <input className={inputClass} value={header.resin_pct_min} placeholder="40"
            onChange={(e) => set({ resin_pct_min: e.target.value })} />
          <span className="admin-faint text-xs">to</span>
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
    <div className="p-3 rounded-xl" style={{ border: "1px solid var(--admin-accent)", backgroundColor: "var(--admin-bg)" }}>
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
          {unmatched > 0 && <span className="text-amber-600"> · {unmatched} without a material match, set those after</span>}
        </span>
        <button onClick={() => onParsed(parsed.map(({ matched, ...r }) => { void matched; return r; }))}
          disabled={!parsed.length} className={`ml-auto ${btnPrimary}`} style={btnPrimaryStyle}>
          Use these {parsed.length} plies
        </button>
        <button onClick={onCancel} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
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
  const [view, setView] = useSheetView();

  // Stacked when compared as fins: the sheets share a length scale, so 931 above
  // 921 shows at a glance that they differ only in the first two plies.
  if (view === "graphic") {
    return (
      <div>
        <div className="flex justify-end mb-3"><ViewToggle view={view} onChange={setView} /></div>
        <div className="space-y-4">
          {bundle.layups.map((l) => {
            const plies = pliesByLayup.get(l.id) ?? [];
            const con = constructionById.get(l.construction_id);
            return (
              <Card key={l.id} title={<span className="inline-flex items-center gap-2">{l.name}{l.is_reference && <Chip tone="violet" solid>REF</Chip>}</span>}
                icon="layers" tone="violet"
                subtitle={`${resolveModelName(l, con, bundle).name} · ${con?.name ?? ""} · ${moldById.get(l.mold_id)?.name} mm · ${plies.length} plies`}>
                {plies.length === 0
                  ? <p className="text-xs admin-faint py-6 text-center">No plies yet</p>
                  : <><PlyFins plies={plies} materials={bundle.materials} maxLengthCm={globalMax} />
                      <PlyLegend plies={plies} materials={bundle.materials} /></>}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3"><ViewToggle view={view} onChange={setView} /></div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {bundle.layups.map((l) => {
          const plies = pliesByLayup.get(l.id) ?? [];
          const con = constructionById.get(l.construction_id);
          return (
            <div key={l.id} className="min-w-[300px] flex-shrink-0">
              <Card flush>
                <div className="p-3">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-base font-bold admin-heading tabular-nums">{moldById.get(l.mold_id)?.name}</span>
                    <span className="text-[11px] admin-faint">mm</span>
                    {l.is_reference && <Chip tone="violet" solid className="ml-auto">REF</Chip>}
                  </div>
                  {con && <Chip tone={constructionTone(bundle, con.id)} className="mb-2">{con.name}</Chip>}
                  {plies.length === 0
                    ? <p className="text-xs admin-faint py-6 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>No plies yet</p>
                    : <PlyDiagram plies={plies} materials={bundle.materials} maxLengthCm={globalMax} />}
                </div>
              </Card>
              <Totals plies={plies} materials={bundle.materials} className="mt-2" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
