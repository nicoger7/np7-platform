"use client";

import { useState, useEffect, useCallback } from "react";
import ImagePickerModal from "@/components/image-picker-modal";

interface Review {
  id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number | null;
  quote: string | null;
  photo_url: string | null;
  status: string;
  booking_id: string | null;
  submitted_at: string | null;
  created_at: string;
  experience_id: string | null;
  edition_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  exp_editions: { id: string; label: string | null; year: number | null } | null;
}

const STATUSES = ["pending", "approved", "hidden"] as const;
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-500",
  approved: "bg-green-500/15 text-green-400",
  hidden: "bg-gray-500/15 text-gray-400",
};

export default function GuestReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "hidden">("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ author_name: "", author_country: "", rating: "5", quote: "", photo_url: "" });
  const [picker, setPicker] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/reviews").then((r) => r.json()).then((d) => {
      setReviews(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);
  const counts = {
    all: reviews.length,
    pending: reviews.filter((r) => r.status === "pending").length,
    approved: reviews.filter((r) => r.status === "approved").length,
    hidden: reviews.filter((r) => r.status === "hidden").length,
  };

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    load();
  }
  async function create() {
    if (!form.quote.trim()) return;
    await fetch("/api/admin/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rating: Number(form.rating), status: "approved" }),
    });
    setForm({ author_name: "", author_country: "", rating: "5", quote: "", photo_url: "" });
    setShowNew(false); load();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const stars = (n: number | null) => "★".repeat(Math.max(1, Math.min(5, n || 5)));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Guest Reviews</h1>
          <p className="text-sm admin-muted">Participant submissions — approve and place them on experiences/editions.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">New Review</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        {(["all", "pending", "approved", "hidden"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${filter === f ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-surface admin-muted"}`} style={{ border: "1px solid var(--admin-border)" }}>
            {f} <span className="admin-faint">({counts[f]})</span>
          </button>
        ))}
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Review</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><label className={labelClass}>Author</label><input className={inputClass} value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} /></div>
            <div><label className={labelClass}>Country</label><input className={inputClass} value={form.author_country} onChange={(e) => setForm({ ...form, author_country: e.target.value })} /></div>
            <div><label className={labelClass}>Rating</label>
              <select className={inputClass} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Photo</label><button onClick={() => setPicker(true)} className={`${inputClass} text-left admin-muted`}>{form.photo_url ? "Photo ✓" : "Pick…"}</button></div>
          </div>
          <div className="mb-4"><label className={labelClass}>Quote *</label><textarea className={`${inputClass} min-h-[60px] resize-y`} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={create} disabled={!form.quote.trim()} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No reviews{filter !== "all" ? ` (${filter})` : ""} yet</p><p className="text-xs admin-faint mt-1">Participants submit these post-trip from the member area.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-start gap-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="w-16 h-16 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: r.photo_url ? `url('${r.photo_url}')` : undefined, border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#ffc42e] text-sm">{stars(r.rating)}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span>
                  {r.booking_id ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00afdb]/15 text-[#0aa3c7]" title="Tied to a real booking">✓ Verified</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 admin-faint" title="Hand-entered, not linked to a booking">Manual</span>
                  )}
                  {r.exp_experiences && <span className="text-[11px] admin-faint truncate">{r.exp_experiences.title}{r.exp_editions ? ` · ${r.exp_editions.label || r.exp_editions.year}` : ""}</span>}
                </div>
                <textarea
                  defaultValue={r.quote ?? ""}
                  onBlur={(e) => { if (e.target.value !== (r.quote ?? "")) patch(r.id, { quote: e.target.value }); }}
                  className="w-full bg-transparent text-sm admin-heading resize-y min-h-[40px] outline-none"
                />
                <div className="flex items-center gap-3 mt-1 text-[11px] admin-faint">
                  <input defaultValue={r.author_name ?? ""} placeholder="author" onBlur={(e) => { if (e.target.value !== (r.author_name ?? "")) patch(r.id, { author_name: e.target.value }); }} className="bg-transparent outline-none border-b border-transparent focus:border-[#0aa3c7] w-28" />
                  <input defaultValue={r.author_country ?? ""} placeholder="country" onBlur={(e) => { if (e.target.value !== (r.author_country ?? "")) patch(r.id, { author_country: e.target.value }); }} className="bg-transparent outline-none border-b border-transparent focus:border-[#0aa3c7] w-24" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="px-2 py-1 admin-input border rounded-lg text-xs">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => remove(r.id)} className="text-xs admin-faint hover:text-red-400 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {picker && (
        <ImagePickerModal onSelect={(url) => { setForm((f) => ({ ...f, photo_url: url })); setPicker(false); }} onClose={() => setPicker(false)} />
      )}
    </div>
  );
}
