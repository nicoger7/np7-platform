"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type DocumentType, formatMoney } from "@/lib/invoices/types";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  email2: string | null;
  phone: string | null;
  country: string | null;
  discipline: string | null;
  level: string | null;
  level_notes: string | null;
  source: string | null;
  tshirt_size: string | null;
  diet_allergies: string | null;
  notes: string | null;
  date_of_birth: string | null;
  accepts_marketing: boolean;
  experience_locations: string[] | null;
  interested_products: string[] | null;
  ai_summary: string | null;
  chatwoot_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ContactBooking {
  id: string;
  name: string;
  status: string;
  agreed_price: number | null;
  created_at: string;
  exp_experiences: { title: string } | null;
}

interface ContactDocument {
  id: string;
  booking_id: string | null;
  contact_id: string | null;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string;
  status: "issued" | "void";
  issued_at: string;
  signedUrl: string | null;
  booking_name?: string | null;
}

export function ContactDetailPane({ contactId, onBack }: { contactId: string; onBack?: () => void }) {
  const id = contactId;
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [bookings, setBookings] = useState<ContactBooking[]>([]);
  const [contactDocs, setContactDocs] = useState<ContactDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [productInput, setProductInput] = useState("");
  // Back target — honour ?from= (e.g. opened from a member) so "back" returns there.
  const [backHref, setBackHref] = useState("/admin/contacts");
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from) setBackHref(from);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/contacts/${id}`).then((r) => r.json()),
      fetch(`/api/admin/bookings?contact_id=${id}`).then((r) => r.json()),
      fetch(`/api/admin/documents`).then((r) => r.json()),
    ]).then(([d, b, allDocs]) => {
      setContact(d);
      setBookings(b.bookings || []);
      const docs: ContactDocument[] = (allDocs.documents || []).filter(
        (doc: ContactDocument) => doc.contact_id === id
      );
      setContactDocs(docs);
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    if (!contact) return;
    setSaving(true);
    const { id: _id, created_at: _c, updated_at: _u, ...fields } = contact;
    await fetch(`/api/admin/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addTag(field: "experience_locations" | "interested_products", value: string) {
    if (!contact || !value.trim()) return;
    const arr = contact[field] || [];
    if (!arr.includes(value.trim())) {
      update(field, [...arr, value.trim()]);
    }
  }

  function removeTag(field: "experience_locations" | "interested_products", value: string) {
    if (!contact) return;
    update(field, (contact[field] || []).filter((x) => x !== value));
  }

  async function handleDelete() {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    await fetch(`/api/admin/contacts/${id}`, { method: "DELETE" });
    router.push("/admin/contacts");
  }

  function update(field: string, value: unknown) {
    setContact((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) return <div className="text-sm admin-faint">Loading...</div>;
  if (!contact) return <div className="text-sm text-red-400">Contact not found</div>;

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

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
            <h1 className="text-2xl font-bold admin-heading">{contact.name}</h1>
            <p className="text-sm admin-muted">{contact.email || "No email"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      <div className="max-w-[720px] space-y-5">
        {/* Name */}
        <div>
          <label className={labelClass}>Name</label>
          <input className={inputClass} value={contact.name || ""} onChange={(e) => update("name", e.target.value)} />
        </div>

        {/* Emails */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} type="email" value={contact.email || ""} onChange={(e) => update("email", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Email 2</label>
            <input className={inputClass} type="email" value={contact.email2 || ""} onChange={(e) => update("email2", e.target.value || null)} />
          </div>
        </div>

        {/* Phone & Country */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={contact.phone || ""} onChange={(e) => update("phone", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Country</label>
            <input className={inputClass} value={contact.country || ""} onChange={(e) => update("country", e.target.value || null)} />
          </div>
        </div>

        {/* Discipline & Level */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Discipline</label>
            <select className={inputClass} value={contact.discipline || ""} onChange={(e) => update("discipline", e.target.value || null)}>
              <option value="">—</option>
              <option>Windsurf</option>
              <option>Wingfoil</option>
              <option>Kitesurf</option>
              <option>Surf</option>
              <option>SUP</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Level</label>
            <select className={inputClass} value={contact.level || ""} onChange={(e) => update("level", e.target.value || null)}>
              <option value="">—</option>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
              <option>Pro</option>
            </select>
          </div>
        </div>

        {/* Source & T-shirt */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Source</label>
            <select className={inputClass} value={contact.source || ""} onChange={(e) => update("source", e.target.value || null)}>
              <option value="">—</option>
              <option value="website">Website</option>
              <option value="instagram">Instagram</option>
              <option value="referral">Referral</option>
              <option value="facebook">Facebook</option>
              <option value="google">Google</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>T-shirt size</label>
            <select className={inputClass} value={contact.tshirt_size || ""} onChange={(e) => update("tshirt_size", e.target.value || null)}>
              <option value="">—</option>
              <option>XS</option>
              <option>S</option>
              <option>M</option>
              <option>L</option>
              <option>XL</option>
              <option>XXL</option>
            </select>
          </div>
        </div>

        {/* Diet / Allergies */}
        <div>
          <label className={labelClass}>Diet / Allergies</label>
          <input className={inputClass} value={contact.diet_allergies || ""} onChange={(e) => update("diet_allergies", e.target.value || null)} placeholder="Any dietary requirements or allergies" />
        </div>

        {/* Level notes */}
        <div>
          <label className={labelClass}>Level Notes</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={contact.level_notes || ""}
            onChange={(e) => update("level_notes", e.target.value || null)}
            placeholder="Additional notes about the rider's level..."
          />
        </div>

        {/* Date of birth & accepts marketing */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input
              type="date"
              className={inputClass}
              value={contact.date_of_birth || ""}
              onChange={(e) => update("date_of_birth", e.target.value || null)}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={contact.accepts_marketing || false}
                onChange={(e) => update("accepts_marketing", e.target.checked)}
                className="w-4 h-4 accent-[#0aa3c7]"
              />
              <span className="text-sm admin-muted">Accepts marketing</span>
            </label>
          </div>
        </div>

        {/* Experience Locations */}
        <div>
          <label className={labelClass}>Experience Locations</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(contact.experience_locations || []).map((loc) => (
              <span key={loc} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs admin-muted" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                {loc}
                <button onClick={() => removeTag("experience_locations", loc)} className="admin-faint hover:text-red-400 ml-1">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Add location..."
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && locationInput.trim()) { addTag("experience_locations", locationInput); setLocationInput(""); } }}
            />
            <button onClick={() => { addTag("experience_locations", locationInput); setLocationInput(""); }} className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>Add</button>
          </div>
        </div>

        {/* Interested Products */}
        <div>
          <label className={labelClass}>Interested Products</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(contact.interested_products || []).map((p) => (
              <span key={p} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs admin-muted" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                {p}
                <button onClick={() => removeTag("interested_products", p)} className="admin-faint hover:text-red-400 ml-1">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Add product..."
              value={productInput}
              onChange={(e) => setProductInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && productInput.trim()) { addTag("interested_products", productInput); setProductInput(""); } }}
            />
            <button onClick={() => { addTag("interested_products", productInput); setProductInput(""); }} className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>Add</button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            value={contact.notes || ""}
            onChange={(e) => update("notes", e.target.value || null)}
            placeholder="Internal notes..."
          />
        </div>

        {/* Chatwoot ID (read-only) */}
        {contact.chatwoot_contact_id && (
          <div>
            <label className={labelClass}>Chatwoot Contact ID <span className="text-[10px] admin-faint">(read-only)</span></label>
            <input className={`${inputClass} opacity-60`} value={contact.chatwoot_contact_id} readOnly />
          </div>
        )}

        {/* Related Bookings */}
        {bookings.length > 0 && (
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-3">Bookings ({bookings.length})</h3>
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_120px_100px_100px] gap-3 px-4 py-2.5 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Booking</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Experience</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
              </div>
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1fr_120px_100px_100px] gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onClick={() => router.push(`/admin/bookings/${b.id}`)}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <span className="text-sm font-medium admin-heading truncate">{b.name}</span>
                  <span className="text-xs admin-muted self-center truncate">{b.exp_experiences?.title || "—"}</span>
                  <span className="text-xs admin-muted self-center capitalize">{b.status}</span>
                  <span className="text-xs admin-muted self-center">{b.agreed_price ? `€${Number(b.agreed_price).toLocaleString()}` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        {contactDocs.length > 0 && (
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-3">Documents ({contactDocs.length})</h3>
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div
                className="grid gap-3 px-4 py-2.5 admin-surface"
                style={{ gridTemplateColumns: "130px 1fr 110px 90px 70px 60px", borderBottom: "1px solid var(--admin-border)" }}
              >
                {["Invoice #", "Title / Booking", "Type", "Amount", "Date", ""].map((h) => (
                  <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
                ))}
              </div>
              {contactDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="grid gap-3 px-4 py-3 transition-colors"
                  style={{ gridTemplateColumns: "130px 1fr 110px 90px 70px 60px", borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-xs font-mono admin-muted self-center truncate">
                    {doc.invoice_number || "—"}
                  </span>
                  <div className="min-w-0 self-center">
                    <div className="text-sm font-medium admin-heading truncate">
                      {doc.title || doc.type.replace(/_/g, " ")}
                    </div>
                    {doc.booking_id && (
                      <Link
                        href={`/admin/bookings/${doc.booking_id}`}
                        className="text-xs admin-faint hover:text-[#0aa3c7] truncate block"
                      >
                        {doc.booking_name || doc.booking_id}
                      </Link>
                    )}
                  </div>
                  <span className="text-xs admin-muted self-center capitalize">
                    {doc.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium admin-heading self-center">
                    {formatMoney(doc.amount, doc.currency)}
                  </span>
                  <span className="text-xs admin-faint self-center">
                    {new Date(doc.issued_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                  <div className="self-center">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The /admin/contacts/[id] route — renders the pane full-page for deep links.
// The Contacts list renders the same pane inline (split view) via ?id=.
export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ContactDetailPane contactId={id} />;
}
