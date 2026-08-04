"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { emailChrome } from "@/lib/email/layout";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

/**
 * Campaigns — blast emails to a targeted audience.
 * Audience is ALWAYS restricted to marketing opt-in contacts server-side; the
 * builder here just narrows further (segment / tags / experience interest /
 * country) with a live recipient count. Sends run in resumable chunks.
 */

interface Campaign {
  id: string;
  name: string;
  subject: string | null;
  preheader: string | null;
  body: string | null;
  division: "experience" | "hardware";
  header_image: string | null;
  header_position: number | null;
  audience: Audience;
  status: string;
  recipient_count: number | null;
  sent_count: number;
  failed_count: number;
  test_sent_at: string | null;
  sent_at: string | null;
  created_at: string;
}

type Audience = { segment?: "all" | "newsletter" | "crm"; tags?: string[]; locations?: string[]; countries?: string[] };

const KNOWN_TAGS = ["Clinic", "Surfcenter Experience", "Experience Participant", "Bonaire", "Tenerife", "Miami", "maillist"];

/** On-brand starter bodies (email-safe markup; the frame adds header/footer). */
const PRESETS: { key: string; label: string; hint: string; subject: string; body: string }[] = [
  {
    key: "announcement", label: "Announcement", hint: "Short news update",
    subject: "News from NP7",
    body: `<p>Hi {{firstName}},</p><p>Big news from NP7 — [what happened, in one sentence].</p><p>[One short paragraph with the details that matter: what it is, why it's exciting, what it means for them.]</p><p>See you on the water,<br>Nico &amp; the NP7 crew</p>`,
  },
  {
    key: "trip-launch", label: "Trip launch", hint: "New experience + CTA button",
    subject: "New trip: [Destination] — spots are open",
    body: `<p>Hi {{firstName}},</p><p>We just opened <strong>[NP7 Experience Destination]</strong> — [dates]. [One sentence on what makes this spot special: conditions, coaching, the vibe.]</p><h2>What's included</h2><ul><li>[Coaching / accommodation / gear]</li><li>[Highlight two]</li><li>[Highlight three]</li></ul><table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto;"><tr><td align="center" bgcolor="#00afdb" style="border-radius:999px;"><a href="https://www.np-seven.com/experience" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">See the trip &amp; grab a spot</a></td></tr></table><p>Spots are limited — first come, first surfs.</p><p>Nico</p>`,
  },
  {
    key: "newsletter", label: "Newsletter", hint: "Digest with 2–3 sections",
    subject: "NP7 — what's new this month",
    body: `<p>Hi {{firstName}},</p><p>[One-line intro — the theme of this update.]</p><h2>[Section one]</h2><p>[2–3 sentences.]</p><h2>[Section two]</h2><p>[2–3 sentences.]</p><h2>Spot of the month</h2><p>[Short spotguide teaser + link.]</p><p>Keep it windy,<br>Nico</p>`,
  },
];

