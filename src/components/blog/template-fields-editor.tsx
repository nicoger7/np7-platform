"use client";

import {
  type BlogTemplate,
  type TemplateField,
  type TemplateData,
  asText,
  asNumber,
  asList,
  asPairs,
  asFeatures,
  asSteps,
  asProsCons,
  fieldsForSlot,
} from "@/lib/blog-templates";

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
          />
        </div>
      );

    default:
      return null;
  }
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

function ObjRowsEditor({
  rows,
  onChange,
  titlePlaceholder,
  descPlaceholder,
  addLabel,
  numbered,
}: {
  rows: { title: string; description: string }[];
  onChange: (v: { title: string; description: string }[]) => void;
  titlePlaceholder: string;
  descPlaceholder: string;
  addLabel: string;
  numbered?: boolean;
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
