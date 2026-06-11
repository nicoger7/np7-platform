"use client";

import { useState, useEffect, useCallback } from "react";

interface LinkedComponent {
  id: string;
  component_id: string;
  quantity: number;
  exp_components: {
    id: string;
    name: string;
    category: string | null;
    unit_cost: number | null;
    sell_price: number | null;
  } | null;
}

interface ComponentOption {
  id: string;
  name: string;
  category: string | null;
  unit_cost: number | null;
  sell_price: number | null;
}

const NEW_COMPONENT_CATEGORIES = ["coaching", "accommodation", "meals", "transport", "gear", "activity", "other"];

function money(n: number | null | undefined) {
  return n != null ? `€${Number(n).toLocaleString()}` : "—";
}

/**
 * Full CRUD for a package's components: list with editable quantities,
 * attach existing components, create-and-attach new ones, remove.
 * Reused on /admin/packages and the edition Packages tab.
 */
export function PackageComponentsEditor({
  packageId,
  namePrefix,
  onChanged,
}: {
  packageId: string;
  /** e.g. "BON - " — prefilled when creating a new component */
  namePrefix?: string;
  onChanged?: () => void;
}) {
  const [links, setLinks] = useState<LinkedComponent[]>([]);
  const [options, setOptions] = useState<ComponentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [showNewComp, setShowNewComp] = useState(false);
  const [newComp, setNewComp] = useState({ name: namePrefix || "", category: "other", unit_cost: "", sell_price: "" });

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/admin/packages/${packageId}/components`).then((r) => r.json()),
      fetch(`/api/admin/components`).then((r) => r.json()),
    ]).then(([l, c]) => {
      setLinks(Array.isArray(l) ? l : []);
      setOptions(Array.isArray(c) ? c : []);
      setLoading(false);
    });
  }, [packageId]);

  useEffect(() => { load(); }, [load]);

  async function attach() {
    if (!addId) return;
    await fetch(`/api/admin/packages/${packageId}/components`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: addId, quantity: Number(addQty) || 1 }),
    });
    setAddId(""); setAddQty("1"); load(); onChanged?.();
  }

  async function detach(componentId: string) {
    await fetch(`/api/admin/packages/${packageId}/components?component_id=${componentId}`, { method: "DELETE" });
    load(); onChanged?.();
  }

  async function setQty(componentId: string, qty: number) {
    await fetch(`/api/admin/packages/${packageId}/components`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, quantity: qty }),
    });
    load(); onChanged?.();
  }

  async function createAndAttach() {
    if (!newComp.name) return;
    const res = await fetch(`/api/admin/components`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newComp.name,
        category: newComp.category,
        unit_cost: newComp.unit_cost ? Number(newComp.unit_cost) : null,
        sell_price: newComp.sell_price ? Number(newComp.sell_price) : null,
        is_global: false,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      await fetch(`/api/admin/packages/${packageId}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_id: created.id, quantity: 1 }),
      });
      setShowNewComp(false);
      setNewComp({ name: namePrefix || "", category: "other", unit_cost: "", sell_price: "" });
      load(); onChanged?.();
    }
  }

  const linkedIds = new Set(links.map((l) => l.component_id));
  const totals = links.reduce(
    (acc, l) => {
      const q = Number(l.quantity) || 1;
      acc.cost += (Number(l.exp_components?.unit_cost) || 0) * q;
      acc.sell += (Number(l.exp_components?.sell_price) || 0) * q;
      return acc;
    },
    { cost: 0, sell: 0 }
  );

  const inputClass = "px-2 py-1.5 admin-input border rounded-lg text-xs focus:outline-none focus:border-[#0aa3c7]";

  if (loading) return <div className="text-xs admin-faint py-2">Loading components…</div>;

  return (
    <div className="rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
          Components ({links.length})
        </span>
        <span className="text-[10px] admin-muted font-mono">
          cost {money(totals.cost)} · sell {money(totals.sell)} · margin{" "}
          <span className={totals.sell - totals.cost < 0 ? "text-red-400" : "text-green-400"}>
            {money(totals.sell - totals.cost)}
          </span>
        </span>
      </div>

      {links.length === 0 ? (
        <p className="text-xs admin-faint mb-2">No components linked yet.</p>
      ) : (
        <div className="space-y-1 mb-3">
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 admin-muted truncate">{l.exp_components?.name || "?"}</span>
              <span className="admin-faint font-mono w-24 text-right">
                {money(l.exp_components?.unit_cost)} / {money(l.exp_components?.sell_price)}
              </span>
              <input
                type="number"
                min={1}
                defaultValue={l.quantity}
                onBlur={(e) => {
                  const q = Number(e.target.value) || 1;
                  if (q !== l.quantity) setQty(l.component_id, q);
                }}
                className={`${inputClass} w-14 text-center`}
                title="Quantity"
              />
              <button onClick={() => detach(l.component_id)} className="admin-faint hover:text-red-400 transition-colors" title="Remove">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attach existing */}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} className={`${inputClass} flex-1`}>
          <option value="">Add existing component…</option>
          {options.filter((o) => !linkedIds.has(o.id)).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({money(o.unit_cost)}/{money(o.sell_price)})
            </option>
          ))}
        </select>
        <input type="number" min={1} value={addQty} onChange={(e) => setAddQty(e.target.value)} className={`${inputClass} w-14 text-center`} title="Qty" />
        <button onClick={attach} disabled={!addId} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">Add</button>
        <button onClick={() => setShowNewComp((v) => !v)} className="px-3 py-1.5 admin-surface admin-muted text-xs rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
          + New
        </button>
      </div>

      {/* Create & attach new component */}
      {showNewComp && (
        <div className="mt-2 flex items-center gap-2">
          <input className={`${inputClass} flex-1`} placeholder="Component name" value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} />
          <select className={inputClass} value={newComp.category} onChange={(e) => setNewComp({ ...newComp, category: e.target.value })}>
            {NEW_COMPONENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" className={`${inputClass} w-20`} placeholder="Buy €" value={newComp.unit_cost} onChange={(e) => setNewComp({ ...newComp, unit_cost: e.target.value })} />
          <input type="number" className={`${inputClass} w-20`} placeholder="Sell €" value={newComp.sell_price} onChange={(e) => setNewComp({ ...newComp, sell_price: e.target.value })} />
          <button onClick={createAndAttach} disabled={!newComp.name} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">Create</button>
        </div>
      )}
    </div>
  );
}
