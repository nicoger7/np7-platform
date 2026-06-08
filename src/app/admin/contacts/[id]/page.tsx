"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  email2: string | null;
  phone: string | null;
  country: string | null;
  discipline: string | null;
  level: string | null;
  source: string | null;
  tshirt_size: string | null;
  diet_allergies: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/contacts/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setContact(d);
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
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/contacts")} className="admin-faint transition-colors">
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
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
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
      </div>
    </div>
  );
}
