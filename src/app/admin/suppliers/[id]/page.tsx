"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtAmount } from "@/lib/hardware/ops";

interface VariantOption {
  id: string; sku: string; name: string;
  hw_products: { id: string; name: string } | null;
}
interface CatalogRow {
  id: string; variant_id: string; supplier_item_code: string | null;
  unit_cost: number | null; currency: string; moq: number | null;
  order_multiple: number; lead_time_days: number | null; incoterm: string | null;
  preferential_origin: boolean;
  hw_variants: VariantOption | null;
}
interface SupplierDetail {
  id: string; name: string; country: string | null; currency: string;
  default_incoterm: string | null; default_payment_terms: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  website: string | null; notes: string | null;
  skus: CatalogRow[];
}

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [s, setS] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ variant_id: "", supplier_item_code: "", unit_cost: "", moq: "", order_multiple: "1", lead_time_days: "", preferential_origin: false });

  function load() {
    fetch(`/api/admin/suppliers/${id}`).then((r) => r.json()).then((d) => {
      setS(d);
      setForm({
        name: d.name ?? "", country: d.country ?? "", currency: d.currency ?? "USD",
        default_incoterm: d.default_incoterm ?? "", default_payment_terms: d.default_payment_terms ?? "",
        contact_name: d.contact_name ?? "", contact_email: d.contact_email ?? "",
        contact_phone: d.contact_phone ?? "", website: d.website ?? "", notes: d.notes ?? "",
      });
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch("/api/admin/variants").then((r) => r.json()).then((d) => setVariants(Array.isArray(d) ? d : []));
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/suppliers/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  async function addSku() {
    if (!addForm.variant_id) return;
    const res = await fetch(`/api/admin/suppliers/${id}/skus`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, currency: form.currency, incoterm: form.default_incoterm }),
    });
    if (res.ok) {
      setShowAdd(false);
      setAddForm({ variant_id: "", supplier_item_code: "", unit_cost: "", moq: "", order_multiple: "1", lead_time_days: "", preferential_origin: false });
      load();
    } else alert((await res.json()).error || "Could not add");
  }

  async function patchSku(skuId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/suppliers/${id}/skus/${skuId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteSku(skuId: string) {
    if (!confirm("Remove this catalog row?")) return;
    await fetch(`/api/admin/suppliers/${id}/skus/${skuId}`, { method: "DELETE" });
    load();
  }

  if (loading || !s) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;

  const offered = new Set(s.skus.map((r) => r.variant_id));

  return (
    <div>
      {/* Header-stack: back to the list, name, save */}
      <div className="mb-6">
        <button onClick={() => router.push("/admin/suppliers")} className="text-xs admin-faint hover:text-[var(--admin-accent)] mb-2">← Suppliers</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold admin-heading">{s.name}</h1>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-green-400">Saved ✓</span>}
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-xl p-5 mb-6" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2"><label className={labelClass}>Name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className={labelClass}>Country</label>
            <input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div><label className={labelClass}>Currency</label>
            <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {["USD", "EUR", "CNY", "THB", "VND"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={labelClass}>Default incoterm</label>
            <select className={inputClass} value={form.default_incoterm} onChange={(e) => setForm({ ...form, default_incoterm: e.target.value })}>
              <option value="">—</option>{["FOB", "EXW", "CIF", "DAP", "DDP"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={labelClass}>Payment terms</label>
            <input className={inputClass} value={form.default_payment_terms} onChange={(e) => setForm({ ...form, default_payment_terms: e.target.value })} placeholder="30/70 T/T" /></div>
          <div><label className={labelClass}>Contact</label>
            <input className={inputClass} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div><label className={labelClass}>Email</label>
            <input className={inputClass} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          <div><label className={labelClass}>Phone</label>
            <input className={inputClass} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          <div className="col-span-2"><label className={labelClass}>Website</label>
            <input className={inputClass} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
          <div className="col-span-2 sm:col-span-4"><label className={labelClass}>Notes</label>
            <textarea className={`${inputClass} min-h-[60px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </div>

      {/* Catalog */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold admin-heading">Catalog · {s.skus.length} SKU{s.skus.length !== 1 ? "s" : ""}</h2>
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">
          Add SKU
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-3">
            <div className="col-span-2"><label className={labelClass}>Variant *</label>
              <select className={inputClass} value={addForm.variant_id} onChange={(e) => setAddForm({ ...addForm, variant_id: e.target.value })}>
                <option value="">Pick a variant…</option>
                {variants.filter((v) => !offered.has(v.id)).map((v) => (
                  <option key={v.id} value={v.id}>{v.hw_products?.name} · {v.name} ({v.sku})</option>
                ))}
              </select></div>
            <div><label className={labelClass}>Unit cost ({form.currency})</label>
              <input type="number" className={inputClass} value={addForm.unit_cost} onChange={(e) => setAddForm({ ...addForm, unit_cost: e.target.value })} /></div>
            <div><label className={labelClass}>MOQ</label>
              <input type="number" className={inputClass} value={addForm.moq} onChange={(e) => setAddForm({ ...addForm, moq: e.target.value })} /></div>
            <div><label className={labelClass}>Lead time (days)</label>
              <input type="number" className={inputClass} value={addForm.lead_time_days} onChange={(e) => setAddForm({ ...addForm, lead_time_days: e.target.value })} /></div>
            <div><label className={labelClass}>Factory item code</label>
              <input className={inputClass} value={addForm.supplier_item_code} onChange={(e) => setAddForm({ ...addForm, supplier_item_code: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs admin-muted mb-3">
            <input type="checkbox" checked={addForm.preferential_origin} onChange={(e) => setAddForm({ ...addForm, preferential_origin: e.target.checked })} />
            Preferential origin (e.g. EVFTA — 0% EU duty)
          </label>
          <div className="flex gap-2">
            <button onClick={addSku} disabled={!addForm.variant_id}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {s.skus.length === 0 ? (
        <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No catalog yet — add the variants this factory produces, with cost, MOQ and lead time.</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_110px_90px_70px_70px_90px_40px] gap-3 px-5 py-3 admin-surface min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Variant", "Item code", "Unit cost", "MOQ", "Multiple", "Lead time", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {s.skus.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_110px_90px_70px_70px_90px_40px] gap-3 px-5 py-3 min-w-[640px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm admin-heading self-center truncate">
                {r.hw_variants?.hw_products?.name} · {r.hw_variants?.name}
                <span className="admin-faint text-xs ml-2 font-mono">{r.hw_variants?.sku}</span>
                {r.preferential_origin && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">0% duty</span>}
              </span>
              <input className={`${inputClass} text-xs`} defaultValue={r.supplier_item_code ?? ""} onBlur={(e) => e.target.value !== (r.supplier_item_code ?? "") && patchSku(r.id, { supplier_item_code: e.target.value })} />
              <input type="number" className={`${inputClass} text-xs`} defaultValue={r.unit_cost ?? ""} onBlur={(e) => Number(e.target.value) !== r.unit_cost && patchSku(r.id, { unit_cost: e.target.value })} />
              <input type="number" className={`${inputClass} text-xs`} defaultValue={r.moq ?? ""} onBlur={(e) => Number(e.target.value) !== r.moq && patchSku(r.id, { moq: e.target.value })} />
              <input type="number" className={`${inputClass} text-xs`} defaultValue={r.order_multiple} onBlur={(e) => Number(e.target.value) !== r.order_multiple && patchSku(r.id, { order_multiple: e.target.value })} />
              <input type="number" className={`${inputClass} text-xs`} defaultValue={r.lead_time_days ?? ""} onBlur={(e) => Number(e.target.value) !== r.lead_time_days && patchSku(r.id, { lead_time_days: e.target.value })} placeholder="days" />
              <button onClick={() => deleteSku(r.id)} title="Remove"
                className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs admin-faint mt-4">
        Costs shown in {form.currency} ({fmtAmount(null)} = not set). New POs for this supplier default to these terms —{" "}
        <Link href="/admin/purchasing" className="text-[var(--admin-accent)] hover:underline">Purchasing</Link>.
      </p>
    </div>
  );
}
