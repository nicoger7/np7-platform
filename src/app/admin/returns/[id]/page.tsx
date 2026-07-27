"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtCents, RETURN_CONDITIONS, RETURN_REASONS } from "@/lib/hardware/orders";
import { StatusBadge } from "@/components/admin/hw-status";

const RETURN_STATUS_COLOR: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-400",
  in_transit: "bg-purple-500/15 text-purple-400",
  received: "bg-purple-500/15 text-purple-400",
  resolved: "bg-green-500/15 text-green-400",
  rejected: "bg-red-500/15 text-red-400",
};

interface RetLine {
  id: string; quantity: number; reason_code: string | null; condition: string | null;
  hw_order_lines: { id: string; sku: string; title: string; variant_title: string | null; unit_price_gross: number } | null;
}
interface RetDetail {
  id: string; type: string; status: string; channel: string; declared_at: string;
  customer_message: string | null; refund_amount: number | null; deduction_amount: number;
  deduction_reason: string | null; notes: string | null; resolved_at: string | null;
  hw_orders: { id: string; display_number: number; email: string; currency: string; grand_total: number; shipping_gross: number; payment_status: string } | null;
  hw_return_lines: RetLine[];
  money: { captured: number; refunded: number; remaining: number; suggested_refund: number };
}

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

