"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface Loc { id: string; code: string; name: string; kind: string; is_virtual: boolean }
interface Row {
  variant_id: string; sku: string; name: string;
  product: { id: string; name: string; category: string } | null;
  levels: Record<string, { on_hand: number; reserved: number }>;
  unit_landed_cost: number | null;
}
interface Movement {
  id: string; qty: number; reason: string; note: string | null; occurred_at: string;
  unit_cost: number | null;
  hw_variants: { id: string; name: string; sku: string; hw_products: { name: string } | null } | null;
  from_loc: { code: string; name: string } | null;
  to_loc: { code: string; name: string } | null;
}

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

const REASON_COLOR: Record<string, string> = {
  po_receipt: "text-green-400", in_transit: "text-purple-400", adjustment: "text-amber-500",
  write_off: "text-red-400", sale: "text-blue-400",
};

function InventoryInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "movements" ? "movements" : "levels";

  const [locations, setLocations] = useState<Loc[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustFor, setAdjustFor] = useState<Row | null>(null);
  const [adjust, setAdjust] = useState({ location_id: "", delta: "", note: "" });

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/inventory").then((r) => r.json()),
      fetch("/api/admin/inventory/movements?limit=150").then((r) => r.json()),
    ]).then(([inv, mov]) => {
      setLocations(inv.locations ?? []);
      setRows(inv.rows ?? []);
      setMovements(Array.isArray(mov) ? mov : []);
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  function setTab(t: string) {
    router.replace(`/admin/inventory${t === "movements" ? "?tab=movements" : ""}`);
  }

  async function submitAdjust() {
    if (!adjustFor || !adjust.location_id || !adjust.delta || !adjust.note) return;
    const res = await fetch("/api/admin/inventory/adjust", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variant_id: adjustFor.variant_id, ...adjust, delta: Number(adjust.delta) }),
    });
    if (!res.ok) alert((await res.json()).error || "Adjustment failed");
    setAdjustFor(null);
    setAdjust({ location_id: "", delta: "", note: "" });
    load();
  }

  const physical = locations.filter((l) => !l.is_virtual);
  const filtered = rows.filter((r) =>
    !search ||
    r.sku.toLowerCase().includes(search.toLowerCase()) ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.product?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const totalOf = (r: Row) => physical.reduce((a, l) => a + (r.levels[l.id]?.on_hand ?? 0), 0);
  const inventoryValue = rows.reduce((a, r) => a + totalOf(r) * (r.unit_landed_cost ?? 0), 0);
  const totalUnits = rows.reduce((a, r) => a + totalOf(r), 0);
  const gridCols = `1fr ${physical.map(() => "90px").join(" ")} 80px 110px 110px 70px`;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Inventory</h1>
          <p className="text-sm admin-muted">
            {totalUnits} units on hand · €{Math.round(inventoryValue).toLocaleString()} at landed cost ·{" "}
            immutable ledger, quantities are derived
          </p>
        </div>
        <input className={`${inputClass} max-w-xs`} placeholder="Search SKU or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-2 mb-5">
        {[{ k: "levels", label: "Levels" }, { k: "movements", label: `Movements (${movements.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === t.k ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}
            style={tab === t.k ? {} : { border: "1px solid var(--admin-border)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : tab === "levels" ? (
        filtered.length === 0 ? (
          <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
            <p className="text-sm admin-faint">
              No variants yet — create them on a <Link href="/admin/products" className="text-[var(--admin-accent)] hover:underline">product</Link>,
              then stock arrives via <Link href="/admin/purchasing" className="text-[var(--admin-accent)] hover:underline">purchasing</Link>.
            </p>
          </div>
        ) : (
          <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="grid gap-3 px-5 py-3 admin-surface min-w-[720px]" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Variant</span>
              {physical.map((l) => <span key={l.id} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase text-right">{l.code}</span>)}
              {["Total", "Landed €/u", "Value €", ""].map((h, i) => (
                <span key={i} className={`text-[10px] font-bold tracking-[0.1em] admin-faint uppercase ${h ? "text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {filtered.map((r) => {
              const total = totalOf(r);
              return (
                <div key={r.variant_id}>
                  <div className="grid gap-3 px-5 py-3 min-w-[720px]" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--admin-border)" }}>
                    <span className="text-sm admin-heading self-center truncate">
                      {r.product ? `${r.product.name} · ` : ""}{r.name}
                      <span className="admin-faint text-xs ml-2 font-mono">{r.sku}</span>
                    </span>
                    {physical.map((l) => {
                      const lv = r.levels[l.id];
                      return (
                        <span key={l.id} className={`text-xs self-center text-right tabular-nums ${lv?.on_hand ? "admin-heading" : "admin-faint"}`}>
                          {lv?.on_hand ?? 0}{lv?.reserved ? <span className="admin-faint"> ({lv.reserved}r)</span> : null}
                        </span>
                      );
                    })}
                    <span className="text-xs font-bold self-center text-right tabular-nums admin-heading">{total}</span>
                    <span className="text-xs self-center text-right tabular-nums admin-muted">{r.unit_landed_cost != null ? `€${r.unit_landed_cost.toFixed(2)}` : "—"}</span>
                    <span className="text-xs self-center text-right tabular-nums admin-muted">{r.unit_landed_cost != null ? `€${Math.round(total * r.unit_landed_cost).toLocaleString()}` : "—"}</span>
                    <button onClick={() => { setAdjustFor(adjustFor?.variant_id === r.variant_id ? null : r); setAdjust({ location_id: physical[0]?.id ?? "", delta: "", note: "" }); }}
                      className="text-[10px] font-bold uppercase self-center text-[var(--admin-accent)] hover:underline">Adjust</button>
                  </div>
                  {adjustFor?.variant_id === r.variant_id && (
                    <div className="px-5 py-4 min-w-[720px]" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface-hover)" }}>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end max-w-3xl">
                        <div><label className={labelClass}>Location</label>
                          <select className={inputClass} value={adjust.location_id} onChange={(e) => setAdjust({ ...adjust, location_id: e.target.value })}>
                            {physical.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select></div>
                        <div><label className={labelClass}>± Units</label>
                          <input type="number" className={inputClass} value={adjust.delta} placeholder="-1 or 5" onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} /></div>
                        <div className="col-span-2"><label className={labelClass}>Why (required)</label>
                          <input className={inputClass} value={adjust.note} placeholder="e.g. count correction after 3PL stocktake" onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></div>
                        <button onClick={submitAdjust} disabled={!adjust.delta || !adjust.note}
                          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Book</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : movements.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No movements yet — the ledger starts with your first PO receipt.</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[130px_1fr_70px_150px_110px_1fr] gap-3 px-5 py-3 admin-surface min-w-[760px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["When", "Variant", "Qty", "From → To", "Reason", "Note"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {movements.map((m) => (
            <div key={m.id} className="grid grid-cols-[130px_1fr_70px_150px_110px_1fr] gap-3 px-5 py-2.5 min-w-[760px] text-xs" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="admin-faint self-center">{new Date(m.occurred_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="admin-heading self-center truncate">
                {m.hw_variants?.hw_products?.name} · {m.hw_variants?.name}
                <span className="admin-faint font-mono ml-2">{m.hw_variants?.sku}</span>
              </span>
              <span className="self-center tabular-nums admin-heading">{m.qty}</span>
              <span className="admin-muted self-center">{m.from_loc?.code ?? "?"} → {m.to_loc?.code ?? "?"}</span>
              <span className={`self-center ${REASON_COLOR[m.reason] ?? "admin-muted"}`}>{m.reason.replace(/_/g, " ")}</span>
              <span className="admin-faint self-center truncate">{m.note ?? (m.unit_cost != null ? `landed €${Number(m.unit_cost).toFixed(2)}/u` : "—")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm admin-faint">Loading…</div>}>
      <InventoryInner />
    </Suspense>
  );
}
