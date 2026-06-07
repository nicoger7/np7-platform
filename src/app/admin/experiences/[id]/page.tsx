"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string;
  date_start: string;
  date_end: string;
  price: number | null;
  deposit: number | null;
  max_spots: number;
  spots_taken: number;
  description: string;
  whats_included: string[];
  hero_image: string;
  gallery: string[];
  status: string;
  // New fields from Notion migration
  currency: string;
  timezone: string;
  hotel: string | null;
  airport_code: string | null;
  whatsapp_group_link: string | null;
  notes: string | null;
  cancellation_policy: string | null;
}

interface Booking {
  id: string;
  name: string;
  status: string;
  agreed_price: number | null;
  fly_in: string | null;
  fly_out: string | null;
  traveling_with: string | null;
  wa_group: boolean;
  downpayment_received: boolean;
  final_payment_received: boolean;
  notes: string | null;
  contact: { id: string; name: string; email: string } | null;
  created_at: string;
}

interface HotelRoom {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  room_number: string | null;
  status: string;
  partner_tag_along: string | null;
  comments: string | null;
  check_in: string | null;
  check_out: string | null;
  booking: { id: string; name: string; contact: { name: string } | null } | null;
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
  contact_by_phone: { label: "Contact by Phone", color: "bg-pink-500" },
  confirmed: { label: "Confirmed", color: "bg-blue-600" },
  attended: { label: "Attended", color: "bg-gray-400" },
  lost: { label: "Lost", color: "bg-red-500" },
};

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function StatusBadge({ status }: { status: string }) {
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

export default function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<"details" | "bookings" | "rooms">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exp, setExp] = useState<Experience | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [includedItem, setIncludedItem] = useState("");
  const [showImagePicker, setShowImagePicker] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/experiences/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setExp(d.experience);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (tab === "bookings") {
      fetch(`/api/admin/bookings?experience_id=${id}`)
        .then((r) => r.json())
        .then((d) => setBookings(d.bookings || []));
    }
  }, [tab, id]);

  useEffect(() => {
    if (tab === "rooms") {
      fetch(`/api/admin/hotel-rooms?experience_id=${id}`)
        .then((r) => r.json())
        .then((d) => setRooms(d.rooms || []));
    }
  }, [tab, id]);

  async function handleSave() {
    if (!exp) return;
    setSaving(true);
    await fetch(`/api/admin/experiences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: exp.title,
        slug: exp.slug,
        location: exp.location,
        date_start: exp.date_start,
        date_end: exp.date_end,
        price: exp.price,
        deposit: exp.deposit,
        max_spots: exp.max_spots,
        spots_taken: exp.spots_taken,
        description: exp.description,
        whats_included: exp.whats_included,
        hero_image: exp.hero_image,
        gallery: exp.gallery,
        status: exp.status,
        currency: exp.currency,
        timezone: exp.timezone,
        hotel: exp.hotel,
        airport_code: exp.airport_code,
        whatsapp_group_link: exp.whatsapp_group_link,
        notes: exp.notes,
        cancellation_policy: exp.cancellation_policy,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this experience? This cannot be undone.")) return;
    await fetch(`/api/admin/experiences/${id}`, { method: "DELETE" });
    router.push("/admin/experiences");
  }

  function update(field: string, value: unknown) {
    setExp((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return <div className="text-sm admin-faint">Loading...</div>;
  }

  if (!exp) {
    return <div className="text-sm text-red-400">Experience not found</div>;
  }

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/experiences")}
            className="admin-faint transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold admin-heading">{exp.title}</h1>
            <p className="text-sm admin-muted">{exp.location}{exp.hotel ? ` • ${exp.hotel}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {(["details", "bookings", "rooms"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
              tab === t
                ? "admin-heading border-[#0aa3c7]"
                : "admin-muted border-transparent"
            }`}
          >
            {t === "rooms" ? "Hotel Rooms" : t}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/* Title & Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Title</label>
              <input
                className={inputClass}
                value={exp.title}
                onChange={(e) => {
                  update("title", e.target.value);
                  update("slug", slugify(e.target.value));
                }}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input
                className={inputClass}
                value={exp.slug}
                onChange={(e) => update("slug", e.target.value)}
              />
            </div>
          </div>

          {/* Location & Hotel */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Location</label>
              <input
                className={inputClass}
                value={exp.location}
                onChange={(e) => update("location", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Hotel</label>
              <select
                className={inputClass}
                value={exp.hotel || ""}
                onChange={(e) => update("hotel", e.target.value || null)}
              >
                <option value="">No hotel</option>
                {HOTELS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
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
                value={exp.date_start || ""}
                onChange={(e) => update("date_start", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input
                type="date"
                className={inputClass}
                value={exp.date_end || ""}
                onChange={(e) => update("date_end", e.target.value)}
              />
            </div>
          </div>

          {/* Price, Deposit, Currency */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Price ({exp.currency || "EUR"})</label>
              <input
                type="number"
                className={inputClass}
                value={exp.price || ""}
                onChange={(e) => update("price", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <label className={labelClass}>Deposit ({exp.currency || "EUR"})</label>
              <input
                type="number"
                className={inputClass}
                value={exp.deposit || ""}
                onChange={(e) => update("deposit", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select
                className={inputClass}
                value={exp.currency || "EUR"}
                onChange={(e) => update("currency", e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Spots */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Max spots</label>
              <input
                type="number"
                className={inputClass}
                value={exp.max_spots}
                onChange={(e) => update("max_spots", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Spots taken</label>
              <input
                type="number"
                className={inputClass}
                value={exp.spots_taken}
                onChange={(e) => update("spots_taken", Number(e.target.value))}
              />
            </div>
          </div>

          {/* Airport & Timezone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Airport code</label>
              <input
                className={inputClass}
                value={exp.airport_code || ""}
                onChange={(e) => update("airport_code", e.target.value || null)}
                placeholder="e.g. ADB, BON, VRN"
              />
            </div>
            <div>
              <label className={labelClass}>Timezone</label>
              <input
                className={inputClass}
                value={exp.timezone || ""}
                onChange={(e) => update("timezone", e.target.value)}
                placeholder="Europe/Berlin"
              />
            </div>
          </div>

          {/* WhatsApp Group Link */}
          <div>
            <label className={labelClass}>WhatsApp group link</label>
            <input
              className={inputClass}
              value={exp.whatsapp_group_link || ""}
              onChange={(e) => update("whatsapp_group_link", e.target.value || null)}
              placeholder="https://chat.whatsapp.com/..."
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={exp.description || ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {/* Internal Notes */}
          <div>
            <label className={labelClass}>Internal notes</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={exp.notes || ""}
              onChange={(e) => update("notes", e.target.value || null)}
              placeholder="Private notes (not shown publicly)"
            />
          </div>

          {/* Cancellation Policy */}
          <div>
            <label className={labelClass}>Cancellation policy</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={exp.cancellation_policy || ""}
              onChange={(e) => update("cancellation_policy", e.target.value || null)}
              placeholder="Cancellation terms..."
            />
          </div>

          {/* What's included */}
          <div>
            <label className={labelClass}>What&apos;s included</label>
            <div className="space-y-1.5 mb-2">
              {(exp.whats_included || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 admin-surface rounded-lg text-sm admin-muted" style={{ border: "1px solid var(--admin-border)" }}>
                    {item}
                  </span>
                  <button
                    onClick={() => {
                      const arr = [...(exp.whats_included || [])];
                      arr.splice(i, 1);
                      update("whats_included", arr);
                    }}
                    className="admin-faint hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Add item..."
                value={includedItem}
                onChange={(e) => setIncludedItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && includedItem.trim()) {
                    update("whats_included", [...(exp.whats_included || []), includedItem.trim()]);
                    setIncludedItem("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (includedItem.trim()) {
                    update("whats_included", [...(exp.whats_included || []), includedItem.trim()]);
                    setIncludedItem("");
                  }
                }}
                className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg transition-colors"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Hero image */}
          <div>
            <label className={labelClass}>Hero image</label>
            {exp.hero_image ? (
              <div className="relative group max-w-[400px]">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={exp.hero_image} alt="Hero" className="w-full h-auto" />
                </div>
                <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowImagePicker(true)}
                    className="px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm text-white font-medium transition-colors"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => update("hero_image", "")}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm text-red-400 font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="w-full max-w-[400px] py-10 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center gap-2"
                style={{ borderColor: "var(--admin-border)" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <svg className="w-8 h-8 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <span className="text-sm admin-muted">Click to select image</span>
              </button>
            )}
          </div>

          {showImagePicker && (
            <ImagePickerModal
              onSelect={(url) => {
                update("hero_image", url);
                setShowImagePicker(false);
              }}
              onClose={() => setShowImagePicker(false)}
            />
          )}

          {/* Status */}
          <div>
            <label className={labelClass}>Status</label>
            <div className="flex gap-2">
              {["draft", "published", "archived"].map((s) => (
                <button
                  key={s}
                  onClick={() => update("status", s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    exp.status === s
                      ? s === "published"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : s === "archived"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "admin-heading border"
                      : "admin-surface admin-faint border"
                  }`}
                  style={{
                    borderColor: exp.status === s && s === "draft" ? "var(--admin-input-border)" :
                                 exp.status !== s ? "var(--admin-border)" : undefined,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <div>
          {bookings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No bookings for this experience</p>
              <p className="text-xs admin-faint mt-1">Bookings from the pipeline will appear here</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_100px_100px_100px_80px] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Fly In</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Fly Out</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Paid</span>
              </div>
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_120px_100px_100px_100px_80px] gap-4 px-5 py-3.5 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium admin-heading truncate">{b.name}</div>
                    {b.traveling_with && (
                      <div className="text-xs admin-faint truncate">w/ {b.traveling_with}</div>
                    )}
                  </div>
                  <span className="self-center"><StatusBadge status={b.status} /></span>
                  <span className="text-xs admin-muted self-center">{formatDate(b.fly_in)}</span>
                  <span className="text-xs admin-muted self-center">{formatDate(b.fly_out)}</span>
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

      {tab === "rooms" && (
        <div>
          {rooms.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No hotel rooms assigned</p>
              <p className="text-xs admin-faint mt-1">Room assignments for this experience will appear here</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_140px_140px_80px_120px_1fr] gap-4 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Room</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hotel</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Guest</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Notes</span>
              </div>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="grid grid-cols-[1fr_140px_140px_80px_120px_1fr] gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium admin-heading truncate">{room.name}</div>
                    {room.room_number && <div className="text-xs admin-faint">#{room.room_number}</div>}
                  </div>
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
                    {room.booking?.name?.split(" — ")[0] || room.booking?.name?.split(" - ")[0] || room.partner_tag_along || "—"}
                  </span>
                  <span className="text-xs admin-faint self-center truncate">
                    {room.comments || room.partner_tag_along || "—"}
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
