"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types (mirroring /api/admin/windcoach-guides) ───────────────────────────

type Block = { kind?: string; text?: string };
type FocusPoint = {
  key?: string; // wind.coach book id like "1.1.3.2" — shown verbatim
  title?: string;
  summary?: string;
  blocks?: Block[];
  image_urls?: string[];
};
type Edition = { label: string | null; date_start: string | null; date_end: string | null };
type CandidateBooking = {
  booking_id: string;
  booking_name: string | null;
  booking_status: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  experience_title: string | null;
  edition: Edition | null;
};
type Guide = {
  id: string;
  status: "stored" | "review";
  email: string;
  name: string | null;
  trip_label: string | null;
  trip_start: string | null;
  trip_end: string | null;
  focus_points: FocusPoint[];
  coach_note: string | null;
  generated_at: string | null;
  created_at: string;
  booking_id: string | null;
  booking: CandidateBooking | null;
  candidates: CandidateBooking[];
};

// ─── Block rendering rules ───────────────────────────────────────────────────
// Known kinds render in this fixed order; unknown kinds follow in payload order
// with a prettified slug as their label — never dropped.

const KIND_LABELS: Record<string, string> = {
  what_to_do: "What to do",
  how: "How",
  why: "Why",
  common_mistakes: "Common mistakes",
  coach_tip: "Coach tip",
};
const KIND_ORDER = Object.keys(KIND_LABELS);

function kindLabel(kind: string | undefined): string {
  if (!kind) return "Note";
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const words = kind.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Note";
}

