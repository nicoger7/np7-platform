"use client";

import { useState, useEffect, useCallback } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { editionLabel } from "@/lib/edition-label";

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
const EMPTY = { author_name: "", author_country: "", rating: "5", quote: "", photo_url: "", status: "approved" };

export default function GuestReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "hidden">("all");
  const [selId, setSelId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
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
  const selReview = selId && selId !== "new" ? reviews.find((r) => r.id === selId) ?? null : null;

  function openNew() { setSelId("new"); setForm(EMPTY); }
  function openReview(r: Review) {
    setSelId(r.id);
    setForm({ author_name: r.author_name ?? "", author_country: r.author_country ?? "", rating: String(r.rating ?? 5), quote: r.quote ?? "", photo_url: r.photo_url ?? "", status: r.status });
  }
  function close() { setSelId(null); }

  async function save() {
    if (!form.quote.trim()) return;
    setSaving(true);
    const body = { ...form, rating: Number(form.rating) };
    if (selId === "new") {
      await fetch("/api/admin/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/reviews/${selId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setSaving(false); close(); load();
  }
  async function remove() {
    if (selId === "new" || !selId) return;
    if (!confirm("Delete this review?")) return;
    await fetch(`/api/admin/reviews/${selId}`, { method: "DELETE" });
    close(); load();
  }
  // Fast moderation straight from the list — no need to open the editor.
  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";
  const stars = (n: number | null) => "★".repeat(Math.max(1, Math.min(5, n || 5)));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Guest Reviews</h1>
          <p className="text-sm admin-muted">Participant submissions — approve and place them on experiences/editions.</p>
        </div>
        {!selId && <button onClick={openNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Review</button>}
      </div>

      {!selId && (
        <div className="flex items-center gap-2 mb-5">
          {(["all", "pending", "approved", "hidden"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${filter === f ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]" : "admin-surface admin-muted"}`} style={{ border: "1px solid var(--admin-border)" }}>
              {f} <span className="admin-faint">({counts[f]})</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : selId ? (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* rail */}
          <div className="lg:w-64 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[82vh] lg:overflow-y-auto lg:pr-1">
            <button onClick={close} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All reviews
            </button>
            <button onClick={openNew} className={`shrink-0 text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${selId === "new" ? "text-[var(--admin-accent-contrast)]" : "text-[#0aa3c7]"}`} style={{ background: selId === "new" ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>+ New review</button>
            {filtered.map((r) => {
              const active = r.id === selId;
              return (
                <button key={r.id} onClick={() => openReview(r)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                  <span className={`flex items-center gap-1.5 ${active ? "text-[var(--admin-accent-contrast)]" : ""}`}>
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: r.status === "approved" ? "#22c55e" : r.status === "pending" ? "#eab308" : "#94a3b8" }} />
                    <span className={`text-xs font-semibold truncate ${active ? "" : "admin-heading"}`}>{r.author_name || "Anonymous"}</span>
                    <span className={`ml-auto text-[10px] ${active ? "text-[var(--admin-accent-contrast)]/80" : "text-[#ffc42e]"}`}>{stars(r.rating)}</span>
                  </span>
                  <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{r.quote || "—"}</span>
                </button>
              );
            })}
          </div>

          {/* detail editor */}
          <div className="flex-1 min-w-0">
            <div className="p-5 rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-bold admin-heading">{selId === "new" ? "New review" : "Edit review"}</h3>
                {selReview && (selReview.booking_id ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00afdb]/15 text-[#0aa3c7]" title="Tied to a real booking">✓ Verified</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 admin-faint" title="Hand-entered, not linked to a booking">Manual</span>
                ))}
                {selReview?.exp_experiences && <span className="text-[11px] admin-faint truncate">on {selReview.exp_experiences.title}{selReview.exp_editions ? ` · ${editionLabel(selReview.exp_editions)}` : ""}</span>}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>Author</label><input className={inputClass} value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} placeholder="Anonymous" /></div>
                <div><label className={labelClass}>Country</label><input className={inputClass} value={form.author_country} onChange={(e) => setForm({ ...form, author_country: e.target.value })} /></div>
                <div><label className={labelClass}>Rating</label>
                  <select className={inputClass} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Photo</label>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: form.photo_url ? `url('${form.photo_url}')` : undefined, border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }} />
                    <button onClick={() => setPicker(true)} className="flex-1 px-3 py-2 admin-input border rounded-lg text-sm text-left admin-muted">{form.photo_url ? "Change…" : "Pick…"}</button>
                    {form.photo_url && <button onClick={() => setForm({ ...form, photo_url: "" })} className="text-xs admin-faint hover:text-red-400 px-1">clear</button>}
                  </div>
                </div>
              </div>

              <div className="mt-4"><label className={labelClass}>Quote *</label>
                <textarea className={`${inputClass} min-h-[100px] resize-y`} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
              </div>

              <div className="mt-4">
                <label className={labelClass}>Status</label>
                <div className="flex rounded-lg overflow-hidden w-max" style={{ border: "1px solid var(--admin-border)" }}>
                  {STATUSES.map((s) => {
                    const on = form.status === s;
                    return <button key={s} onClick={() => setForm({ ...form, status: s })} className="px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors" style={on ? { background: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : { color: "var(--admin-text-muted)" }}>{s}</button>;
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button onClick={save} disabled={saving || !form.quote.trim()} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{saving ? "Saving…" : selId === "new" ? "Create review" : "Save review"}</button>
                <button onClick={close} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                {selId !== "new" && <button onClick={remove} className="ml-auto px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete</button>}
              </div>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No reviews{filter !== "all" ? ` (${filter})` : ""} yet</p><p className="text-xs admin-faint mt-1">Participants submit these post-trip from the member area.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} onClick={() => openReview(r)} className="flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-colors" style={{ border: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <div className="w-16 h-16 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: r.photo_url ? `url('${r.photo_url}')` : undefined, border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[#ffc42e] text-sm">{stars(r.rating)}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span>
                  {r.booking_id ? (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#00afdb]/15 text-[#0aa3c7]" title="Tied to a real booking">✓ Verified</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 admin-faint" title="Hand-entered, not linked to a booking">Manual</span>
                  )}
                  {r.exp_experiences && <span className="text-[11px] admin-faint truncate">{r.exp_experiences.title}{r.exp_editions ? ` · ${editionLabel(r.exp_editions)}` : ""}</span>}
                </div>
                <p className="text-sm admin-heading line-clamp-2">{r.quote || "—"}</p>
                <p className="text-[11px] admin-faint mt-1">{r.author_name || "Anonymous"}{r.author_country ? ` · ${r.author_country}` : ""}</p>
              </div>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="px-2 py-1 admin-input border rounded-lg text-xs">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
