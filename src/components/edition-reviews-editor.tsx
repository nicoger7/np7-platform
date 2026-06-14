"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Review {
  id: string;
  author_name: string | null;
  author_country: string | null;
  rating: number | null;
  quote: string | null;
  photo_url: string | null;
  status: string;
}

interface Placement {
  id: string;
  review_id: string;
  sort_order: number;
  exp_reviews: Review | null;
}

/**
 * Curate which approved reviews appear on this edition: pick from the pool,
 * reorder, remove. The pool is filled by participant submissions (member area)
 * and managed at /admin/reviews.
 */
export function EditionReviewsEditor({ editionId, experienceId }: { editionId: string; experienceId: string }) {
  const [placed, setPlaced] = useState<Placement[]>([]);
  const [pool, setPool] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/admin/editions/${editionId}/reviews`).then((r) => r.json()),
      fetch(`/api/admin/reviews?status=approved`).then((r) => r.json()),
    ]).then(([p, pool]) => {
      setPlaced(Array.isArray(p) ? p : []);
      setPool(Array.isArray(pool) ? pool : []);
      setLoading(false);
    });
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  const placedIds = new Set(placed.map((p) => p.review_id));

  async function place() {
    if (!addId) return;
    await fetch(`/api/admin/editions/${editionId}/reviews`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: addId, experience_id: experienceId }),
    });
    setAddId(""); load();
  }

  async function unplace(reviewId: string) {
    await fetch(`/api/admin/editions/${editionId}/reviews?review_id=${reviewId}`, { method: "DELETE" });
    load();
  }

  async function move(idx: number, dir: -1 | 1) {
    const a = placed[idx]; const b = placed[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      fetch(`/api/admin/editions/${editionId}/reviews`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_id: a.review_id, sort_order: b.sort_order }) }),
      fetch(`/api/admin/editions/${editionId}/reviews`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_id: b.review_id, sort_order: a.sort_order }) }),
    ]);
    load();
  }

  const inputClass = "px-2 py-1.5 admin-input border rounded-lg text-xs focus:outline-none focus:border-[#0aa3c7]";
  const stars = (n: number | null) => "★".repeat(Math.max(1, Math.min(5, n || 5)));

  if (loading) return <div className="text-xs admin-faint py-2">Loading reviews…</div>;

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold admin-heading">Reviews on this edition</h3>
          <p className="text-xs admin-faint mt-0.5">Pick approved reviews from the pool. Participants submit them post-trip; approve in <Link href="/admin/guest-reviews" className="text-[#0aa3c7] hover:underline">Reviews</Link>.</p>
        </div>
      </div>

      {placed.length === 0 ? (
        <p className="text-xs admin-faint mb-3">No reviews placed on this edition yet.</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {placed.map((p, idx) => {
            const r = p.exp_reviews;
            return (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                <div className="w-9 h-9 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: r?.photo_url ? `url('${r.photo_url}')` : undefined, border: "1px solid var(--admin-border)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs admin-muted truncate">{r?.quote ? `“${r.quote}”` : "—"}</div>
                  <div className="text-[11px] admin-faint truncate"><span className="text-[#ffc42e]">{stars(r?.rating ?? null)}</span> · {r?.author_name || "Anon"}{r?.author_country ? ` · ${r.author_country}` : ""}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="admin-faint hover:admin-heading disabled:opacity-20 text-xs px-1" title="Move up">↑</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === placed.length - 1} className="admin-faint hover:admin-heading disabled:opacity-20 text-xs px-1" title="Move down">↓</button>
                  <button onClick={() => unplace(p.review_id)} className="admin-faint hover:text-red-400 transition-colors" title="Remove">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} className={`${inputClass} flex-1`}>
          <option value="">Add an approved review…</option>
          {pool.filter((r) => !placedIds.has(r.id)).map((r) => (
            <option key={r.id} value={r.id}>{stars(r.rating)} · {r.author_name || "Anon"}{r.quote ? ` — ${r.quote.slice(0, 50)}` : ""}</option>
          ))}
        </select>
        <button onClick={place} disabled={!addId} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">Add</button>
      </div>
      {pool.length === 0 && <p className="text-[11px] admin-faint mt-2">No approved reviews yet — approve some in the <Link href="/admin/guest-reviews" className="text-[#0aa3c7] hover:underline">Reviews pool</Link>.</p>}
    </div>
  );
}
