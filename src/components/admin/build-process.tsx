"use client";

import { useMemo, useRef, useState } from "react";
import { keyUrl, cdnImage } from "@/lib/img";
import {
  PD_METHODS, fmtDuration, fmtRange,
  type PdProcess, type PdProcessStep, type PdPhoto,
} from "@/lib/product-dev";

/**
 * The building process — "step by step, with photos, very organized".
 *
 * Three levels, which is what "with sub sections" needs and what a flat
 * numbered list of thirty steps cannot give you:
 *
 *   STAGE     a pd_processes row — "Stage 1: press the blade"
 *   SECTION   a free-text heading a run of consecutive steps shares —
 *             "Preparing the mold". A label on the step, not a table: it has
 *             no properties of its own and nothing ever references it.
 *   STEP      a pd_process_steps row, numbered within the stage
 *
 * Deliberately NOT a second set of tables. pd_processes and pd_process_steps
 * have modelled exactly this since migration 129 — parameters, materials,
 * critical flags, tolerances with and without numbers, photos — and had a full
 * API the whole time. They were simply never given a tab. This is that tab, and
 * it serves a board and a project from the same component.
 */

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] transition-colors";
const labelClass = "block text-[11px] font-medium admin-muted mb-1";

type Owner = { kind: "board" | "project"; id: string };

type StepDraft = Omit<PdProcessStep, "id" | "process_id" | "created_at" | "updated_at"> & { id?: string };

const EMPTY_STEP = (): StepDraft => ({
  step_no: 0, section: null, hero_photo: null, title: "", body: null, equipment: null,
  temp_c_min: null, temp_c_max: null, pressure_t_min: null, pressure_t_max: null, duration_min: null,
  params: {}, materials: [], critical: false,
  tolerance_target: null, tolerance_unit: null, tolerance_note: null,
  photos: [], source_id: null,
} as StepDraft);