function orderedBlocks(blocks: Block[] | undefined): Block[] {
  const list = Array.isArray(blocks) ? blocks : [];
  const known = list.filter((b) => KIND_ORDER.includes(b.kind ?? ""));
  known.sort((a, b) => KIND_ORDER.indexOf(a.kind ?? "") - KIND_ORDER.indexOf(b.kind ?? ""));
  const unknown = list.filter((b) => !KIND_ORDER.includes(b.kind ?? ""));
  return [...known, ...unknown];
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function tripWindow(start: string | null, end: string | null): string {
  if (start && end) return `${fmtDate(start)} to ${fmtDate(end)}`;
  return fmtDate(start || end);
}

/** One line of booking context: experience, edition, dates, contact email. */
function bookingLine(b: CandidateBooking): string {
  const ed = b.edition;
  const dates = ed?.date_start ? tripWindow(ed.date_start, ed.date_end) : "";
  return [b.experience_title, ed?.label, dates, b.contact_email].filter(Boolean).join(" · ");
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function CandidateRow({ b, onAttach, busy }: { b: CandidateBooking; onAttach: (bookingId: string) => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold admin-heading truncate">
          {b.booking_name || b.contact_name || "Unnamed booking"}
          {b.booking_status && <span className="ml-1.5 admin-faint font-normal capitalize">({b.booking_status})</span>}
        </p>
        <p className="text-[11px] admin-muted truncate">{bookingLine(b) || "No trip details on this booking"}</p>
      </div>
      <button
        onClick={() => onAttach(b.booking_id)}
        disabled={busy}
        className="shrink-0 px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
      >
        Attach
      </button>
    </div>
  );
}

function BookingSearch({ onAttach, busy }: { onAttach: (bookingId: string) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CandidateBooking[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/windcoach-guides?q=${encodeURIComponent(term)}`);
      const d = await r.json().catch(() => ({}));
      setResults(Array.isArray(d.bookings) ? (d.bookings as CandidateBooking[]) : []);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider admin-faint mb-1.5">Attach manually</p>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 px-3 py-2 admin-input border rounded-lg text-sm"
          placeholder="Search bookings by contact name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button
          onClick={search}
          disabled={searching || !q.trim()}
          className="admin-btn admin-btn-ghost"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {results !== null && (
        <div className="mt-2 space-y-1.5">
          {results.length === 0 ? (
            <p className="text-xs admin-faint">No bookings match that search.</p>
          ) : (
            results.map((b) => <CandidateRow key={b.booking_id} b={b} onAttach={onAttach} busy={busy} />)
          )}
        </div>
      )}
    </div>
  );
}

/** The full guide content: coach note + focus points with their blocks. */
function GuidePreview({ guide }: { guide: Guide }) {
  const points = Array.isArray(guide.focus_points) ? guide.focus_points : [];
  return (
    <div className="mt-3 space-y-3">
      {guide.coach_note && (
        <div className="p-3 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider admin-faint mb-1">Coach note</p>
          <p className="text-sm admin-heading whitespace-pre-wrap">{guide.coach_note}</p>
        </div>
      )}
      {points.length === 0 && <p className="text-xs admin-faint">This guide carries no focus points.</p>}
      {points.map((fp, i) => (
        <div key={i} className="p-3 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            {fp.key && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded admin-muted" style={{ border: "1px solid var(--admin-border)" }}>
                {fp.key}
              </span>
            )}
            <span className="text-sm font-bold admin-heading">{fp.title || "Untitled focus point"}</span>
          </div>
          {fp.summary && <p className="text-xs admin-muted mt-1">{fp.summary}</p>}
          <div className="mt-2 space-y-2">
            {orderedBlocks(fp.blocks).map((b, j) => (
              <div key={j}>
                <p className="text-[10px] font-bold uppercase tracking-wider admin-faint">{kindLabel(b.kind)}</p>
                <p className="text-sm admin-heading whitespace-pre-wrap">{b.text ?? ""}</p>
              </div>
            ))}
          </div>
          {Array.isArray(fp.image_urls) && fp.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {fp.image_urls.map((u, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={u} alt="" className="w-16 h-16 object-cover rounded-lg" style={{ border: "1px solid var(--admin-border)" }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WindcoachGuidesPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch("/api/admin/windcoach-guides")
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        setGuides(Array.isArray(d.guides) ? (d.guides as Guide[]) : []);
        setLoading(false);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function post(body: Record<string, string>, guideId: string) {
    setBusyId(guideId);
    setError(null);
    try {
      const r = await fetch("/api/admin/windcoach-guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(typeof d.error === "string" ? d.error : "That did not work. Please try again.");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }
  const attach = (guideId: string, bookingId: string) =>
    post({ action: "attach", guide_id: guideId, booking_id: bookingId }, guideId);
  const detach = (guideId: string) => {
    if (!confirm("Detach this guide from its booking and send it back to review?")) return;
    post({ action: "detach", guide_id: guideId }, guideId);
  };

  const review = guides.filter((g) => g.status === "review");
  const stored = guides.filter((g) => g.status !== "review");

  const whoLine = (g: Guide) => [g.name, g.email].filter(Boolean).join(" · ");
  const tripLine = (g: Guide) => [g.trip_label, tripWindow(g.trip_start, g.trip_end)].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">wind.coach guides</h1>
        <p className="text-sm admin-muted">
          Training guides received from wind.coach. Guides that arrived without a matching booking wait in the review
          queue until you attach them by hand.
        </p>
      </div>

      {error && <div className="mb-4 px-3 py-2 rounded-lg text-sm text-red-400 bg-red-500/10">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : (
        <div className="space-y-8">
          {/* ── Needs review ── */}
          <section>
            <h2 className="text-[11px] font-bold tracking-[0.15em] admin-faint mb-3">NEEDS REVIEW ({review.length})</h2>
            {review.length === 0 ? (
              <div className="admin-card p-6 text-center">
                <p className="text-sm admin-faint">Nothing waiting for review. Guides that cannot be matched to a booking automatically will show up here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {review.map((g) => {
                  const busy = busyId === g.id;
                  return (
                    <div key={g.id} className="admin-card p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/15 text-yellow-500">Review</span>
                        <span className="text-sm font-bold admin-heading truncate">{whoLine(g) || "Unknown sender"}</span>
                        <span className="ml-auto text-[11px] admin-faint">received {fmtDate(g.created_at)}</span>
                      </div>
                      <p className="text-xs admin-muted mt-1">
                        {tripLine(g) || "No trip details on this guide"}
                        {g.focus_points.length > 0 && (
                          <span className="admin-faint">
                            {" "}
                            · {g.focus_points.length} focus point{g.focus_points.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                      <button onClick={() => toggle(g.id)} className="mt-2 text-xs font-semibold text-[#0aa3c7] hover:underline">
                        {expanded.has(g.id) ? "Hide guide" : "Show guide"}
                      </button>
                      {expanded.has(g.id) && <GuidePreview guide={g} />}

                      <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider admin-faint mb-1.5">Candidate bookings</p>
                        {g.candidates.length === 0 ? (
                          <p className="text-xs admin-faint">No bookings share this email address. Use the search below to find the right booking.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {g.candidates.map((b) => (
                              <CandidateRow key={b.booking_id} b={b} onAttach={(bookingId) => attach(g.id, bookingId)} busy={busy} />
                            ))}
                          </div>
                        )}
                      </div>

                      <BookingSearch onAttach={(bookingId) => attach(g.id, bookingId)} busy={busy} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Stored ── */}
          <section>
            <h2 className="text-[11px] font-bold tracking-[0.15em] admin-faint mb-3">STORED ({stored.length})</h2>
            {stored.length === 0 ? (
              <div className="admin-card p-6 text-center">
                <p className="text-sm admin-faint">No guides stored yet. Matched guides land here together with their booking.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stored.map((g) => {
                  const busy = busyId === g.id;
                  return (
                    <div key={g.id} className="admin-card p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-500/15 text-green-400">Stored</span>
                        <span className="text-sm font-bold admin-heading truncate">{whoLine(g) || "Unknown sender"}</span>
                        <span className="ml-auto text-[11px] admin-faint">received {fmtDate(g.created_at)}</span>
                      </div>
                      <p className="text-xs admin-muted mt-1">{tripLine(g) || "No trip details on this guide"}</p>
                      <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg admin-surface" style={{ border: "1px solid var(--admin-border)" }}>
                        <div className="min-w-0 flex-1">
                          {g.booking ? (
                            <>
                              <p className="text-xs font-semibold admin-heading truncate">
                                Booking: {g.booking.booking_name || g.booking.contact_name || "Unnamed booking"}
                                {g.booking.booking_status && <span className="ml-1.5 admin-faint font-normal capitalize">({g.booking.booking_status})</span>}
                              </p>
                              <p className="text-[11px] admin-muted truncate">{bookingLine(g.booking) || "No trip details on this booking"}</p>
                            </>
                          ) : (
                            <p className="text-xs admin-faint">Stored without a booking link.</p>
                          )}
                        </div>
                        <button
                          onClick={() => detach(g.id)}
                          disabled={busy}
                          className="shrink-0 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40 rounded-lg transition-colors"
                        >
                          {g.booking ? "Detach" : "Send to review"}
                        </button>
                      </div>
                      <button onClick={() => toggle(g.id)} className="mt-2 text-xs font-semibold text-[#0aa3c7] hover:underline">
                        {expanded.has(g.id) ? "Hide guide" : "Show guide"}
                      </button>
                      {expanded.has(g.id) && <GuidePreview guide={g} />}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
