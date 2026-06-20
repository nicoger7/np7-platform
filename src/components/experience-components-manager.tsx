"use client";

import { useState, useEffect, useCallback } from "react";

interface Component {
  id: string;
  name: string;
  category: string | null;
  unit_cost: number | null;
  sell_price: number | null;
  is_global: boolean;
  experience_id: string | null;
}

const CATEGORIES = ["coaching", "accommodation", "meals", "transport", "gear", "activity", "other"];
const GRID = "minmax(0,1fr) 120px 92px 92px 80px 24px";

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString("de-DE")}` : "—";
}

/**
 * Manage an experience's components directly from the experience page:
 * lists components scoped to this experience (+ global / unscoped),
 * with inline price edits, create, and delete.
 */
export function ExperienceComponentsManager({
  experienceId,
  code,
}: {
  experienceId: string;
  /** experience code, e.g. "GAR" — prefilled on new components */
  code?: string | null;
}) {
  const [comps, setComps] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const prefix = code ? `${code} - ` : "";
  const emptyNew = { name: prefix, category: "other", unit_cost: "", sell_price: "" };
  const [form, setForm] = useState(emptyNew);

  const load = useCallback(() => {
    fetch(`/api/admin/components?experience_id=${experienceId}`)
      .then((r) => r.json())
      .then((d) => {
        setComps(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [experienceId]);

  useEffect(() => { load(); }, [load]);

  async function patchPrice(id: string, field: "unit_cost" | "sell_price", value: string) {
    const num = value === "" ? null : Number(value);
    await fetch(`/api/admin/components/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: num }),
    });
    load();
  }

  async function create() {
    if (!form.name.trim()) return;
    await fetch(`/api/admin/components`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        category: form.category,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
        sell_price: form.sell_price ? Number(form.sell_price) : null,
        is_global: false,
        experience_id: experienceId,
      }),
    });
    setForm(emptyNew);
    setShowNew(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this component? It will be removed from any packages using it.")) return;
    await fetch(`/api/admin/components/${id}`, { method: "DELETE" });
    load();
  }

  // This experience's own components first, then global/unscoped (shared)
  const own = comps.filter((c) => c.experience_id === experienceId);
  const shared = comps.filter((c) => c.experience_id !== experienceId);

  const inputClass = "px-2 py-1.5 admin-input border rounded-lg text-xs focus:outline-none focus:border-[#0aa3c7]";

  function Row({ c, editable }: { c: Component; editable: boolean }) {
    const margin = (Number(c.sell_price) || 0) - (Number(c.unit_cost) || 0);
    return (
      <div
        className="grid items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors"
        style={{ gridTemplateColumns: GRID }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <span className="admin-heading truncate" title={c.name}>{c.name}</span>
        <span className="admin-faint capitalize truncate">{c.category || "—"}</span>
        {editable ? (
          <>
            <input
              type="number" defaultValue={c.unit_cost ?? ""} placeholder="buy"
              onBlur={(e) => { if (e.target.value !== String(c.unit_cost ?? "")) patchPrice(c.id, "unit_cost", e.target.value); }}
              className={`${inputClass} w-full text-right tabular-nums`}
            />
            <input
              type="number" defaultValue={c.sell_price ?? ""} placeholder="sell"
              onBlur={(e) => { if (e.target.value !== String(c.sell_price ?? "")) patchPrice(c.id, "sell_price", e.target.value); }}
              className={`${inputClass} w-full text-right tabular-nums`}
            />
          </>
        ) : (
          <>
            <span className="admin-faint font-mono text-right tabular-nums">{money(c.unit_cost)}</span>
            <span className="admin-faint font-mono text-right tabular-nums">{money(c.sell_price)}</span>
          </>
        )}
        <span className={`font-mono text-right tabular-nums ${margin < 0 ? "text-red-400" : "text-green-400/80"}`}>{money(margin)}</span>
        {editable ? (
          <button onClick={() => remove(c.id)} className="admin-faint hover:text-red-400 transition-colors justify-self-center" title="Delete">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        ) : (
          <span className="justify-self-center admin-faint text-[10px]" title={c.is_global ? "Global component" : "Unscoped component"}>{c.is_global ? "★" : "·"}</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold admin-heading">Components</h3>
          <p className="text-xs admin-faint mt-0.5">Building blocks for this experience&apos;s packages. Buy/sell editable inline.</p>
        </div>
        <button onClick={() => { setForm(emptyNew); setShowNew((v) => !v); }} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">
          {showNew ? "Cancel" : "+ New component"}
        </button>
      </div>

      {showNew && (
        <div className="grid items-center gap-2 mb-3 p-2 rounded-lg" style={{ gridTemplateColumns: GRID, border: "1px solid var(--admin-border)" }}>
          <input autoFocus className={`${inputClass} w-full`} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className={`${inputClass} w-full`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" className={`${inputClass} w-full text-right`} placeholder="buy" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          <input type="number" className={`${inputClass} w-full text-right`} placeholder="sell" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
          <button onClick={create} disabled={!form.name.trim()} className="px-2 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg col-span-2">Add</button>
        </div>
      )}

      {loading ? (
        <div className="text-xs admin-faint py-3">Loading…</div>
      ) : (
        <>
          {/* Header */}
          <div className="grid items-center gap-2 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] admin-faint" style={{ gridTemplateColumns: GRID }}>
            <span>Name</span><span>Category</span><span className="text-right">Buy</span><span className="text-right">Sell</span><span className="text-right">Margin</span><span />
          </div>
          {own.length === 0 && shared.length === 0 ? (
            <p className="text-xs admin-faint py-2 px-2">No components yet — add one above.</p>
          ) : (
            <div className="space-y-px">
              {own.map((c) => <Row key={c.id} c={c} editable />)}
              {shared.length > 0 && (
                <div className="pt-2 mt-1" style={{ borderTop: "1px dashed var(--admin-border)" }}>
                  <p className="text-[10px] uppercase tracking-[0.08em] admin-faint px-2 py-1">Shared (global / unscoped)</p>
                  {shared.map((c) => <Row key={c.id} c={c} editable={false} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
