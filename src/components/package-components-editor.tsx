"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface LinkedComponent {
  id: string;
  component_id: string;
  quantity: number;
  /** Shown in the website's "What's included" list (text = the component's Website text). */
  show_on_website?: boolean;
  exp_components: {
    id: string;
    name: string;
    category: string | null;
    unit_cost: number | null;
    sell_price: number | null;
    description?: string | null;
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

/** Shared grid: name | cost | sell | margin | qty | remove */
const COMP_GRID = "minmax(0,1fr) 92px 92px 92px 44px 80px 28px";

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
  experienceId,
  editionId,
  sellPrice,
  onChanged,
  onCostSynced,
}: {
  packageId: string;
  /** Restrict the picker to this experience's components (+ global + unscoped) */
  experienceId?: string | null;
  /** Narrow further to this edition's components (+ experience-wide + global) */
  editionId?: string | null;
  /** The package's current (manual) sell price — to show override status + a one-click sync. */
  sellPrice?: number | null;
  onChanged?: () => void;
  /** Fired after the buy total auto-syncs into the package's cost/person. */
  onCostSynced?: (n: number) => void;
}) {
  const [links, setLinks] = useState<LinkedComponent[]>([]);
  const [options, setOptions] = useState<ComponentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showNewComp, setShowNewComp] = useState(false);
  const [newComp, setNewComp] = useState({ name: "", category: "other", unit_cost: "", sell_price: "" });
  const pickerRef = useRef<HTMLDivElement>(null);
  // "Copy from another package" (duplicate a whole component set)
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPkgs, setCopyPkgs] = useState<{ id: string; name: string; edition?: { label: string | null; year: number | null } | null }[]>([]);
  const [copyBusy, setCopyBusy] = useState(false);

  const load = useCallback(async (): Promise<LinkedComponent[]> => {
    const params = new URLSearchParams();
    if (experienceId) params.set("experience_id", experienceId);
    if (editionId) params.set("edition_id", editionId);
    const compsUrl = `/api/admin/components${params.toString() ? `?${params}` : ""}`;
    const [l, c] = await Promise.all([
      fetch(`/api/admin/packages/${packageId}/components`).then((r) => r.json()),
      fetch(compsUrl).then((r) => r.json()),
    ]);
    const list: LinkedComponent[] = Array.isArray(l) ? l : [];
    setLinks(list);
    setOptions(Array.isArray(c) ? c : []);
    setLoading(false);
    return list;
  }, [packageId, experienceId, editionId]);

  // The components ARE the cost basis — whenever they change, the buy total is
  // written straight into the package's cost/person (no manual copying).
  const syncCost = useCallback(async (list: LinkedComponent[]) => {
    const buy = Math.round(list.reduce((a, l) => a + (Number(l.exp_components?.unit_cost) || 0) * (Number(l.quantity) || 1), 0) * 100) / 100;
    await fetch(`/api/admin/packages/${packageId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cost_per_person: buy }),
    }).catch(() => {});
    onCostSynced?.(buy);
  }, [packageId, onCostSynced]);

  useEffect(() => { load(); }, [load]);

  // close the picker dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); }
    if (pickerOpen) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  async function attachOne(componentId: string) {
    await fetch(`/api/admin/packages/${packageId}/components`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, quantity: 1 }),
    });
    setSearch(""); setPickerOpen(false);
    syncCost(await load()); onChanged?.();
  }

  /** Pull the candidate packages to copy a component set from (same experience). */
  async function openCopy() {
    setCopyOpen((v) => !v);
    if (copyPkgs.length === 0 && experienceId) {
      const r = await fetch(`/api/admin/packages?experience_id=${experienceId}`).then((x) => x.json()).catch(() => []);
      setCopyPkgs((Array.isArray(r) ? r : []).filter((p: { id: string }) => p.id !== packageId));
    }
  }

  /** Copy every component (with quantities) from another package into this one. */
  async function copyFrom(srcId: string) {
    setCopyBusy(true);
    const src = await fetch(`/api/admin/packages/${srcId}/components`).then((r) => r.json()).catch(() => []);
    const linkedIds = new Set(links.map((l) => l.component_id));
    for (const l of (Array.isArray(src) ? src : [])) {
      if (linkedIds.has(l.component_id)) continue; // don't double-add
      await fetch(`/api/admin/packages/${packageId}/components`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_id: l.component_id, quantity: l.quantity || 1 }),
      });
    }
    setCopyBusy(false); setCopyOpen(false);
    syncCost(await load()); onChanged?.();
  }

  async function detach(componentId: string) {
    await fetch(`/api/admin/packages/${packageId}/components?component_id=${componentId}`, { method: "DELETE" });
    syncCost(await load()); onChanged?.();
  }

  async function setWeb(componentId: string, on: boolean) {
    await fetch(`/api/admin/packages/${packageId}/components`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, show_on_website: on }),
    });
    load(); onChanged?.();
  }

  async function setQty(componentId: string, qty: number) {
    await fetch(`/api/admin/packages/${packageId}/components`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, quantity: qty }),
    });
    syncCost(await load()); onChanged?.();
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
        experience_id: experienceId || null,
        edition_id: editionId || null,
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
      setNewComp({ name: "", category: "other", unit_cost: "", sell_price: "" });
      syncCost(await load()); onChanged?.();
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

  const computedBuy = Math.round(totals.cost * 100) / 100;
  const computedSell = Math.round(totals.sell * 100) / 100;
  const computedMargin = Math.round((totals.sell - totals.cost) * 100) / 100;
  const priceMatches = sellPrice != null && Math.abs(Number(sellPrice) - computedSell) < 0.005;

  /** Set the package's sell price to the components total (the manual override). */
  async function applyComputedPrice() {
    await fetch(`/api/admin/packages/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: computedSell }),
    });
    onChanged?.();
  }

  const inputClass = "px-2 py-1.5 admin-input border rounded-lg text-xs focus:outline-none focus:border-[#0aa3c7]";

  if (loading) return <div className="text-xs admin-faint py-2">Loading components…</div>;

  return (
    <div className="rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">
          Components ({links.length})
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs admin-muted tabular-nums">
            buy <span className="admin-heading font-semibold" title="Auto-synced into the package\u2019s Cost/person on every change">{money(computedBuy)}</span> · sell <span className="admin-heading font-semibold">{money(computedSell)}</span> · margin{" "}
            <span className={`font-semibold ${computedMargin < 0 ? "text-red-400" : "text-green-500"}`}>{money(computedMargin)}</span>
          </span>
          {links.length > 0 && (priceMatches ? (
            <span className="text-[10px] font-semibold text-green-400/90 whitespace-nowrap">price = components ✓</span>
          ) : (
            <button
              onClick={applyComputedPrice}
              title={sellPrice != null ? `Package price is ${money(sellPrice)} — click to set it to the components total` : "Set the package price to the components total"}
              className="px-2 py-1 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-[10px] font-bold rounded-md transition-colors whitespace-nowrap"
            >
              Set price → {money(computedSell)}
            </button>
          ))}
        </div>
      </div>
      {sellPrice != null && !priceMatches && links.length > 0 && (
        <p className="text-[10px] admin-faint mb-2">
          Sell price is a <strong>manual override</strong> ({money(sellPrice)}). Components add up to {money(computedSell)}.
        </p>
      )}

      {/* Add a component — searchable picker, on top of the list */}
      <div className="flex items-stretch gap-2 mb-3">
        <div ref={pickerRef} className="relative flex-1">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 admin-faint pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Search components to add…"
              className="w-full h-9 pl-9 pr-3 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7]"
            />
          </div>
          {pickerOpen && (() => {
            const q = search.trim().toLowerCase();
            const avail = options.filter((o) => !linkedIds.has(o.id) && (!q || `${o.name} ${o.category ?? ""}`.toLowerCase().includes(q)));
            return (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-[280px] overflow-y-auto rounded-xl py-1" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                {avail.length === 0 ? (
                  <p className="px-3 py-3 text-xs admin-faint">{options.length === 0 ? "No components for this experience yet." : "No matches — try “+ New” to create one."}</p>
                ) : avail.map((o) => (
                  <button key={o.id} onClick={() => attachOne(o.id)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--admin-surface-hover)] transition-colors">
                    <span className="min-w-0">
                      <span className="block text-sm admin-heading font-medium truncate">{o.name}</span>
                      {o.category && <span className="block text-[11px] admin-faint capitalize">{o.category}</span>}
                    </span>
                    <span className="shrink-0 text-xs admin-muted tabular-nums">{money(o.unit_cost)} / {money(o.sell_price)}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        <button onClick={() => setShowNewComp((v) => !v)} className="px-3 h-9 admin-surface admin-muted text-xs font-semibold rounded-lg transition-colors hover:admin-heading" style={{ border: "1px solid var(--admin-border)" }}>
          + New
        </button>
        <div className="relative">
          <button onClick={openCopy} className="px-3 h-9 admin-surface admin-muted text-xs font-semibold rounded-lg transition-colors hover:admin-heading whitespace-nowrap" style={{ border: "1px solid var(--admin-border)" }} title="Copy the component set from another package">
            Copy from…
          </button>
          {copyOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCopyOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-[300px] max-h-[300px] overflow-y-auto rounded-xl py-1" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>Copy components from</div>
                {copyPkgs.length === 0 ? (
                  <p className="px-3 py-3 text-xs admin-faint">No other packages in this experience.</p>
                ) : copyPkgs.map((p) => (
                  <button key={p.id} disabled={copyBusy} onClick={() => copyFrom(p.id)} className="w-full text-left px-3 py-2 text-sm admin-muted hover:admin-heading hover:bg-[var(--admin-surface-hover)] transition-colors disabled:opacity-50">
                    <span className="block truncate">{p.name}</span>
                    {p.edition && <span className="block text-[11px] admin-faint">{[p.edition.year, p.edition.label].filter(Boolean).join(" · ")}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create & attach new component */}
      {showNewComp && (
        <div className="mb-3 flex items-center gap-2">
          <input className={`${inputClass} flex-1`} placeholder="Component name" value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })} />
          <select className={inputClass} value={newComp.category} onChange={(e) => setNewComp({ ...newComp, category: e.target.value })}>
            {NEW_COMPONENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" className={`${inputClass} w-20`} placeholder="Buy €" value={newComp.unit_cost} onChange={(e) => setNewComp({ ...newComp, unit_cost: e.target.value })} />
          <input type="number" className={`${inputClass} w-20`} placeholder="Sell €" value={newComp.sell_price} onChange={(e) => setNewComp({ ...newComp, sell_price: e.target.value })} />
          <button onClick={createAndAttach} disabled={!newComp.name} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">Create</button>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-xs admin-faint mb-2">No components linked yet.</p>
      ) : (
        <div className="mb-3">
          {/* Column header */}
          <div
            className="grid items-center gap-2 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] admin-faint"
            style={{ gridTemplateColumns: COMP_GRID }}
          >
            <span>Component</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Sell</span>
            <span className="text-right">Margin</span>
            <span className="text-center" title="Show in the website's What's-included list (text = the component's Website text)">Web</span>
            <span className="text-center">Qty</span>
            <span />
          </div>
          <div className="space-y-0.5">
            {links.map((l) => {
              const cost = Number(l.exp_components?.unit_cost) || 0;
              const sell = Number(l.exp_components?.sell_price) || 0;
              const margin = sell - cost;
              return (
                <div
                  key={l.id}
                  className="grid items-center gap-2 px-2 py-2 text-sm rounded-lg transition-colors"
                  style={{ gridTemplateColumns: COMP_GRID }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="admin-heading font-medium truncate" title={l.exp_components?.name || ""}>{l.exp_components?.name || "?"}</span>
                  <span className="admin-muted text-right tabular-nums whitespace-nowrap">{money(l.exp_components?.unit_cost)}</span>
                  <span className="admin-muted text-right tabular-nums whitespace-nowrap">{money(l.exp_components?.sell_price)}</span>
                  <span className={`text-right tabular-nums whitespace-nowrap font-medium ${margin < 0 ? "text-red-400" : "text-green-500"}`}>{money(margin)}</span>
                  <label className="justify-self-center cursor-pointer" title={l.show_on_website ? `Shows on the website as: "${l.exp_components?.description || l.exp_components?.name || ""}"` : "Hidden from the website's What's-included list"}>
                    <input type="checkbox" checked={!!l.show_on_website} onChange={(e) => setWeb(l.component_id, e.target.checked)} className="w-4 h-4 accent-[#0aa3c7]" />
                  </label>
                  <input
                    type="number"
                    min={1}
                    defaultValue={l.quantity}
                    onBlur={(e) => {
                      const q = Number(e.target.value) || 1;
                      if (q !== l.quantity) setQty(l.component_id, q);
                    }}
                    className="w-full h-9 px-2 admin-input border rounded-lg text-sm font-semibold text-center tabular-nums focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7]"
                    title="Quantity"
                  />
                  <button onClick={() => detach(l.component_id)} className="admin-faint hover:text-red-400 transition-colors justify-self-center" title="Remove">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
