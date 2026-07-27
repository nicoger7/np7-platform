"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RETURN_STATUSES } from "@/lib/hardware/orders";
import { StatusBadge } from "@/components/admin/hw-status";

const RETURN_STATUS_COLOR: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-400",
  in_transit: "bg-purple-500/15 text-purple-400",
  received: "bg-purple-500/15 text-purple-400",
  resolved: "bg-green-500/15 text-green-400",
  rejected: "bg-red-500/15 text-red-400",
};

interface ReturnRow {
  id: string; type: string; status: string; channel: string; declared_at: string;
  refund_amount: number | null; units: number;
  hw_orders: { id: string; display_number: number; email: string } | null;
}

export default function ReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/returns${statusFilter ? `?status=${statusFilter}` : ""}`)
      .then((r) => r.json()).then((d) => {
        setRows(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const open = rows.filter((r) => !["resolved", "rejected"].includes(r.status)).length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Returns</h1>
          <p className="text-sm admin-muted">{open} open · withdrawal (14-day) and warranty claims land here</p>
        </div>
        <select
          className="px-3 py-2 admin-input border rounded-lg text-sm max-w-[180px] focus:outline-none focus:border-[var(--admin-accent)]"
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {RETURN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No returns — may it stay that way. 🤙</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[90px_1fr_110px_110px_110px_60px_90px] gap-3 px-5 py-3 admin-surface min-w-[700px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Order", "Customer", "Type", "Channel", "Status", "Units", "Declared"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/returns/${r.id}`}
              className="grid grid-cols-[90px_1fr_110px_110px_110px_60px_90px] gap-3 px-5 py-3 min-w-[700px] transition-colors hover:bg-[var(--admin-surface-hover)]"
              style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm font-mono admin-heading self-center">#{r.hw_orders?.display_number}</span>
              <span className="text-xs admin-muted self-center truncate">{r.hw_orders?.email}</span>
              <span className="text-xs admin-muted self-center capitalize">{r.type}</span>
              <span className="text-xs admin-faint self-center">{r.channel.replace(/_/g, " ")}</span>
              <span className="self-center"><StatusBadge value={r.status} colors={RETURN_STATUS_COLOR} /></span>
              <span className="text-xs admin-muted self-center tabular-nums">{r.units}</span>
              <span className="text-xs admin-faint self-center">{new Date(r.declared_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
