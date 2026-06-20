"use client";

import { useState, useEffect, useRef } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";
import ImagePickerModal from "@/components/image-picker-modal";

interface EmailTemplate {
  id: string;
  name: string;
  template_key: string | null;
  subject_line: string | null;
  body: string | null;
  header_image: string | null;
  type: string | null;
  trigger_stage: string | null;
  status: string | null;
  language: string | null;
  active: boolean;
  experience_id: string | null;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience { id: string; title: string; }

type SortDir = "asc" | "desc" | null;

/** Click-to-insert variables — [token, friendly label]. */
const VARS: [string, string][] = [
  ["firstName", "First name"], ["experienceTitle", "Trip"], ["dates", "Dates"],
  ["deposit", "Deposit"], ["balance", "Balance"], ["bookingLink", "Booking link"], ["activationLink", "Login link"],
];

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "subject", label: "Subject", width: "180px" },
  { key: "type", label: "Type", width: "120px", defaultHidden: true },
  { key: "status", label: "Status", width: "90px", defaultHidden: true },
  { key: "trigger_stage", label: "Trigger", width: "130px", defaultHidden: true },
  { key: "experience", label: "Experience", width: "140px", defaultHidden: true },
  { key: "language", label: "Lang", width: "60px", defaultHidden: true },
  { key: "body", label: "Body", width: "200px", defaultHidden: true },
  { key: "notes", label: "Notes", width: "140px", defaultHidden: true },
  { key: "active", label: "Active", width: "60px" },
  { key: "_actions", label: "", width: "70px", required: true },
];

const STORAGE_KEY = "np7-email-templates-columns";

