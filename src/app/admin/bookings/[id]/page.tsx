"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ContactPicker } from "@/components/contact-picker";
import { SearchSelect } from "@/components/admin/search-select";
import { type DocumentType, formatMoney } from "@/lib/invoices/types";
import { parseFlightNote, sanitizeFlightInfo, type FlightInfo } from "@/lib/flights";
import { FlightEditor } from "@/components/admin/flight-editor";
import { parseAmount, formatAmount } from "@/lib/parse-amount";
import { normalizeBookingStatus } from "@/lib/types";
import { effectiveAddonStatus } from "@/lib/addons";
import { describePrice } from "@/lib/pricing";
import { reconcileBooking, suggestInvoices, type ReconInvoice, type ReconPayment } from "@/lib/reconcile";
import { computePaymentPlan, dueUrgency, type MilestoneKind } from "@/lib/payments";
import { CancelBookingModal } from "@/components/admin/cancel-booking-modal";
import { sumReceived, sumExpected, paidState } from "@/lib/payment-totals";

/**
 * Go back to where you came from — without leaving this page on the history
 * stack. `router.push(backHref)` looked right (the arrow landed on the member
 * you opened the contact from) but it ADDS an entry, so the browser's own Back
 * button then returned you straight to the contact you had just left, and you
 * were stuck in a two-page loop. Replacing the entry unwinds it properly.
 */
function goBack(router: { replace: (href: string) => void }, backHref: string) {
  router.replace(backHref);
}


// Package names carry an edition code prefix (e.g. "BON001 - Advanced – …") baked
// into the string. Inside an edition-scoped list that prefix is redundant noise,
// so strip a leading "CODE - " for display.
const cleanPackageName = (name: string) => name.replace(/^[A-Za-z0-9]+\s*[-–—]\s*/, "").trim() || name;

interface BookingDetail {
  id: string;
  name: string;
  experience_id: string | null;
  edition_id: string | null;
  package_id: string | null;
  contact_id: string | null;
  status: string;
  fly_in: string | null;
  fly_out: string | null;
  flight_info?: Record<string, unknown> | null;
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
  meta?: { checkIn?: string | null; checkOut?: string | null; nightsBefore?: number; nightsAfter?: number; nights?: number; hotelConfirmed?: boolean } | null;
  exp_components: { id: string; name: string; category: string; unit_cost: number; sell_price?: number | null; payment_mode?: string | null; payment_note?: string | null } | null;
}

interface HotelRoom {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  hotel_confirmed?: boolean;
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
  /** Waivers: a signed record, not an issued document — open it, don't act on it. */
  href?: string | null;
  readOnly?: boolean;
}

