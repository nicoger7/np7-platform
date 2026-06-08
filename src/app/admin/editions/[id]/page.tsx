"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessCaseCard from "@/components/business-case-card";

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
  slug: string | null;
  date_start: string | null;
  date_end: string | null;
  computed_price_from: number | null;
  computed_price_to: number | null;
  deposit: number | null;
  max_spots: number | null;
  spots_taken: number;
  status: string;
  currency: string | null;
  coaches: string | null;
  experience_code: string | null;
  pricing_details: string | null;
  payment_page_id: string | null;
  whatsapp_group_link: string | null;
  total_fixed_costs: number | null;
  estimated_costs: number | null;
  expected_revenue: number | null;
  expected_profit: number | null;
  paid_revenue: number | null;
  paid_profit: number | null;
  active: boolean;
  notion_id: string | null;
  exp_experiences: {
    id: string;
    title: string;
    slug: string;
    location: string;
    hero_image: string | null;
    currency: string | null;
  } | null;
  _counts?: {
    bookings: number;
    packages: number;
    costs: number;
    rooms: number;
  };
}

interface Booking {
  id: string;
  name: string;
  status: string;
  agreed_price: number | null;
  fly_in: string | null;
  fly_out: string | null;
  downpayment_received: boolean;
  final_payment_received: boolean;
}

interface Package {
  id: string;
  name: string;
  price: number | null;
  deposit: number | null;
  max_spots: number | null;
  status: string;
  category: string | null;
}

interface Cost {
  id: string;
  item: string;
  estimated_amount: number | null;
  actual_amount: number | null;
  status: string;
  date: string | null;
}

interface Room {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  room_number: string | null;
  status: string;
  booking_id: string | null;
  booking: { id: string; name: string } | null;
}

const BOOKING_STATUSES: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-gray-500" },
  interested: { label: "Interested", color: "bg-yellow-500" },
  enquiring: { label: "Enquiring", color: "bg-blue-400" },
  ready_to_book: { label: "Ready to Book", color: "bg-orange-500" },
  payment_pending: { label: "Payment Pending", color: "bg-amber-600" },
  downpayment_paid: { label: "Downpayment Paid", color: "bg-green-500" },
  create_invoice: { label: "Create Invoice", color: "bg-orange-400" },
  paid: { label: "Paid", color: "bg-green-600" },
  confirmed: { label: "Confirmed", color: "bg-blue-600" },
  attended: { label: "Attended", color: "bg-gray-400" },
  lost: { label: "Lost", color: "bg-red-500" },
};

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];
const COST_STATUSES = ["estimate", "confirmed", "cancelled", "unlisted"];
const ROOM_STATUSES = ["available", "assigned", "held"];
const PKG_CATEGORIES = ["", "pro", "beginner", "mixed"];
const ADD_BOOKING_STATUSES = ["lead", "interested", "enquiring", "ready_to_book", "payment_pending", "downpayment_paid", "create_invoice", "paid", "confirmed", "attended", "lost"];

