"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ContactPicker } from "@/components/contact-picker";
import { type DocumentType, formatMoney } from "@/lib/invoices/types";
import { normalizeBookingStatus } from "@/lib/types";
import { effectiveAddonStatus } from "@/lib/addons";
import { describePrice } from "@/lib/pricing";
import { reconcileBooking, suggestInvoices, type ReconInvoice, type ReconPayment } from "@/lib/reconcile";
import { computePaymentPlan, type MilestoneKind } from "@/lib/payments";

interface BookingDetail {
  id: string;
  name: string;
  experience_id: string | null;
  package_id: string | null;
  contact_id: string | null;
  status: string;
  fly_in: string | null;
  fly_out: string | null;
  traveling_with: string | null;
  wa_group: boolean;
  agreed_price: number | null;
  deposit_invoice_sent: boolean;
  deposit_received: boolean;
  downpayment_invoice_sent: boolean;
  downpayment_received: boolean;
  final_invoice_sent: boolean;
  final_invoice_due: string | null;
  final_payment_received: boolean;
  notes: string | null;
  created_at: string;
  contacts: { name: string; email: string; phone: string; country: string; level: string; tshirt_size: string; diet_allergies: string } | null;
  exp_experiences: { title: string; slug: string; date_start: string; date_end: string } | null;
  exp_editions: { year: number | null; date_start: string | null; date_end: string | null; deposit: number | null } | null;
  exp_packages: { name: string; price: number; deposit: number | null; downpayment_percent: number | null; final_days_before: number | null; deposit_refund_days: number | null } | null;
  payments: Payment[];
  addons: Addon[];
  hotel_rooms: HotelRoom[];
}

interface Payment {
  id: string;
  amount: number;
  type: string;
  direction: string | null;
  status: string | null;
  method: string | null;
  reference: string | null;
  received_at: string | null;
  notes: string | null;
  document_id: string | null;
}

interface Addon {
  id: string;
  label: string;
  price: number | null;
  notes: string | null;
  component_id: string | null;
  status: string | null;
  source: string | null;
  exp_components: { id: string; name: string; category: string; unit_cost: number } | null;
}

interface HotelRoom {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
}

interface BookingDocument {
  id: string;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string;
  status: "issued" | "void";
  issued_at: string;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  signedUrl: string | null;
}

interface AvailableComponent {
  id: string;
  name: string;
  category: string;
  unit_cost: number | null;
}

interface AvailableExperience {
  id: string;
  title: string;
}

interface AvailablePackage {
  id: string;
  name: string;
  price: number | null;
}

