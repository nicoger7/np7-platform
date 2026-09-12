"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BOARD_CATEGORIES, BOARD_ORIGINS, DEFAULT_STATIONS, type BoardCategory, type BoardOrigin } from "@/lib/board-measurements";

type BoardRow = {
  id: string;
  name: string;
  brand: string | null;
  year: number | null;
  category: BoardCategory;
  origin: BoardOrigin;
  volume_l: number | null;
  max_width_cm: number | null;
  measured_at: string | null;
  readings: number;
  metrics: number;
  processes: number;
};

const ORIGIN_COLOR: Record<BoardOrigin, string> = {
  own: "text-green-400",
  prototype: "text-[var(--admin-accent)]",
  competitor: "text-amber-400",
  reference: "admin-faint",
};

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";
const GRID = "1fr 110px 90px 80px 70px 110px 40px";

export default function BoardsPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", brand: "", year: String(new Date().getFullYear()),
    category: "slalom" as BoardCategory, origin: "competitor" as BoardOrigin,
    volume_l: "", station_origin: "tail" as "tail" | "nose",
  });

  const fetchData = useCallback(() => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/product-dev/boards${qs}`)
      .then((r) => r.json())
      .then((d) => { setBoards(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchData, search]);

  async function handleCreate() {
    if (!form.name) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/product-dev/boards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        brand: form.brand || null,
        year: form.year ? Number(form.year) : null,
        category: form.category,
        origin: form.origin,
        volume_l: form.volume_l ? Number(form.volume_l) : null,
        station_origin: form.station_origin,
        // A new board starts with a station grid rather than an empty table:
        // the first thing you do is fill in numbers, not build a form.
        stations: DEFAULT_STATIONS,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/product-dev/boards/${data.id}`);
    } else {
      setError((await res.json().catch(() => ({}))).error || "Couldn't create that board.");
      setCreating(false);
    }
  }

  async function handleArchive(b: BoardRow) {
    if (!confirm(`Archive "${b.name}"?\n\nEvery reading, cut-out and note stays in the database.`)) return;
    const res = await fetch(`/api/admin/product-dev/boards/${b.id}`, { method: "DELETE" });
    if (res.ok) fetchData();
    else setError((await res.json().catch(() => ({}))).error || "Couldn't archive that board.");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Boards</h1>
          <p className="text-sm admin-muted">
            {boards.length} board{boards.length !== 1 ? "s" : ""} · measurements, 2D plans, cut-outs and the build
          </p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          New board
        </button>
      </div>

      <div className="mb-5">
        <input className={`${inputClass} max-w-sm`} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>
      )}

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New board</h3>
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 mb-4">
            <div className="sm:col-span-3">
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={form.name} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. FMX 2026 Slalom 85" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Brand</label>
              <input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="FMX" />
            </div>
            <div>
              <label className={labelClass}>Year</label>
              <input className={inputClass} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BoardCategory })}>
                {BOARD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Whose board</label>
              <select className={inputClass} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value as BoardOrigin })}>
                {BOARD_ORIGINS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Volume (l)</label>
              <input className={inputClass} value={form.volume_l} onChange={(e) => setForm({ ...form, volume_l: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} title="Which end the tape hooks on.">Measure from</label>
              <select className={inputClass} value={form.station_origin}
                onChange={(e) => setForm({ ...form, station_origin: e.target.value as "tail" | "nose" })}>
                <option value="tail">the tail</option>
                <option value="nose">the nose</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || creating}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              {creating ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : boards.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint max-w-md mx-auto leading-relaxed">
            {search
              ? "No board matches that."
              : "Nothing here yet. Start with a board you can put a straightedge on — your own or somebody else's."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="gap-3 px-5 py-3 admin-surface" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}>
            {["Board", "Category", "Whose", "Volume", "Readings", "Measured", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {boards.map((b) => (
            <div key={b.id} className="gap-3 px-5 py-3 transition-colors group"
              style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <Link href={`/admin/product-dev/boards/${b.id}`} className="min-w-0 self-center">
                <span className="block text-sm font-medium admin-heading truncate hover:text-[var(--admin-accent)] transition-colors">{b.name}</span>
                {(b.brand || b.year) && (
                  <span className="block text-[11px] admin-faint truncate">{[b.brand, b.year].filter(Boolean).join(" · ")}</span>
                )}
              </Link>
              <span className="text-xs admin-muted self-center">{b.category}</span>
              <span className={`text-xs self-center ${ORIGIN_COLOR[b.origin] ?? "admin-muted"}`}>
                {BOARD_ORIGINS.find((o) => o.key === b.origin)?.label.replace(/^Our /, "").replace(/ board$/, "") ?? b.origin}
              </span>
              <span className="text-xs admin-muted self-center">{b.volume_l ? `${b.volume_l} l` : "—"}</span>
              <span className={`text-xs self-center ${b.readings > 0 ? "text-[var(--admin-accent)] font-semibold" : "admin-faint"}`}>
                {b.readings || "—"}
                {b.metrics > 0 && <span className="admin-faint font-normal"> / {b.metrics}</span>}
              </span>
              <span className="text-xs admin-muted self-center">
                {b.measured_at ? new Date(b.measured_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
              </span>
              <button onClick={() => handleArchive(b)} title="Archive"
                className="text-xs admin-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity self-center">✕</button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs admin-faint max-w-2xl leading-relaxed">
        Readings counts every number on the board; the figure after the slash is how many of the six
        measurements it covers. Everything in this section is internal.
      </p>
    </div>
  );
}
