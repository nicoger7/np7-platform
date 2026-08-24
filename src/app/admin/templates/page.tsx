"use client";

import { useEffect, useState } from "react";

/**
 * Shared content templates — the overview.
 *
 * One row per template, grouped by what it templates, with the number that
 * matters in bold: how many experiences follow it. Editing the WORDS happens
 * inside any experience that follows the template (Event Content → the
 * section shows "following …" and saving updates the template) — this page
 * manages the fleet: rename, see reach, delete strays. Customised experiences
 * are listed too, so divergence stays visible instead of silent.
 */

type Tpl = {
  id: string;
  kind: string;
  name: string;
  body: Record<string, unknown>;
  usedBy: number;
  updated_at: string;
};
type ContentRow = { experience_id: string; title: string; methodCustom: boolean; outcomesCustom: boolean };

const KIND_LABEL: Record<string, string> = {
  method: "Coaching method",
  outcomes: "Week outcomes (what you take home)",
  faq: "FAQ",
  packing: "Packing list",
  policy: "Cancellation policy",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [custom, setCustom] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      fetch("/api/admin/content-templates").then((r) => r.json()),
      fetch("/api/admin/content-custom").then((r) => r.json()).catch(() => ({ rows: [] })),
    ]).then(([t, c]) => {
      setTemplates(t.templates ?? []);
      setCustom(c.rows ?? []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  async function rename(t: Tpl) {
    const name = prompt("Template name", t.name);
    if (!name || name.trim() === t.name) return;
    setBusy(t.id);
    const res = await fetch(`/api/admin/content-templates/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    setBusy(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Rename failed."); return; }
    load();
  }

  async function remove(t: Tpl) {
    if (!confirm(`Delete "${t.name}"? Only possible while nothing follows it.`)) return;
    setBusy(t.id);
    const res = await fetch(`/api/admin/content-templates/${t.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Couldn't delete."); return; }
    load();
  }

  const kinds = [...new Set(templates.map((t) => t.kind))];

  return (
    <div className="max-w-[760px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Templates</h1>
        <p className="text-sm admin-muted">
          Shared website copy, written once. The words are edited <em>inside any experience that follows the template</em> (Event
          Content → the section says &quot;following…&quot; and saving updates every follower). This page manages the fleet.
        </p>
      </div>

      {loading && <p className="text-sm admin-faint">Loading…</p>}

      {kinds.map((kind) => (
        <div key={kind} className="mb-8">
          <h2 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2">{KIND_LABEL[kind] ?? kind}</h2>
          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            {templates.filter((t) => t.kind === kind).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold admin-heading truncate">{t.name}</p>
                  <p className="text-[11.5px] admin-faint">
                    <strong className={t.usedBy > 0 ? "admin-muted" : ""}>{t.usedBy}</strong> experience{t.usedBy === 1 ? "" : "s"} follow{t.usedBy === 1 ? "s" : ""} it
                    {" · "}edited {new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <button onClick={() => rename(t)} disabled={busy === t.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold admin-muted hover:admin-heading disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Rename</button>
                {t.usedBy === 0 && (
                  <button onClick={() => remove(t)} disabled={busy === t.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400/80 hover:text-red-400 disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Delete</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {custom.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-2">Customised — not following a template</h2>
          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            {custom.map((c) => (
              <div key={c.experience_id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <a href={`/admin/content/${c.experience_id}`} className="admin-heading font-semibold hover:text-[#0aa3c7] truncate flex-1">{c.title}</a>
                <span className="admin-faint text-[11.5px] shrink-0">
                  {[c.methodCustom && "method", c.outcomesCustom && "week outcomes"].filter(Boolean).join(" + ")} customised
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] admin-faint mt-2">Deliberate divergence is fine — this list just keeps it visible. &quot;Follow the template again&quot; inside the experience brings one back.</p>
        </div>
      )}
    </div>
  );
}