const EMPTY_FORM = { name: "", template_key: "", subject_line: "", body: "", header_image: "", type: "", trigger_stage: "", status: "", language: "en", active: true, experience_id: "", notes: "" };

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewDivision, setPreviewDivision] = useState<"experience" | "hardware">("experience");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const autoOpenedRef = useRef(false);

  // Deep-link: /admin/email-templates?edit=<template_key> opens that template's
  // editor straight away (used by the Emails hub "click to edit").
  useEffect(() => {
    if (autoOpenedRef.current || templates.length === 0) return;
    const key = new URLSearchParams(window.location.search).get("edit");
    autoOpenedRef.current = true;
    if (!key) return;
    const t = templates.find((x) => x.template_key === key);
    if (t) startEdit(t);
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live, debounced email preview while the editor is open.
  useEffect(() => {
    if (!showNew && !editId) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/admin/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: form.body, subject: form.subject_line, division: previewDivision, headerImage: form.header_image, templateKey: form.template_key }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => { setPreviewHtml(d.html || ""); setPreviewSubject(d.subject || ""); })
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [form.body, form.subject_line, form.header_image, form.template_key, previewDivision, showNew, editId]);

  function fetchData() {
    Promise.all([
      fetch("/api/admin/email-templates").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([t, e]) => {
      setTemplates(t || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortKey && sortDir
    ? [...templates].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "subject") { aVal = a.subject_line; bVal = b.subject_line; }
        else if (sortKey === "active") { aVal = a.active; bVal = b.active; }
        else if (sortKey === "experience") { aVal = a.exp_experiences?.title; bVal = b.exp_experiences?.title; }
        else { aVal = a[sortKey as keyof EmailTemplate]; bVal = b[sortKey as keyof EmailTemplate]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : templates;

  function openNew() {
    setShowNew(true); setEditId(null); setShowAdvanced(false); setForm(EMPTY_FORM);
  }

  function startEdit(t: EmailTemplate) {
    setEditId(t.id);
    setShowAdvanced(false);
    setForm({ name: t.name, template_key: t.template_key || "", subject_line: t.subject_line || "", body: t.body || "", header_image: t.header_image || "", type: t.type || "", trigger_stage: t.trigger_stage || "", status: t.status || "", language: t.language || "en", active: t.active !== false, experience_id: t.experience_id || "", notes: t.notes || "" });
    setShowNew(false);
  }

  function insertVar(token: string) {
    const text = `{{${token}}}`;
    const ta = bodyRef.current;
    if (!ta) { setForm((f) => ({ ...f, body: f.body + text })); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = form.body.slice(0, start) + text + form.body.slice(end);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => { ta.focus(); const pos = start + text.length; ta.setSelectionRange(pos, pos); });
  }

  async function handleSave() {
    // Only include header_image when set — so copy edits save even before the
    // header_image column migration (029) has run.
    const payload: Record<string, unknown> = { name: form.name, subject_line: form.subject_line || null, body: form.body || null, type: form.type || null, trigger_stage: form.trigger_stage || null, status: form.status || null, language: form.language, active: form.active, experience_id: form.experience_id || null, notes: form.notes || null };
    if (form.header_image) payload.header_image = form.header_image;
    const url = editId ? `/api/admin/email-templates/${editId}` : "/api/admin/email-templates";
    const res = await fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error?.includes("header_image") ? "Couldn't save — apply migration 029 (adds the header image column) first." : (j.error || "Couldn't save."));
      return;
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/admin/email-templates/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/email-templates/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      {pickingImage && (
        <ImagePickerModal
          defaultFolder="email"
          onSelect={(url) => { setForm((f) => ({ ...f, header_image: url })); setPickingImage(false); }}
          onClose={() => setPickingImage(false)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Email Templates</h1>
          <p className="text-sm admin-muted">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={openNew} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">New Template</button>
        </div>
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit email" : "New email"}</h3>

          {/* Name + subject */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><label className={labelClass}>Subject line</label><input className={inputClass} value={form.subject_line} onChange={(e) => setForm({ ...form, subject_line: e.target.value })} placeholder="What the recipient sees in their inbox" /></div>
          </div>

          {/* Header image */}
          <div className="mb-4">
            <label className={labelClass}>Header image <span className="admin-faint font-normal">— the photo at the top; leave blank for the default</span></label>
            <div className="flex items-center gap-3">
              {form.header_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.header_image} alt="" className="h-12 w-24 object-cover rounded-md" style={{ border: "1px solid var(--admin-border)" }} />
              ) : (
                <div className="h-12 w-24 rounded-md grid place-items-center text-[10px] admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>default</div>
              )}
              <button type="button" onClick={() => setPickingImage(true)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface admin-muted" style={{ border: "1px solid var(--admin-border)" }}>{form.header_image ? "Change image" : "Choose image"}</button>
              {form.header_image && <button type="button" onClick={() => setForm({ ...form, header_image: "" })} className="text-xs admin-faint hover:text-red-400 transition-colors">Remove</button>}
            </div>
          </div>

          {/* Body + live preview */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelClass + " mb-0"}>Body</label>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {VARS.map(([token, label]) => (
                    <button key={token} type="button" onClick={() => insertVar(token)} title={`Insert {{${token}}}`} className="px-2 py-0.5 text-[11px] rounded-md admin-surface admin-muted hover:text-[#0aa3c7] transition-colors" style={{ border: "1px solid var(--admin-border)" }}>+ {label}</button>
                  ))}
                </div>
              </div>
              <textarea ref={bodyRef} className={`${inputClass} min-h-[360px] resize-y font-mono text-xs`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Leave blank to use the built-in wording, or write your own. Tip: click a variable button above to drop it in." />
              <p className="mt-1.5 text-[11px] admin-faint">The branded frame, logo, colours and footer are added automatically — just write the message.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + " mb-0"}>Live preview</label>
                <div className="inline-flex rounded-md overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {(["experience", "hardware"] as const).map((dv) => (
                    <button key={dv} type="button" onClick={() => setPreviewDivision(dv)}
                      className={`px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${previewDivision === dv ? "bg-[#0aa3c7] text-white" : "admin-muted"}`}>
                      {dv}
                    </button>
                  ))}
                </div>
              </div>
              {previewSubject && <div className="text-[11px] admin-muted mb-1 truncate"><span className="admin-faint">Subject:</span> {previewSubject}</div>}
              <div className="rounded-lg overflow-hidden bg-white" style={{ border: "1px solid var(--admin-border)", height: 360 }}>
                <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* Advanced (collapsed) */}
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs admin-faint hover:text-[#0aa3c7] transition-colors mb-3">
            {showAdvanced ? "▾ Hide advanced" : "▸ Advanced (trigger, status, language, audience)"}
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-4 mb-4 p-4 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
              <div><label className={labelClass}>Type</label><input className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="welcome, reminder..." /></div>
              <div><label className={labelClass}>Trigger stage</label><input className={inputClass} value={form.trigger_stage} onChange={(e) => setForm({ ...form, trigger_stage: e.target.value })} placeholder="booking_confirmed..." /></div>
              <div><label className={labelClass}>Status</label><input className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} placeholder="draft, ready..." /></div>
              <div><label className={labelClass}>Language</label>
                <select className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="en">English</option><option value="de">German</option><option value="es">Spanish</option><option value="fr">French</option>
                </select>
              </div>
              <div><label className={labelClass}>Experience</label>
                <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                  <option value="">—</option>
                  {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
                  <span className="text-sm admin-muted">Active</span>
                </label>
              </div>
              <div className="col-span-3"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">{editId ? "Save" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No templates yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_actions" ? <span key={col.key} /> : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {sorted.map((t) => (
            <div key={t.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(t)}
            >
              <div className="min-w-0 self-center">
                <div className="text-sm font-medium admin-heading truncate">{t.name}</div>
                {t.trigger_stage && <div className="text-xs admin-faint">{t.trigger_stage}</div>}
              </div>
              {visibleColumns.has("subject") && <span className="text-xs admin-muted self-center truncate">{t.subject_line || "—"}</span>}
              {visibleColumns.has("type") && <span className="text-xs admin-muted self-center truncate">{t.type || "—"}</span>}
              {visibleColumns.has("status") && <span className="text-xs admin-muted self-center truncate">{t.status || "—"}</span>}
              {visibleColumns.has("trigger_stage") && <span className="text-xs admin-muted self-center truncate">{t.trigger_stage || "—"}</span>}
              {visibleColumns.has("experience") && <span className="text-xs admin-muted self-center truncate">{t.exp_experiences?.title || "—"}</span>}
              {visibleColumns.has("language") && <span className="text-xs admin-muted self-center uppercase">{t.language || "—"}</span>}
              {visibleColumns.has("body") && <span className="text-xs admin-faint self-center truncate" title={t.body || ""}>{t.body || "—"}</span>}
              {visibleColumns.has("notes") && <span className="text-xs admin-faint self-center truncate" title={t.notes || ""}>{t.notes || "—"}</span>}
              {visibleColumns.has("active") && <span className="self-center">{t.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>}
              <RowActions onDuplicate={() => handleDuplicate(t.id)} onDelete={() => handleDelete(t.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
