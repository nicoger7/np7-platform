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

type ExpOption = { id: string; title: string };
type FormState = {
  id: string | null; // null = create
  amount: string; recipient_name: string; recipient_email: string;
  experience_id: string; notes: string; redeem_by: string; activate: boolean;
};
const EMPTY_FORM: FormState = { id: null, amount: "", recipient_name: "", recipient_email: "", experience_id: "", notes: "", redeem_by: "", activate: true };

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [experiences, setExperiences] = useState<ExpOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<VoucherStatus | "">("");
  /* Someone rings up holding a card: "my code is NP7-…" or "it's for Anna".
     A status dropdown does not answer that, and the list only grows. */
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null); // open modal state
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/admin/vouchers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setVouchers(data.vouchers || []);
      if (Array.isArray(data.experiences)) setExperiences(data.experiences);
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

  async function saveForm() {
    if (!form) return;
    setSaving(true);
    setFormErr("");
    const isEdit = !!form.id;
    const fields = {
      amount: form.amount, recipient_name: form.recipient_name, recipient_email: form.recipient_email,
      experience_id: form.experience_id || null, notes: form.notes, redeem_by: form.redeem_by || null,
    };
    const res = await fetch(isEdit ? `/api/admin/vouchers/${form.id}` : "/api/admin/vouchers", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { action: "update", fields } : { ...fields, activate: form.activate }),
    });
    setSaving(false);
    if (res.ok) { setForm(null); fetchVouchers(); }
    else {
      const d = await res.json().catch(() => ({}));
      setFormErr(d.error || "Couldn't save the voucher.");
    }
  }

  async function remove(v: VoucherRow) {
    if (!confirm(`Delete voucher ${v.code}? This can't be undone.`)) return;
    setBusy(v.id);
    const res = await fetch(`/api/admin/vouchers/${v.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) fetchVouchers();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Couldn't delete the voucher.");
    }
  }

  function openEdit(v: VoucherRow) {
    setFormErr("");
    setForm({
      id: v.id, amount: String(v.amount ?? ""), recipient_name: v.recipient_name ?? v.recipient?.name ?? "",
      recipient_email: v.recipient_email ?? v.recipient?.email ?? "",
      experience_id: v.exp_experiences?.id ?? "", notes: (v as { notes?: string | null }).notes ?? "",
      redeem_by: v.redeem_by ?? "", activate: false,
    });
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const pendingCount = vouchers.filter((v) => v.status === "pending").length;
  const shown = vouchers.filter((v) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${v.code} ${v.recipient_name ?? ""} ${v.recipient_email ?? ""} ${v.buyer?.name ?? ""} ${v.buyer?.email ?? ""} ${v.exp_experiences?.title ?? ""}`
      .toLowerCase().includes(q);
  });

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
        <button
          onClick={() => { setFormErr(""); setForm({ ...EMPTY_FORM }); }}
          className="self-start px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
          style={{ background: "var(--admin-accent)" }}
        >
          + New voucher
        </button>
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
        <input
          className={inputClass}
          placeholder="Search code, recipient or buyer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(""); setFilterStatus(""); }}
            className="px-3 py-2 text-xs admin-muted rounded-lg transition-colors"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">{vouchers.length === 0 ? "No gift vouchers yet" : "No voucher matches that"}</p>
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
          {shown.map((v) => {
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
                  {v.status !== "redeemed" && (
                    <button
                      onClick={() => openEdit(v)}
                      disabled={busy === v.id}
                      className="text-[11px] text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                    >
                      Edit
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
                  {["pending", "cancelled", "expired"].includes(v.status) && !v.redeemed_booking_id && (
                    <button
                      onClick={() => remove(v)}
                      disabled={busy === v.id}
                      className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div
            className="w-full max-w-md rounded-xl p-5 admin-surface"
            style={{ border: "1px solid var(--admin-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold admin-heading mb-4">{form.id ? "Edit voucher" : "New voucher"}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Amount (EUR) *</label>
                <input type="number" min="1" className={`${inputClass} w-full`} value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Recipient name</label>
                  <input className={`${inputClass} w-full`} value={form.recipient_name}
                    onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Recipient email</label>
                  <input className={`${inputClass} w-full`} value={form.recipient_email}
                    onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Restricted to experience</label>
                <select className={`${inputClass} w-full`} value={form.experience_id}
                  onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                  <option value="">Any experience</option>
                  {experiences.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Use by</label>
                <input type="date" className={`${inputClass} w-full`} value={form.redeem_by}
                  onChange={(e) => setForm({ ...form, redeem_by: e.target.value })} />
                {!form.id && <p className="text-[11px] admin-faint mt-1">Empty = 1 year from activation (2 for value vouchers over €5k).</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide admin-faint mb-1">Internal notes</label>
                <textarea rows={2} className={`${inputClass} w-full`} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              {!form.id && (
                <label className="flex items-center gap-2 text-sm admin-heading">
                  <input type="checkbox" checked={form.activate}
                    onChange={(e) => setForm({ ...form, activate: e.target.checked })} />
                  Activate immediately (no bank transfer to wait for)
                </label>
              )}
              {formErr && <p className="text-sm text-red-400">{formErr}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm admin-muted">Cancel</button>
              <button onClick={saveForm} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--admin-accent)" }}>
                {saving ? "Saving…" : form.id ? "Save changes" : "Create voucher"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
