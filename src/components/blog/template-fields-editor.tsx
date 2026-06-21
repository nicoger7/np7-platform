"use client";

import { useState } from "react";
import {
  type BlogTemplate,
  type TemplateField,
  type TemplateData,
  type Spot,
  type Option,
  SPOT_FIELDS,
  OPTION_FIELDS,
  WIND_DIRECTIONS,
  WIND_QUALITY_META,
  CONDITION_TYPES,
  asWindWindow,
  asConditionsAvail,
  asMatrix,
  asText,
  asNumber,
  asList,
  asPairs,
  asFeatures,
  asSteps,
  asProsCons,
  fieldsForSlot,
} from "@/lib/blog-templates";
import ImagePickerModal from "@/components/image-picker-modal";

/**
 * Renders an editor input for every field of a template, driven entirely by the
 * template config in src/lib/blog-templates.ts. Hero + facts fields render
 * compactly at the top; body fields below. Editors only need to fill blanks —
 * the public renderer turns the same data into a consistent layout.
 */
export function TemplateFieldsEditor({
  template,
  data,
  onChange,
}: {
  template: BlogTemplate;
  data: TemplateData;
  onChange: (next: TemplateData) => void;
}) {
  if (template.fields.length === 0) return null;
  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value });
  const top = [...fieldsForSlot(template, "hero"), ...fieldsForSlot(template, "facts")];
  const body = fieldsForSlot(template, "body");

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        {top.map((f) => (
          <FieldEditor key={f.key} field={f} value={data[f.key]} set={(v) => set(f.key, v)} />
        ))}
      </div>
      {body.length > 0 && (
        <div className="space-y-5 pt-1">
          {body.map((f) => (
            <FieldEditor key={f.key} field={f} value={data[f.key]} set={(v) => set(f.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

const input =
  "admin-input w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none";

function FieldLabel({ field }: { field: TemplateField }) {
  return (
    <div className="mb-1.5">
      <label className="text-[13px] font-bold admin-heading">{field.label}</label>
      {field.hint && <p className="text-[11px] admin-faint mt-0.5">{field.hint}</p>}
    </div>
  );
}

function FieldEditor({ field, value, set }: { field: TemplateField; value: unknown; set: (v: unknown) => void }) {
  switch (field.kind) {
    case "text":
      return (
        <div>
          <FieldLabel field={field} />
          <input value={asText(value)} onChange={(e) => set(e.target.value)} placeholder={field.placeholder} className={input} />
        </div>
      );

    case "textarea":
    case "callout":
      return (
        <div>
          <FieldLabel field={field} />
          <textarea value={asText(value)} onChange={(e) => set(e.target.value)} rows={field.kind === "callout" ? 2 : 4} placeholder={field.placeholder} className={`${input} resize-y`} />
        </div>
      );

    case "youtube":
      return (
        <div>
          <FieldLabel field={field} />
          <input value={asText(value)} onChange={(e) => set(e.target.value)} placeholder={field.placeholder ?? "https://youtu.be/…"} className={`${input} font-mono`} />
        </div>
      );

    case "select":
      return (
        <div>
          <FieldLabel field={field} />
          <div className="flex flex-wrap gap-1.5">
            {(field.options ?? []).map((opt) => {
              const active = asText(value) === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set(active ? "" : opt)}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                    active ? "bg-[#0aa3c7] text-white border-[#0aa3c7]" : "admin-border admin-muted hover:admin-heading"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );

    case "rating":
      return (
        <div>
          <FieldLabel field={field} />
          <RatingEditor value={asNumber(value)} onChange={set} />
        </div>
      );

    case "list":
      return (
        <div>
          <FieldLabel field={field} />
          <ListEditor items={asList(value)} onChange={set} placeholder={field.placeholder} />
        </div>
      );

    case "proscons": {
      const pc = asProsCons(value);
      return (
        <div>
          <FieldLabel field={field} />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] font-bold text-green-500 mb-1.5">Pros</div>
              <ListEditor items={pc.pros} onChange={(pros) => set({ ...pc, pros })} placeholder="A good thing" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-red-400 mb-1.5">Cons</div>
              <ListEditor items={pc.cons} onChange={(cons) => set({ ...pc, cons })} placeholder="A downside" />
            </div>
          </div>
        </div>
      );
    }

    case "pairs":
      return (
        <div>
          <FieldLabel field={field} />
          <PairsEditor pairs={asPairs(value)} onChange={set} />
        </div>
      );

    case "features":
      return (
        <div>
          <FieldLabel field={field} />
          <ObjRowsEditor
            rows={asFeatures(value)}
            onChange={set}
            titlePlaceholder="Headline"
            descPlaceholder="One or two sentences…"
            addLabel="Add point"
          />
        </div>
      );

    case "steps":
      return (
        <div>
          <FieldLabel field={field} />
          <ObjRowsEditor
            rows={asSteps(value)}
            onChange={set}
            titlePlaceholder="Step title"
            descPlaceholder="What to do…"
            addLabel="Add step"
            numbered
            withImage
          />
        </div>
      );

    case "image":
      return <ImageField field={field} value={value} set={set} />;

    case "windrose":
      return (
        <div>
          <FieldLabel field={field} />
          <WindRoseEditor value={value} set={set} />
        </div>
      );

    case "frequency":
      return (
        <div>
          <FieldLabel field={field} />
          <FrequencyEditor value={value} set={set} />
        </div>
      );

    case "spots":
      return (
        <div>
          <FieldLabel field={field} />
          <SpotsEditor spots={Array.isArray(value) ? (value as Spot[]) : []} onChange={set} />
        </div>
      );

    case "options":
      return (
        <div>
          <FieldLabel field={field} />
          <OptionsEditor options={Array.isArray(value) ? (value as Option[]) : []} onChange={set} />
        </div>
      );

    case "matrix":
      return (
        <div>
          <FieldLabel field={field} />
          <MatrixEditor value={value} set={set} />
        </div>
      );

    default:
      return null;
  }
}

function ImageField({ field, value, set }: { field: TemplateField; value: unknown; set: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const url = asText(value);
  return (
    <div>
      <FieldLabel field={field} />
      {url ? (
        <div className="relative aspect-[16/10] max-w-[280px] rounded-lg overflow-hidden admin-border border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <button type="button" onClick={() => setOpen(true)} className="px-2 py-0.5 rounded text-[11px] font-bold bg-black/60 text-white hover:bg-black/80">Change</button>
            <button type="button" onClick={() => set("")} className="px-2 py-0.5 rounded text-[11px] font-bold bg-black/60 text-white hover:bg-red-500">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="aspect-[16/10] max-w-[280px] w-full rounded-lg border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[#0aa3c7] transition-colors">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
            Choose image
          </span>
        </button>
      )}
      {open && <ImagePickerModal onSelect={(u) => { set(u); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function WindRoseEditor({ value, set }: { value: unknown; set: (v: unknown) => void }) {
  const w = asWindWindow(value);
  const setDir = (d: string, q: string) => set({ ...w, [d]: w[d as keyof typeof w] === q ? "" : q });
  return (
    <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5">
      {WIND_DIRECTIONS.map((d) => (
        <div key={d} className="flex items-center gap-2">
          <span className="w-7 text-[12px] font-bold admin-heading">{d}</span>
          <div className="flex gap-1">
            {WIND_QUALITY_META.map((q) => {
              const active = w[d] === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setDir(d, q.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${active ? "text-white border-transparent" : "admin-border admin-muted hover:admin-heading"}`}
                  style={active ? { backgroundColor: q.color } : undefined}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const FREQS = [
  { id: "often", label: "Often" },
  { id: "sometimes", label: "Sometimes" },
  { id: "never", label: "Never" },
];

function FrequencyEditor({ value, set }: { value: unknown; set: (v: unknown) => void }) {
  const c = asConditionsAvail(value);
  const setFreq = (k: string, f: string) => set({ ...c, [k]: c[k] === f ? "" : f });
  return (
    <div className="space-y-1.5">
      {CONDITION_TYPES.map((t) => (
        <div key={t.key} className="flex items-center gap-2">
          <span className="w-24 text-[12px] font-bold admin-heading">{t.label}</span>
          <div className="flex gap-1">
            {FREQS.map((f) => {
              const active = c[t.key] === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFreq(t.key, f.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${active ? "bg-[#0aa3c7] text-white border-[#0aa3c7]" : "admin-border admin-muted hover:admin-heading"}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpotsEditor({ spots, onChange }: { spots: Spot[]; onChange: (v: Spot[]) => void }) {
  const blank: Spot = { name: "", image: "", coords: "", level: "", waterType: "", windWindow: {}, conditionsAvail: {}, conditions: "", infrastructure: [] };
  const update = (i: number, key: string, val: unknown) =>
    onChange(spots.map((s, j) => (j === i ? { ...s, [key]: val } : s)));

  return (
    <div className="space-y-4">
      {spots.map((spot, i) => (
        <div key={i} className="admin-surface admin-border border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold admin-faint">Spot {i + 1}{(spot as Spot).name ? ` · ${(spot as Spot).name}` : ""}</span>
            <RowButtons
              onUp={() => onChange(move(spots, i, -1))}
              onDown={() => onChange(move(spots, i, 1))}
              onRemove={() => onChange(spots.filter((_, j) => j !== i))}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {SPOT_FIELDS.map((f) => {
              const full = f.kind === "textarea" || f.kind === "list" || f.kind === "image" || f.kind === "windrose" || f.kind === "frequency";
              return (
                <div key={f.key} className={full ? "sm:col-span-2" : ""}>
                  <FieldEditor field={f} value={(spot as Record<string, unknown>)[f.key]} set={(v) => update(i, f.key, v)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <AddButton label="Add spot" onClick={() => onChange([...spots, blank])} />
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: Option[]; onChange: (v: Option[]) => void }) {
  const blank: Option = { name: "", image: "", bestFor: "", pros: [], cons: [] };
  const update = (i: number, key: string, val: unknown) =>
    onChange(options.map((o, j) => (j === i ? { ...o, [key]: val } : o)));
  return (
    <div className="space-y-4">
      {options.map((opt, i) => (
        <div key={i} className="admin-surface admin-border border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold admin-faint">Option {i + 1}{opt.name ? ` · ${opt.name}` : ""}</span>
            <RowButtons
              onUp={() => onChange(move(options, i, -1))}
              onDown={() => onChange(move(options, i, 1))}
              onRemove={() => onChange(options.filter((_, j) => j !== i))}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {OPTION_FIELDS.map((f) => {
              const full = f.kind === "list" || f.kind === "image";
              return (
                <div key={f.key} className={full ? "sm:col-span-2" : ""}>
                  <FieldEditor field={f} value={(opt as Record<string, unknown>)[f.key]} set={(v) => update(i, f.key, v)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <AddButton label="Add option" onClick={() => onChange([...options, blank])} />
    </div>
  );
}

function MatrixEditor({ value, set }: { value: unknown; set: (v: unknown) => void }) {
  const m = asMatrix(value);
  const cols = m.columns;
  const setCols = (columns: string[]) =>
    set({ columns, rows: m.rows.map((r) => ({ ...r, values: columns.map((_, i) => r.values[i] ?? "") })) });
  const updateRow = (ri: number, patch: Partial<{ label: string; values: string[] }>) =>
    set({ ...m, rows: m.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) });
  const setCell = (ri: number, ci: number, val: string) =>
    updateRow(ri, { values: cols.map((_, i) => (i === ci ? val : m.rows[ri].values[i] ?? "")) });

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[12px] font-bold admin-heading mb-1.5">Columns (the options)</div>
        <ListEditor items={cols} onChange={setCols} placeholder="Freeride" />
      </div>
      {cols.length > 0 && (
        <div>
          <div className="text-[12px] font-bold admin-heading mb-1.5">Rows (attributes)</div>
          <div className="space-y-2">
            {m.rows.map((r, ri) => (
              <div key={ri} className="admin-surface admin-border border rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <input value={r.label} onChange={(e) => updateRow(ri, { label: e.target.value })} placeholder="Attribute (e.g. Cambers)" className={`${input} flex-1`} />
                  <IconBtn onClick={() => set({ ...m, rows: m.rows.filter((_, j) => j !== ri) })} label="Remove" danger><path d="M18 6L6 18M6 6l12 12" /></IconBtn>
                </div>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
                  {cols.map((c, ci) => (
                    <input key={ci} value={r.values[ci] ?? ""} onChange={(e) => setCell(ri, ci, e.target.value)} placeholder={c} className={`${input} !text-[12px] !px-2`} />
                  ))}
                </div>
              </div>
            ))}
            <AddButton label="Add row" onClick={() => set({ ...m, rows: [...m.rows, { label: "", values: cols.map(() => "") }] })} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- editors ---- */

function RatingEditor({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars`} className={`text-[22px] leading-none ${n <= Math.round(value) ? "text-[#ffc42e]" : "admin-faint"}`}>
            ★
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        max={5}
        step={0.1}
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)))}
        placeholder="4.5"
        className="admin-input w-20 px-3 py-1.5 rounded-md border text-sm outline-none"
      />
      <span className="text-[12px] admin-faint">/ 5</span>
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} className={input} />
          <RowButtons onUp={() => onChange(move(items, i, -1))} onDown={() => onChange(move(items, i, 1))} onRemove={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label="Add item" onClick={() => onChange([...items, ""])} />
    </div>
  );
}

function PairsEditor({ pairs, onChange }: { pairs: { label: string; value: string }[]; onChange: (v: { label: string; value: string }[]) => void }) {
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={p.label} onChange={(e) => onChange(pairs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label (e.g. Volume)" className={`${input} flex-1`} />
          <input value={p.value} onChange={(e) => onChange(pairs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="Value (e.g. 95 L)" className={`${input} flex-1`} />
          <RowButtons onUp={() => onChange(move(pairs, i, -1))} onDown={() => onChange(move(pairs, i, 1))} onRemove={() => onChange(pairs.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label="Add row" onClick={() => onChange([...pairs, { label: "", value: "" }])} />
    </div>
  );
}

type ObjRow = { title: string; description: string; image?: string };

function ObjRowsEditor({
  rows,
  onChange,
  titlePlaceholder,
  descPlaceholder,
  addLabel,
  numbered,
  withImage,
}: {
  rows: ObjRow[];
  onChange: (v: ObjRow[]) => void;
  titlePlaceholder: string;
  descPlaceholder: string;
  addLabel: string;
  numbered?: boolean;
  withImage?: boolean;
}) {
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="admin-surface admin-border border rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            {numbered && <span className="text-[11px] font-bold admin-faint w-6">{i + 1}.</span>}
            <input value={r.title} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={titlePlaceholder} className={`${input} flex-1`} />
            <RowButtons onUp={() => onChange(move(rows, i, -1))} onDown={() => onChange(move(rows, i, 1))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
          <textarea value={r.description} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} rows={2} placeholder={descPlaceholder} className={`${input} resize-y`} />
          {withImage && (
            <div className="mt-2.5">
              <ImageField
                field={{ key: "image", label: "Photo (optional)", kind: "image", slot: "body" }}
                value={r.image}
                set={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, image: asText(v) } : x)))}
              />
            </div>
          )}
        </div>
      ))}
      <AddButton label={addLabel} onClick={() => onChange([...rows, { title: "", description: "" }])} />
    </div>
  );
}

function RowButtons({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <IconBtn onClick={onUp} label="Move up"><path d="M18 15l-6-6-6 6" /></IconBtn>
      <IconBtn onClick={onDown} label="Move down"><path d="M6 9l6 6 6-6" /></IconBtn>
      <IconBtn onClick={onRemove} label="Remove" danger><path d="M18 6L6 18M6 6l12 12" /></IconBtn>
    </div>
  );
}

function IconBtn({ onClick, label, children, danger }: { onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`w-7 h-7 grid place-items-center rounded-md admin-border border admin-muted hover:admin-heading transition-colors ${danger ? "hover:text-red-400 hover:border-red-400/40" : ""}`}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0aa3c7] hover:gap-2.5 transition-all">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  );
}
