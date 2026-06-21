"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["Hotel", "Transport", "Catering", "Gear", "Photography", "Media", "Other"];

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/vendors/${id}`).then((r) => r.json()).then((d) => { setVendor(d); setLoading(false); });
  }, [id]);

  async function handleSave() {
    if (!vendor) return;
    setSaving(true);
    const { id: _id, created_at: _c, updated_at: _u, ...fields } = vendor;
    await fetch(`/api/admin/vendors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this vendor?")) return;
    await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
    router.push("/admin/vendors");
  }

  function update(field: string, value: unknown) {
    setVendor((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) return <div className="text-sm admin-faint">Loading...</div>;
  if (!vendor) return <div className="text-sm text-red-400">Vendor not found</div>;

  const inputClass = "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/vendors")} className="admin-faint transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold admin-heading">{vendor.name}</h1>
            <p className="text-sm admin-muted">{vendor.company || vendor.category || "Vendor"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleDelete} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors">Delete</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors">
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="max-w-[720px] space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Name</label><input className={inputClass} value={vendor.name || ""} onChange={(e) => update("name", e.target.value)} /></div>
          <div><label className={labelClass}>Company</label><input className={inputClass} value={vendor.company || ""} onChange={(e) => update("company", e.target.value || null)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelClass}>Category</label>
            <select className={inputClass} value={vendor.category || ""} onChange={(e) => update("category", e.target.value || null)}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={vendor.email || ""} onChange={(e) => update("email", e.target.value || null)} /></div>
          <div><label className={labelClass}>Phone</label><input className={inputClass} value={vendor.phone || ""} onChange={(e) => update("phone", e.target.value || null)} /></div>
        </div>
        <div><label className={labelClass}>Notes</label>
          <textarea className={`${inputClass} min-h-[100px] resize-y`} value={vendor.notes || ""} onChange={(e) => update("notes", e.target.value || null)} placeholder="Internal notes..." />
        </div>
      </div>
    </div>
  );
}
