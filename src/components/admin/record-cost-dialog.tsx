"use client";

import { useEffect, useState } from "react";
import type { BoardCategory } from "@/lib/finance/board";

/**
 * Recording what a cost really was, and pointing it at the line that predicted
 * it. Two ways in, because both happen: a bill that has just arrived, and a
 * bill already in the system that turns out to belong to this plan line.
 *
 * The date asked for is the INVOICE date. That is the one the P&L period is
 * decided by; when it was paid is a separate question and does not move the
 * number.
 */

type Vendor = { id: string; name: string };
type FreeActual = {
  id: string; description: string; incurred_on: string; amount_net: number;
  remaining: number; document_number: string | null;
};

const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export function RecordCostDialog({
  categories, entityId, year, planLine, defaultCategoryId, onClose, onDone,
}: {
  categories: BoardCategory[];
  entityId: string | null;
  year: number;
  planLine: { lineId: string | null; label: string; month: number } | null;
  defaultCategoryId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [free, setFree] = useState<FreeActual[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [description, setDescription] = useState(planLine?.label ?? "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [net, setNet] = useState("");
  const [vat, setVat] = useState("");
  const [incurredOn, setIncurredOn] = useState(() => {
    const m = planLine?.month ?? new Date().getMonth() + 1;
    return `${year}-${String(m).padStart(2, "0")}-01`;
  });
  const [dueOn, setDueOn] = useState("");

  useEffect(() => {
    void fetch("/api/admin/vendors").then((r) => r.json()).then((d) => setVendors(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (mode !== "existing") return;
    const qs = new URLSearchParams({ year: String(year), unallocated: "1" });
    if (entityId) qs.set("entity", entityId);
    void fetch(`/api/admin/finance/actuals?${qs}`).then((r) => r.json()).then((d) => setFree(Array.isArray(d) ? d : []));
  }, [mode, year, entityId]);

  async function createCost() {
    if (!description.trim()) { setErr("What was this cost for?"); return; }
    if (!net.trim()) { setErr("How much was it, net?"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/finance/actuals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: entityId,
        description: description.trim(),
        document_number: documentNumber.trim() || null,
        vendor_id: vendorId || null,
        category_id: categoryId || null,
        amount_net: Number(net.replace(",", ".")),
        amount_vat: vat.trim() ? Number(vat.replace(",", ".")) : null,
        incurred_on: incurredOn,
        due_on: dueOn || null,
        plan_line_id: planLine?.lineId ?? null,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error ?? "Could not record the cost."); return; }
    if (data.attachWarning) { setErr(`Cost saved, but not attached: ${data.attachWarning}`); return; }
    onDone();
  }

  async function attach(actualId: string) {
    if (!planLine?.lineId) { setErr("This month has no planned line yet. Plan an amount first, then attach."); return; }
    setSaving(true);
    const res = await fetch("/api/admin/finance/allocations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_id: actualId, plan_line_id: planLine.lineId }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Could not attach."); return; }
    onDone();
  }

  const target = planLine
    ? `${planLine.label} · ${new Date(year, planLine.month - 1).toLocaleString("en-GB", { month: "long" })} ${year}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="admin-card border rounded-xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold admin-heading mb-1">Record a cost</h2>
        {target ? (
          <p className="text-xs admin-muted mb-4">Against <span className="admin-heading font-semibold">{target}</span></p>
        ) : (
          <p className="text-xs admin-muted mb-4">Not attached to a plan line. It will show up as unplanned.</p>
        )}

        {planLine && (
          <div className="flex gap-1 mb-4 p-1 rounded-lg admin-input border w-fit">
            {(["new", "existing"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(null); }}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        mode === m ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"
                      }`}>
                {m === "new" ? "New invoice" : "Already recorded"}
              </button>
            ))}
          </div>
        )}

        {mode === "new" ? (
          <>
            <label className="block text-xs font-semibold admin-muted mb-1">What was it for</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} autoFocus
                   className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3" />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">Supplier</label>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}
                        className="w-full admin-input border rounded-lg px-3 py-2 text-sm">
                  <option value="">Not set</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">Invoice number</label>
                <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)}
                       className="w-full admin-input border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <label className="block text-xs font-semibold admin-muted mb-1">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full admin-input border rounded-lg px-3 py-2 text-sm mb-3">
              <option value="">Not set</option>
              {categories.filter((c) => c.kind === "cost").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">Net</label>
                <input value={net} onChange={(e) => setNet(e.target.value)} inputMode="decimal" placeholder="8340"
                       className="w-full admin-input border rounded-lg px-3 py-2 text-sm tabular-nums" />
              </div>
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">VAT</label>
                <input value={vat} onChange={(e) => setVat(e.target.value)} inputMode="decimal" placeholder="optional"
                       className="w-full admin-input border rounded-lg px-3 py-2 text-sm tabular-nums" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">Invoice date</label>
                <input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)}
                       className="w-full admin-input border rounded-lg px-3 py-2 text-sm" />
                <p className="text-[10px] admin-faint mt-1">Decides the P&amp;L month, not the payment date.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold admin-muted mb-1">Due</label>
                <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)}
                       className="w-full admin-input border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border admin-input">Cancel</button>
              <button onClick={createCost} disabled={saving}
                      className="px-4 py-2 text-sm font-bold rounded-lg admin-btn-primary disabled:opacity-50">
                {saving ? "Saving…" : planLine?.lineId ? "Record and attach" : "Record"}
              </button>
            </div>
          </>
        ) : (
          <>
            {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
            {free.length === 0 ? (
              <p className="text-sm admin-muted py-6 text-center">
                Every recorded cost in {year} is already attached to something.
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--admin-input-border)" }}>
                {free.map((a) => (
                  <button key={a.id} onClick={() => attach(a.id)} disabled={saving}
                          className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-[var(--admin-accent-weak)] px-2 rounded disabled:opacity-50">
                    <span className="text-[11px] admin-faint tabular-nums w-20 shrink-0">{a.incurred_on}</span>
                    <span className="text-xs admin-heading flex-1 truncate">{a.description}</span>
                    <span className="text-xs font-semibold admin-heading tabular-nums shrink-0">{eur(a.remaining)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border admin-input">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