interface AvailableComponent {
  id: string;
  name: string;
  category: string;
  /** What it costs US. Never the price a guest is charged. */
  unit_cost: number | null;
  /** What we charge for it — the one to put on an add-on. */
  sell_price: number | null;
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
  const [flightsDirty, setFlightsDirty] = useState(false);
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
  // Group bookings: move a FREE amount of this booking's received money to a
  // sibling booking (mirrored alloc pair) — no fixed percentage.
  const [allocForm, setAllocForm] = useState<{ open: boolean; amount: string; toBookingId: string; busy: boolean; options: { id: string; name: string | null }[] }>({ open: false, amount: "", toBookingId: "", busy: false, options: [] });
  // Inline contact edit — Simona shouldn't get bounced to /admin/contacts just to
  // fix a phone number; edit the contact right here on the booking.
  const [contactEdit, setContactEdit] = useState(false);
  const [contactForm, setContactForm] = useState<{ name: string; email: string; phone: string; country: string; level: string; tshirt_size: string; diet_allergies: string }>({ name: "", email: "", phone: "", country: "", level: "", tshirt_size: "", diet_allergies: "" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [rowEdit, setRowEdit] = useState({ amount: "", type: "final", status: "paid", method: "", reference: "" });
  const [contactBusy, setContactBusy] = useState(false);

  useEffect(() => {
    // Resilient loads: a restricted role may get 403 on some of these — never let
    // a non-OK response (or a non-array body) crash the page into an error/404.
    const safeJson = (r: Response) => (r.ok ? r.json().catch(() => null) : null);
    Promise.all([
      fetch(`/api/admin/bookings/${id}`).then(safeJson),
      fetch("/api/admin/experiences").then(safeJson),
    ]).then(([b, exps]) => {
      setBooking(b);
      if (!b) { setLoading(false); return; } // no access / not found → graceful empty state
      fetchDocuments(); // also needed by the Payments tab to reconcile
      const expList = Array.isArray(exps?.experiences) ? exps.experiences : Array.isArray(exps) ? exps : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setExperiences(expList.map((e: any) => ({ id: e.id, title: e.title })));
      // Add-on components: only what's relevant to this booking — global + this
      // experience's components (edition-scoped when possible). Otherwise the
      // picker floods with every experience's items (e.g. Garda "GAR-" ones).
      fetch(`/api/admin/components${b.experience_id ? `?experience_id=${b.experience_id}${b.edition_id ? `&edition_id=${b.edition_id}` : ""}` : ""}`)
        .then((r) => r.json())
        .then((comps) => setComponents(Array.isArray(comps) ? comps : []));
      // Packages are stored per edition (~14 per week) — scope the picker to the
      // booking's own edition so it shows just this week's list, not every
      // edition's near-duplicate packages. Fall back to the experience if the
      // booking somehow has no edition.
      if (b.edition_id || b.experience_id) {
        fetch(`/api/admin/packages?${b.edition_id ? `edition_id=${b.edition_id}` : `experience_id=${b.experience_id}`}`)
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
        // fly_in/fly_out deliberately absent: they are mirrored from the travel
        // details by the flights endpoint below, so there is exactly one writer
        // and the guest never sees a date the admin has since changed.
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
    // Travel goes through its own endpoint — the same one the member portal
    // uses — so both sides write flight_info and mirror the dates identically.
    // Sent whenever it was touched, not only when it ends up non-empty: clearing
    // a wrong arrival has to clear the mirrored fly_in too.
    if (flightsDirty) {
      await fetch(`/api/admin/bookings/${id}/flights`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizeFlightInfo((booking.flight_info ?? {}) as Record<string, unknown>)),
      });
      setFlightsDirty(false);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this booking? This cannot be undone.")) return;
    await fetch(`/api/admin/bookings/${id}`, { method: "DELETE" });
    router.push("/admin/bookings");
  }

  async function cancelBooking(args: { initiator: "customer" | "np7"; reason: string; sendEmail: boolean }) {
    const res = await fetch(`/api/admin/bookings/${id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setBooking((prev) => (prev ? { ...prev, status: "lost" } : prev));
      setCancelOpen(false);
      alert(j.emailed ? "Booking cancelled — the customer has been emailed." : "Booking cancelled. No email was sent.");
    } else {
      alert(j.error || "Could not cancel the booking.");
    }
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

  // Selecting a package pre-fills the agreed price with the package price —
  // but a manually entered price sticks: we only overwrite when the current
  // value is empty or still equals the previously selected package's price.
  function handlePackageChange(pkgId: string | null) {
    const prevPkg = packages.find((p) => p.id === booking?.package_id);
    const nextPkg = packages.find((p) => p.id === pkgId);
    update("package_id", pkgId);
    const current = booking?.agreed_price;
    const untouched = current == null || current === 0 || (prevPkg?.price != null && Number(current) === Number(prevPkg.price));
    if (nextPkg?.price != null && untouched) {
      update("agreed_price", Number(nextPkg.price));
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
      setBooking((prev) => {
        if (!prev) return prev;
        // customer-confirm of an extra-nights add-on implies hotel-confirmed too
        const hasStay = !!(prev.addons.find((a) => a.id === addonId)?.meta?.checkIn || prev.addons.find((a) => a.id === addonId)?.meta?.checkOut);
        return {
          ...prev,
          addons: prev.addons.map((a) => a.id === addonId ? { ...a, status: "confirmed", price: complimentary ? 0 : a.price, meta: hasStay ? { ...a.meta, hotelConfirmed: true } : a.meta } : a),
          hotel_rooms: hasStay ? prev.hotel_rooms.map((r) => ({ ...r, hotel_confirmed: true })) : prev.hotel_rooms,
        };
      });
    }
  }

  // Internal "the hotel OK'd this (overlapping) stay" — never notifies the guest.
  async function hotelConfirmAddon(addonId: string, flag: boolean) {
    const res = await fetch(`/api/admin/bookings/${id}/addons`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addon_id: addonId, hotel_confirmed: flag }),
    });
    if (res.ok) {
      setBooking((prev) => prev ? {
        ...prev,
        addons: prev.addons.map((a) => a.id === addonId ? { ...a, meta: { ...a.meta, hotelConfirmed: flag } } : a),
        hotel_rooms: prev.hotel_rooms.map((r) => ({ ...r, hotel_confirmed: flag })),
      } : prev);
    }
  }

  async function hotelConfirmRoom(roomId: string, flag: boolean) {
    const res = await fetch(`/api/admin/hotel-rooms/${roomId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotel_confirmed: flag }),
    });
    if (res.ok) {
      setBooking((prev) => prev ? { ...prev, hotel_rooms: prev.hotel_rooms.map((r) => r.id === roomId ? { ...r, hotel_confirmed: flag } : r) } : prev);
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
    // Name the number. The prompt described the mechanism but never said what
    // the price would BECOME — so the one irreversible detail was the one you
    // couldn't see before agreeing to it.
    const received = Number(recon?.paidTotal ?? 0);
    const becomes = `€${received.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const note = window.prompt(
      `Accept what's been paid as the full price?\n\n`
      + `The trip price becomes ${becomes} (minus any confirmed add-ons) and the booking reads as settled.\n\n`
      + `Add a short note for the record:`);
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
    const amount = parseAmount(paymentForm.amount);
    if (amount === null || amount === 0) return;
    const body = {
      amount,
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

  async function openAllocForm() {
    if (!allocForm.open && booking?.edition_id && allocForm.options.length === 0) {
      const r = await fetch(`/api/admin/bookings?edition_id=${booking.edition_id}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const options = ((r?.bookings ?? []) as { id: string; name: string | null }[]).filter((b) => b.id !== id);
      setAllocForm((f) => ({ ...f, open: true, options }));
    } else {
      setAllocForm((f) => ({ ...f, open: !f.open }));
    }
  }

  async function submitAllocation() {
    setAllocForm((f) => ({ ...f, busy: true }));
    const res = await fetch(`/api/admin/bookings/${id}/allocate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toBookingId: allocForm.toBookingId, amount: parseAmount(allocForm.amount) ?? 0 }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const mine = (j.payments ?? []).filter((p: Payment & { booking_id?: string }) => p.booking_id === id);
      setBooking((prev) => prev ? { ...prev, payments: [...prev.payments, ...mine] } : prev);
      setAllocForm((f) => ({ ...f, open: false, busy: false, amount: "", toBookingId: "" }));
    } else {
      setAllocForm((f) => ({ ...f, busy: false }));
      alert(j.error || "Could not create the allocation.");
    }
  }

  function startContactEdit() {
    const c = booking?.contacts;
    setContactForm({
      name: c?.name ?? "", email: c?.email ?? "", phone: c?.phone ?? "", country: c?.country ?? "",
      level: c?.level ?? "", tshirt_size: c?.tshirt_size ?? "", diet_allergies: c?.diet_allergies ?? "",
    });
    setContactEdit(true);
  }
  async function saveContact() {
    if (!booking?.contact_id) return;
    setContactBusy(true);
    const res = await fetch(`/api/admin/contacts/${booking.contact_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    const j = await res.json().catch(() => ({}));
    setContactBusy(false);
    if (res.ok) {
      setBooking((prev) => prev ? { ...prev, contacts: { ...(prev.contacts ?? {} as NonNullable<typeof prev.contacts>), ...contactForm } } : prev);
      setContactEdit(false);
    } else {
      alert(j.error || "Could not save the contact.");
    }
  }

  // ── Payment row editing ───────────────────────────────────────────────────
  // A wrong row (a pending one that never arrived, a typo'd amount) used to be
  // untouchable from the booking it belongs to. Now it is fixable in place.
  async function savePaymentRow(paymentId: string) {
    const amount = parseAmount(rowEdit.amount);
    if (amount === null) { alert("Amount is not a number."); return; }
    const res = await fetch(`/api/admin/bookings/${id}/payments`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, amount, type: rowEdit.type, status: rowEdit.status, method: rowEdit.method, reference: rowEdit.reference }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { alert(j.error || "Could not save the payment."); return; }
    setBooking((prev) => prev ? { ...prev, payments: prev.payments.map((x) => x.id === paymentId ? { ...x, ...j.payment } : x) } : prev);
    setEditingRow(null);
  }

  async function deletePaymentRow(p: { id: string; amount: number | string | null }) {
    if (!confirm(`Delete this payment of €${Number(p.amount).toLocaleString()}?\n\nThe row is removed from the ledger. This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/bookings/${id}/payments?paymentId=${p.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { alert(j.error || "Could not delete the payment."); return; }
    setBooking((prev) => prev ? { ...prev, payments: prev.payments.filter((x) => x.id !== p.id) } : prev);
  }

  async function removeAllocation(paymentId: string) {
    if (!confirm("Remove this allocation? Both sides of the pair are removed — the money goes back to the booking that actually paid.")) return;
    const res = await fetch(`/api/admin/bookings/${id}/payments?paymentId=${paymentId}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setBooking((prev) => prev ? { ...prev, payments: prev.payments.filter((p) => p.id !== paymentId) } : prev);
    else alert(j.error || "Could not remove the allocation.");
  }

  // Load documents when tab activates
  useEffect(() => {
    if (tab === "documents") fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (loading) return <div className="text-sm admin-faint">Loading...</div>;
  if (!booking) return <div className="text-sm text-red-400">Booking not found</div>;

  // Travel. flight_info is the answer; the notes sentinel is the pre-migration
  // fallback; fly_in/fly_out fill in for bookings whose dates were only ever
  // typed on the old admin form, so nothing that was entered goes missing.
  const storedFlights = (booking.flight_info as FlightInfo | null) ?? parseFlightNote(booking.notes) ?? {};
  const flights: FlightInfo = {
    ...storedFlights,
    arrivalDate: storedFlights.arrivalDate ?? booking.fly_in ?? null,
    departureDate: storedFlights.departureDate ?? booking.fly_out ?? null,
  };

  // Received = 'paid' rows only. Pending is shown separately below so it informs
  // without inflating what the customer actually owes.
  const totalPaid = sumReceived(booking.payments);
  const totalPending = sumExpected(booking.payments);
  const outstanding = booking.agreed_price ? Math.max(0, Number(booking.agreed_price) - totalPaid) : 0;
  const parsedPayAmount = parseAmount(paymentForm.amount);
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
    { total: bookingTotal, paidAmount: recon.paidTotal, editionStart: booking.exp_editions?.date_start ?? null, bookedAt: booking.created_at ?? null },
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
    // Unpaid past its deadline → the team should chase (sign-up + X days for
    // the downpayment; N days before the trip for the final balance). A few
    // days before it, "last chance" — same ladder the member sees.
    const overdue = !paid && !!m.dueDate && m.dueDate < new Date().toISOString().slice(0, 10);
    const lastChance = !paid && !overdue && dueUrgency(m) === "last_chance";
    return { kind: m.kind, label: m.label, amount: m.amount, paid, invoiceIssued, invoiceSent, partialLeft, dueLabel: m.dueLabel, overdue, lastChance };
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
          <button onClick={() => (onBack ? onBack() : goBack(router, backHref))} className="admin-faint transition-colors" aria-label="Back">
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
            <button onClick={() => setCancelOpen(true)} className="px-3 py-2 text-xs text-amber-500/80 hover:text-amber-400 transition-colors">
              Cancel booking…
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
              <SearchSelect
                value={booking.experience_id}
                onChange={(v) => handleExperienceChange(v ?? "")}
                options={experiences.map((exp) => ({ value: exp.id, label: exp.title }))}
                placeholder="None"
                searchPlaceholder="Search experiences…"
              />
            </div>
            <div>
              <label className={labelClass}>Package <span className="admin-faint font-normal">· this week&apos;s options</span></label>
              <SearchSelect
                value={booking.package_id}
                onChange={handlePackageChange}
                options={packages.map((pkg) => ({ value: pkg.id, label: cleanPackageName(pkg.name), hint: pkg.price ? `€${pkg.price}` : undefined }))}
                placeholder="No package"
                searchPlaceholder="Search packages…"
              />
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
              {booking.contact_id && booking.contacts && !contactEdit && (
                <button
                  type="button"
                  onClick={startContactEdit}
                  className="px-3 py-2.5 admin-surface admin-muted hover:admin-heading text-xs rounded-lg transition-colors flex items-center"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  Edit contact
                </button>
              )}
            </div>
          </div>

          {/* Contact info — read-only card, or inline editor when editing */}
          {booking.contacts && !contactEdit && (
            <div className="p-4 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="text-xs font-bold admin-faint uppercase tracking-wider mb-2">Contact info</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><span className="admin-faint">Email:</span> <span className="admin-muted">{booking.contacts.email || "—"}</span></div>
                <div><span className="admin-faint">Phone:</span> <span className="admin-muted">{booking.contacts.phone || "—"}</span></div>
                <div><span className="admin-faint">Country:</span> <span className="admin-muted">{booking.contacts.country || "—"}</span></div>
                <div><span className="admin-faint">Level:</span> <span className="admin-muted">{booking.contacts.level || "—"}</span></div>
                <div><span className="admin-faint">T-shirt:</span> <span className="admin-muted uppercase">{booking.contacts.tshirt_size || "—"}</span></div>
                <div><span className="admin-faint">Diet:</span> <span className="admin-muted">{booking.contacts.diet_allergies || "—"}</span></div>
              </div>
            </div>
          )}
          {booking.contacts && contactEdit && (
            <div className="p-4 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold admin-faint uppercase tracking-wider">Edit contact</div>
                <div className="text-[11px] admin-faint">Saves to the contact — changing the email also updates their login.</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Name</label><input className={inputClass} value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} /></div>
                <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} /></div>
                <div><label className={labelClass}>Phone</label><input className={inputClass} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
                <div><label className={labelClass}>Country</label><input className={inputClass} value={contactForm.country} onChange={(e) => setContactForm({ ...contactForm, country: e.target.value })} /></div>
                <div><label className={labelClass}>Level</label><input className={inputClass} value={contactForm.level} onChange={(e) => setContactForm({ ...contactForm, level: e.target.value })} /></div>
                <div><label className={labelClass}>T-shirt</label>
                  <select className={inputClass} value={(contactForm.tshirt_size || "").toLowerCase()}
                    onChange={(e) => setContactForm({ ...contactForm, tshirt_size: e.target.value })}>
                    <option value="">—</option>
                    {["xs", "s", "m", "l", "xl", "xxl"].map((sz) => <option key={sz} value={sz}>{sz.toUpperCase()}</option>)}
                  </select></div>
                <div className="col-span-2"><label className={labelClass}>Diet / allergies</label><input className={inputClass} value={contactForm.diet_allergies} onChange={(e) => setContactForm({ ...contactForm, diet_allergies: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button type="button" onClick={saveContact} disabled={contactBusy}
                  className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                  {contactBusy ? "Saving…" : "Save contact"}
                </button>
                <button type="button" onClick={() => setContactEdit(false)} disabled={contactBusy}
                  className="px-3 py-1.5 admin-surface admin-muted hover:admin-heading text-xs font-semibold rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
                  Cancel
                </button>
                <Link href={`/admin/contacts/${booking.contact_id}`} className="ml-auto text-[11px] text-[#0aa3c7] hover:underline self-center">
                  Full contact page →
                </Link>
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
            <p className="text-[11px] admin-faint mt-1">Pre-filled from the selected package — type your own price to override (it sticks).</p>
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
              {/* Pending is money we EXPECT. Named separately so it informs
                  without being mistaken for cash in the bank. */}
              {totalPending > 0 && (
                <p className="text-[11px] text-amber-500 mt-1.5">+€{totalPending.toLocaleString()} pending — not counted as received</p>
              )}
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

          {/* Travel — one block, not two.
              There used to be a pair of "Fly in / Fly out" date inputs here and,
              below them, a read-only echo of what the member had entered. That
              split was the bug: the dates written here never reached flight_info,
              so an admin correcting an arrival date left the guest looking at the
              old one in their member area. Now everything — dates, times, flight
              numbers, own-way — is the same field the member writes, and the
              fly_in/fly_out columns are mirrored from it on save. */}
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <label className={labelClass}>Travel</label>
              {flights.booked === true && (
                <span className="text-[10.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                  {flights.arrivalMode === "own" ? "travel confirmed" : "flights booked"}
                </span>
              )}
            </div>
            <div className="rounded-xl p-3.5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <FlightEditor
                value={flights}
                onChange={(next) => {
                  setFlightsDirty(true);
                  update("flight_info", next);
                  // Keep the local mirror in step so the rest of the page (and
                  // the list you go back to) doesn't show the pre-edit dates.
                  update("fly_in", next.arrivalDate || null);
                  update("fly_out", next.departureDate || null);
                }}
                hint={{ start: booking.exp_editions?.date_start ?? booking.exp_experiences?.date_start ?? null, end: booking.exp_editions?.date_end ?? booking.exp_experiences?.date_end ?? null }}
              />
              <p className="text-[10.5px] admin-faint mt-3">Saved to the same place the guest edits — a change here shows in their member area, and theirs shows here.</p>
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
                  const tone = s.paid ? "bg-green-500/15 text-green-400" : s.overdue ? "bg-red-500/15 text-red-400" : s.lastChance ? "bg-amber-500/15 text-amber-400" : s.partialLeft > 0 ? "bg-amber-500/15 text-amber-400" : s.invoiceSent ? "bg-blue-500/15 text-blue-400" : "bg-gray-500/15 text-gray-400";
                  const statusText = s.paid ? "Paid" : s.overdue ? "Overdue" : s.lastChance ? "Last chance" : s.partialLeft > 0 ? `Part-paid · €${s.partialLeft.toLocaleString()} left` : s.invoiceSent ? "Invoice sent" : s.invoiceIssued ? "Invoice ready" : "Not invoiced";
                  return (
                    <div key={s.kind} className="flex items-center gap-3 px-4 py-2.5 text-sm" style={i < paymentStages.length - 1 ? { borderBottom: "1px solid var(--admin-border)" } : undefined}>
                      <span className="flex-1 min-w-0">
                        <span className="admin-heading block truncate">{s.label}</span>
                        {!s.paid && s.dueLabel && (
                          <span className={`block text-[11px] mt-0.5 ${s.overdue ? "text-red-400 font-semibold" : "admin-faint"}`}>{s.dueLabel}</span>
                        )}
                      </span>
                      <span className="text-xs admin-faint">€{s.amount.toLocaleString()}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tone}`}>{statusText}</span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[11px] admin-faint mt-1.5">Derived from invoices &amp; payments — record a payment (Payments tab) to update it. Deadlines come from the package&apos;s payment settings (downpayment %, days) — edit them under Packages.</p>
          </div>

          {/* WhatsApp — the one manual flag */}
          {/* Removed: the "Added to WhatsApp group" tick and the "Final invoice
              due" note.
              wa_group is the MEMBER's own answer — they tick it in the portal —
              so an admin control here could only overwrite what they said.
              final_invoice_due was a free-text leftover from Notion that nothing
              computed from; the real deadline comes from the package settings and
              is shown under Payment status. Both columns stay in the DB (the
              Notion sync still writes them) and both remain as optional columns
              on the bookings list. */}

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
            <div className="flex items-center gap-2">
              <button
                onClick={openAllocForm}
                className="px-3 py-1.5 admin-surface admin-muted hover:admin-heading text-xs font-semibold rounded-lg transition-colors"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                Allocate to booking…
              </button>
              <button
                onClick={() => {
                  const opening = !showPaymentForm;
                  setShowPaymentForm(opening);
                  // Opening it: start from what is actually owed. That's the
                  // amount being recorded almost every time, and it saves
                  // retyping a figure whose formatting is easy to get wrong.
                  if (opening && !paymentForm.amount && outstanding > 0) {
                    setPaymentForm((f) => ({ ...f, amount: String(outstanding), type: totalPaid > 0 ? "final" : f.type }));
                  }
                }}
                className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
              >
                Record Payment
              </button>
            </div>
          </div>

          {allocForm.open && (
            <div className="mb-4 p-4 rounded-xl admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <p className="text-xs admin-muted mb-3">
                Move part of this booking&apos;s received money to another booking in the same week —
                <span className="admin-heading font-semibold"> any amount you type</span>, no fixed split.
                It appears as a mirrored pair (−&nbsp;here, +&nbsp;there) and can be removed again with the ✕ on the row.
              </p>
              <div className="grid grid-cols-[140px_1fr_auto] gap-3 items-end">
                <div>
                  <label className={labelClass}>Amount (€) *</label>
                  <input className={inputClass} type="text" inputMode="decimal" placeholder="3.845 or 3845" value={allocForm.amount}
                    onChange={(e) => setAllocForm((f) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className={labelClass}>To booking *</label>
                  <select className={inputClass} value={allocForm.toBookingId}
                    onChange={(e) => setAllocForm((f) => ({ ...f, toBookingId: e.target.value }))}>
                    <option value="">Pick a booking…</option>
                    {allocForm.options.map((o) => <option key={o.id} value={o.id}>{o.name || o.id.slice(0, 8)}</option>)}
                  </select>
                </div>
                <button
                  onClick={submitAllocation}
                  disabled={allocForm.busy || !allocForm.toBookingId || !((parseAmount(allocForm.amount) ?? 0) > 0)}
                  className="px-3 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {allocForm.busy ? "Moving…" : "Move money"}
                </button>
              </div>
            </div>
          )}

          {showPaymentForm && (
            <div className="mb-4 p-4 rounded-xl admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Amount (€) *</label>
                  {/* Text, not type="number": the balance above is printed as
                      "€3.845", and pasting that back into a number input made the
                      whole field invalid — the browser reports an empty value, so
                      Add greyed out with nothing to explain it. parseAmount also
                      stops "3.845" being read as three euros eighty-five. */}
                  <input className={inputClass} type="text" inputMode="decimal" placeholder="3.845 or 3845"
                    value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                  {/* Say out loud what will be stored — the notation is ambiguous
                      and a silent misread here is a wrong ledger. */}
                  {paymentForm.amount.trim() !== "" && (
                    parsedPayAmount === null
                      ? <p className="text-[11px] text-amber-500 mt-1">Not a number — try 3845 or 3.845</p>
                      : <p className="text-[11px] admin-faint mt-1">Records €{formatAmount(parsedPayAmount)}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}>
                    <option value="downpayment">Downpayment</option>
                    <option value="final">Final</option>
                    <option value="partial">Partial</option>
                    <option value="addon">Add-on / service</option>
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
                <button onClick={addPayment} disabled={parsedPayAmount === null || parsedPayAmount === 0}
                  title={parsedPayAmount === null ? "Type an amount first" : parsedPayAmount === 0 ? "An amount of 0 records nothing" : undefined}
                  className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">
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
                  <span className="text-xs admin-muted self-center capitalize" title={p.type === "addon" ? "Extra service — not counted against the trip balance" : undefined}>{p.type === "addon" ? "Add-on" : p.type}</span>
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
                  <span className="text-xs admin-muted self-center flex items-center gap-1.5">
                    {formatDate(p.received_at)}
                    {/^alloc[#:]/.test(p.reference || "") ? (
                      <button onClick={() => removeAllocation(p.id)} title="Remove allocation (both sides of the pair)"
                        className="w-5 h-5 grid place-items-center rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors">✕</button>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingRow(p.id); setRowEdit({ amount: String(p.amount ?? ""), type: p.type || "final", status: p.status || "paid", method: p.method || "", reference: p.reference || "" }); }}
                          title="Edit this payment"
                          className="w-5 h-5 grid place-items-center rounded admin-faint hover:text-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/10 transition-colors">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                        </button>
                        <button onClick={() => deletePaymentRow(p)} title="Delete this payment"
                          className="w-5 h-5 grid place-items-center rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors">✕</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {editingRow && (
            <div className="mt-3 p-4 rounded-xl admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
              <p className="text-xs admin-faint mb-3">Editing a payment — a <b className="admin-heading">pending</b> row is money we expect, not money we have.</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className={labelClass}>Amount (€)</label>
                  <input className={inputClass} type="text" inputMode="decimal" value={rowEdit.amount} onChange={(e) => setRowEdit({ ...rowEdit, amount: e.target.value })} />
                  {rowEdit.amount.trim() !== "" && (parseAmount(rowEdit.amount) === null
                    ? <p className="text-[11px] text-amber-500 mt-1">Not a number</p>
                    : <p className="text-[11px] admin-faint mt-1">€{formatAmount(parseAmount(rowEdit.amount)!)}</p>)}
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select className={inputClass} value={rowEdit.type} onChange={(e) => setRowEdit({ ...rowEdit, type: e.target.value })}>
                    {["downpayment", "final", "partial", "addon", "refund"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select className={inputClass} value={rowEdit.status} onChange={(e) => setRowEdit({ ...rowEdit, status: e.target.value })}>
                    {["pending", "paid", "overdue", "cancelled"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Method</label>
                  <input className={inputClass} value={rowEdit.method} onChange={(e) => setRowEdit({ ...rowEdit, method: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Reference</label>
                  <input className={inputClass} value={rowEdit.reference} onChange={(e) => setRowEdit({ ...rowEdit, reference: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => savePaymentRow(editingRow)} className="px-3 py-1.5 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">Save payment</button>
                <button onClick={() => setEditingRow(null)} className="px-3 py-1.5 admin-muted text-xs rounded-lg">Cancel</button>
              </div>
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
                  <SearchSelect
                    value={addonForm.component_id || null}
                    onChange={(v) => {
                      const comp = components.find((c) => c.id === v);
                      setAddonForm({
                        ...addonForm,
                        component_id: v ?? "",
                        label: comp?.name || addonForm.label,
                        price: comp?.sell_price != null ? String(comp.sell_price)
                          : comp?.unit_cost != null ? String(comp.unit_cost) : addonForm.price,
                      });
                    }}
                    options={components.map((c) => ({ value: c.id, label: c.name, sub: c.category, hint: c.sell_price != null ? `€${c.sell_price}` : c.unit_cost != null ? `€${c.unit_cost} (cost)` : undefined }))}
                    placeholder="Custom (no component)"
                    clearLabel="Custom (no component)"
                    searchPlaceholder="Search components…"
                  />
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
                // "Pay the supplier direct" add-ons: we arrange them, no money
                // moves through NP7, so no invoice and no payment row.
                const payDirect = a.exp_components?.payment_mode === "direct";
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
                    {(a.meta?.checkIn || a.meta?.checkOut) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs text-[#0aa3c7] font-medium truncate">🛏 {formatDate(a.meta.checkIn ?? null)} → {formatDate(a.meta.checkOut ?? null)}{a.meta.nights ? ` · ${a.meta.nights} night${a.meta.nights !== 1 ? "s" : ""}` : ""}</div>
                        {a.meta.hotelConfirmed ? (
                          <button onClick={() => hotelConfirmAddon(a.id, false)} title="The hotel confirmed these dates with us (internal — the guest is never notified by this). Click to undo." className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 hover:opacity-75 transition-opacity">Hotel confirmed ✓</button>
                        ) : (
                          <button onClick={() => hotelConfirmAddon(a.id, true)} title="Mark that the hotel OK'd these dates (e.g. an overlap they'll cover). Internal only — does NOT confirm anything to the guest." className="text-[10px] font-medium px-1.5 py-0.5 rounded admin-faint hover:text-green-500 transition-colors" style={{ border: "1px dashed var(--admin-border)" }}>Hotel confirmed?</button>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs admin-muted self-center capitalize">{a.exp_components?.category || "custom"}</span>
                  <span className="text-xs self-center">
                    {payDirect
                      ? <span className="text-[11px] font-semibold text-amber-500" title={a.exp_components?.payment_note || "The guest pays the supplier directly — nothing is invoiced by NP7."}>Pays supplier</span>
                      : (() => {
                          // An add-on stores its own price at the moment it was
                          // added, so a row saved while the picker prefilled the
                          // BUYING price keeps that number for ever. Show what it
                          // should be next to it rather than silently disagreeing
                          // with the component — the invoice bills this number.
                          const sell = a.exp_components?.sell_price;
                          const wrong = a.price != null && sell != null && Number(a.price) < Number(sell);
                          return (
                            <span className="admin-muted">
                              {a.price ? `€${Number(a.price).toLocaleString()}` : "—"}
                              {wrong && (
                                <span className="ml-1.5 text-[11px] font-semibold text-amber-500"
                                  title="This was saved at our cost price. The sell price for this component is shown here — edit the add-on to charge it.">
                                  → €{Number(sell).toLocaleString()}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                  </span>
                  <div className="flex items-center justify-end gap-2 self-center">
                    {requested && (
                      payDirect ? (
                        // We arrange it, the guest settles with the supplier. Charging
                        // it here would bill them twice, and "No charge" would claim
                        // it's free — so neither of the usual buttons is the truth.
                        <button onClick={() => confirmAddon(a.id, true)} title="We arrange it; the guest pays the supplier. Nothing is added to their invoice." className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 transition-colors">Confirm</button>
                      ) : (
                      <>
                        <button onClick={() => confirmAddon(a.id, false)} title="Adds the price to what they owe" className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 transition-colors">Confirm &amp; charge</button>
                        <button onClick={() => confirmAddon(a.id, true)} title="Include it at no extra charge (price → €0)" className="text-[11px] font-medium px-2.5 py-1 rounded-md admin-surface hover:opacity-80 transition-opacity" style={{ border: "1px solid var(--admin-border)" }}>No charge</button>
                      </>
                      )
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
                  {room.hotel_confirmed ? (
                    <button onClick={() => hotelConfirmRoom(room.id, false)} title="The hotel confirmed this stay with us (internal). Click to undo." className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/15 text-green-500 hover:opacity-75 transition-opacity">Hotel confirmed ✓</button>
                  ) : (
                    <button onClick={() => hotelConfirmRoom(room.id, true)} title="Mark that the hotel OK'd this stay — e.g. an overlap they'll cover. Internal only, the guest is not notified." className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded admin-faint hover:text-green-500 transition-colors" style={{ border: "1px dashed var(--admin-border)" }}>Hotel confirmed?</button>
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
            {(["proforma_invoice", "deposit_invoice", "downpayment_invoice", "final_invoice", "booking_confirmation"] as const).map((type) => (
              <button
                key={type}
                onClick={() => generateDocument(type)}
                disabled={generating === type}
                className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
              >
                {generating === type
                  ? "Generating..."
                  : type === "proforma_invoice"
                  ? "Pro-forma (payment request)"
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
                    {doc.readOnly ? "—" : formatMoney(doc.amount, doc.currency)}
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
                    {doc.readOnly && doc.href && (
                      <a href={doc.href} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">
                        Open
                      </a>
                    )}
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
                    {!doc.readOnly && doc.status !== "void" && doc.type !== "booking_confirmation" && (
                      <button
                        onClick={() => sendInvoice(doc.id)}
                        title={doc.sent_at ? `Sent ${new Date(doc.sent_at).toLocaleDateString("en-GB")}` : "Email this invoice to the customer"}
                        className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                      >
                        {doc.sent_at ? "Resend" : "Send"}
                      </button>
                    )}
                    {!doc.readOnly && doc.status !== "void" && (
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
      {cancelOpen && booking && (
        <CancelBookingModal
          bookingName={booking.name || "this booking"}
          onClose={() => setCancelOpen(false)}
          onConfirm={cancelBooking}
        />
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
