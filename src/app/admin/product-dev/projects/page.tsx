"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PD_KINDS, type PdKind, type PdStatus } from "@/lib/product-dev";
import {
  Card, Chip, Empty, FilterPills, Icon, InfoTip, KIND_META, KindChip, PageHeader, SearchBox, StatusChip, StatusTrack,
  btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, inputCls, labelCls, toneVars,
} from "@/components/admin/pd-ui";
import { FinThumb, KindGlyph } from "@/components/admin/pd-thumbs";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  kind: PdKind;
  status: PdStatus;
  molds: number;
  layups: number;
  stages?: number;
  thumb?: { l: number; c: string | null }[];
  updated_at: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function ProductDevProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PdKind | "">("");
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

  const kinds = useMemo(() => PD_KINDS.filter((k) => projects.some((p) => p.kind === k)), [projects]);
  const shown = projects.filter((p) => !kind || p.kind === kind);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Everything in development: build sheets, tooling and how it is built.
            <InfoTip>Internal only. Photos uploaded in Product Dev never appear in the Experience or Hardware file pickers.</InfoTip>
          </span>
        }
        actions={
          <button onClick={() => setShowNew(!showNew)} className={btnPrimary} style={btnPrimaryStyle}>
            <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />New project
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search projects" />
        {kinds.length > 1 && (
          <FilterPills value={kind} onChange={setKind} options={[
            { key: "" as const, label: "All", count: projects.length },
            ...kinds.map((k) => ({ key: k, label: KIND_META[k].label, count: projects.filter((p) => p.kind === k).length, tone: KIND_META[k].tone, icon: KIND_META[k].icon })),
          ]} />
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-500" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {showNew && (
        <Card title="New project" icon="plus" tone="violet" className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-4">
            <div>
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={form.name} autoFocus placeholder="e.g. NP7 Rockstar Fin"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
              <p className="text-[11px] admin-faint mt-1">Web slug: {form.slug || (form.name ? slugify(form.name) : "made from the name")}</p>
            </div>
            <div>
              <label className={labelCls}>Kind</label>
              <div className="flex flex-wrap gap-1.5">
                {PD_KINDS.map((k) => {
                  const on = form.kind === k;
                  const m = KIND_META[k];
                  return (
                    <button key={k} onClick={() => setForm({ ...form, kind: k })} aria-pressed={on}
                      className="pd-tone inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                      style={{
                        ...toneVars(m.tone),
                        ...(on ? { backgroundColor: "var(--tone-bg)", color: "var(--tone)", border: "1px solid var(--tone-line)" }
                          : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }),
                      }}>
                      <Icon name={m.icon} className="w-4 h-4" style={{ color: "var(--tone)" }} />{m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || creating} className={btnPrimary} style={btnPrimaryStyle}>
              {creating ? "Creating…" : "Create project"}
            </button>
            <button onClick={() => setShowNew(false)} className={btnSecondary} style={btnSecondaryStyle}>Cancel</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : shown.length === 0 ? (
        <Empty icon="fin" tone="teal" title={search ? "No project matches that" : "No projects yet"}>
          {search ? "Try another word." : "Start with the product you know most about."}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {shown.map((p) => <ProjectCard key={p.id} p={p} onArchive={() => handleArchive(p)} />)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, onArchive }: { p: ProjectRow; onArchive: () => void }) {
  const m = KIND_META[p.kind] ?? KIND_META.accessory;
  const hasFin = p.kind === "fin" && (p.thumb?.length ?? 0) > 0;
  return (
    <div className="group relative rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
      style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <Link href={`/admin/product-dev/projects/${p.id}`} className="block">
        <div className="pd-tone h-36 flex items-center justify-center" style={{ ...toneVars(m.tone), backgroundColor: "var(--tone-bg)" }}>
          {hasFin ? <FinThumb plies={p.thumb!} className="h-32" /> : <KindGlyph kind={p.kind} className="w-14 h-14" />}
        </div>
        <div className="p-4">
          <p className="text-sm font-bold admin-heading leading-snug line-clamp-2 group-hover:text-[var(--admin-accent)] transition-colors">{p.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <KindChip kind={p.kind} />
            <StatusChip status={p.status} />
          </div>
          <StatusTrack status={p.status} className="mt-3" />
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <Chip tone={p.layups ? "violet" : "slate"} icon="layers">{p.layups} sheet{p.layups === 1 ? "" : "s"}</Chip>
            <Chip tone={p.molds ? "amber" : "slate"} icon="mold">{p.molds} mold{p.molds === 1 ? "" : "s"}</Chip>
            {p.stages != null && <Chip tone={p.stages ? "teal" : "slate"} icon="steps">{p.stages} stage{p.stages === 1 ? "" : "s"}</Chip>}
          </div>
        </div>
      </Link>
      <button onClick={onArchive} title="Archive"
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg inline-flex items-center justify-center admin-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        <Icon name="archive" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
