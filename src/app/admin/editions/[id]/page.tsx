"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Edition {
  id: string;
  experience_id: string;
  year: number;
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
  status: string;
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

  useEffect(() => {
    fetch(`/api/admin/editions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setEdition(d);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (tab === "bookings") {
      fetch(`/api/admin/bookings?edition_id=${id}`)
        .then((r) => r.json())
        .then((d) => setBookings(d.bookings || []));
    }
  }, [tab, id]);

  useEffect(() => {
    if (tab === "packages") {
      fetch(`/api/admin/packages?edition_id=${id}`)
        .then((r) => r.json())
        .then((d) => setPackages(d || []));
    }
  }, [tab, id]);

  useEffect(() => {
    if (tab === "costs") {
      fetch(`/api/admin/exp-costs?edition_id=${id}`)
        .then((r) => r.json())
        .then((d) => setCosts(d || []));
    }
  }, [tab, id]);

  useEffect(() => {
    if (tab === "rooms") {
      fetch(`/api/admin/hotel-rooms?edition_id=${id}`)
        .then((r) => r.json())
        .then((d) => setRooms(d.rooms || []));
    }
  }, [tab, id]);

  async function handleSave() {
    if (!edition) return;
    setSaving(true);
    await fetch(`/api/admin/editions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: edition.year,
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
                {edition.exp_experiences?.title || "Edition"} — {edition.year}
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
          {/* Year & Status */}
          <div className="grid grid-cols-2 gap-4">
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
            <Link
              href={`/admin/bookings?edition_id=${id}`}
              className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No bookings for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_130px_90px_90px_70px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Fly In</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Paid</span>
              </div>
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_130px_90px_90px_70px] gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onClick={() => router.push(`/admin/bookings/${b.id}`)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center">{b.name}</span>
                  <span className="self-center"><BookingStatusBadge status={b.status} /></span>
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
            <Link
              href={`/admin/packages?edition_id=${id}`}
              className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          {packages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No packages for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Deposit</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Spots</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
              </div>
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="grid grid-cols-[1fr_100px_100px_80px_80px] gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <div className="min-w-0 self-center">
                    <div className="text-sm font-medium admin-heading truncate">{pkg.name}</div>
                    {pkg.category && <div className="text-xs admin-faint capitalize">{pkg.category}</div>}
                  </div>
                  <span className="text-xs admin-muted self-center">
                    {pkg.price ? `€${Number(pkg.price).toLocaleString()}` : "—"}
                  </span>
                  <span className="text-xs admin-muted self-center">
                    {pkg.deposit ? `€${Number(pkg.deposit).toLocaleString()}` : "—"}
                  </span>
                  <span className="text-xs admin-muted self-center">{pkg.max_spots ?? "—"}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      pkg.status === "active" ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"
                    }`}>
                      {pkg.status}
                    </span>
                  </span>
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
            <Link
              href={`/admin/exp-costs?edition_id=${id}`}
              className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          {costs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No costs for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_110px_110px_90px_90px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Item</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Estimated</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Actual</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
              </div>
              {costs.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_110px_110px_90px_90px] gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <span className="text-sm admin-heading truncate self-center">{c.item}</span>
                  <span className="text-xs admin-muted self-center">
                    {c.estimated_amount ? `€${Number(c.estimated_amount).toLocaleString()}` : "—"}
                  </span>
                  <span className="text-xs admin-muted self-center">
                    {c.actual_amount ? `€${Number(c.actual_amount).toLocaleString()}` : "—"}
                  </span>
                  <span className="text-xs admin-faint self-center">{formatDate(c.date)}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.status === "paid" ? "bg-green-500/15 text-green-400" :
                      c.status === "pending" ? "bg-amber-500/15 text-amber-400" :
                      "admin-surface admin-muted"
                    }`}>
                      {c.status}
                    </span>
                  </span>
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
            <Link
              href={`/admin/hotel-rooms?edition_id=${id}`}
              className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          {rooms.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No hotel rooms for this edition</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_120px_80px_120px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Room</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hotel</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Guest</span>
              </div>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-[1fr_120px_120px_80px_120px] gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <span className="text-sm font-medium admin-heading truncate self-center">{room.name}</span>
                  <span className="text-xs admin-muted self-center truncate">{room.room_type}</span>
                  <span className="text-xs admin-muted self-center">{room.hotel}</span>
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                      room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                      "bg-green-500/15 text-green-400"
                    }`}>
                      {room.status}
                    </span>
                  </span>
                  <span className="text-xs admin-muted self-center truncate">
                    {room.booking?.name || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
