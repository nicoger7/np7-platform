"use client";

import { useState } from "react";
import type { KbField } from "@/lib/kb-config";

/**
 * One knowledge-base section, rendered from its field spec.
 *
 * The point of the whole change: a coach no longer faces a blank textarea and
 * a hint asking them to remember that a drill needs a setup, a task and a
 * success criterion. The fields ARE the structure, so a new coach can read an
 * entry and run the session tomorrow, and the assistant has somewhere exact to
 * sort a braindump into.
 *
 * Two rules show up in the markup. Fields the template does not mark public
 * carry no visibility switch at all, because releasing them is not an option
 * the product offers; the ones that do get the switch right next to the text
 * they release, never at the top of the entry where it used to imply far more
 * than it did. And `notes` is the escape hatch on every section: the structure
 * must never be the reason somebody stops writing something down.
 */

const input = "w-full admin-input border rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0aa3c7]";
const border = { borderColor: "var(--admin-border)" };

type Row = Record<string, unknown>;

function FieldInput({ f, value, onChange }: { f: KbField; value: unknown; onChange: (v: unknown) => void }) {
  if (f.kind === "longtext") {
    return <textarea defaultValue={(value as string) ?? ""} rows={3} onBlur={(e) => onChange(e.target.value)}
      placeholder={f.placeholder} className={`${input} leading-relaxed`} style={border} />;
  }
  if (f.kind === "number") {
    return <input type="number" defaultValue={value == null ? "" : String(value)}
      onBlur={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={input} style={border} />;
  }
  if (f.kind === "enum") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} className={input} style={border}>
        <option value="">not set</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    );
  }
  if (f.kind === "multi_enum") {
    const on = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {(f.options ?? []).map((o) => {
          const active = on.includes(o);
          return (
            <button key={o} type="button"
              onClick={() => onChange(active ? on.filter((x) => x !== o) : [...on, o])}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors ${active ? "text-white" : "admin-muted"}`}
              style={active ? { backgroundColor: "#0aa3c7", borderColor: "#0aa3c7" } : border}>
              {o.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    );
  }
  return <input defaultValue={(value as string) ?? ""} onBlur={(e) => onChange(e.target.value)}
    placeholder={f.placeholder} className={input} style={border} />;
}

function ListField({ f, rows, onChange }: { f: KbField; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const sub = f.fields ?? [];
  const set = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider admin-faint">
              {f.itemLabel ?? "item"} {i + 1}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="text-[11px] admin-faint hover:admin-heading disabled:opacity-30 px-1">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                className="text-[11px] admin-faint hover:admin-heading disabled:opacity-30 px-1">↓</button>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-[11px] px-1" style={{ color: "#c0392b" }}>Remove</button>
            </div>
          </div>
          <div className="space-y-2">
            {sub.map((sf) => (
              <div key={sf.key}>
                <label className="block text-[11px] font-semibold admin-muted mb-1">
                  {sf.label}{sf.required && <span style={{ color: "#b97608" }}> *</span>}
                </label>
                <FieldInput f={sf} value={r[sf.key]} onChange={(v) => set(i, sf.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, {}])}
        className="text-[12px] font-semibold" style={{ color: "#0aa3c7" }}>
        + Add {f.itemLabel ?? "item"}
      </button>
    </div>
  );
}

export function KbSectionEditor({
  fields, data, publicFields, onSave,
}: {
  fields: KbField[];
  data: Record<string, unknown>;
  publicFields: string[];
  onSave: (next: { data?: Record<string, unknown>; publicFields?: string[] }) => void;
}) {
  const [local, setLocal] = useState(data);
  const [pub, setPub] = useState(publicFields);

  const put = (key: string, value: unknown) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    onSave({ data: next });
  };
  const togglePublic = (key: string) => {
    const next = pub.includes(key) ? pub.filter((k) => k !== key) : [...pub, key];
    setPub(next);
    onSave({ publicFields: next });
  };

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-[11.5px] font-bold admin-muted">
              {f.label}{f.required && <span style={{ color: "#b97608" }}> *</span>}
            </label>
            {f.humanOnly && <span className="text-[10px] admin-faint">the assistant never writes this</span>}
            {f.public && (
              <button type="button" onClick={() => togglePublic(f.key)}
                className="ml-auto text-[10.5px] font-semibold px-2 py-0.5 rounded-full border transition-colors"
                style={pub.includes(f.key)
                  ? { backgroundColor: "#0aa3c7", borderColor: "#0aa3c7", color: "#fff" }
                  : { borderColor: "var(--admin-border)", opacity: 0.6 }}>
                {pub.includes(f.key) ? "👁 members see this" : "internal · release"}
              </button>
            )}
          </div>
          {f.help && <p className="text-[11px] admin-faint mb-1.5">{f.help}</p>}
          {f.kind === "list"
            ? <ListField f={f} rows={Array.isArray(local[f.key]) ? (local[f.key] as Row[]) : []} onChange={(rows) => put(f.key, rows)} />
            : <FieldInput f={f} value={local[f.key]} onChange={(v) => put(f.key, v)} />}
        </div>
      ))}
    </div>
  );
}
