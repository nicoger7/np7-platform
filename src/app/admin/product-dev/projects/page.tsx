"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PD_KINDS, type PdKind, type PdStatus } from "@/lib/product-dev";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  kind: PdKind;
  status: PdStatus;
  molds: number;
  layups: number;
  updated_at: string;
}

const STATUS_COLOR: Record<PdStatus, string> = {
  concept: "admin-faint",
  in_development: "text-blue-400",
  tooling: "text-amber-400",
  pilot: "text-purple-400",
  production: "text-green-400",
  shelved: "admin-faint",
};

const STATUS_LABEL: Record<PdStatus, string> = {
  concept: "Concept",
  in_development: "In development",
  tooling: "Tooling",
  pilot: "Pilot",
  production: "Production",
  shelved: "Shelved",
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const GRID = "1fr 90px 120px 80px 90px 40px";

export default function ProductDevProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", kind: "fin" as PdKind });

  const fetchData = useCallback(() => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/product-dev/projects${qs}`)
      .then((r) => r.json())
      .then((d) => { setProjects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchData, search]);

  async function handleCreate() {
    if (!form.name) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/product-dev/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, slug: form.slug || slugify(form.name) }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/product-dev/projects/${data.id}`);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't create that project.");
      setCreating(false);
    }
  }

  async function handleArchive(p: ProjectRow) {
    if (!confirm(`Archive "${p.name}"?\n\nIts molds, build sheets and sources stay in the database and can be restored from the Archive.`)) return;
    const res = await fetch(`/api/admin/product-dev/projects/${p.id}`, { method: "DELETE" });
    if (res.ok) fetchData();
    else setError((await res.json().catch(() => ({}))).error || "Couldn't archive that project.");
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">R&amp;D projects</h1>
          <p className="text-sm admin-muted">
            {projects.length} project{projects.length !== 1 ? "s" : ""} · build sheets, tooling, process and the sources behind them
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
        >
          New project
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
          <h3 className="text-sm font-bold admin-heading mb-4">New project</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={form.name} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. NP7 Rockstar Fin" />
            </div>
            <div>
              <label className={labelClass}>Kind</label>
              <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PdKind })}>
                {PD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input className={inputClass} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder={form.name ? slugify(form.name) : "auto"} />
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
      ) : projects.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">
            {search ? "No project matches that." : "Nothing here yet — start with the product you know most about."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Inline gridTemplateColumns, not a Tailwind arbitrary class: the mobile
              rule in globals.css keys its min-width off a literal style attribute. */}
          <div className="gap-3 px-5 py-3 admin-surface" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}>
            {["Project", "Kind", "Status", "Molds", "Sheets", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {projects.map((p) => (
            <div key={p.id} className="gap-3 px-5 py-3 transition-colors group"
              style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <Link href={`/admin/product-dev/projects/${p.id}`} className="text-sm font-medium admin-heading truncate hover:text-[var(--admin-accent)] transition-colors self-center">
                {p.name}
              </Link>
              <span className="text-xs admin-muted self-center">{p.kind}</span>
              <span className={`text-xs self-center ${STATUS_COLOR[p.status] ?? "admin-muted"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
              <span className="text-xs admin-muted self-center">{p.molds || "—"}</span>
              <span className={`text-xs self-center ${p.layups > 0 ? "text-[var(--admin-accent)] font-semibold" : "admin-faint"}`}>{p.layups || "—"}</span>
              <button onClick={() => handleArchive(p)} title="Archive"
                className="text-xs admin-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs admin-faint max-w-2xl leading-relaxed">
        Everything in this section is internal. Photos uploaded here stay here — they never appear in the
        Experience or Hardware file pickers.
      </p>
    </div>
  );
}