export function BuildProcess({ owner, processes, steps, onChanged, readOnly = false }: {
  owner: Owner;
  processes: PdProcess[];
  steps: PdProcessStep[];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const ordered = useMemo(() => [...processes].sort((a, b) => a.stage_order - b.stage_order), [processes]);
  const [activeId, setActiveId] = useState<string | null>(ordered[0]?.id ?? null);
  const [error, setError] = useState("");
  const active = ordered.find((p) => p.id === activeId) ?? ordered[0] ?? null;

  async function addStage() {
    const name = prompt("Stage name (e.g. “Stage 1 — press the blade”)");
    if (!name) return;
    const res = await fetch("/api/admin/product-dev/processes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [owner.kind === "board" ? "board_id" : "project_id"]: owner.id,
        name, method: "prepreg_press", stage_order: ordered.length + 1,
      }),
    });
    if (res.ok) { const d = await res.json(); setActiveId(d.id); onChanged(); }
    else setError((await res.json().catch(() => ({}))).error ?? "Couldn't add that stage.");
  }

  async function removeStage(p: PdProcess) {
    if (!confirm(`Archive “${p.name}”?\n\nIts steps stay in the database and can be restored from the Archive.`)) return;
    const res = await fetch(`/api/admin/product-dev/processes/${p.id}`, { method: "DELETE" });
    if (res.ok) { setActiveId(null); onChanged(); }
  }

  if (!ordered.length) {
    return (
      <div>
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint max-w-lg mx-auto leading-relaxed mb-4">
            No building process recorded yet. A stage is one run through a machine or a bench —
            press, oven, bonding, finishing — and the steps inside it are what a person actually does,
            in order, with the photo that shows it.
          </p>
          {!readOnly && (
            <button onClick={addStage} className="px-4 py-2 text-sm font-bold rounded-lg"
              style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
              Add the first stage
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <aside>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {ordered.map((p, i) => {
            const count = steps.filter((s) => s.process_id === p.id).length;
            const on = p.id === active?.id;
            return (
              <button key={p.id} onClick={() => setActiveId(p.id)}
                className="w-full text-left px-4 py-3 transition-colors"
                style={{
                  borderBottom: i < ordered.length - 1 ? "1px solid var(--admin-border)" : undefined,
                  backgroundColor: on ? "var(--admin-surface)" : "transparent",
                  borderLeft: on ? "3px solid var(--admin-accent)" : "3px solid transparent",
                }}>
                <span className="block text-[10px] font-bold tracking-[0.08em] admin-faint uppercase">Stage {p.stage_order}</span>
                <span className="block text-sm font-semibold admin-heading truncate">{p.name}</span>
                <span className="block text-[11px] admin-faint">
                  {p.method.replace(/_/g, " ")} · {count} step{count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
        {!readOnly && (
          <button onClick={addStage} className="mt-2 w-full px-3 py-2 text-xs font-semibold admin-muted rounded-lg"
            style={{ border: "1px solid var(--admin-border)" }}>
            + Stage
          </button>
        )}
      </aside>

      {active && (
        <StageEditor key={active.id} process={active}
          steps={steps.filter((s) => s.process_id === active.id).sort((a, b) => a.step_no - b.step_no)}
          onChanged={onChanged} onRemove={() => removeStage(active)} readOnly={readOnly} />
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── One stage ───────────────────────────────────────────────────────────────

function StageEditor({ process, steps, onChanged, onRemove, readOnly }: {
  process: PdProcess; steps: PdProcessStep[]; onChanged: () => void; onRemove: () => void; readOnly: boolean;
}) {
  const [header, setHeader] = useState({ name: process.name, method: process.method, summary: process.summary ?? "", stage_order: process.stage_order });
  const [draft, setDraft] = useState<StepDraft[]>(() => steps.map((s) => ({ ...s })));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<number | null>(steps.length ? 0 : null);

  function patchStep(i: number, patch: Partial<StepDraft>) {
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next); setDirty(true);
    setOpen(open === i ? j : open === j ? i : open);
  }
  function addStep(afterIndex?: number) {
    const at = afterIndex == null ? draft.length : afterIndex + 1;
    // A new step inherits the section above it, because that is what "add a
    // step here" means nine times out of ten.
    const section = at > 0 ? draft[at - 1]?.section ?? null : null;
    const next = [...draft];
    next.splice(at, 0, { ...EMPTY_STEP(), section });
    setDraft(next); setDirty(true); setOpen(at);
  }
  function removeStep(i: number) {
    if (draft[i].title && !confirm(`Delete step “${draft[i].title}”?`)) return;
    setDraft(draft.filter((_, j) => j !== i)); setDirty(true); setOpen(null);
  }

  async function saveHeader() {
    const res = await fetch(`/api/admin/product-dev/processes/${process.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...header, summary: header.summary || null }),
    });
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? "Couldn't save the stage."); return false; }
    return true;
  }

  async function save() {
    const untitled = draft.findIndex((s) => !s.title.trim());
    if (untitled >= 0) { setMsg(`Step ${untitled + 1} needs a title.`); setOpen(untitled); return; }
    setSaving(true); setMsg("");
    if (!(await saveHeader())) { setSaving(false); return; }
    const res = await fetch(`/api/admin/product-dev/processes/${process.id}/steps`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: draft.map((s, i) => ({ ...s, step_no: i + 1 })) }),
    });
    setSaving(false);
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error ?? "Save failed — your changes are NOT stored."); return; }
    setDirty(false); setMsg("Saved."); onChanged();
    setTimeout(() => setMsg(""), 2000);
  }

  // Steps carry their sub-heading; consecutive steps sharing one are drawn
  // under a single heading rather than repeating it.
  const grouped: { section: string | null; from: number; steps: StepDraft[] }[] = [];
  draft.forEach((s, i) => {
    const last = grouped[grouped.length - 1];
    if (last && last.section === (s.section || null)) last.steps.push(s);
    else grouped.push({ section: s.section || null, from: i, steps: [s] });
  });

  return (
    <div>
      <div className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_90px] gap-3 mb-3">
          <div>
            <label className={labelClass}>Stage</label>
            <input className={inputClass} value={header.name} disabled={readOnly}
              onChange={(e) => { setHeader({ ...header, name: e.target.value }); setDirty(true); }} />
          </div>
          <div>
            <label className={labelClass}>Method</label>
            <select className={inputClass} value={header.method} disabled={readOnly}
              onChange={(e) => { setHeader({ ...header, method: e.target.value as PdProcess["method"] }); setDirty(true); }}>
              {PD_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Order</label>
            <input type="number" className={inputClass} value={header.stage_order} disabled={readOnly}
              onChange={(e) => { setHeader({ ...header, stage_order: Number(e.target.value) }); setDirty(true); }} />
          </div>
        </div>
        <div>
          <label className={labelClass}>What this stage is</label>
          <textarea className={`${inputClass} min-h-[60px]`} value={header.summary} disabled={readOnly}
            placeholder="One or two sentences — the thing somebody needs to know before they start."
            onChange={(e) => { setHeader({ ...header, summary: e.target.value }); setDirty(true); }} />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-bold admin-heading">
          {draft.length} step{draft.length === 1 ? "" : "s"}
        </h3>
        {!readOnly && (
          <button onClick={() => addStep()} className="px-3 py-1.5 text-xs font-semibold admin-muted rounded-lg"
            style={{ border: "1px solid var(--admin-border)" }}>+ Step</button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className={`text-xs ${msg === "Saved." ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
          {!readOnly && (
            <button onClick={save} disabled={!dirty || saving}
              className="px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40"
              style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
              {saving ? "Saving…" : dirty ? "Save stage" : "Saved"}
            </button>
          )}
        </div>
      </div>

      {grouped.map((g, gi) => (
        <div key={gi} className="mb-4">
          {!readOnly ? (
            <input
              className="w-full px-0 py-1 mb-1.5 bg-transparent text-[11px] font-bold tracking-[0.12em] uppercase admin-faint focus:outline-none focus:text-[var(--admin-accent)]"
              value={g.section ?? ""} placeholder="+ sub-section heading (optional)"
              onChange={(e) => {
                // Renaming a heading renames it for every step under it.
                const v = e.target.value || null;
                setDraft((d) => d.map((s, i) => (i >= g.from && i < g.from + g.steps.length ? { ...s, section: v } : s)));
                setDirty(true);
              }} />
          ) : g.section ? (
            <h4 className="text-[11px] font-bold tracking-[0.12em] uppercase admin-faint mb-1.5">{g.section}</h4>
          ) : null}

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
            {g.steps.map((s, k) => {
              const i = g.from + k;
              return (
                <StepRow key={i} step={s} index={i} open={open === i} readOnly={readOnly}
                  onToggle={() => setOpen(open === i ? null : i)}
                  onChange={(patch) => patchStep(i, patch)}
                  onMove={(dir) => move(i, dir)}
                  onRemove={() => removeStep(i)}
                  onAddAfter={() => addStep(i)}
                  last={i === draft.length - 1} first={i === 0} />
              );
            })}
          </div>
        </div>
      ))}

      {!readOnly && (
        <button onClick={onRemove} className="mt-4 text-xs text-red-400 hover:underline">Archive this stage</button>
      )}
    </div>
  );
}

// ─── One step ────────────────────────────────────────────────────────────────

function StepRow({ step, index, open, onToggle, onChange, onMove, onRemove, onAddAfter, first, last, readOnly }: {
  step: StepDraft; index: number; open: boolean; onToggle: () => void;
  onChange: (patch: Partial<StepDraft>) => void;
  onMove: (dir: -1 | 1) => void; onRemove: () => void; onAddAfter: () => void;
  first: boolean; last: boolean; readOnly: boolean;
}) {
  const params = [
    fmtRange(step.pressure_t_min, step.pressure_t_max, "t"),
    fmtRange(step.temp_c_min, step.temp_c_max, "°C"),
    fmtDuration(step.duration_min),
  ].filter(Boolean) as string[];

  return (
    <div style={{ borderBottom: "1px solid var(--admin-border)" }}>
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer group" onClick={onToggle}>
        <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{
            backgroundColor: step.critical ? "#ef4444" : "var(--admin-surface)",
            color: step.critical ? "#fff" : "var(--admin-text-muted)",
            border: "1px solid var(--admin-border)",
          }}>
          {index + 1}
        </span>
        {step.hero_photo && (
          <img src={cdnImage(keyUrl(step.hero_photo), { width: 160 })} alt=""
            className="w-14 h-14 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold admin-heading truncate">{step.title || <span className="admin-faint">Untitled step</span>}</p>
          <p className="text-[11px] admin-faint truncate">
            {params.length ? params.join(" · ") : step.equipment || "—"}
            {step.photos.length ? ` · ${step.photos.length} photo${step.photos.length === 1 ? "" : "s"}` : ""}
            {step.tolerance_note || step.tolerance_target != null ? " · tolerance" : ""}
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onMove(-1)} disabled={first} title="Move up" className="text-xs admin-faint hover:admin-heading disabled:opacity-20 px-1">↑</button>
            <button onClick={() => onMove(1)} disabled={last} title="Move down" className="text-xs admin-faint hover:admin-heading disabled:opacity-20 px-1">↓</button>
            <button onClick={onAddAfter} title="Add a step after this one" className="text-xs admin-faint hover:text-[var(--admin-accent)] px-1">+</button>
            <button onClick={onRemove} title="Delete" className="text-xs admin-faint hover:text-red-400 px-1">✕</button>
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4" style={{ backgroundColor: "var(--admin-surface)" }}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3 mb-3">
            <div>
              <label className={labelClass}>What to do</label>
              <input className={inputClass} value={step.title} disabled={readOnly} autoFocus
                placeholder="e.g. Lay ply 1 on the lower mold half, nose to the pin"
                onChange={(e) => onChange({ title: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Equipment</label>
              <input className={inputClass} value={step.equipment ?? ""} disabled={readOnly}
                placeholder="press, oven, jig…" onChange={(e) => onChange({ equipment: e.target.value || null })} />
            </div>
          </div>

          <div className="mb-3">
            <label className={labelClass}>Detail</label>
            <textarea className={`${inputClass} min-h-[80px]`} value={step.body ?? ""} disabled={readOnly}
              placeholder="The wording the person doing it needs. Keep a supplier's own words verbatim."
              onChange={(e) => onChange({ body: e.target.value || null })} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
            <Num label="Pressure min (t)" value={step.pressure_t_min} readOnly={readOnly} onChange={(v) => onChange({ pressure_t_min: v })} />
            <Num label="max" value={step.pressure_t_max} readOnly={readOnly} onChange={(v) => onChange({ pressure_t_max: v })} />
            <Num label="Temp min (°C)" value={step.temp_c_min} readOnly={readOnly} onChange={(v) => onChange({ temp_c_min: v })} />
            <Num label="max" value={step.temp_c_max} readOnly={readOnly} onChange={(v) => onChange({ temp_c_max: v })} />
            <Num label="Duration (min)" value={step.duration_min} readOnly={readOnly} onChange={(v) => onChange({ duration_min: v })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[110px_90px_1fr] gap-3 mb-3">
            <Num label="Tolerance" value={step.tolerance_target} readOnly={readOnly} onChange={(v) => onChange({ tolerance_target: v })} />
            <div>
              <label className={labelClass}>Unit</label>
              <input className={inputClass} value={step.tolerance_unit ?? ""} disabled={readOnly}
                placeholder="mm" onChange={(e) => onChange({ tolerance_unit: e.target.value || null })} />
            </div>
            <div>
              {/* Always available, and the one that is usually filled: "keep the
                  fore-and-aft position of the blade" is a real tolerance with
                  no number, and must not be demoted to prose for lacking one. */}
              <label className={labelClass}>Tolerance in words</label>
              <input className={inputClass} value={step.tolerance_note ?? ""} disabled={readOnly}
                placeholder="e.g. keep the fore-and-aft position of the blade"
                onChange={(e) => onChange({ tolerance_note: e.target.value || null })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs admin-muted mb-3 cursor-pointer">
            <input type="checkbox" checked={step.critical} disabled={readOnly}
              onChange={(e) => onChange({ critical: e.target.checked })} />
            Critical — getting this wrong scraps the part
          </label>

          <StepPhotos step={step} readOnly={readOnly} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange, readOnly }: { label: string; value: number | null; onChange: (v: number | null) => void; readOnly: boolean }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input type="number" step="any" className={inputClass} value={value ?? ""} disabled={readOnly}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    </div>
  );
}

// ─── Photos on a step ────────────────────────────────────────────────────────

function StepPhotos({ step, onChange, readOnly }: {
  step: StepDraft; onChange: (patch: Partial<StepDraft>) => void; readOnly: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError("");
    const added: PdPhoto[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "product-dev/process");
      const res = await fetch("/api/admin/product-dev/media", { method: "POST", body: fd });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Upload failed for ${file.name}.`); break; }
      const { path } = await res.json();
      added.push({ key: path, caption: null });
    }
    setBusy(false);
    if (added.length) {
      const photos = [...step.photos, ...added];
      onChange({ photos, hero_photo: step.hero_photo ?? added[0].key });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <label className={`${labelClass} mb-0`}>Photos</label>
        {!readOnly && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => upload(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="text-[11px] font-semibold admin-muted px-2 py-1 rounded disabled:opacity-40"
              style={{ border: "1px solid var(--admin-border)" }}>
              {busy ? "Uploading…" : "+ Add"}
            </button>
          </>
        )}
        {step.photos.length > 1 && <span className="text-[10px] admin-faint">click a photo to make it the one shown in the list</span>}
      </div>

      {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}

      {step.photos.length === 0 ? (
        <p className="text-[11px] admin-faint">No photo on this step.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {step.photos.map((p) => {
            const hero = step.hero_photo === p.key;
            return (
              <div key={p.key} className="relative group">
                <img src={cdnImage(keyUrl(p.key), { width: 400 })} alt={p.caption ?? ""}
                  onClick={() => !readOnly && onChange({ hero_photo: p.key })}
                  className="w-24 h-24 rounded-lg object-cover cursor-pointer"
                  style={{ border: hero ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border)" }} />
                {hero && (
                  <span className="absolute top-1 left-1 text-[9px] font-bold px-1 rounded"
                    style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>MAIN</span>
                )}
                {!readOnly && (
                  <button
                    onClick={() => {
                      const photos = step.photos.filter((x) => x.key !== p.key);
                      onChange({ photos, hero_photo: hero ? (photos[0]?.key ?? null) : step.hero_photo });
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: "var(--admin-bg)", border: "1px solid var(--admin-border)" }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