const STATUSES = [
  { value: "lead", label: "Lead", color: "bg-gray-500" },
  { value: "reserved", label: "Reserved", color: "bg-amber-500" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { value: "paid", label: "Fully paid", color: "bg-green-600" },
  { value: "attended", label: "Attended", color: "bg-gray-400" },
  { value: "lost", label: "Lost", color: "bg-red-500" },
];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BookingDetailPane({ bookingId, onBack }: { bookingId: string; onBack?: () => void }) {
  const id = bookingId;
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"details" | "payments" | "addons" | "rooms" | "documents">("details");
  // Back target — honour ?from= (e.g. opened from a member) so "back" returns to
  // where you came from, not always the Bookings list.
  const [backHref, setBackHref] = useState("/admin/bookings");
  // Deep-link to a tab, e.g. /admin/bookings/:id?tab=addons (from the dashboard).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tab");
    if (t === "addons" || t === "payments" || t === "rooms" || t === "documents") setTab(t);
    const from = sp.get("from");
    if (from) setBackHref(from);
  }, []);

  // Documents tab state
  const [documents, setDocuments] = useState<BookingDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<DocumentType | null>(null);

  // Reference data
  const [experiences, setExperiences] = useState<AvailableExperience[]>([]);
  const [packages, setPackages] = useState<AvailablePackage[]>([]);
  const [components, setComponents] = useState<AvailableComponent[]>([]);

  // New add-on form
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [addonForm, setAddonForm] = useState({ component_id: "", label: "", price: "", notes: "" });

  // New payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", type: "downpayment", direction: "revenue", status: "paid", method: "", reference: "", notes: "", document_id: "" });

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/bookings/${id}`).then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/components").then((r) => r.json()),
    ]).then(([b, exps, comps]) => {
      setBooking(b);
      fetchDocuments(); // also needed by the Payments tab to reconcile
      const expList = exps.experiences || exps || [];
      setExperiences(expList.map((e: Record<string, string>) => ({ id: e.id, title: e.title })));
      setComponents(comps || []);
      // Load packages for the booking's experience
      if (b.experience_id) {
        fetch(`/api/admin/packages?experience_id=${b.experience_id}`)
          .then((r) => r.json())
          .then((pkgs) => setPackages(pkgs || []));
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function update(field: string, value: unknown) {
    setBooking((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function fetchDocuments() {
    setDocsLoading(true);
    const res = await fetch(`/api/admin/bookings/${id}/documents`);
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents || []);
    }
    setDocsLoading(false);
  }

  async function generateDocument(type: DocumentType) {
    setGenerating(type);
    setGenError(null);
    const res = await fetch(`/api/admin/bookings/${id}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      await fetchDocuments();
    } else {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      setGenError(err.error || err.message || "Generation failed");
    }
    setGenerating(null);
  }

  async function voidDocument(docId: string) {
    if (!confirm("Void this document?")) return;
    setGenError(null);
    const res = await fetch(`/api/admin/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void" }),
    });
    if (res.ok) fetchDocuments();
    else {
      const j = await res.json().catch(() => ({}));
      setGenError(j.error || "Couldn't void this document.");
    }
  }

  async function handleSave() {
    if (!booking) return;
    setSaving(true);
    await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: booking.name,
        experience_id: booking.experience_id,
        package_id: booking.package_id,
        contact_id: booking.contact_id,
        status: booking.status,
        fly_in: booking.fly_in,
        fly_out: booking.fly_out,
        traveling_with: booking.traveling_with,
        wa_group: booking.wa_group,
        agreed_price: booking.agreed_price,
        deposit_invoice_sent: booking.deposit_invoice_sent,
        deposit_received: booking.deposit_received,
        downpayment_invoice_sent: booking.downpayment_invoice_sent,
        downpayment_received: booking.downpayment_received,
        final_invoice_sent: booking.final_invoice_sent,
        final_invoice_due: booking.final_invoice_due,
        final_payment_received: booking.final_payment_received,
        notes: booking.notes,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this booking? This cannot be undone.")) return;
    await fetch(`/api/admin/bookings/${id}`, { method: "DELETE" });
    router.push("/admin/bookings");
  }

  async function handleConfirmCancellation() {
    if (!confirm("Confirm this cancellation? The booking is set to Lost and the member gets a cancellation email. (Refunds/credits are handled separately.)")) return;
    const res = await fetch(`/api/admin/bookings/${id}/cancel`, { method: "POST" });
    if (res.ok) { setBooking((prev) => (prev ? { ...prev, status: "lost" } : prev)); alert("Cancellation confirmed — the member has been emailed."); }
    else { const j = await res.json().catch(() => ({})); alert(j.error || "Could not confirm the cancellation."); }
  }

  async function handleExperienceChange(expId: string) {
    update("experience_id", expId || null);
    update("package_id", null);
    if (expId) {
      const pkgs = await fetch(`/api/admin/packages?experience_id=${expId}`).then((r) => r.json());
      setPackages(pkgs || []);
    } else {
      setPackages([]);
    }
  }

  async function addAddon() {
    const body = {
      component_id: addonForm.component_id || null,
      label: addonForm.label || (components.find((c) => c.id === addonForm.component_id)?.name || "Add-on"),
      price: addonForm.price ? Number(addonForm.price) : null,
      notes: addonForm.notes || null,
    };
    const res = await fetch(`/api/admin/bookings/${id}/addons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const addon = await res.json();
      setBooking((prev) => prev ? { ...prev, addons: [...prev.addons, addon] } : prev);
      setShowAddonForm(false);
      setAddonForm({ component_id: "", label: "", price: "", notes: "" });
    }
  }

  async function removeAddon(addonId: string) {
    await fetch(`/api/admin/bookings/${id}/addons?addon_id=${addonId}`, { method: "DELETE" });
    setBooking((prev) => prev ? { ...prev, addons: prev.addons.filter((a) => a.id !== addonId) } : prev);
  }

  async function confirmAddon(addonId: string, complimentary = false) {
    const res = await fetch(`/api/admin/bookings/${id}/addons`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addon_id: addonId, status: "confirmed", complimentary }),
    });
    if (res.ok) {
      setBooking((prev) => prev ? { ...prev, addons: prev.addons.map((a) => a.id === addonId ? { ...a, status: "confirmed", price: complimentary ? 0 : a.price } : a) } : prev);
    }
  }

  async function sendInvoice(docId: string) {
    setGenError(null);
    const res = await fetch(`/api/admin/documents/${docId}/send`, { method: "POST" });
    if (res.ok) { await fetchDocuments(); }
    else { const e = await res.json().catch(() => ({})); setGenError(e.error || "Couldn't send the invoice."); }
  }

  async function sendShortfallReminder() {
    const res = await fetch(`/api/admin/bookings/${id}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remind_shortfall" }),
    });
    const d = await res.json().catch(() => ({}));
    alert(res.ok ? "Reminder emailed to the customer." : (d.error || "Couldn't send the reminder."));
  }

  async function acceptShort() {
    const note = window.prompt("Accept what's been paid as the full price?\n\nThe agreed price drops to the amount received and the booking reads as settled. Add a short note for the record:");
    if (note === null) return;
    const res = await fetch(`/api/admin/bookings/${id}/settle`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept_short", note }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setBooking((prev) => prev ? { ...prev, agreed_price: d.agreed_price } : prev); }
    else alert(d.error || "Couldn't accept the short payment.");
  }

  async function addPayment() {
    const body = {
      amount: Number(paymentForm.amount),
      type: paymentForm.type,
      direction: paymentForm.direction || "revenue",
      status: paymentForm.status || "paid",
      method: paymentForm.method || null,
      reference: paymentForm.reference || null,
      received_at: new Date().toISOString(),
      notes: paymentForm.notes || null,
      document_id: paymentForm.document_id || null,
    };
    const res = await fetch(`/api/admin/bookings/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { payment } = await res.json();
      setBooking((prev) => prev ? { ...prev, payments: [...prev.payments, payment] } : prev);
      setShowPaymentForm(false);
      setPaymentForm({ amount: "", type: "downpayment", direction: "revenue", status: "paid", method: "", reference: "", notes: "", document_id: "" });
    }
  }

  // Load documents when tab activates
  useEffect(() => {
    if (tab === "documents") fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (loading) return <div className="text-sm admin-faint">Loading...</div>;
  if (!booking) return <div className="text-sm text-red-400">Booking not found</div>;

  const totalPaid = booking.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const outstanding = booking.agreed_price ? Math.max(0, Number(booking.agreed_price) - totalPaid) : 0;
  // Custom-price vs the package list (+ confirmed add-ons): discount / match / "as discussed".
  const confirmedAddonsTotal = booking.addons
    .filter((a) => effectiveAddonStatus(a) === "confirmed")
    .reduce((s, a) => s + (Number(a.price) || 0), 0);
  const priceLabel = describePrice({
    agreedPrice: booking.agreed_price,
    packagePrice: booking.exp_packages?.price ?? null,
    addonsTotal: confirmedAddonsTotal,
  });
  const statusInfo = STATUSES.find((s) => s.value === normalizeBookingStatus(booking.status));

  // ── Reconciliation: tie payments to invoices, derive balances ──
  const bookingTotal = (Number(booking.agreed_price) || 0) + confirmedAddonsTotal;
  const reconInvoices: ReconInvoice[] = documents
    .filter((d) => (d.type || "").includes("invoice"))
    .map((d) => ({
      id: d.id, type: d.type, invoice_number: d.invoice_number, amount: d.amount,
      currency: d.currency, status: d.status, sent_at: d.sent_at, due_date: d.due_date, issued_at: d.issued_at,
    }));
  const reconPayments: ReconPayment[] = booking.payments.map((p) => ({
    id: p.id, amount: p.amount, type: p.type, direction: p.direction, status: p.status,
    reference: p.reference, method: p.method, received_at: p.received_at, document_id: p.document_id,
  }));
  const recon = reconcileBooking({ total: bookingTotal, invoices: reconInvoices, payments: reconPayments });
  // Open invoices ranked for the amount/reference currently in the payment form.
  const matchSuggestions = suggestInvoices(
    { amount: Number(paymentForm.amount) || 0, reference: paymentForm.reference },
    recon.invoices,
  );
  const invoiceLabel = (docId: string | null) => {
    if (!docId) return null;
    const d = documents.find((x) => x.id === docId);
    return d?.invoice_number || (d?.type || "").replace(/_/g, " ") || null;
  };

  // ── Derived payment status (replaces the manual checkboxes) ──
  // The plan tells us which milestones exist (deposit collapses to nothing when
  // there's no deposit) and whether each is covered, by the SAME logic the member
  // sees. We then blend in invoices (issued/sent) and the legacy flags so old
  // bookings that were only ticked don't suddenly read as unpaid.
  const paymentPlan = computePaymentPlan(
    {
      deposit: booking.exp_editions?.deposit ?? booking.exp_packages?.deposit ?? null,
      downpayment_percent: booking.exp_packages?.downpayment_percent ?? null,
      final_days_before: booking.exp_packages?.final_days_before ?? null,
      deposit_refund_days: booking.exp_packages?.deposit_refund_days ?? null,
    },
    { total: bookingTotal, paidAmount: recon.paidTotal, editionStart: booking.exp_editions?.date_start ?? null },
  );
  const DOC_FOR: Record<MilestoneKind, string> = { deposit: "deposit_invoice", downpayment: "downpayment_invoice", final: "final_invoice" };
  const LEGACY_SENT: Record<MilestoneKind, boolean> = { deposit: !!booking.deposit_invoice_sent, downpayment: !!booking.downpayment_invoice_sent, final: !!booking.final_invoice_sent };
  const LEGACY_PAID: Record<MilestoneKind, boolean> = { deposit: !!booking.deposit_received, downpayment: !!booking.downpayment_received, final: !!booking.final_payment_received };
  const paymentStages = paymentPlan.map((m) => {
    const ir = recon.invoices.find((i) => (i.invoice.type || "") === DOC_FOR[m.kind]);
    const paid = m.status === "paid" || LEGACY_PAID[m.kind] || ir?.state === "paid";
    const invoiceSent = !!ir?.sent || LEGACY_SENT[m.kind];
    const invoiceIssued = !!ir;
    const partialLeft = ir && ir.state === "partial" ? ir.remaining : 0;
    return { kind: m.kind, label: m.label, amount: m.amount, paid, invoiceIssued, invoiceSent, partialLeft };
  });

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";
  const checkboxClass = "flex items-center gap-2 text-sm admin-muted cursor-pointer select-none";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => (onBack ? onBack() : router.push(backHref))} className="admin-faint transition-colors" aria-label="Back">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold admin-heading">{booking.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${statusInfo?.color || "bg-gray-500"}`} />
                <span className="admin-muted">{statusInfo?.label || booking.status}</span>
              </span>
              {booking.exp_experiences && (
                <span className="text-xs admin-faint">• {booking.exp_experiences.title}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Financial summary */}
          <div className="text-right mr-4">
            <div className="text-xs admin-faint">
              Agreed: <span className="admin-muted font-medium">{booking.agreed_price ? `€${Number(booking.agreed_price).toLocaleString()}` : "—"}</span>
              {priceLabel.kind === "discount" && (
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 align-middle" title={`List €${priceLabel.list.toLocaleString()}`}>{priceLabel.percentOff}% off</span>
              )}
              {priceLabel.kind === "as_discussed" && (
                <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 align-middle" title={`List €${priceLabel.list.toLocaleString()} — agreed is higher`}>as discussed</span>
              )}
            </div>
            <div className="text-xs admin-faint">
              Paid: <span className="text-green-400 font-medium">€{totalPaid.toLocaleString()}</span>
              {outstanding > 0 && (
                <span className="text-amber-400 ml-2">Owed: €{outstanding.toLocaleString()}</span>
              )}
            </div>
          </div>
          {booking.status !== "lost" && (
            <button onClick={handleConfirmCancellation} className="px-3 py-2 text-xs text-amber-500/80 hover:text-amber-400 transition-colors">
              Confirm cancellation
            </button>
          )}
          <button onClick={handleDelete} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors">
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {(["details", "payments", "addons", "rooms", "documents"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
              tab === t ? "admin-heading border-[var(--admin-accent)]" : "admin-muted border-transparent"
            }`}
          >
            {t === "addons" ? `Add-ons (${booking.addons.length})` : t === "payments" ? `Payments (${booking.payments.length})` : t === "rooms" ? `Rooms (${booking.hotel_rooms.length})` : t === "documents" ? `Documents (${documents.length})` : t}
          </button>
        ))}
      </div>

      {/* ─── Details Tab ─── */}
      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/* Name */}
          <div>
            <label className={labelClass}>Booking name</label>
            <input className={inputClass} value={booking.name} onChange={(e) => update("name", e.target.value)} />
          </div>

          {/* Status */}
          <div>
            <label className={labelClass}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => update("status", s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    normalizeBookingStatus(booking.status) === s.value
                      ? "bg-[var(--admin-accent)]/20 text-[#0aa3c7] border border-[var(--admin-accent)]/30"
                      : "admin-surface admin-faint border"
                  }`}
                  style={{ borderColor: normalizeBookingStatus(booking.status) !== s.value ? "var(--admin-border)" : undefined }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Experience & Package */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Experience</label>
              <select className={inputClass} value={booking.experience_id || ""} onChange={(e) => handleExperienceChange(e.target.value)}>
                <option value="">None</option>
                {experiences.map((exp) => (
                  <option key={exp.id} value={exp.id}>{exp.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Package</label>
              <select className={inputClass} value={booking.package_id || ""} onChange={(e) => update("package_id", e.target.value || null)}>
                <option value="">None</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}{pkg.price ? ` (€${pkg.price})` : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className={labelClass}>Contact</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <ContactPicker
                  value={booking.contact_id}
                  display={booking.contacts && booking.contact_id ? { id: booking.contact_id, name: booking.contacts.name, email: booking.contacts.email } : null}
                  onChange={(cid) => update("contact_id", cid)}
                />
              </div>
              {booking.contact_id && (
                <Link
                  href={`/admin/contacts/${booking.contact_id}`}
                  className="px-3 py-2.5 admin-surface admin-muted text-xs rounded-lg transition-colors flex items-center"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  Edit →
                </Link>
              )}
            </div>
          </div>

          {/* Contact info card */}
          {booking.contacts && (
            <div className="p-4 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="text-xs font-bold admin-faint uppercase tracking-wider mb-2">Contact info</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><span className="admin-faint">Email:</span> <span className="admin-muted">{booking.contacts.email || "—"}</span></div>
                <div><span className="admin-faint">Phone:</span> <span className="admin-muted">{booking.contacts.phone || "—"}</span></div>
                <div><span className="admin-faint">Country:</span> <span className="admin-muted">{booking.contacts.country || "—"}</span></div>
                <div><span className="admin-faint">Level:</span> <span className="admin-muted">{booking.contacts.level || "—"}</span></div>
                <div><span className="admin-faint">T-shirt:</span> <span className="admin-muted">{booking.contacts.tshirt_size || "—"}</span></div>
                <div><span className="admin-faint">Diet:</span> <span className="admin-muted">{booking.contacts.diet_allergies || "—"}</span></div>
              </div>
            </div>
          )}

          {/* Pricing */}
          <div>
            <label className={labelClass}>Agreed price (€)</label>
            <input
              type="number"
              className={`${inputClass} max-w-xs`}
              value={booking.agreed_price || ""}
              onChange={(e) => update("agreed_price", e.target.value ? Number(e.target.value) : null)}
            />
          </div>

          {/* Computed: total paid + outstanding */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg p-3 bg-[var(--admin-accent)]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Total Paid
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]">Auto</span>
              </label>
              <input
                className={`${inputClass} opacity-70 cursor-default`}
                value={totalPaid > 0 ? `€${totalPaid.toLocaleString()}` : "€0"}
                readOnly
              />
            </div>
            <div className="rounded-lg p-3 bg-[var(--admin-accent)]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Outstanding
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]">Auto</span>
              </label>
              <input
                className={`${inputClass} opacity-70 cursor-default ${outstanding > 0 ? "text-amber-400" : "text-green-400"}`}
                value={outstanding > 0 ? `€${outstanding.toLocaleString()} owed` : booking.agreed_price ? "✓ Fully paid" : "—"}
                readOnly
              />
            </div>
          </div>

          {/* Travel */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fly in</label>
              <input type="date" className={inputClass} value={booking.fly_in || ""} onChange={(e) => update("fly_in", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Fly out</label>
              <input type="date" className={inputClass} value={booking.fly_out || ""} onChange={(e) => update("fly_out", e.target.value || null)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Traveling with</label>
            <input className={inputClass} value={booking.traveling_with || ""} onChange={(e) => update("traveling_with", e.target.value || null)} placeholder="Partner, friend, etc." />
          </div>

          {/* Payment status — derived from invoices + payments (no manual ticks) */}
          <div>
            <label className={labelClass}>Payment status</label>
            <div className="rounded-xl admin-tablecard mt-1 overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {paymentStages.length === 0 ? (
                <div className="px-4 py-3 text-xs admin-faint">No payment plan yet — set the agreed price.</div>
              ) : (
                paymentStages.map((s, i) => {
                  const tone = s.paid ? "bg-green-500/15 text-green-400" : s.partialLeft > 0 ? "bg-amber-500/15 text-amber-400" : s.invoiceSent ? "bg-blue-500/15 text-blue-400" : "bg-gray-500/15 text-gray-400";
                  const statusText = s.paid ? "Paid" : s.partialLeft > 0 ? `Part-paid · €${s.partialLeft.toLocaleString()} left` : s.invoiceSent ? "Invoice sent" : s.invoiceIssued ? "Invoice ready" : "Not invoiced";
                  return (
                    <div key={s.kind} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={i < paymentStages.length - 1 ? { borderBottom: "1px solid var(--admin-border)" } : undefined}>
                      <span className="admin-heading flex-1 truncate">{s.label}</span>
                      <span className="text-xs admin-faint">€{s.amount.toLocaleString()}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone}`}>{statusText}</span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[11px] admin-faint mt-1.5">Derived from invoices &amp; payments — record a payment (Payments tab) to update it. Deposit confirms automatically once Stripe is connected.</p>
          </div>

          {/* WhatsApp — the one manual flag */}
          <div>
            <label className={checkboxClass}>
              <input type="checkbox" checked={booking.wa_group} onChange={(e) => update("wa_group", e.target.checked)} className="accent-[#0aa3c7]" />
              Added to WhatsApp group
            </label>
          </div>

          <div>
            <label className={labelClass}>Final invoice due</label>
            <input className={`${inputClass} max-w-xs`} value={booking.final_invoice_due || ""} onChange={(e) => update("final_invoice_due", e.target.value || null)} placeholder="e.g. 2 weeks before trip" />
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} min-h-[100px] resize-y`}
              value={booking.notes || ""}
              onChange={(e) => update("notes", e.target.value || null)}
              placeholder="Internal notes..."
            />
          </div>
        </div>
      )}

      {/* ─── Payments Tab ─── */}
      {tab === "payments" && (
        <div className="max-w-[800px]">
          {/* Balance summary — derived from invoices + payments */}
          <div className="rounded-xl admin-surface mb-4 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ border: "1px solid var(--admin-border)" }}>
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Trip total</div>
              <div className="text-base font-semibold admin-heading">€{recon.total.toLocaleString()}</div>
              {confirmedAddonsTotal > 0 && <div className="text-[10px] admin-faint">incl. €{confirmedAddonsTotal.toLocaleString()} add-ons</div>}
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Received</div>
              <div className="text-base font-semibold text-green-400">€{recon.paidTotal.toLocaleString()}</div>
              {recon.unallocatedTotal > 0.01 && <div className="text-[10px] text-amber-400">€{recon.unallocatedTotal.toLocaleString()} unassigned</div>}
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Balance</div>
              <div className={`text-base font-semibold ${recon.balance > 0.01 ? "text-amber-400" : "text-green-400"}`}>
                {recon.balance > 0.01 ? `€${recon.balance.toLocaleString()}` : "✓ Settled"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">Next due</div>
              <div className="text-sm font-medium admin-heading capitalize">{recon.nextDue ? `${(recon.nextDue.invoice.type || "").replace(/_/g, " ").replace(" invoice", "")} · €${recon.nextDue.remaining.toLocaleString()}` : "—"}</div>
            </div>
          </div>

          {/* Shortfall actions — only when something's still owed */}
          {recon.balance > 0.01 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={sendShortfallReminder} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface hover:opacity-80 transition-opacity" style={{ border: "1px solid var(--admin-border)" }}>
                Send reminder · €{recon.balance.toLocaleString()} left
              </button>
              <button onClick={acceptShort} title="Accept what's been paid as the full price" className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface hover:opacity-80 transition-opacity" style={{ border: "1px solid var(--admin-border)" }}>
                Accept as settled
              </button>
            </div>
          )}

          {/* Invoices with their reconciliation state */}
          {recon.invoices.length > 0 && (
            <div className="rounded-xl admin-tablecard mb-4" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="px-5 py-2.5 admin-surface text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>Invoices</div>
              {recon.invoices.map((ir) => {
                const tone = ir.state === "paid" ? "bg-green-500/15 text-green-400" : ir.state === "partial" ? "bg-amber-500/15 text-amber-400" : ir.state === "overpaid" ? "bg-blue-500/15 text-blue-400" : "bg-gray-500/15 text-gray-400";
                return (
                  <div key={ir.invoice.id} className="flex items-center gap-3 px-5 py-2.5 text-sm" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <span className="font-mono text-xs admin-heading shrink-0">{ir.invoice.invoice_number || "—"}</span>
                    <span className="text-xs admin-muted capitalize flex-1 truncate">{(ir.invoice.type || "").replace(/_/g, " ")}{ir.sent ? "" : " · not sent"}</span>
                    <span className="text-xs admin-faint">€{ir.paid.toLocaleString()} / €{ir.invoiced.toLocaleString()}</span>
                    {ir.remaining > 0.01 && <span className="text-xs text-amber-400">€{ir.remaining.toLocaleString()} left</span>}
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone}`}>{ir.state}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <div className="text-xs admin-faint">Record a bank transfer, card payment or refund — and tie it to an invoice.</div>
            <button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
            >
              Record Payment
            </button>
          </div>

          {showPaymentForm && (
            <div className="mb-4 p-4 rounded-xl admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Amount (€) *</label>
                  <input className={inputClass} type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}>
                    <option value="downpayment">Downpayment</option>
                    <option value="final">Final</option>
                    <option value="partial">Partial</option>
                    <option value="refund">Refund</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Direction</label>
                  <select className={inputClass} value={paymentForm.direction} onChange={(e) => setPaymentForm({ ...paymentForm, direction: e.target.value })}>
                    <option value="revenue">Revenue</option>
                    <option value="cost">Cost</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select className={inputClass} value={paymentForm.status} onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Method</label>
                  <input className={inputClass} value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} placeholder="Bank, PayPal..." />
                </div>
                <div>
                  <label className={labelClass}>Reference</label>
                  <input className={inputClass} value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Invoice #" />
                </div>
              </div>
              {recon.invoices.length > 0 && (
                <div className="mb-3">
                  <label className={labelClass}>Apply to invoice</label>
                  <select className={inputClass} value={paymentForm.document_id} onChange={(e) => setPaymentForm({ ...paymentForm, document_id: e.target.value })}>
                    <option value="">— Not assigned —</option>
                    {recon.invoices.filter((i) => i.state !== "void").map((i) => (
                      <option key={i.invoice.id} value={i.invoice.id}>
                        {(i.invoice.invoice_number || (i.invoice.type || "").replace(/_/g, " "))} — €{i.remaining.toLocaleString()} left{i.state === "paid" ? " (paid)" : ""}
                      </option>
                    ))}
                  </select>
                  {matchSuggestions[0] && paymentForm.document_id !== matchSuggestions[0].invoice.id && (
                    <button type="button" onClick={() => setPaymentForm({ ...paymentForm, document_id: matchSuggestions[0].invoice.id })}
                      className="mt-1.5 text-[11px] text-[var(--admin-accent)] hover:underline">
                      Suggested: {matchSuggestions[0].invoice.invoice_number || (matchSuggestions[0].invoice.type || "").replace(/_/g, " ")} · {matchSuggestions[0].reason} — apply
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={addPayment} disabled={!paymentForm.amount} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">
                  Add
                </button>
                <button onClick={() => setShowPaymentForm(false)} className="px-3 py-1.5 admin-muted text-xs rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {booking.payments.length === 0 ? (
            <div className="py-12 text-center text-sm admin-faint">No payments recorded</div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[100px_84px_80px_120px_84px_1fr_80px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Amount</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Invoice</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Method</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Reference</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
              </div>
              {booking.payments.map((p) => (
                <div key={p.id} className="grid grid-cols-[100px_84px_80px_120px_84px_1fr_80px] gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className={`text-sm font-medium self-center ${p.type === "refund" || p.direction === "cost" ? "text-red-400" : "text-green-400"}`}>
                    {p.type === "refund" || p.direction === "cost" ? "-" : "+"}€{Number(p.amount).toLocaleString()}
                  </span>
                  <span className="text-xs admin-muted self-center capitalize">{p.type}</span>
                  <span className="self-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      p.status === "paid" ? "bg-green-500/15 text-green-400" :
                      p.status === "overdue" ? "bg-red-500/15 text-red-400" :
                      p.status === "cancelled" ? "bg-gray-500/15 text-gray-400" :
                      "bg-amber-500/15 text-amber-400"
                    }`}>{p.status || "pending"}</span>
                  </span>
                  <span className="text-xs self-center truncate font-mono" title={invoiceLabel(p.document_id) || ""}>
                    {invoiceLabel(p.document_id)
                      ? <span className="text-[var(--admin-accent)]">{invoiceLabel(p.document_id)}</span>
                      : <span className="admin-faint">—</span>}
                  </span>
                  <span className="text-xs admin-muted self-center">{p.method || "—"}</span>
                  <span className="text-xs admin-muted self-center">{p.reference || "—"}</span>
                  <span className="text-xs admin-muted self-center">{formatDate(p.received_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Add-ons Tab ─── */}
      {tab === "addons" && (
        <div className="max-w-[800px]">
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">Extra components beyond the package</p>
            <button
              onClick={() => setShowAddonForm(!showAddonForm)}
              className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
            >
              Add Component
            </button>
          </div>

          {showAddonForm && (
            <div className="mb-4 p-4 rounded-xl admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Component</label>
                  <select
                    className={inputClass}
                    value={addonForm.component_id}
                    onChange={(e) => {
                      const comp = components.find((c) => c.id === e.target.value);
                      setAddonForm({
                        ...addonForm,
                        component_id: e.target.value,
                        label: comp?.name || addonForm.label,
                        price: comp?.unit_cost?.toString() || addonForm.price,
                      });
                    }}
                  >
                    <option value="">Custom (no component)</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.category}){c.unit_cost ? ` — €${c.unit_cost}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Label *</label>
                  <input className={inputClass} value={addonForm.label} onChange={(e) => setAddonForm({ ...addonForm, label: e.target.value })} placeholder="Display name" />
                </div>
                <div>
                  <label className={labelClass}>Price (€)</label>
                  <input className={inputClass} type="number" step="0.01" value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addAddon} disabled={!addonForm.label && !addonForm.component_id} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">
                  Add
                </button>
                <button onClick={() => setShowAddonForm(false)} className="px-3 py-1.5 admin-muted text-xs rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {booking.addons.length === 0 ? (
            <div className="py-12 text-center text-sm admin-faint">No add-ons</div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_100px_60px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Item</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase"></span>
              </div>
              {booking.addons.map((a) => {
                const eff = effectiveAddonStatus(a);
                if (eff === "declined") return null; // "no add-ons needed" marker — not shown to the team
                const requested = eff === "requested";
                const isMember = a.source === "member" || (a.notes ?? "").startsWith("member:");
                return (
                <div key={a.id} className="grid grid-cols-[1fr_110px_90px_120px] gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium admin-heading truncate flex items-center gap-2">
                      {a.label}
                      {requested && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">Requested by member</span>}
                      {eff === "confirmed" && isMember && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">Confirmed</span>}
                    </div>
                    {a.notes && <div className="text-xs admin-faint truncate">{a.notes}</div>}
                  </div>
                  <span className="text-xs admin-muted self-center capitalize">{a.exp_components?.category || "custom"}</span>
                  <span className="text-xs admin-muted self-center">{a.price ? `€${Number(a.price).toLocaleString()}` : "—"}</span>
                  <div className="flex items-center justify-end gap-2 self-center">
                    {requested && (
                      <>
                        <button onClick={() => confirmAddon(a.id, false)} title="Adds the price to what they owe" className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 transition-colors">Confirm &amp; charge</button>
                        <button onClick={() => confirmAddon(a.id, true)} title="Include it at no extra charge (price → €0)" className="text-[11px] font-medium px-2.5 py-1 rounded-md admin-surface hover:opacity-80 transition-opacity" style={{ border: "1px solid var(--admin-border)" }}>No charge</button>
                      </>
                    )}
                    <button onClick={() => removeAddon(a.id)} className="text-xs admin-faint hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Rooms Tab ─── */}
      {tab === "rooms" && (
        <div className="max-w-[800px]">
          {booking.hotel_rooms.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm admin-faint">No hotel rooms assigned</p>
              <p className="text-xs admin-faint mt-1">Assign rooms from the Hotel Rooms page</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              {booking.hotel_rooms.map((room) => (
                <div key={room.id} className="px-5 py-3 flex items-center gap-4" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium admin-heading">{room.name}</div>
                    <div className="text-xs admin-faint">{room.hotel} • {room.room_type}</div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                    room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                    "bg-green-500/15 text-green-400"
                  }`}>
                    {room.status}
                  </span>
                  {room.check_in && (
                    <span className="text-xs admin-faint">{formatDate(room.check_in)} → {formatDate(room.check_out)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Documents Tab ─── */}
      {tab === "documents" && (
        <div className="max-w-[860px]">
          {/* Generate buttons */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-xs admin-faint">Generate:</span>
            {(["deposit_invoice", "downpayment_invoice", "final_invoice", "booking_confirmation"] as const).map((type) => (
              <button
                key={type}
                onClick={() => generateDocument(type)}
                disabled={generating === type}
                className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
              >
                {generating === type
                  ? "Generating..."
                  : type === "deposit_invoice"
                  ? "Deposit Invoice"
                  : type === "downpayment_invoice"
                  ? "Down-Payment Invoice"
                  : type === "final_invoice"
                  ? "Final Invoice"
                  : "Booking Confirmation"}
              </button>
            ))}
          </div>

          {genError && (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {genError}
            </div>
          )}

          {docsLoading ? (
            <div className="py-10 text-center text-sm admin-faint">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-sm admin-faint">No documents yet</div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div
                className="grid gap-3 px-5 py-3 admin-surface"
                style={{ gridTemplateColumns: "130px 1fr 100px 90px 64px 64px 130px", borderBottom: "1px solid var(--admin-border)" }}
              >
                {["Invoice #", "Title", "Type", "Amount", "Date", "Status", ""].map((h) => (
                  <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
                ))}
              </div>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid gap-3 px-5 py-3 transition-colors"
                  style={{ gridTemplateColumns: "130px 1fr 100px 90px 64px 64px 130px", borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-xs font-mono admin-muted self-center truncate">
                    {doc.invoice_number || "—"}
                  </span>
                  <span className="text-sm font-medium admin-heading self-center truncate">
                    {doc.title || doc.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs admin-muted self-center capitalize">
                    {doc.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium admin-heading self-center">
                    {formatMoney(doc.amount, doc.currency)}
                  </span>
                  <span className="text-xs admin-faint self-center">
                    {new Date(doc.issued_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                  <span className="self-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      doc.status === "void" ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"
                    }`}>
                      {doc.status}
                    </span>
                  </span>
                  <div className="self-center flex items-center gap-2">
                    {doc.signedUrl && (
                      <a
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                      >
                        PDF
                      </a>
                    )}
                    {doc.status !== "void" && doc.type !== "booking_confirmation" && (
                      <button
                        onClick={() => sendInvoice(doc.id)}
                        title={doc.sent_at ? `Sent ${new Date(doc.sent_at).toLocaleDateString("en-GB")}` : "Email this invoice to the customer"}
                        className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                      >
                        {doc.sent_at ? "Resend" : "Send"}
                      </button>
                    )}
                    {doc.status !== "void" && (
                      <button
                        onClick={() => voidDocument(doc.id)}
                        className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The /admin/bookings/[id] route — renders the pane full-page for deep links.
// The Bookings list renders the same pane inline (split view) via ?id=.
export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BookingDetailPane bookingId={id} />;
}