export default function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [r, setR] = useState<RetDetail | null>(null);
  const [resolve, setResolve] = useState({ refund_amount_eur: "", deduction_amount_eur: "", deduction_reason: "", restock_location: "HQ" });
  const [prefilled, setPrefilled] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/returns/${id}`).then((res) => res.json()).then((d) => {
      setR(d);
      setPrefilled((p) => {
        if (!p && d?.money) {
          setResolve((cur) => ({ ...cur, refund_amount_eur: (d.money.suggested_refund / 100).toFixed(2) }));
        }
        return true;
      });
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await fetch(`/api/admin/returns/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) alert((await res.json()).error || "Action failed");
    load();
  }

  async function setCondition(lineId: string, condition: string) {
    await fetch(`/api/admin/returns/${id}/lines/${lineId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition }),
    });
    load();
  }

  if (!r) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;

  const reasonLabel = (code: string | null) => RETURN_REASONS.find((x) => x.code === code)?.label ?? code ?? "—";
  const deduction = Math.round(Number(resolve.deduction_amount_eur || 0) * 100);
  const netRefund = Math.max(0, Math.round(Number(resolve.refund_amount_eur || 0) * 100) - deduction);

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => router.push("/admin/returns")} className="text-xs admin-faint hover:text-[var(--admin-accent)] mb-2">← Returns</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold admin-heading">Return · <Link href={`/admin/orders/${r.hw_orders?.id}`} className="font-mono hover:text-[var(--admin-accent)]">#{r.hw_orders?.display_number}</Link></h1>
            <StatusBadge value={r.status} colors={RETURN_STATUS_COLOR} />
            <span className="text-xs admin-faint capitalize">{r.type} · via {r.channel.replace(/_/g, " ")} · {new Date(r.declared_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
          </div>
          <div className="flex items-center gap-2">
            {r.status === "requested" && (
              <>
                <button onClick={() => act({ action: "approve" })}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]">Approve</button>
                <button onClick={() => { const reason = prompt("Why reject?"); if (reason !== null) act({ action: "reject", reason }); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400" style={{ border: "1px solid var(--admin-border)" }}>Reject</button>
              </>
            )}
            {["approved", "in_transit"].includes(r.status) && (
              <button onClick={() => act({ action: "mark_received" })}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]">Goods received</button>
            )}
          </div>
        </div>
        {r.customer_message && (
          <p className="text-xs admin-muted mt-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
            &ldquo;{r.customer_message}&rdquo; <span className="admin-faint">— {r.hw_orders?.email}</span>
          </p>
        )}
      </div>

      {/* Lines + inspection */}
      <div className="rounded-xl admin-tablecard overflow-x-auto mb-6" style={{ border: "1px solid var(--admin-border)" }}>
        <div className="grid grid-cols-[1fr_60px_110px_150px_190px] gap-3 px-5 py-3 admin-surface min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          {["Item", "Qty", "Value", "Customer reason", "Inspection"].map((h, i) => (
            <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
          ))}
        </div>
        {r.hw_return_lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_60px_110px_150px_190px] gap-3 px-5 py-3 min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-sm admin-heading self-center truncate">
              {l.hw_order_lines?.title}{l.hw_order_lines?.variant_title ? <span className="admin-muted"> · {l.hw_order_lines.variant_title}</span> : null}
              <span className="admin-faint text-xs ml-2 font-mono">{l.hw_order_lines?.sku}</span>
            </span>
            <span className="text-xs admin-muted self-center tabular-nums">{l.quantity}</span>
            <span className="text-xs admin-muted self-center tabular-nums">{fmtCents(l.quantity * (l.hw_order_lines?.unit_price_gross ?? 0))}</span>
            <span className="text-xs admin-faint self-center">{reasonLabel(l.reason_code)}</span>
            {r.status === "received" ? (
              <select className={`${inputClass} text-xs`} value={l.condition ?? ""} onChange={(e) => setCondition(l.id, e.target.value)}>
                <option value="">Inspect: condition…</option>
                {RETURN_CONDITIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            ) : (
              <span className="text-xs self-center admin-muted">{RETURN_CONDITIONS.find((c) => c.code === l.condition)?.label ?? "—"}</span>
            )}
          </div>
        ))}
      </div>

      {/* Money + resolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h2 className="text-sm font-bold admin-heading mb-3">Order money</h2>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="admin-muted">Order total</span><span className="admin-heading tabular-nums">{fmtCents(r.hw_orders?.grand_total ?? 0)}</span></div>
            <div className="flex justify-between"><span className="admin-muted">Captured</span><span className="admin-heading tabular-nums">{fmtCents(r.money.captured)}</span></div>
            {r.money.refunded > 0 && <div className="flex justify-between"><span className="admin-muted">Already refunded</span><span className="text-red-400 tabular-nums">−{fmtCents(r.money.refunded)}</span></div>}
            <div className="flex justify-between pt-1.5 font-bold" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <span className="admin-heading">Refundable</span><span className="admin-heading tabular-nums">{fmtCents(r.money.remaining)}</span>
            </div>
            <div className="flex justify-between"><span className="admin-muted">Returned-goods value</span><span className="admin-muted tabular-nums">{fmtCents(r.money.suggested_refund)}</span></div>
          </div>
          {r.status === "resolved" && (
            <p className="text-xs text-green-400 mt-4">
              Resolved {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""} —
              refunded {fmtCents(r.refund_amount ?? 0)}{r.deduction_amount ? `, deduction ${fmtCents(r.deduction_amount)} (${r.deduction_reason ?? "—"})` : ""}.
            </p>
          )}
        </div>

        {r.status === "received" && (
          <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <h2 className="text-sm font-bold admin-heading mb-3">Resolve</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={labelClass}>Refund €</label>
                <input type="number" step="0.01" className={inputClass} value={resolve.refund_amount_eur}
                  onChange={(e) => setResolve({ ...resolve, refund_amount_eur: e.target.value })} /></div>
              <div><label className={labelClass}>Deduction € (diminished value)</label>
                <input type="number" step="0.01" className={inputClass} value={resolve.deduction_amount_eur}
                  onChange={(e) => setResolve({ ...resolve, deduction_amount_eur: e.target.value })} /></div>
              <div className="col-span-2"><label className={labelClass}>Deduction reason (required if deducting)</label>
                <input className={inputClass} value={resolve.deduction_reason} placeholder="e.g. fin scratches from water use"
                  onChange={(e) => setResolve({ ...resolve, deduction_reason: e.target.value })} /></div>
              <div><label className={labelClass}>Restock A-stock into</label>
                <select className={inputClass} value={resolve.restock_location} onChange={(e) => setResolve({ ...resolve, restock_location: e.target.value })}>
                  <option value="HQ">Own storage (HQ)</option>
                  <option value="3PL">3PL warehouse</option>
                </select></div>
            </div>
            <p className="text-xs admin-faint mb-4 leading-relaxed">
              Pays out <b className="admin-heading">{fmtCents(netRefund)}</b> to the customer&apos;s original method.
              B-stock goes to the B-stock shelf, scrap is written off. Withdrawal refunds legally include
              outbound shipping on a full return.
            </p>
            <button
              onClick={() => act({
                action: "resolve",
                refund_amount_eur: (netRefund / 100).toFixed(2),
                deduction_amount_eur: resolve.deduction_amount_eur || 0,
                deduction_reason: resolve.deduction_reason,
                restock_location: resolve.restock_location,
              }, `Resolve this return — refund ${fmtCents(netRefund)} and restock the goods?`)}
              disabled={deduction > 0 && !resolve.deduction_reason}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              Refund &amp; restock
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