function BookingStatusBadge({ status }: { status: string }) {
  const s = BOOKING_STATUSES[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${s?.color || "bg-gray-500"}`} />
      <span className="admin-muted">{s?.label || status}</span>
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EditionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<"details" | "bookings" | "packages" | "costs" | "rooms">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // ── Inline CRUD form state ──
  const emptyPkg = { name: "", price: "", deposit: "", max_spots: "", category: "", status: "active" };
  const [pkgForm, setPkgForm] = useState(emptyPkg);
  const [pkgEditId, setPkgEditId] = useState<string | null>(null);
  const [pkgShow, setPkgShow] = useState(false);

  const emptyCost = { item: "", estimated_amount: "", actual_amount: "", date: "", status: "estimate" };
  const [costForm, setCostForm] = useState(emptyCost);
  const [costEditId, setCostEditId] = useState<string | null>(null);
  const [costShow, setCostShow] = useState(false);

  const emptyRoom = { name: "", hotel: "", room_type: "", room_number: "", status: "available", booking_id: "" };
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [roomEditId, setRoomEditId] = useState<string | null>(null);
  const [roomShow, setRoomShow] = useState(false);

  const emptyBooking = { name: "", status: "lead", agreed_price: "", package_id: "" };
  const [bookingForm, setBookingForm] = useState(emptyBooking);
  const [bookingShow, setBookingShow] = useState(false);

  const loadBookings = () =>
    fetch(`/api/admin/bookings?edition_id=${id}`).then((r) => r.json()).then((d) => setBookings(d.bookings || []));
  const loadPackages = () =>
    fetch(`/api/admin/packages?edition_id=${id}`).then((r) => r.json()).then((d) => setPackages(d || []));
  const loadCosts = () =>
    fetch(`/api/admin/exp-costs?edition_id=${id}`).then((r) => r.json()).then((d) => setCosts(d || []));
  const loadRooms = () =>
    fetch(`/api/admin/hotel-rooms?edition_id=${id}`).then((r) => r.json()).then((d) => setRooms(d.rooms || []));

  useEffect(() => {
    fetch(`/api/admin/editions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setEdition(d);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (tab === "bookings") { loadBookings(); loadPackages(); }
    if (tab === "packages") { loadPackages(); loadBookings(); }
    if (tab === "costs") loadCosts();
    if (tab === "rooms") { loadRooms(); loadBookings(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const expId = edition?.experience_id;

  // Packages
  async function savePackage() {
    const body = {
      name: pkgForm.name,
      price: pkgForm.price ? Number(pkgForm.price) : null,
      deposit: pkgForm.deposit ? Number(pkgForm.deposit) : null,
      max_spots: pkgForm.max_spots ? Number(pkgForm.max_spots) : null,
      category: pkgForm.category || null,
      status: pkgForm.status,
      edition_id: id,
      experience_id: expId,
    };
    if (pkgEditId) {
      await fetch(`/api/admin/packages/${pkgEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setPkgShow(false); setPkgEditId(null); setPkgForm(emptyPkg); loadPackages();
  }
  async function deletePackage(pkgId: string) {
    if (!confirm("Delete this package?")) return;
    await fetch(`/api/admin/packages/${pkgId}`, { method: "DELETE" });
    loadPackages();
  }

  // Costs
  async function saveCost() {
    const body = {
      item: costForm.item,
      estimated_amount: costForm.estimated_amount ? Number(costForm.estimated_amount) : null,
      actual_amount: costForm.actual_amount ? Number(costForm.actual_amount) : null,
      date: costForm.date || null,
      status: costForm.status,
      edition_id: id,
      experience_id: expId,
    };
    if (costEditId) {
      await fetch(`/api/admin/exp-costs/${costEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/exp-costs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setCostShow(false); setCostEditId(null); setCostForm(emptyCost); loadCosts();
  }
  async function deleteCost(costId: string) {
    if (!confirm("Delete this cost item?")) return;
    await fetch(`/api/admin/exp-costs/${costId}`, { method: "DELETE" });
    loadCosts();
  }

  // Rooms
  async function saveRoom() {
    const body = {
      name: roomForm.name,
      hotel: roomForm.hotel || null,
      room_type: roomForm.room_type || null,
      room_number: roomForm.room_number || null,
      status: roomForm.status,
      booking_id: roomForm.booking_id || null,
      edition_id: id,
      experience_id: expId,
    };
    if (roomEditId) {
      await fetch(`/api/admin/hotel-rooms/${roomEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/hotel-rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setRoomShow(false); setRoomEditId(null); setRoomForm(emptyRoom); loadRooms();
  }
  async function deleteRoom(roomId: string) {
    if (!confirm("Delete this room?")) return;
    await fetch(`/api/admin/hotel-rooms/${roomId}`, { method: "DELETE" });
    loadRooms();
  }

  // Bookings (add inline; edit on detail page)
  async function addBooking() {
    const body = {
      name: bookingForm.name,
      status: bookingForm.status,
      agreed_price: bookingForm.agreed_price ? Number(bookingForm.agreed_price) : null,
      package_id: bookingForm.package_id || null,
      edition_id: id,
      experience_id: expId,
    };
    await fetch(`/api/admin/bookings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBookingShow(false); setBookingForm(emptyBooking); loadBookings();
  }
  async function deleteBooking(bookingId: string) {
    if (!confirm("Delete this booking?")) return;
    await fetch(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
    loadBookings();
  }

  async function handleSave() {
    if (!edition) return;
    setSaving(true);
    await fetch(`/api/admin/editions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: edition.year,
        label: edition.label,
        slug: edition.slug,
        date_start: edition.date_start,
        date_end: edition.date_end,
        deposit: edition.deposit,
        max_spots: edition.max_spots,
        status: edition.status,
        currency: edition.currency,
        coaches: edition.coaches,
        experience_code: edition.experience_code,
        pricing_details: edition.pricing_details,
        payment_page_id: edition.payment_page_id,
        whatsapp_group_link: edition.whatsapp_group_link,
        total_fixed_costs: edition.total_fixed_costs,
        estimated_costs: edition.estimated_costs,
        expected_revenue: edition.expected_revenue,
        expected_profit: edition.expected_profit,
        active: edition.active,
        notion_id: edition.notion_id,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this edition? This cannot be undone.")) return;
    await fetch(`/api/admin/editions/${id}`, { method: "DELETE" });
    if (edition?.experience_id) {
      router.push(`/admin/experiences/${edition.experience_id}`);
    } else {
      router.push("/admin/experiences");
    }
  }

  function update(field: string, value: unknown) {
    setEdition((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return <div className="text-sm admin-faint">Loading...</div>;
  }

  if (!edition) {
    return <div className="text-sm text-red-400">Edition not found</div>;
  }

  const currency = edition.currency || edition.exp_experiences?.currency || "EUR";
  const spotsRemaining = edition.max_spots != null
    ? Math.max(0, edition.max_spots - edition.spots_taken)
    : null;
  const priceRange =
    edition.computed_price_from == null && edition.computed_price_to == null
      ? "No packages yet"
      : edition.computed_price_from != null &&
        edition.computed_price_to != null &&
        edition.computed_price_from !== edition.computed_price_to
      ? `${currency} ${Number(edition.computed_price_from).toLocaleString()} – ${Number(edition.computed_price_to).toLocaleString()}`
      : `${currency} ${Number(edition.computed_price_from ?? edition.computed_price_to).toLocaleString()}`;

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {edition.experience_id && (
            <Link
              href={`/admin/experiences/${edition.experience_id}`}
              className="admin-faint hover:admin-muted transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold admin-heading">
                {edition.exp_experiences?.title || "Edition"} — {edition.label || edition.year}
              </h1>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                  edition.status === "published"
                    ? "bg-green-500/15 text-green-400"
                    : edition.status === "archived"
                    ? "bg-red-500/15 text-red-400"
                    : edition.status === "private"
                    ? "bg-purple-500/15 text-purple-400"
                    : "admin-surface admin-muted"
                }`}
              >
                {edition.status}
              </span>
            </div>
            <p className="text-sm admin-muted">
              {edition.exp_experiences?.location || ""}
              {edition.experience_code ? ` • ${edition.experience_code}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          {tab === "details" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {(["details", "bookings", "packages", "costs", "rooms"] as const).map((t) => {
          const count = edition._counts?.[t as keyof typeof edition._counts];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
                tab === t
                  ? "admin-heading border-[#0aa3c7]"
                  : "admin-muted border-transparent"
              }`}
            >
              {t === "rooms" ? "Hotel Rooms" : t === "costs" ? "Costs" : t}
              {count != null && count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#0aa3c7]/15 text-[#0aa3c7] text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Details tab ── */}
      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/* Label, Year & Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Label</label>
              <input
                className={inputClass}
                value={edition.label || ""}
                onChange={(e) => update("label", e.target.value || null)}
                placeholder="e.g. Week II"
              />
            </div>
            <div>
              <label className={labelClass}>Year</label>
              <input
                type="number"
                className={inputClass}
                value={edition.year}
                onChange={(e) => update("year", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={edition.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start date</label>
              <input
                type="date"
                className={inputClass}
                value={edition.date_start || ""}
                onChange={(e) => update("date_start", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input
                type="date"
                className={inputClass}
                value={edition.date_end || ""}
                onChange={(e) => update("date_end", e.target.value || null)}
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 rounded-lg p-2 bg-[#0aa3c7]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Price range
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0aa3c7]/15 text-[#0aa3c7]">From packages</span>
              </label>
              <div className={`${inputClass} opacity-80 flex items-center`} style={{ cursor: "default" }}>
                {priceRange}
              </div>
            </div>
            <div>
              <label className={labelClass}>Deposit ({currency})</label>
              <input
                type="number"
                className={inputClass}
                value={edition.deposit || ""}
                onChange={(e) => update("deposit", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
          <p className="text-xs admin-faint -mt-2">
            Price is derived from this edition&apos;s packages — edit prices in the <span className="font-medium admin-muted">Packages</span> tab.
          </p>

          {/* Currency & Slug */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Currency</label>
              <select
                className={inputClass}
                value={edition.currency || "EUR"}
                onChange={(e) => update("currency", e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Slug</label>
              <input
                className={inputClass}
                value={edition.slug || ""}
                onChange={(e) => update("slug", e.target.value || null)}
                placeholder="auto-generated from experience"
              />
            </div>
          </div>

          {/* Spots */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Max spots</label>
              <input
                type="number"
                className={inputClass}
                value={edition.max_spots || ""}
                onChange={(e) => update("max_spots", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div className="rounded-lg p-2 bg-[#0aa3c7]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Spots taken
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0aa3c7]/15 text-[#0aa3c7]">Auto</span>
              </label>
              <input
                type="number"
                className={`${inputClass} opacity-70 cursor-default`}
                value={edition.spots_taken}
                readOnly
              />
            </div>
            <div className="rounded-lg p-2 bg-[#0aa3c7]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
              <label className={`${labelClass} flex items-center gap-2`}>
                Spots remaining
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0aa3c7]/15 text-[#0aa3c7]">Auto</span>
              </label>
              <input
                type="number"
                className={`${inputClass} opacity-70 cursor-default`}
                value={spotsRemaining ?? ""}
                readOnly
              />
            </div>
          </div>

          {/* Operations */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-4">Operations</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Coaches</label>
                  <input
                    className={inputClass}
                    value={edition.coaches || ""}
                    onChange={(e) => update("coaches", e.target.value || null)}
                    placeholder="e.g. Nico, Sarah"
                  />
                </div>
                <div>
                  <label className={labelClass}>Notion ID</label>
                  <input
                    className={inputClass}
                    value={edition.notion_id || ""}
                    onChange={(e) => update("notion_id", e.target.value || null)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Experience Code</label>
                  <input
                    className={inputClass}
                    value={edition.experience_code || ""}
                    onChange={(e) => update("experience_code", e.target.value || null)}
                    placeholder="e.g. ALC-2026"
                  />
                </div>
                <div>
                  <label className={labelClass}>Payment Page ID</label>
                  <input
                    className={inputClass}
                    value={edition.payment_page_id || ""}
                    onChange={(e) => update("payment_page_id", e.target.value || null)}
                    placeholder="Stripe checkout / payment page"
                  />
                </div>
                <div>
                  <label className={labelClass}>WhatsApp group link</label>
                  <input
                    className={inputClass}
                    value={edition.whatsapp_group_link || ""}
                    onChange={(e) => update("whatsapp_group_link", e.target.value || null)}
                    placeholder="https://chat.whatsapp.com/..."
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Pricing Details</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  value={edition.pricing_details || ""}
                  onChange={(e) => update("pricing_details", e.target.value || null)}
                  placeholder="Pricing breakdown, inclusions..."
                />
              </div>
            </div>
          </div>

          {/* Financials */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-4">Financials</h3>

            {/* Computed business case — sell − cost from packages × confirmed heads */}
            <div className="mb-5">
              <BusinessCaseCard editionId={id} />
            </div>

            <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-3">Manual overrides (optional)</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Total Fixed Costs ({currency})</label>
                <input type="number" className={inputClass} value={edition.total_fixed_costs || ""} onChange={(e) => update("total_fixed_costs", e.target.value ? Number(e.target.value) : null)} placeholder="Costs not tied to headcount" />
              </div>
              <div>
                <label className={labelClass}>Estimated Costs ({currency})</label>
                <input type="number" className={inputClass} value={edition.estimated_costs || ""} onChange={(e) => update("estimated_costs", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label className={labelClass}>Expected Revenue ({currency})</label>
                <input type="number" className={inputClass} value={edition.expected_revenue || ""} onChange={(e) => update("expected_revenue", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label className={labelClass}>Expected Profit ({currency})</label>
                <input type="number" className={inputClass} value={edition.expected_profit || ""} onChange={(e) => update("expected_profit", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="rounded-lg p-2 bg-[#0aa3c7]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
                <label className={`${labelClass} flex items-center gap-2`}>
                  Paid Revenue
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0aa3c7]/15 text-[#0aa3c7]">Auto</span>
                </label>
                <input type="number" className={`${inputClass} opacity-70 cursor-default`} value={edition.paid_revenue || ""} readOnly />
              </div>
              <div className="rounded-lg p-2 bg-[#0aa3c7]/5" style={{ border: "1px solid rgba(10,163,199,0.15)" }}>
                <label className={`${labelClass} flex items-center gap-2`}>
                  Paid Profit
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#0aa3c7]/15 text-[#0aa3c7]">Auto</span>
                </label>
                <input type="number" className={`${inputClass} opacity-70 cursor-default`} value={edition.paid_profit || ""} readOnly />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bookings tab ── */}
      {tab === "bookings" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/bookings?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => setBookingShow((v) => !v)} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">New Booking</button>
            </div>
          </div>

          {bookingShow && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="grid grid-cols-[1fr_140px_110px_1fr] gap-3 mb-3">
                <div><label className={labelClass}>Name *</label><input className={inputClass} value={bookingForm.name} onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })} /></div>
                <div><label className={labelClass}>Status</label><select className={inputClass} value={bookingForm.status} onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}>{ADD_BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUSES[s]?.label || s}</option>)}</select></div>
                <div><label className={labelClass}>Price ({currency})</label><input type="number" className={inputClass} value={bookingForm.agreed_price} onChange={(e) => setBookingForm({ ...bookingForm, agreed_price: e.target.value })} /></div>
                <div><label className={labelClass}>Package</label><select className={inputClass} value={bookingForm.package_id} onChange={(e) => setBookingForm({ ...bookingForm, package_id: e.target.value })}><option value="">None</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={addBooking} disabled={!bookingForm.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">Create</button>
                <button onClick={() => { setBookingShow(false); setBookingForm(emptyBooking); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No bookings for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_130px_90px_90px_60px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Fly In</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Paid</span>
                <span></span>
              </div>
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_130px_90px_90px_60px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center cursor-pointer" onClick={() => router.push(`/admin/bookings/${b.id}`)}>{b.name}</span>
                  <span className="self-center cursor-pointer" onClick={() => router.push(`/admin/bookings/${b.id}`)}><BookingStatusBadge status={b.status} /></span>
                  <span className="text-xs admin-muted self-center">{formatDate(b.fly_in)}</span>
                  <span className="text-xs admin-muted self-center">
                    {b.agreed_price ? `€${Number(b.agreed_price).toLocaleString()}` : "—"}
                  </span>
                  <span className="self-center">
                    {b.final_payment_received ? (
                      <span className="text-green-400 text-xs font-medium">✓</span>
                    ) : b.downpayment_received ? (
                      <span className="text-amber-400 text-xs font-medium">½</span>
                    ) : (
                      <span className="admin-faint text-xs">—</span>
                    )}
                  </span>
                  <button onClick={() => deleteBooking(b.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Packages tab ── */}
      {tab === "packages" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{packages.length} package{packages.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/packages?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => { setPkgEditId(null); setPkgForm(emptyPkg); setPkgShow(true); }} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">New Package</button>
            </div>
          </div>

          {(pkgShow || pkgEditId) && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-3">{pkgEditId ? "Edit Package" : "New Package"}</h3>
              <div className="grid grid-cols-[1fr_110px_110px_90px_130px] gap-3 mb-3">
                <div><label className={labelClass}>Name *</label><input className={inputClass} value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} /></div>
                <div><label className={labelClass}>Price ({currency})</label><input type="number" className={inputClass} value={pkgForm.price} onChange={(e) => setPkgForm({ ...pkgForm, price: e.target.value })} /></div>
                <div><label className={labelClass}>Deposit</label><input type="number" className={inputClass} value={pkgForm.deposit} onChange={(e) => setPkgForm({ ...pkgForm, deposit: e.target.value })} /></div>
                <div><label className={labelClass}>Spots</label><input type="number" className={inputClass} value={pkgForm.max_spots} onChange={(e) => setPkgForm({ ...pkgForm, max_spots: e.target.value })} /></div>
                <div><label className={labelClass}>Category</label><select className={inputClass} value={pkgForm.category} onChange={(e) => setPkgForm({ ...pkgForm, category: e.target.value })}>{PKG_CATEGORIES.map((c) => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : "None"}</option>)}</select></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={savePackage} disabled={!pkgForm.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">{pkgEditId ? "Update" : "Create"}</button>
                <button onClick={() => { setPkgShow(false); setPkgEditId(null); setPkgForm(emptyPkg); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                <span className="text-xs admin-faint ml-2">Edit components from the <Link href={`/admin/packages?edition_id=${id}`} className="text-[#0aa3c7]">packages page</Link>.</span>
              </div>
            </div>
          )}

          {packages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No packages for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_100px_100px_70px_80px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Deposit</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Spots</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span></span>
              </div>
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="grid grid-cols-[1fr_100px_100px_70px_80px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <div className="min-w-0 self-center cursor-pointer" onClick={() => { setPkgEditId(pkg.id); setPkgShow(false); setPkgForm({ name: pkg.name, price: pkg.price?.toString() || "", deposit: pkg.deposit?.toString() || "", max_spots: pkg.max_spots?.toString() || "", category: pkg.category || "", status: pkg.status }); }}>
                    <div className="text-sm font-medium admin-heading truncate">{pkg.name}</div>
                    {pkg.category && <div className="text-xs admin-faint capitalize">{pkg.category}</div>}
                  </div>
                  <span className="text-xs admin-muted self-center">{pkg.price ? `€${Number(pkg.price).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{pkg.deposit ? `€${Number(pkg.deposit).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{pkg.max_spots ?? "—"}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pkg.status === "active" ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"}`}>{pkg.status}</span>
                  </span>
                  <button onClick={() => deletePackage(pkg.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Costs tab ── */}
      {tab === "costs" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{costs.length} cost item{costs.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/exp-costs?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => { setCostEditId(null); setCostForm(emptyCost); setCostShow(true); }} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">New Cost</button>
            </div>
          </div>

          {(costShow || costEditId) && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-3">{costEditId ? "Edit Cost" : "New Cost"}</h3>
              <div className="grid grid-cols-[1fr_120px_120px_140px_130px] gap-3 mb-3">
                <div><label className={labelClass}>Item *</label><input className={inputClass} value={costForm.item} onChange={(e) => setCostForm({ ...costForm, item: e.target.value })} /></div>
                <div><label className={labelClass}>Estimated ({currency})</label><input type="number" className={inputClass} value={costForm.estimated_amount} onChange={(e) => setCostForm({ ...costForm, estimated_amount: e.target.value })} /></div>
                <div><label className={labelClass}>Actual ({currency})</label><input type="number" className={inputClass} value={costForm.actual_amount} onChange={(e) => setCostForm({ ...costForm, actual_amount: e.target.value })} /></div>
                <div><label className={labelClass}>Date</label><input type="date" className={inputClass} value={costForm.date} onChange={(e) => setCostForm({ ...costForm, date: e.target.value })} /></div>
                <div><label className={labelClass}>Status</label><select className={inputClass} value={costForm.status} onChange={(e) => setCostForm({ ...costForm, status: e.target.value })}>{COST_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCost} disabled={!costForm.item} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">{costEditId ? "Update" : "Create"}</button>
                <button onClick={() => { setCostShow(false); setCostEditId(null); setCostForm(emptyCost); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {costs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No costs for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_110px_110px_90px_90px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Item</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Estimated</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Actual</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span></span>
              </div>
              {costs.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_110px_110px_90px_90px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm admin-heading truncate self-center cursor-pointer" onClick={() => { setCostEditId(c.id); setCostShow(false); setCostForm({ item: c.item, estimated_amount: c.estimated_amount?.toString() || "", actual_amount: c.actual_amount?.toString() || "", date: c.date || "", status: c.status }); }}>{c.item}</span>
                  <span className="text-xs admin-muted self-center">{c.estimated_amount ? `€${Number(c.estimated_amount).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{c.actual_amount ? `€${Number(c.actual_amount).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-faint self-center">{formatDate(c.date)}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.status === "confirmed" ? "bg-green-500/15 text-green-400" :
                      c.status === "estimate" ? "bg-amber-500/15 text-amber-400" :
                      c.status === "cancelled" ? "bg-red-500/15 text-red-400" :
                      "admin-surface admin-muted"
                    }`}>{c.status}</span>
                  </span>
                  <button onClick={() => deleteCost(c.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rooms tab ── */}
      {tab === "rooms" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">{rooms.length} room{rooms.length !== 1 ? "s" : ""} for this edition</p>
            <div className="flex items-center gap-3">
              <Link href={`/admin/hotel-rooms?edition_id=${id}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">View all →</Link>
              <button onClick={() => { setRoomEditId(null); setRoomForm(emptyRoom); setRoomShow(true); }} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">New Room</button>
            </div>
          </div>

          {(roomShow || roomEditId) && (
            <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-sm font-bold admin-heading mb-3">{roomEditId ? "Edit Room" : "New Room"}</h3>
              <div className="grid grid-cols-[1fr_140px_90px_120px] gap-3 mb-3">
                <div><label className={labelClass}>Name *</label><input className={inputClass} value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} /></div>
                <div><label className={labelClass}>Hotel</label><select className={inputClass} value={roomForm.hotel} onChange={(e) => setRoomForm({ ...roomForm, hotel: e.target.value })}><option value="">—</option>{HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
                <div><label className={labelClass}>Room #</label><input className={inputClass} value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} /></div>
                <div><label className={labelClass}>Status</label><select className={inputClass} value={roomForm.status} onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })}>{ROOM_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-3 mb-3">
                <div><label className={labelClass}>Room type</label><input className={inputClass} value={roomForm.room_type} onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })} placeholder="e.g. BON-WAN-Double Deluxe Balcony" /></div>
                <div><label className={labelClass}>Guest (booking)</label><select className={inputClass} value={roomForm.booking_id} onChange={(e) => setRoomForm({ ...roomForm, booking_id: e.target.value })}><option value="">Unassigned</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveRoom} disabled={!roomForm.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">{roomEditId ? "Update" : "Create"}</button>
                <button onClick={() => { setRoomShow(false); setRoomEditId(null); setRoomForm(emptyRoom); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {rooms.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No hotel rooms for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_110px_80px_110px_40px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Room</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hotel</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Guest</span>
                <span></span>
              </div>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-[1fr_120px_110px_80px_110px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center cursor-pointer" onClick={() => { setRoomEditId(room.id); setRoomShow(false); setRoomForm({ name: room.name, hotel: room.hotel || "", room_type: room.room_type || "", room_number: room.room_number || "", status: room.status, booking_id: room.booking_id || "" }); }}>{room.name}</span>
                  <span className="text-xs admin-muted self-center truncate">{room.room_type}</span>
                  <span className="text-xs admin-muted self-center">{room.hotel}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                      room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                      "bg-green-500/15 text-green-400"
                    }`}>{room.status}</span>
                  </span>
                  <span className="text-xs admin-muted self-center truncate">{room.booking?.name || "—"}</span>
                  <button onClick={() => deleteRoom(room.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
