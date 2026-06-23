"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  STATUS_LABEL,
  STATUS_TONE,
  fmtVoucherMoney,
  type VoucherStatus,
} from "@/lib/vouchers";

type Joined = { id: string; name: string | null; email: string | null } | null;

interface VoucherRow {
  id: string;
  code: string;
  amount: number | null;
  currency: string | null;
  status: VoucherStatus;
  recipient_name: string | null;
  recipient_email: string | null;
  paid_at: string | null;
  issued_at: string | null;
  redeem_by: string | null;
  redeemed_booking_id: string | null;
  created_at: string;
  nico_call?: boolean | null;
  recipient_phone?: string | null;
  call_preferred_date?: string | null;
  buyer?: Joined;
  recipient?: Joined;
  exp_experiences?: { id: string; title: string } | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const TONE_CLASS: Record<"amber" | "green" | "slate", string> = {
  amber: "bg-amber-500/15 text-amber-500",
  green: "bg-green-500/15 text-green-500",
  slate: "bg-slate-500/15 text-slate-400",
};

const STATUS_FILTERS: (VoucherStatus | "")[] = ["", "pending", "active", "redeemed", "expired", "cancelled"];

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<VoucherStatus | "">("");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/admin/vouchers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setVouchers(data.vouchers || []);
    }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  async function act(id: string, action: "activate" | "cancel") {
    if (action === "cancel" && !confirm("Cancel this voucher? The buyer keeps no claim on the trip.")) return;
    if (action === "activate" && !confirm("Confirm the bank transfer landed and activate this voucher?\n\nThis starts the 1-year validity clock.")) return;
    setBusy(id);
    const res = await fetch(`/api/admin/vouchers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.ok) fetchVouchers();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Couldn't update the voucher.");
    }
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const pendingCount = vouchers.filter((v) => v.status === "pending").length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Gift Vouchers</h1>
          <p className="text-sm admin-muted mt-0.5">
            {vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""}
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-500 font-semibold">· {pendingCount} awaiting payment</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className={inputClass}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as VoucherStatus | "")}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || "all"} value={s}>{s ? STATUS_LABEL[s] : "All statuses"}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : vouchers.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No gift vouchers yet</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div
            className="grid gap-3 px-5 py-3 admin-surface"
            style={{
              gridTemplateColumns: "150px 1fr 1fr 110px 110px 110px 140px",
              borderBottom: "1px solid var(--admin-border)",
            }}
          >
            {["Code", "Experience", "Buyer → Recipient", "Amount", "Status", "Use by", ""].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {vouchers.map((v) => {
            const tone = STATUS_TONE[v.status] ?? "slate";
            const recipient = v.recipient?.name || v.recipient_name || v.recipient_email || "— (self / unclaimed)";
            return (
              <div
                key={v.id}
                className="grid gap-3 px-5 py-3 transition-colors"
                style={{
                  gridTemplateColumns: "150px 1fr 1fr 110px 110px 110px 140px",
                  borderBottom: "1px solid var(--admin-border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span className="text-xs font-mono admin-heading self-center truncate">{v.code}</span>
                <span className="text-sm admin-heading self-center truncate">
                  {v.exp_experiences?.title || "—"}
                </span>
                <div className="min-w-0 self-center">
                  <div className="text-xs admin-muted truncate">
                    {v.buyer?.name || v.buyer?.email || "—"}
                  </div>
                  <div className="text-xs admin-faint truncate">→ {recipient}</div>
                  {v.nico_call && (
                    <div className="text-[11px] font-semibold text-[#0aa3c7] truncate mt-0.5">
                      📞 Call {v.recipient_phone || "(no number)"}
                      {v.call_preferred_date ? ` · ${fmtDate(v.call_preferred_date)}` : ""}
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium admin-heading self-center">
                  {fmtVoucherMoney(v.amount, v.currency || "EUR") || "—"}
                </span>
                <span className="self-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${TONE_CLASS[tone]}`}>
                    {STATUS_LABEL[v.status]}
                  </span>
                </span>
                <span className="text-xs admin-faint self-center">{fmtDate(v.redeem_by)}</span>
                <div className="self-center flex items-center gap-2 justify-end">
                  {v.redeemed_booking_id && (
                    <Link href={`/admin/bookings/${v.redeemed_booking_id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80">
                      Booking
                    </Link>
                  )}
                  {v.status === "pending" && (
                    <button
                      onClick={() => act(v.id, "activate")}
                      disabled={busy === v.id}
                      className="px-2.5 py-1 bg-green-600 hover:bg-green-600/90 disabled:opacity-50 text-white text-[11px] font-bold rounded-md transition-colors"
                    >
                      {busy === v.id ? "…" : "Mark paid"}
                    </button>
                  )}
                  {(v.status === "pending" || v.status === "active") && (
                    <button
                      onClick={() => act(v.id, "cancel")}
                      disabled={busy === v.id}
                      className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