const VARS: [string, string][] = [["firstName", "First name"]];
const EMPTY: { name: string; subject: string; preheader: string; body: string; division: "experience" | "hardware"; header_image: string; header_position: number; audience: Audience } =
  { name: "", subject: "", preheader: "", body: "", division: "experience", header_image: "", header_position: 50, audience: { segment: "all" } };

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [experiences, setExperiences] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [selId, setSelId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  // audience preview
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<{ name: string; email: string }[]>([]);
  const [countryInput, setCountryInput] = useState("");
  // test + send
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | string>("idle");
  const [sendProgress, setSendProgress] = useState<{ total: number; done: number; failed: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const heroDrag = useRef<{ y: number; pos: number; h: number } | null>(null);

  const sel = selId && selId !== "new" ? campaigns.find((c) => c.id === selId) : null;
  const locked = sel ? sel.status !== "draft" : false;

  function load() {
    return fetch("/api/admin/campaigns").then((r) => r.json()).then((d) => {
      setCampaigns(d.campaigns || []);
      setMigrationPending(!!d.migrationPending);
    });
  }
  useEffect(() => {
    Promise.all([
      load(),
      fetch("/api/admin/experiences").then((r) => r.json()).then((e) => setExperiences((e.experiences || []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title })))),
    ]).then(() => setLoading(false));
  }, []);

  // Unsaved-changes guard
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Live audience count (debounced)
  useEffect(() => {
    if (!selId) return;
    const t = setTimeout(() => {
      fetch("/api/admin/campaigns/audience", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: form.audience }),
      }).then((r) => r.json()).then((d) => { setCount(d.count ?? null); setSample(d.sample || []); }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [form.audience, selId]);

  const set = useCallback(<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => {
    setForm((f) => ({ ...f, [k]: v })); setDirty(true);
  }, []);
  const setAud = (patch: Partial<Audience>) => set("audience", { ...form.audience, ...patch });
  const toggleIn = (arr: string[] | undefined, v: string) => (arr || []).includes(v) ? (arr || []).filter((x) => x !== v) : [...(arr || []), v];

  function guardedNav(fn: () => void) {
    if (dirty && !confirm("You have unsaved changes — discard them?")) return;
    fn(); setDirty(false); setSendProgress(null); setSendError(null); setTestState("idle");
  }
  function open(c: Campaign) {
    guardedNav(() => {
      setSelId(c.id);
      setForm({ name: c.name, subject: c.subject || "", preheader: c.preheader || "", body: c.body || "", division: c.division, header_image: c.header_image || "", header_position: c.header_position ?? 50, audience: c.audience || { segment: "all" } });
    });
  }
  function openNew() { guardedNav(() => { setSelId("new"); setForm(EMPTY); setPresetOpen(true); }); }
  function close() { guardedNav(() => setSelId(null)); }

  async function save(): Promise<string | null> {
    setSaving(true);
    const payload = { name: form.name, subject: form.subject, preheader: form.preheader, body: form.body, division: form.division, header_image: form.header_image, header_position: form.header_position, audience: form.audience };
    const res = await fetch(selId === "new" ? "/api/admin/campaigns" : `/api/admin/campaigns/${selId}`, {
      method: selId === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { alert(d.error || "Couldn't save."); return null; }
    setDirty(false);
    await load();
    if (selId === "new" && d.campaign?.id) setSelId(d.campaign.id);
    return d.campaign?.id ?? (selId !== "new" ? selId : null);
  }

  async function sendTest() {
    const id = await save();
    if (!id) return;
    setTestState("sending");
    const res = await fetch(`/api/admin/campaigns/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testTo }) });
    const d = await res.json().catch(() => ({}));
    setTestState(res.ok ? "ok" : (d.error || "Failed"));
    if (res.ok) load();
  }

  async function sendCampaign() {
    const id = await save();
    if (!id || count == null) return;
    const c = campaigns.find((x) => x.id === id);
    if (!c?.test_sent_at && !confirm("You haven't sent yourself a test yet. Send to the full audience anyway?")) return;
    if (!confirm(`Send "${form.name}" to ${count.toLocaleString()} recipient${count === 1 ? "" : "s"}? This can't be undone.`)) return;
    setSendError(null);
    setSendProgress({ total: count, done: 0, failed: 0 });
    for (let i = 0; i < 200; i++) {
      const res = await fetch(`/api/admin/campaigns/${id}/send`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setSendError(d.error || "Send failed — you can retry; nothing double-sends."); break; }
      setSendProgress({ total: d.total, done: d.total - d.remaining, failed: d.failed });
      if (d.done) break;
    }
    load();
  }

  // hero focal-point drag (same interaction as the template editor)
  function heroDown(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    heroDrag.current = { y: e.clientY, pos: form.header_position, h: rect.height || 200 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function heroMove(e: React.PointerEvent) {
    if (!heroDrag.current) return;
    const { y, pos, h } = heroDrag.current;
    set("header_position", Math.min(100, Math.max(0, Math.round(pos - ((e.clientY - y) / h) * 100))));
  }
  function heroUp() { heroDrag.current = null; }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const chipCls = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10 admin-heading" : "admin-surface admin-muted"}`;
  const statusChip = (s: string) => s === "sent" ? "bg-green-500/15 text-green-400" : s === "sending" ? "bg-amber-500/15 text-amber-400" : "bg-slate-500/15 admin-muted";
  const chrome = emailChrome(form.division, form.header_image || undefined);

  return (
    <div>
      {pickingImage && <ImagePickerModal defaultFolder="email" onSelect={(url) => { set("header_image", url); setPickingImage(false); }} onClose={() => setPickingImage(false)} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Campaigns</h1>
          <p className="text-sm admin-muted">Blast emails to a targeted audience — opt-in contacts only.</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Campaign</button>
      </div>

      {migrationPending && (
        <div className="mb-5 p-3 rounded-lg text-sm" style={{ border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)" }}>
          <span className="text-amber-400 font-semibold">Migration 086 pending</span> <span className="admin-muted">— paste <code className="text-xs">20260712_086_email_campaigns.sql</code> in the Supabase SQL editor to enable campaigns.</span>
        </div>
      )}

      {selId ? (
        <div className="flex flex-col xl:flex-row gap-4">
          {/* rail */}
          <div className="xl:w-56 shrink-0 flex xl:flex-col gap-1.5 xl:max-h-[84vh] xl:overflow-y-auto xl:pr-1">
            <button onClick={close} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All campaigns
            </button>
            {campaigns.map((c) => (
              <button key={c.id} onClick={() => open(c)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: c.id === selId ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${c.id === selId ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{c.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate ${c.id === selId ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{c.status}{c.recipient_count != null ? ` · ${c.recipient_count}` : ""}</span>
              </button>
            ))}
          </div>

          {/* composer */}
          <div className="flex-1 min-w-0 space-y-4">
            {locked && (
              <div className="p-3 rounded-lg text-sm admin-muted" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
                This campaign is <b className="admin-heading">{sel?.status}</b> — {sel?.sent_count ?? 0} sent{sel?.failed_count ? `, ${sel.failed_count} failed` : ""}{sel?.sent_at ? ` · ${new Date(sel.sent_at).toLocaleString("en-GB")}` : ""}. Sent campaigns are read-only.
              </div>
            )}

            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div><label className={labelClass}>Campaign name *</label><input className={inputClass} disabled={locked} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Internal — e.g. Bonaire launch" /></div>
                <div><label className={labelClass}>Subject line</label><input className={inputClass} disabled={locked} value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="What lands in the inbox" /></div>
                <div><label className={labelClass}>Preheader <span className="admin-faint">(inbox preview text)</span></label><input className={inputClass} disabled={locked} value={form.preheader} onChange={(e) => set("preheader", e.target.value)} placeholder="Short teaser after the subject" /></div>
              </div>

              {/* division + presets + header image */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPresetOpen((v) => !v)} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface admin-muted" style={{ border: "1px solid var(--admin-border)" }}>Start from a template…</button>
                  <button type="button" onClick={() => setPickingImage(true)} disabled={locked} className="px-3 py-1.5 text-xs font-bold rounded-lg admin-surface admin-muted" style={{ border: "1px solid var(--admin-border)" }}>{form.header_image ? "Change header photo" : "Header photo"}</button>
                  {form.header_image && <button type="button" onClick={() => set("header_image", "")} className="text-xs admin-faint hover:text-red-400 transition-colors">Use default</button>}
                </div>
                <div className="inline-flex rounded-md overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {(["experience", "hardware"] as const).map((dv) => (
                    <button key={dv} type="button" disabled={locked} onClick={() => set("division", dv)} className={`px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${form.division === dv ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}>{dv}</button>
                  ))}
                </div>
              </div>

              {presetOpen && (
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.key} type="button" onClick={() => { if (!form.body || confirm("Replace the current body with this template?")) { setForm((f) => ({ ...f, body: p.body, subject: f.subject || p.subject })); setDirty(true); } setPresetOpen(false); }}
                      className="text-left p-3 rounded-lg transition-colors hover:border-[var(--admin-accent)]" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
                      <span className="block text-xs font-bold admin-heading">{p.label}</span>
                      <span className="block text-[11px] admin-faint mt-0.5">{p.hint}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* body inside the live brand frame */}
              <RichTextEditor
                seamless
                minHeight={240}
                value={form.body}
                onChange={(html) => set("body", html)}
                vars={VARS}
                placeholder="Write your campaign — header, colours and footer are added automatically. {{firstName}} personalises the greeting."
                frame={(body) => (
                  <div className="mx-auto max-w-[600px] rounded-2xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", boxShadow: "0 10px 34px rgba(0,55,74,0.12)", background: "#fff" }}>
                    {chrome.hero ? (
                      <div onPointerDown={heroDown} onPointerMove={heroMove} onPointerUp={heroUp} onPointerCancel={heroUp} title="Drag up/down to position the photo"
                        style={{ backgroundImage: `url('${chrome.hero}')`, backgroundSize: "cover", backgroundPosition: `center ${form.header_position}%`, backgroundColor: chrome.headerBg, cursor: "ns-resize", touchAction: "none" }}>
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
                      {chrome.tagline}<br />
                      <span>You&apos;re receiving this because you subscribed — <span style={{ color: chrome.footerStrong, textDecoration: "underline" }}>unsubscribe</span>.</span>
                    </div>
                  </div>
                )}
              />
            </div>

            {/* audience */}
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-sm font-bold admin-heading">Audience</h3>
                <span className="text-sm">
                  {count == null ? <span className="admin-faint">counting…</span> : <><b className="admin-heading">{count.toLocaleString()}</b> <span className="admin-muted">recipient{count === 1 ? "" : "s"}</span></>}
                </span>
              </div>
              <p className="text-[11px] admin-faint mb-3">Only contacts with marketing opt-in ever receive campaigns — that filter is always on.</p>

              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Segment</label>
                  <div className="flex gap-1.5">
                    {([["all", "All opted-in"], ["newsletter", "Newsletter list"], ["crm", "CRM contacts"]] as const).map(([k, l]) => (
                      <button key={k} type="button" disabled={locked} onClick={() => setAud({ segment: k })} className={chipCls((form.audience.segment || "all") === k)} style={{ borderColor: (form.audience.segment || "all") === k ? undefined : "var(--admin-border)" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Lists / tags <span className="admin-faint">(any of)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {KNOWN_TAGS.map((t) => (
                      <button key={t} type="button" disabled={locked} onClick={() => setAud({ tags: toggleIn(form.audience.tags, t) })} className={chipCls((form.audience.tags || []).includes(t))} style={{ borderColor: (form.audience.tags || []).includes(t) ? undefined : "var(--admin-border)" }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Interested in <span className="admin-faint">(experience locations, any of)</span></label>
                  <div className="flex flex-wrap gap-1.5">
                    {[...experiences.map((e) => e.title), "Miami"].map((t) => (
                      <button key={t} type="button" disabled={locked} onClick={() => setAud({ locations: toggleIn(form.audience.locations, t) })} className={chipCls((form.audience.locations || []).includes(t))} style={{ borderColor: (form.audience.locations || []).includes(t) ? undefined : "var(--admin-border)" }}>{t.replace("NP7 Experience ", "")}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Countries <span className="admin-faint">(any of — leave empty for all)</span></label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(form.audience.countries || []).map((c) => (
                      <span key={c} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs admin-muted" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                        {c}<button disabled={locked} onClick={() => setAud({ countries: (form.audience.countries || []).filter((x) => x !== c) })} className="admin-faint hover:text-red-400">×</button>
                      </span>
                    ))}
                    <input className={`${inputClass} !w-40`} disabled={locked} placeholder="Add country…" value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && countryInput.trim()) { setAud({ countries: [...(form.audience.countries || []), countryInput.trim()] }); setCountryInput(""); } }} />
                  </div>
                </div>
                {sample.length > 0 && (
                  <p className="text-[11px] admin-faint">e.g. {sample.slice(0, 5).map((s) => s.name && s.email && s.name !== s.email ? `${s.name} (${s.email})` : (s.name || s.email)).join(" · ")}</p>
                )}
              </div>
            </div>

            {/* test + send */}
            {!locked && (
              <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <label className={labelClass}>Test address</label>
                    <input className={inputClass} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@np-seven.com" />
                  </div>
                  <button onClick={sendTest} disabled={!testTo || testState === "sending" || !form.subject || !form.body} className="px-4 py-2 text-sm font-bold rounded-lg admin-surface admin-heading disabled:opacity-40 transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
                    {testState === "sending" ? "Sending…" : "Send me a test"}
                  </button>
                  <button onClick={sendCampaign} disabled={!form.subject || !form.body || !count || !!sendProgress} className="px-5 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
                    Send to {count != null ? count.toLocaleString() : "…"} recipients
                  </button>
                </div>
                {testState === "ok" && <p className="text-xs text-green-400 mt-2">Test sent ✓ — check your inbox.</p>}
                {testState !== "idle" && testState !== "sending" && testState !== "ok" && <p className="text-xs text-red-400 mt-2">{testState}</p>}
                {sel?.test_sent_at && <p className="text-[11px] admin-faint mt-2">Last test: {new Date(sel.test_sent_at).toLocaleString("en-GB")}</p>}

                {sendProgress && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--admin-border)" }}>
                      <div className="h-full bg-[var(--admin-accent)] transition-all" style={{ width: `${sendProgress.total ? Math.round((sendProgress.done / sendProgress.total) * 100) : 0}%` }} />
                    </div>
                    <p className="text-xs admin-muted mt-1.5">{sendProgress.done.toLocaleString()} / {sendProgress.total.toLocaleString()} processed{sendProgress.failed ? ` · ${sendProgress.failed} failed` : ""}</p>
                  </div>
                )}
                {sendError && <p className="text-xs text-red-400 mt-2">{sendError}</p>}
              </div>
            )}

            {!locked && (
              <div className="flex gap-2">
                <button onClick={save} disabled={!form.name || saving} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{saving ? "Saving…" : dirty ? "Save draft" : "Saved ✓"}</button>
                <button onClick={close} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Close</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="py-12 text-center text-sm admin-faint">Loading...</div>
          ) : campaigns.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm admin-faint">No campaigns yet</p>
              <p className="text-xs admin-faint mt-1">Create one to email a targeted slice of your {""}contacts — opt-in only, with live audience counts.</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_90px_110px_130px_120px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                {["Campaign", "Status", "Audience", "Sent / failed", "Date"].map((h) => <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>)}
              </div>
              {campaigns.map((c) => (
                <div key={c.id} className="grid grid-cols-[1fr_90px_110px_130px_120px] gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-[var(--admin-surface-hover)]" style={{ borderBottom: "1px solid var(--admin-border)" }} onClick={() => open(c)}>
                  <div className="min-w-0 self-center">
                    <div className="text-sm font-medium admin-heading truncate">{c.name}</div>
                    <div className="text-xs admin-faint truncate">{c.subject || "—"}</div>
                  </div>
                  <span className="self-center"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusChip(c.status)}`}>{c.status}</span></span>
                  <span className="text-xs admin-muted self-center">{c.recipient_count != null ? c.recipient_count.toLocaleString() : "—"}</span>
                  <span className="text-xs admin-muted self-center">{c.status === "draft" ? "—" : `${c.sent_count.toLocaleString()}${c.failed_count ? ` / ${c.failed_count} ✗` : ""}`}</span>
                  <span className="text-xs admin-faint self-center">{new Date(c.sent_at || c.created_at).toLocaleDateString("en-GB")}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
