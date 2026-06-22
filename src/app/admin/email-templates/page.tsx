"use client";

import { useState, useEffect, useRef } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";
import ImagePickerModal from "@/components/image-picker-modal";
import { DEFAULT_BODIES, DEFAULT_SUBJECTS } from "@/lib/email/default-bodies";
import { DEFAULT_HEADER_IMAGE, emailChrome } from "@/lib/email/layout";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

interface EmailTemplate {
  id: string;
  name: string;
  template_key: string | null;
  subject_line: string | null;
  body: string | null;
  header_image: string | null;
  header_image_hardware: string | null;
  header_position: number | null;
  header_position_hardware: number | null;
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

const EMPTY_FORM = { name: "", template_key: "", subject_line: "", body: "", header_image: "", header_image_hardware: "", header_position: 50, header_position_hardware: 50, type: "", trigger_stage: "", status: "", language: "en", active: true, experience_id: "", notes: "" };

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
  const [exactOpen, setExactOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const autoOpenedRef = useRef(false);
  const heroDrag = useRef<{ y: number; pos: number; h: number } | null>(null);

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
    const hw = previewDivision === "hardware";
    const t = setTimeout(() => {
      fetch("/api/admin/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: form.body, subject: form.subject_line, division: previewDivision, headerImage: hw ? form.header_image_hardware : form.header_image, headerPosition: hw ? form.header_position_hardware : form.header_position, templateKey: form.template_key }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => { setPreviewHtml(d.html || ""); setPreviewSubject(d.subject || ""); })
        .catch(() => {});
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [form.body, form.subject_line, form.header_image, form.header_image_hardware, form.header_position, form.header_position_hardware, form.template_key, previewDivision, showNew, editId]);

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
    const key = t.template_key || "";
    setForm({ name: t.name, template_key: key, subject_line: t.subject_line || DEFAULT_SUBJECTS[key] || "", body: t.body || DEFAULT_BODIES[key] || "", header_image: t.header_image || "", header_image_hardware: t.header_image_hardware || "", header_position: t.header_position ?? 50, header_position_hardware: t.header_position_hardware ?? 50, type: t.type || "", trigger_stage: t.trigger_stage || "", status: t.status || "", language: t.language || "en", active: t.active !== false, experience_id: t.experience_id || "", notes: t.notes || "" });
    setShowNew(false);
  }

  function resetToDefault() {
    const key = form.template_key;
    if (!key || !DEFAULT_BODIES[key]) return;
    if (!confirm("Replace the current wording with the built-in default?")) return;
    setForm((f) => ({ ...f, body: DEFAULT_BODIES[key], subject_line: DEFAULT_SUBJECTS[key] ?? f.subject_line }));
  }


  async function handleSave() {
    const payload: Record<string, unknown> = { name: form.name, subject_line: form.subject_line || null, body: form.body || null, type: form.type || null, trigger_stage: form.trigger_stage || null, status: form.status || null, language: form.language, active: form.active, experience_id: form.experience_id || null, notes: form.notes || null };
    if (form.header_image) payload.header_image = form.header_image;
    // Per-division header (migration 046) — included always, but stripped + retried
    // if the columns aren't there yet so saves still work pre-migration.
    payload.header_image_hardware = form.header_image_hardware || null;
    payload.header_position = form.header_position;
    payload.header_position_hardware = form.header_position_hardware;
    const PENDING_046 = ["header_image_hardware", "header_position", "header_position_hardware"];
    const url = editId ? `/api/admin/email-templates/${editId}` : "/api/admin/email-templates";
    const send = (body: Record<string, unknown>) => fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let res = await send(payload);
    if (!res.ok) {
      const j = await res.clone().json().catch(() => ({}));
      if (PENDING_046.some((k) => (j.error || "").includes(k))) {
        res = await send(Object.fromEntries(Object.entries(payload).filter(([k]) => !PENDING_046.includes(k))));
      }
    }
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

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  // Per-division header image + vertical focal point (Experience vs Hardware).
  const hw = previewDivision === "hardware";
  const curImg = hw ? form.header_image_hardware : form.header_image;
  const curPos = hw ? form.header_position_hardware : form.header_position;
  const setCurImg = (url: string) => setForm((f) => (hw ? { ...f, header_image_hardware: url } : { ...f, header_image: url }));
  const setCurPos = (n: number) => setForm((f) => (hw ? { ...f, header_position_hardware: n } : { ...f, header_position: n }));
  // Drag the hero photo up/down to set its focal point (background-position-y %).
  function heroDown(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    heroDrag.current = { y: e.clientY, pos: curPos, h: rect.height || 200 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function heroMove(e: React.PointerEvent) {
    if (!heroDrag.current) return;
    const { y, pos, h } = heroDrag.current;
    const next = Math.min(100, Math.max(0, Math.round(pos - ((e.clientY - y) / h) * 100)));
    setCurPos(next);
  }
  function heroUp() { heroDrag.current = null; }

  return (
    <div>
      {pickingImage && (
        <ImagePickerModal
          defaultFolder="email"
          onSelect={(url) => { setCurImg(url); setPickingImage(false); }}
          onClose={() => setPickingImage(false)}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Email Templates</h1>
          <p className="text-sm admin-muted">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {!(showNew || editId) && <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />}
          <button onClick={openNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Template</button>
        </div>
      </div>

      {(showNew || editId) ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail — small list of templates */}
        <div className="lg:w-60 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[82vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => { setShowNew(false); setEditId(null); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All templates
          </button>
          {sorted.map((t) => {
            const active = t.id === editId;
            return (
              <button key={t.id} onClick={() => startEdit(t)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full" title={t.active !== false ? "Active — this email sends" : "Off — won’t send"} style={{ background: t.active !== false ? "#22c55e" : (active ? "var(--admin-accent-contrast)" : "var(--admin-border)"), opacity: t.active !== false ? 1 : 0.5 }} />
                  <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{t.name}</span>
                </span>
                <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{t.active === false ? "Off · " : ""}{t.subject_line || t.trigger_stage || "—"}</span>
              </button>
            );
          })}
        </div>
        {/* detail — the editor */}
        <div className="flex-1 min-w-0">
        <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit email" : "New email"}</h3>

          {/* Name + subject */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><label className={labelClass}>Subject line</label><input className={inputClass} value={form.subject_line} onChange={(e) => setForm({ ...form, subject_line: e.target.value })} placeholder="What the recipient sees in their inbox" /></div>
          </div>

          {/* Division toggle + header image (per division) */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <label className={labelClass + " mb-0"}>Editing the <span className="admin-heading font-bold capitalize">{previewDivision}</span> email</label>
              {form.template_key && DEFAULT_BODIES[form.template_key] && (
                <button type="button" onClick={resetToDefault} className="text-[10px] admin-faint hover:text-[#0aa3c7] transition-colors">↺ Back to default</button>
              )}
            </div>
            <div className="inline-flex rounded-md overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {(["experience", "hardware"] as const).map((dv) => (
                <button key={dv} type="button" onClick={() => setPreviewDivision(dv)}
                  className={`px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${previewDivision === dv ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}>
                  {dv}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Header image <span className="admin-faint font-normal">— the {previewDivision} photo behind the logo (separate per world)</span></label>
            <div className="mb-2 p-2.5 rounded-lg text-[11px] leading-relaxed flex gap-2" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
              <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <span className="admin-muted">Which image actually sends: an email <strong>about a specific experience</strong> uses <strong>that experience&apos;s own hero photo</strong> (set on the experience page). The image here is the fallback for <strong>general</strong> emails (no experience), then the {previewDivision} default.</span>
            </div>
            <div className="flex items-center gap-3">
              {curImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={curImg} alt="" className="h-12 w-24 object-cover rounded-md" style={{ border: "1px solid var(--admin-border)", objectPosition: `center ${curPos}%` }} />
              ) : DEFAULT_HEADER_IMAGE[previewDivision] ? (
                <div className="relative h-12 w-24 rounded-md overflow-hidden" style={{ border: "1px dashed var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={DEFAULT_HEADER_IMAGE[previewDivision]!} alt="" className="h-full w-full object-cover opacity-80" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[8px] font-bold text-center py-0.5">DEFAULT</span>
                </div>
              ) : (
                <div className="h-12 w-24 rounded-md grid place-items-center text-[10px] admin-faint text-center px-1" style={{ border: "1px dashed var(--admin-border)" }}>No header photo (default)</div>
              )}
              <div>
                <button type="button" onClick={() => setPickingImage(true)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface admin-muted" style={{ border: "1px solid var(--admin-border)" }}>{curImg ? "Change image" : "Choose image"}</button>
                {curImg
                  ? <button type="button" onClick={() => setCurImg("")} className="ml-2 text-xs admin-faint hover:text-red-400 transition-colors">Use default</button>
                  : <p className="text-[11px] admin-faint mt-1">Blank uses the {previewDivision === "experience" ? "NP7 hero photo" : "no-photo header"} — or the experience’s own photo when one is set.</p>}
                {curImg && <p className="text-[11px] admin-faint mt-1">Drag the photo up/down in the preview to position it.</p>}
              </div>
            </div>
          </div>

          {/* Body — edit directly inside the branded email; toolbar sits above it */}
          <div className="mb-4">
            {previewSubject && <p className="text-center text-[11px] admin-muted mb-2"><span className="admin-faint">Inbox subject:</span> {previewSubject}</p>}

            <RichTextEditor
              seamless
              minHeight={260}
              value={form.body}
              onChange={(html) => setForm((f) => ({ ...f, body: html }))}
              vars={VARS}
              placeholder="Write your message — the branded frame, logo, colours and footer are added automatically."
              frame={(body) => {
                const chrome = emailChrome(previewDivision, curImg || undefined);
                return (
                  <div className="mx-auto max-w-[600px] rounded-2xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", boxShadow: "0 10px 34px rgba(0,55,74,0.12)", background: "#fff" }}>
                    {chrome.hero ? (
                      <div
                        onPointerDown={heroDown} onPointerMove={heroMove} onPointerUp={heroUp} onPointerCancel={heroUp}
                        title="Drag up/down to position the photo"
                        style={{ backgroundImage: `url('${chrome.hero}')`, backgroundSize: "cover", backgroundPosition: `center ${curPos}%`, backgroundColor: chrome.headerBg, cursor: "ns-resize", touchAction: "none" }}
                      >
                        <div className="px-6 pt-14 pb-7 text-center pointer-events-none" style={{ background: `linear-gradient(180deg,rgba(0,28,40,0.04) 0%,rgba(0,28,40,0.40) 52%,${chrome.headerFade} 100%)` }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={chrome.logo} alt={chrome.logoAlt} style={{ width: chrome.logoW, maxWidth: "64%", height: "auto", margin: "0 auto", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.45))" }} />
                        </div>
                      </div>
                    ) : (
                      <div className="px-6 pt-7 pb-2 text-center" style={{ background: "#fff" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={chrome.logo} alt={chrome.logoAlt} style={{ width: chrome.logoW, maxWidth: "60%", height: "auto", margin: "0 auto" }} />
                      </div>
                    )}
                    <div style={{ height: 4, background: chrome.accent, backgroundImage: chrome.gradient }} />
                    {body}
                    <div className="px-8 py-5 text-[12px] leading-relaxed" style={{ background: chrome.footerBg, color: chrome.footerText }}>
                      <strong style={{ color: chrome.footerStrong }}>NP7 GmbH</strong> · Germany · {chrome.contactEmail}<br />
                      {chrome.tagline}
                    </div>
                  </div>
                );
              }}
            />

            <p className="mt-2 text-center text-[11px] admin-faint">The toolbar above formats the body; the header, logo, colours and footer are added automatically. <button type="button" onClick={() => setExactOpen((v) => !v)} className="hover:text-[#0aa3c7] transition-colors underline">{exactOpen ? "Hide exact render" : "See exact render"}</button></p>

            {exactOpen && (
              <div className="mx-auto max-w-[600px] mt-2 rounded-lg overflow-hidden bg-white" style={{ border: "1px solid var(--admin-border)", height: 420 }}>
                <iframe title="Exact email render" srcDoc={previewHtml} sandbox="" className="w-full h-full" />
              </div>
            )}
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
            <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">{editId ? "Save" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
        </div>
      </div>
      ) : (
      <>
      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No templates yet</p></div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
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
      </>
      )}
    </div>
  );
}
