"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";
import { SurveyStoryShare } from "@/components/admin/survey-story-share";
import type { Survey, SurveyInvite, SurveyDestination, SurveyWeek, SurveyStatus } from "@/lib/surveys";

/**
 * The survey admin: edit the survey (title, intro, status, destination
 * shortlist, week-windows, budget anchor + range), invite hand-picked members
 * (search → add → email and/or copy their secret link), and read the responses
 * with light aggregates. Everything talks to /api/admin/surveys/*.
 */

const uid = () => Math.random().toString(36).slice(2, 9);
const STATUSES: SurveyStatus[] = ["draft", "open", "closed"];
const PREVIEW_PREFIX = "preview-"; // team-only preview link (matches /survey/[token])

export function SurveyAdmin({ initialSurvey, initialInvites }: { initialSurvey: Survey; initialInvites: SurveyInvite[] }) {
  const router = useRouter();
  const [s, setS] = useState<Survey>(initialSurvey);
  const [invites, setInvites] = useState<SurveyInvite[]>(initialInvites);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (t: string) => `${origin}/survey/${t}`;
  const fmtMoney = (n: number | null) => n == null ? "—" : new Intl.NumberFormat("en-IE", { style: "currency", currency: s.currency || "EUR", maximumFractionDigits: 0 }).format(n);

  const patch = (p: Partial<Survey>) => setS((cur) => ({ ...cur, ...p }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/surveys/${s.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: s.title, intro: s.intro, status: s.status, destinations: s.destinations, weeks: s.weeks,
          budget_anchor: s.budget_anchor, budget_min: s.budget_min, budget_max: s.budget_max, currency: s.currency,
          quick: s.quick, eyebrow: s.eyebrow, cta_label: s.cta_label, decline_label: s.decline_label, show_decline: s.show_decline, email_body: s.email_body, ask_wishes: s.ask_wishes, email_date_buttons: s.email_date_buttons, email_button_label: s.email_button_label,
        }),
      });
      if (res.ok) { setSavedAt(new Date().toLocaleTimeString()); router.refresh(); }
    } finally { setSaving(false); }
  }

  async function archive() {
    if (!confirm("Archive this survey?")) return;
    await fetch(`/api/admin/surveys/${s.id}`, { method: "DELETE" });
    router.refresh();
    router.push("/admin/surveys");
  }

  // ---- trips (places) / weeks repeaters ----
  // A "place" is one card; its date windows are the rows sharing a groupId (or, for
  // older rows, the same label). The admin edits the place once; each date is a row.
  const gkey = (d: SurveyDestination) => d.groupId ?? (d.label || d.location || d.key || "").trim();
  const tripGroups = (() => {
    const seen = new Set<string>(); const out: { key: string; rows: SurveyDestination[] }[] = [];
    for (const d of s.destinations) { const k = gkey(d); if (!seen.has(k)) { seen.add(k); out.push({ key: k, rows: s.destinations.filter((x) => gkey(x) === k) }); } }
    return out;
  })();
  const addTrip = () => patch({ destinations: [...s.destinations, { key: uid(), groupId: uid(), label: "", location: "", start: null, end: null, blurb: "" }] });
  // edit a shared place field on EVERY date row of the place
  const setGroup = (gid: string, p: Partial<SurveyDestination>) => patch({ destinations: s.destinations.map((d) => gkey(d) === gid ? { ...d, ...p } : d) });
  // edit one date row
  const setRow = (rowKey: string, p: Partial<SurveyDestination>) => patch({ destinations: s.destinations.map((d) => d.key === rowKey ? { ...d, ...p } : d) });
  const delGroup = (gid: string) => patch({ destinations: s.destinations.filter((d) => gkey(d) !== gid) });
  // add another date window to a place (clones its shared fields; stamps a groupId
  // so the rows stay one card even if the place is renamed later). Returns the new
  // row's key so the caller can pop its date editor open immediately.
  const addDate = (gid: string): string => {
    const rows = s.destinations.filter((d) => gkey(d) === gid);
    const groupId = rows.find((d) => d.groupId)?.groupId ?? uid();
    const base = rows[rows.length - 1];
    const newRow: SurveyDestination = { key: uid(), groupId, label: base.label, location: base.location, blurb: base.blurb, image: base.image, lat: base.lat, lng: base.lng, start: null, end: null };
    const upgraded = s.destinations.map((d) => gkey(d) === gid ? { ...d, groupId } : d);
    let lastIdx = -1; upgraded.forEach((d, i) => { if (d.groupId === groupId) lastIdx = i; });
    patch({ destinations: [...upgraded.slice(0, lastIdx + 1), newRow, ...upgraded.slice(lastIdx + 1)] });
    return newRow.key;
  };
  const delDate = (gid: string, rowKey: string) => {
    const rows = s.destinations.filter((d) => gkey(d) === gid);
    if (rows.length <= 1) { setRow(rowKey, { start: null, end: null }); return; } // last date → just clear it
    patch({ destinations: s.destinations.filter((d) => d.key !== rowKey) });
  };
  // ---- date pills ----
  const [openDate, setOpenDate] = useState<string | null>(null); // row key whose date popover is open
  /** "12 – 20 Jan 2027" (compacts when the range shares a month/year). */
  const fmtRange = (start?: string | null, end?: string | null): string | null => {
    if (!start && !end) return null;
    const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", o);
    const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
    if (start && end) {
      if (start.slice(0, 7) === end.slice(0, 7)) return `${+start.slice(8, 10)} – ${f(end, full)}`;
      if (start.slice(0, 4) === end.slice(0, 4)) return `${f(start, { day: "numeric", month: "short" })} – ${f(end, full)}`;
      return `${f(start, full)} – ${f(end, full)}`;
    }
    return start ? `${f(start, full)} → ?` : `? → ${f(end!, full)}`;
  };
  const nightsOf = (r: SurveyDestination) =>
    r.start && r.end && r.end > r.start ? Math.round((+new Date(r.end) - +new Date(r.start)) / 86400000) : null;
  // Picking a start auto-fills a sensible end (start + 8 days — the typical trip
  // window) whenever the end is empty or now invalid. One click less, every time.
  const setStartSmart = (r: SurveyDestination, v: string | null) => {
    const p: Partial<SurveyDestination> = { start: v };
    if (v && (!r.end || r.end <= v)) {
      // UTC throughout — local-midnight + toISOString() shifts a day in TZs east of UTC
      const d = new Date(v + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 8);
      p.end = d.toISOString().slice(0, 10);
    }
    setRow(r.key, p);
  };
  const [picker, setPicker] = useState<string | null>(null); // group key whose image picker is open
  /** The editor grew past a screen and a half. Four tabs, in the order you
   *  actually work: write it, set the dates, invite people, read the answers. */
  const [tab, setTab] = useState<"setup" | "trips" | "invites" | "responses">("setup");
  const [geoBusy, setGeoBusy] = useState<string | null>(null);
  // Drop a pin from the place name → coords power the satellite fallback when there's no photo.
  async function locate(gid: string) {
    const d = s.destinations.find((x) => gkey(x) === gid);
    if (!d) return;
    const q = [d.location, d.label].filter(Boolean).join(", ").trim();
    if (!q) return;
    setGeoBusy(gid);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } });
      const hits = await r.json().catch(() => []);
      if (Array.isArray(hits) && hits[0]) setGroup(gid, { lat: Math.round(+hits[0].lat * 1e5) / 1e5, lng: Math.round(+hits[0].lon * 1e5) / 1e5 });
    } catch { /* leave coords blank — admin can type them */ }
    finally { setGeoBusy(null); }
  }
  const addWeek = () => patch({ weeks: [...s.weeks, { key: uid(), label: "", start: null, end: null }] });
  const setWeek = (i: number, p: Partial<SurveyWeek>) => patch({ weeks: s.weeks.map((w, j) => j === i ? { ...w, ...p } : w) });
  const delWeek = (i: number) => patch({ weeks: s.weeks.filter((_, j) => j !== i) });

  const card = "rounded-2xl border border-[#e7ddcb] bg-white p-5";
  const lbl = "text-[12px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]";
  const input = "w-full rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-3 py-2 text-[14px] outline-none focus:border-[#0aa3c7] transition-colors";

  return (
    <div className="max-w-[900px] space-y-4">
      {/* header */}
      <div className="flex items-center gap-2.5">
        <Link href="/admin/surveys" className="text-[13px] font-bold text-[#6a7a80] hover:text-[#0a2a33]">← Surveys</Link>
        <span className="ml-auto text-[12px] text-[#9aa6ac] hidden sm:inline">{savedAt ? `Saved ${savedAt}` : ""}</span>
        <a href={`${origin}/survey/${PREVIEW_PREFIX}${s.id}`} target="_blank" rel="noopener" className="rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[13px] font-bold px-4 py-2 hover:bg-[#eaf7fb] transition-colors">Preview ↗</a>
        <button onClick={save} disabled={saving} className="rounded-full bg-[#0aa3c7] text-white text-[13px] font-bold px-5 py-2 hover:bg-[#0891b2] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
        {([
          ["setup", "Setup"],
          ["trips", "Trips & dates"],
          ["invites", `Invites${invites.length ? ` (${invites.length})` : ""}`],
          ["responses", "Responses"],
        ] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${tab === k ? "bg-[#0aa3c7] text-white" : "text-[#6a7a80] hover:text-[#0a2a33] border border-[#e2d8c6]"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "setup" && (
      <div className={card}>
        <label className="block mb-3">
          <span className={lbl}>Title</span>
          <input className={`${input} mt-1 text-[16px] font-bold`} value={s.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="block mb-3">
          <span className={lbl}>Small line above the title <span className="font-normal normal-case opacity-70">— gold, uppercase. Empty = &ldquo;By private invitation&rdquo; · a single space hides it</span></span>
          <input className={`${input} mt-1`} value={s.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value === "" ? null : e.target.value })} placeholder="By private invitation" />
        </label>
        <label className="block mb-3">
          <span className={lbl}>Intro (shown on the form + email)</span>
          <textarea className={`${input} mt-1 min-h-[70px] resize-y`} value={s.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} placeholder="e.g. I'm cooking up a small, special trip for a handful of riders…" />
        </label>
        <label className="block mb-3">
          <span className={lbl}>Invite email text <span className="font-normal normal-case opacity-70">— replaces the standard pitch between the greeting and the buttons; greeting, buttons, opt-out &amp; sign-off stay. Empty = built-in copy. Check it with ✉ Preview email below.</span></span>
          <textarea className={`${input} mt-1 min-h-[90px] resize-y`} value={s.email_body ?? ""} onChange={(e) => patch({ email_body: e.target.value || null })} placeholder={"I'm putting together " + (s.title || "this trip") + " and you're on my shortlist. Just tell me if you'd be in — one tap on a date below is all it takes."} />
        </label>
        <label className="block mb-3">
          <span className={lbl}>Email buttons</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => patch({ email_date_buttons: true })}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold transition-colors ${s.email_date_buttons !== false ? "bg-[#0aa3c7] text-white" : "bg-[#f2f8f9] text-[#5a6b72] hover:bg-[#e2f0f3]"}`}>
              One per date — one-tap answers
            </button>
            <button type="button" onClick={() => patch({ email_date_buttons: false })}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold transition-colors ${s.email_date_buttons === false ? "bg-[#0aa3c7] text-white" : "bg-[#f2f8f9] text-[#5a6b72] hover:bg-[#e2f0f3]"}`}>
              One button — opens the survey
            </button>
            {s.email_date_buttons === false && (
              <input className={`${input} !w-[260px]`} value={s.email_button_label ?? ""} onChange={(e) => patch({ email_button_label: e.target.value || null })} placeholder="Take the 2-minute survey" />
            )}
          </span>
          <span className="block text-[11.5px] text-[#9aa6ac] mt-1">Many dates or places? Pick &ldquo;one button&rdquo; so the email stays short — people choose everything on the survey page instead.</span>
        </label>
        <div>
          <span className={lbl}>Status</span>
          <div className="flex gap-1.5 mt-1.5">
            {STATUSES.map((st) => (
              <button key={st} onClick={() => patch({ status: st })}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-bold border capitalize transition-colors ${s.status === st ? "bg-[#0aa3c7] text-white border-[#0aa3c7]" : "bg-white text-[#3a4a50] border-[#e2e9ec] hover:border-[#0aa3c7]"}`}>{st}</button>
            ))}
            <span className="self-center ml-2 text-[12px] text-[#9aa6ac]">{s.status === "draft" ? "Not collecting — preview only" : s.status === "open" ? "Live & collecting" : "Closed to new answers"}</span>
          </div>
        </div>
        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input type="checkbox" checked={s.ask_wishes !== false} onChange={(e) => patch({ ask_wishes: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[#0aa3c7]" />
          <span>
            <span className="block text-[13.5px] font-bold text-[#0a2a33]">Ask &ldquo;What are you looking for?&rdquo;</span>
            <span className="block text-[12px] text-[#9aa6ac] leading-snug">The free-text wishes card on the form — great for premium trips, noise for simple date polls. (Quick mode never shows it.)</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
          <input type="checkbox" checked={!!s.quick} onChange={(e) => patch({ quick: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[#0aa3c7]" />
          <span>
            <span className="block text-[13.5px] font-bold text-[#0a2a33]">Quick mode — one-tap interest</span>
            <span className="block text-[12px] text-[#9aa6ac] leading-snug">The invite email gets a button per date that <b>already registers the answer</b>; the page just confirms it and lets them adjust. Only the trips&apos; dates are asked — budget &amp; wishes are skipped.</span>
          </span>
        </label>
        {(s.quick || s.destinations.some((d) => d.start || d.end)) && (
          <div className="mt-3 ml-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={lbl}>Join button <span className="font-normal normal-case opacity-70">— page cards + email buttons · empty = just the date</span></span>
              <input className={`${input} mt-1`} value={s.cta_label ?? ""} onChange={(e) => patch({ cta_label: e.target.value || null })} placeholder="(none — the date stands alone)" />
            </label>
            <label className="block">
              <span className={lbl}>Decline button</span>
              <input className={`${input} mt-1`} value={s.decline_label ?? ""} onChange={(e) => patch({ decline_label: e.target.value || null })} placeholder="Can't make it this time" disabled={s.show_decline === false} />
            </label>
            <label className="flex items-start gap-2 cursor-pointer sm:col-span-2">
              <input type="checkbox" checked={s.show_decline !== false} onChange={(e) => patch({ show_decline: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[#0aa3c7]" />
              <span className="text-[12.5px] text-[#5a6a70]">Offer a &ldquo;can&apos;t make it&rdquo; opt-out <span className="text-[#9aa6ac]">— off: no decline button on the page, no decline link in the email</span></span>
            </label>
          </div>
        )}
      </div>

      )}

      {tab === "trips" && (<>
      {/* trips = a PLACE with one or more date windows */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <span className={lbl}>Trips</span>
          <button onClick={addTrip} className="text-[12.5px] font-bold text-[#0aa3c7]">+ Add place</button>
        </div>
        <p className="text-[12px] text-[#9aa6ac] mb-3">One card per <b>place</b> — add as many <b>date windows</b> under it as you like. Riders see one card for the place and tick the dates that work. Give it a blurb + a photo (or hit <b>Locate</b> for a satellite fallback). (Leave dates empty to fall back to the old “pick a spot + a week” style.)</p>
        {tripGroups.length === 0 ? <p className="text-[13px] text-[#9aa6ac]">No trips yet.</p> : (
          <div className="space-y-2.5">
            {tripGroups.map((g) => {
              const first = g.rows[0];
              return (
                <div key={g.key} className="rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input className={`${input} font-semibold`} value={first.label} onChange={(e) => setGroup(g.key, { label: e.target.value })} placeholder="Place — e.g. Langebaan" />
                    <button onClick={() => delGroup(g.key)} className="shrink-0 text-[#c0392b] text-[13px] font-bold px-2">Remove</button>
                  </div>
                  <input className={input} value={first.location ?? ""} onChange={(e) => setGroup(g.key, { location: e.target.value })} placeholder="Location — e.g. Cape Town, South Africa (optional)" />

                  {/* dates — one PILL per window; click a pill to edit it in a popover */}
                  <div>
                    <span className="text-[12px] font-bold text-[#6a7a80]">Dates <span className="font-normal text-[#9aa6ac]">— riders pick from these · click a pill to edit</span></span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {g.rows.map((r) => {
                        const label = fmtRange(r.start, r.end);
                        const open = openDate === r.key;
                        const nights = nightsOf(r);
                        return (
                          <div key={r.key} className="relative">
                            <button type="button" onClick={() => setOpenDate(open ? null : r.key)}
                              className={`inline-flex items-center gap-1.5 rounded-full py-1.5 text-[13px] font-bold border transition-colors ${g.rows.length > 1 ? "pl-3.5 pr-1.5" : "px-3.5"} ${open ? "border-[#0aa3c7] bg-[#eaf7fb] text-[#0a2a33]" : label ? "border-[#d8e3e6] bg-white text-[#0a2a33] hover:border-[#0aa3c7]" : "border-dashed border-[#c9bda5] text-[#8a9aa0] hover:border-[#0aa3c7] hover:text-[#0aa3c7]"}`}>
                              <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10.5h18" /></svg>
                              {label ?? "Pick dates…"}
                              {g.rows.length > 1 && (
                                <span role="button" tabIndex={0} title="Remove this date"
                                  onClick={(e) => { e.stopPropagation(); if (open) setOpenDate(null); delDate(g.key, r.key); }}
                                  className="w-5 h-5 grid place-items-center rounded-full text-[#9aa6ac] hover:bg-[#fbe4de] hover:text-[#c0392b] transition-colors">✕</span>
                              )}
                            </button>
                            {open && (
                              <>
                                {/* click-away layer */}
                                <div className="fixed inset-0 z-20" onClick={() => setOpenDate(null)} />
                                <div className="absolute z-30 top-full left-0 mt-2 w-[300px] rounded-2xl border border-[#e2e9ec] bg-white shadow-[0_16px_40px_rgba(2,33,46,0.18)] p-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <label className="flex-1 min-w-0">
                                      <span className="text-[11px] font-black uppercase tracking-wide text-[#6a7a80]">From</span>
                                      <input type="date" autoFocus className={`${input} mt-1`} value={r.start ?? ""} onChange={(e) => setStartSmart(r, e.target.value || null)} />
                                    </label>
                                    <label className="flex-1 min-w-0">
                                      <span className="text-[11px] font-black uppercase tracking-wide text-[#6a7a80]">To</span>
                                      <input type="date" className={`${input} mt-1`} min={r.start ?? undefined} value={r.end ?? ""} onChange={(e) => setRow(r.key, { end: e.target.value || null })} />
                                    </label>
                                  </div>
                                  <div className="flex items-center justify-between mt-3">
                                    <button onClick={() => { setOpenDate(null); delDate(g.key, r.key); }} className="text-[12px] font-bold text-[#c0392b]">Remove</button>
                                    <span className="text-[11.5px] text-[#9aa6ac]">{nights ? `${nights} nights` : ""}</span>
                                    <button onClick={() => setOpenDate(null)} className="rounded-full bg-[#0aa3c7] text-white text-[12.5px] font-bold px-4 py-1.5 hover:bg-[#0891b2]">Done</button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      <button onClick={() => setOpenDate(addDate(g.key))}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#c9bda5] px-3.5 py-1.5 text-[13px] font-bold text-[#6a7a80] hover:border-[#0aa3c7] hover:text-[#0aa3c7] transition-colors">＋ Add dates</button>
                    </div>
                  </div>

                  <textarea className={`${input} min-h-[60px] resize-y`} value={first.blurb ?? ""} onChange={(e) => setGroup(g.key, { blurb: e.target.value })} placeholder="Write about the trip — the spot, the vibe, what's included…" />

                  {/* one photo / satellite fallback for the whole place */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {first.image ? (
                      <>
                        {/* Drag the photo up or down to reframe it — the survey
                            banner is short and wide, so a tall photo lands
                            wherever the middle happens to be. Same gesture as
                            the email header editor. */}
                        <div
                          title="Drag up or down to reframe"
                          onPointerDown={(e) => {
                            const el = e.currentTarget;
                            el.setPointerCapture(e.pointerId);
                            const startY = e.clientY;
                            const startFocus = first.focus ?? 50;
                            const h = el.getBoundingClientRect().height || 48;
                            const move = (ev: PointerEvent) => {
                              const next = Math.min(100, Math.max(0, Math.round(startFocus - ((ev.clientY - startY) / h) * 100)));
                              setGroup(g.key, { focus: next });
                            };
                            const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
                            el.addEventListener("pointermove", move);
                            el.addEventListener("pointerup", up);
                          }}
                          className="relative w-28 h-12 rounded-lg overflow-hidden border border-[#e2d8c6] cursor-ns-resize touch-none"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={first.image} alt="" draggable={false}
                            className="w-full h-full object-cover select-none"
                            style={{ objectPosition: `50% ${first.focus ?? 50}%` }} />
                          <span className="absolute inset-x-0 bottom-0 text-[9px] font-bold text-white/90 bg-black/35 text-center leading-[13px]">drag ↕</span>
                        </div>
                        <button onClick={() => setPicker(g.key)} className="text-[12px] font-bold text-[#0aa3c7]">Change photo</button>
                        {(first.focus ?? 50) !== 50 && (
                          <button onClick={() => setGroup(g.key, { focus: 50 })} className="text-[12px] font-bold admin-muted hover:text-[#0aa3c7]">Recentre</button>
                        )}
                        <button onClick={() => setGroup(g.key, { image: null })} className="text-[12px] font-bold text-[#c0392b]">Remove</button>
                      </>
                    ) : (
                      <button onClick={() => setPicker(g.key)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#c9bda5] px-3 py-1.5 text-[12.5px] font-bold text-[#6a7a80] hover:border-[#0aa3c7] hover:text-[#0aa3c7]">＋ Add / upload photo</button>
                    )}
                    <span className="text-[#e2d8c6]">·</span>
                    <button onClick={() => locate(g.key)} disabled={geoBusy === g.key} className="text-[12px] font-bold text-[#0aa3c7] disabled:opacity-50">{geoBusy === g.key ? "Locating…" : "📍 Locate from name"}</button>
                    {first.lat != null && first.lng != null && <span className="text-[11.5px] text-[#1f9e57] font-semibold">✓ satellite fallback ready</span>}
                  </div>
                  {!first.image && (first.lat == null || first.lng == null) && (
                    <p className="text-[11px] text-[#9aa6ac]">No photo yet? Hit <b>Locate</b> — riders will see a satellite view of the spot instead of a blank card.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {picker !== null && (
        <ImagePickerModal
          defaultFolder="experiences/shared"
          onSelect={(url) => { setGroup(picker, { image: url }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* weeks — legacy "pick a spot + a week" mode ONLY. The member form hides &
          ignores weeks as soon as any trip has dates, so hide the editor too (it
          would just collect answers nobody can give). */}
      {!s.destinations.some((d) => !!(d.start || d.end)) && (
        <div className={card}>
          <div className="flex items-center justify-between mb-2">
            <span className={lbl}>Possible weeks</span>
            <button onClick={addWeek} className="text-[12.5px] font-bold text-[#0aa3c7]">+ Add week</button>
          </div>
          <p className="text-[12px] text-[#9aa6ac] mb-3">Constrain availability to a few windows — riders tick the ones that work. <b>Only used when your trips above have no dates</b> — with dated trips, riders pick dates on the trip cards instead.</p>
          {s.weeks.length === 0 ? <p className="text-[13px] text-[#9aa6ac]">No weeks yet.</p> : (
            <div className="space-y-2">
              {s.weeks.map((w, i) => (
                <div key={w.key} className="flex flex-wrap items-center gap-2">
                  <input className={`${input} flex-1 min-w-[160px]`} value={w.label} onChange={(e) => setWeek(i, { label: e.target.value })} placeholder="e.g. Week 1 · early March" />
                  <input type="date" className={`${input} w-[150px]`} value={w.start ?? ""} onChange={(e) => setWeek(i, { start: e.target.value || null })} />
                  <input type="date" className={`${input} w-[150px]`} value={w.end ?? ""} onChange={(e) => setWeek(i, { end: e.target.value || null })} />
                  <button onClick={() => delWeek(i)} className="shrink-0 text-[#c0392b] text-[13px] font-bold px-2">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* budget */}
      <div className={card}>
        <span className={lbl}>Budget</span>
        <p className="text-[12px] text-[#9aa6ac] mt-1 mb-3">The approximate per-person figure riders see — they confirm if it&apos;s comfortable (yes / maybe / too much).</p>
        <div className="grid grid-cols-2 gap-3 max-w-[320px]">
          <label className="block"><span className="text-[12px] font-bold text-[#6a7a80]">Currency</span><input className={`${input} mt-1`} value={s.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase().slice(0, 3) })} /></label>
          <label className="block"><span className="text-[12px] font-bold text-[#6a7a80]">Approx. €/person</span><input type="number" className={`${input} mt-1`} value={s.budget_anchor ?? ""} onChange={(e) => patch({ budget_anchor: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
      </div>

      </>)}

      {tab === "invites" && (<>
        <div className={card}>
          <p className={lbl}>Share it as a story</p>
          <p className="text-[12.5px] text-[#6a7a80] mt-1 mb-2.5">
            A branded graphic for Instagram or WhatsApp — the open link goes in the sticker.
          </p>
          <SurveyStoryShare
            photos={[...new Map(s.destinations.filter((d) => d.image).map((d) => [d.image!, { url: d.image!, label: d.label || "Trip" }])).values()]}
            defaultTitle={s.title}
            defaultSub={s.eyebrow?.trim() || ""}
          />
        </div>
        <InviteSection surveyId={s.id} surveyTitle={s.title} openToken={s.open_token} invites={invites} setInvites={setInvites} linkFor={linkFor} />
      </>)}

      {tab === "responses" && (
        <ResponsesSection survey={s} invites={invites} fmtMoney={fmtMoney} />
      )}

      <div className="pt-2">
        <button onClick={archive} className="text-[13px] font-bold text-[#c0392b] hover:underline">Archive survey</button>
      </div>
    </div>
  );
}

// ---------------- invites ----------------
type Picked = { id: string; name: string };
function InviteSection({ surveyId, surveyTitle, openToken, invites, setInvites, linkFor }: {
  surveyId: string; surveyTitle: string; openToken: string | null; invites: SurveyInvite[]; setInvites: (v: SurveyInvite[]) => void; linkFor: (t: string) => string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const invitedIds = useMemo(() => new Set(invites.map((i) => i.contact_id)), [invites]);

  async function search(q: string) {
    setTerm(q);
    if (q.trim().length < 2) { setResults([]); return; }
    const res = await fetch(`/api/admin/contacts?search=${encodeURIComponent(q)}&limit=8`);
    const j = await res.json().catch(() => ({ data: [] }));
    setResults((j.data ?? []).map((c: { id: string; name: string | null; email: string | null }) => ({ id: c.id, name: c.name || c.email || "Unnamed" })));
  }
  const addPick = (p: Picked) => { if (!picked.some((x) => x.id === p.id)) setPicked([...picked, p]); setTerm(""); setResults([]); };

  async function addInvites() {
    if (!picked.length) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}/invites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: picked.map((p) => p.id), sendEmail }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "Couldn't add invites."); return; }
      // refetch the full list
      const list = await fetch(`/api/admin/surveys/${surveyId}/invites`).then((r) => r.json()).catch(() => ({ invites }));
      setInvites(list.invites ?? invites);
      setPicked([]);
      setMsg(sendEmail ? `Added ${j.created?.length ?? 0} · emailed ${j.emailed ?? 0}` : `Added ${j.created?.length ?? 0}`);
    } finally { setBusy(false); }
  }

  // Bulk add: everyone carrying a contact tag (e.g. "Tenerife") joins the list
  // un-emailed — review, remove anyone, then Send invites.
  const [tag, setTag] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagFocus, setTagFocus] = useState(false);
  const [tagOptions, setTagOptions] = useState<{ tag: string; count: number }[]>([]);

  /**
   * Audience by BOOKING, not by tag.
   *
   * Tags drift: 19 of the 20 Lake Garda 2026 guests carry `Clinic`, a leftover
   * from the Notion import, so "everyone tagged Experience Participant" left
   * almost every Garda guest out of a survey about Garda. Bookings are written
   * by the act of booking and can't fall out of date.
   */
  type AudOpts = {
    experiences: { id: string; title: string }[];
    editions: { id: string; experienceId: string; label: string; year: number | null; dateStart: string | null }[];
    statuses: string[];
  };
  const [audOpts, setAudOpts] = useState<AudOpts>({ experiences: [], editions: [], statuses: [] });
  const [audExp, setAudExp] = useState("");
  const [audYear, setAudYear] = useState("");
  // Defaults to people who actually came. "lead" only ever enquired — a very
  // different audience, so it is opt-in rather than swept along.
  const [audStatuses, setAudStatuses] = useState<string[]>(["attended", "paid", "confirmed"]);
  const [audCount, setAudCount] = useState<number | null>(null);
  const [audBusy, setAudBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audience").then((r) => r.json()).then(setAudOpts).catch(() => {});
  }, []);

  const audFilters = useMemo(() => ({
    bookings: {
      experienceIds: audExp ? [audExp] : undefined,
      years: audYear ? [Number(audYear)] : undefined,
      statuses: audStatuses.length ? audStatuses : undefined,
    },
  }), [audExp, audYear, audStatuses]);

  const audActive = !!(audExp || audYear);
  useEffect(() => {
    if (!audActive) { setAudCount(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/admin/audience", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: audFilters }), signal: ctrl.signal,
      }).then((r) => r.json()).then((d) => setAudCount(typeof d.count === "number" ? d.count : null)).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [audFilters, audActive]);

  const audYears = useMemo(() => {
    const eds = audExp ? audOpts.editions.filter((e) => e.experienceId === audExp) : audOpts.editions;
    return [...new Set(eds.map((e) => e.year).filter((y): y is number => y != null))].sort((a, b) => b - a);
  }, [audOpts.editions, audExp]);

  async function addByBooking() {
    if (audBusy || !audActive) return;
    setAudBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/audience", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: audFilters, ids: true }),
      }).then((x) => x.json()).catch(() => null);
      const ids: string[] = Array.isArray(r?.ids) ? r.ids : [];
      const fresh = ids.filter((id) => !invitedIds.has(id));
      const label = [audOpts.experiences.find((e) => e.id === audExp)?.title, audYear].filter(Boolean).join(" ") || "that filter";
      if (!fresh.length) {
        setMsg(ids.length ? `All ${ids.length} from ${label} are already on the list.` : `Nobody matches ${label}.`);
        return;
      }
      if (!confirm(`Add ${fresh.length} ${fresh.length === 1 ? "person" : "people"} who booked ${label} to the invite list?\n\nNo emails yet — review the list, then press Send invites.`)) return;
      const res = await fetch(`/api/admin/surveys/${surveyId}/invites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: fresh, sendEmail: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "Couldn't add."); return; }
      const list = await fetch(`/api/admin/surveys/${surveyId}/invites`).then((x) => x.json()).catch(() => null);
      if (list?.invites) setInvites(list.invites);
      setMsg(`Added ${j.created?.length ?? fresh.length} who booked ${label} — press Send invites when ready.`);
    } finally { setAudBusy(false); }
  }
  useEffect(() => {
    fetch("/api/admin/contacts/tags").then((r) => r.json()).then((d) => setTagOptions(Array.isArray(d?.tags) ? d.tags : [])).catch(() => {});
  }, []);
  const tagMatches = (tag.trim()
    ? tagOptions.filter((t) => t.tag.toLowerCase().includes(tag.trim().toLowerCase()))
    : tagOptions
  ).slice(0, 8);
  async function addByTag(tArg?: string) {
    const t = (tArg ?? tag).trim();
    if (!t || tagBusy) return;
    setTagBusy(true); setMsg("");
    try {
      const dry = await fetch(`/api/admin/surveys/${surveyId}/invites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: t, dryRun: true }),
      }).then((r) => r.json()).catch(() => null);
      if (!dry || typeof dry.count !== "number") { setMsg("Couldn't look up that tag."); return; }
      if (dry.count === 0) { setMsg(dry.total > 0 ? `All ${dry.total} "${t}" contacts are already on the list.` : `No contacts carry the tag "${t}".`); return; }
      if (!confirm(`Add ${dry.count} contacts tagged "${t}" to the invite list?

No emails yet — review the list, then press Send invites.`)) return;
      const res = await fetch(`/api/admin/surveys/${surveyId}/invites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: t, sendEmail: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "Couldn't add."); return; }
      const list = await fetch(`/api/admin/surveys/${surveyId}/invites`).then((r) => r.json()).catch(() => null);
      if (list?.invites) setInvites(list.invites);
      setMsg(`Added ${j.created?.length ?? 0} from "${t}" — press Send invites when ready.`);
      setTag("");
    } finally { setTagBusy(false); }
  }

  // Explicit send step: add → review the list (remove anyone) → press Send.
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [showMail, setShowMail] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [invFilter, setInvFilter] = useState<string>("");
  const [invSearch, setInvSearch] = useState("");
  const unsent = invites.filter((i) => !i.emailed && i.contactEmail && i.source !== "open_link").length;
  async function sendAll() {
    if (!unsent || sending) return;
    if (!confirm(`Email the invite to ${unsent} ${unsent === 1 ? "person" : "people"} who haven't received it yet?`)) return;
    setSending(true); setSendMsg("");
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}/invites/send`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setSendMsg(j.error || "Couldn't send."); return; }
      setSendMsg(`Sent to ${j.sent}${j.failed ? ` · ${j.failed} failed` : ""} 🤙`);
      const list = await fetch(`/api/admin/surveys/${surveyId}/invites`).then((r) => r.json()).catch(() => null);
      if (list?.invites) setInvites(list.invites);
    } finally { setSending(false); }
  }

  // Remind non-responders: got the mail, silent, address not bouncing, not
  // reminded before. Split warm/cold on the open pixel where we have it.
  const remindable = invites.filter((i) =>
    i.emailed && i.contactEmail && !i.response && i.status !== "completed" &&
    i.emailEvent !== "bounced" && i.emailEvent !== "complained" && !i.remindedAt);
  const remOpened = remindable.filter((i) => i.emailOpenedAt).length;
  const [remindOpen, setRemindOpen] = useState(false);
  const [remTarget, setRemTarget] = useState<"all" | "opened" | "unopened">("all");
  const [remSubject, setRemSubject] = useState("");
  const [reminding, setReminding] = useState(false);
  const remCount = remTarget === "all" ? remindable.length : remTarget === "opened" ? remOpened : remindable.length - remOpened;
  async function sendReminders() {
    if (!remCount || reminding) return;
    if (!confirm(`Send the reminder to ${remCount} ${remCount === 1 ? "person" : "people"}?

Same invite email under the subject "${remSubject.trim() || `Quick reminder 🤙 — ${surveyTitle}`}". Each person gets at most ONE reminder — ever.`)) return;
    setReminding(true); setSendMsg("");
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}/invites/remind`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: remTarget, subject: remSubject.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setSendMsg(j.error || "Couldn't send reminders."); return; }
      setSendMsg(`Reminded ${j.sent}${j.failed ? ` · ${j.failed} failed` : ""} 🤙`);
      setRemindOpen(false);
      const list = await fetch(`/api/admin/surveys/${surveyId}/invites`).then((r) => r.json()).catch(() => null);
      if (list?.invites) setInvites(list.invites);
    } finally { setReminding(false); }
  }

  async function remove(inviteId: string) {
    await fetch(`/api/admin/surveys/${surveyId}/invites?inviteId=${inviteId}`, { method: "DELETE" });
    setInvites(invites.filter((i) => i.id !== inviteId));
  }
  function copy(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1600); }).catch(() => {});
  }

  const STATUS: Record<string, string> = { invited: "bg-[#eef3f4] text-[#6a7a80]", opened: "bg-[#fff3df] text-[#9a6b16]", completed: "bg-[#e1f5ee] text-[#0f6e56]" };

  return (
    <div className="rounded-2xl border border-[#e7ddcb] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]">Invite members</span>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setShowMail((v) => !v)}
            className="rounded-full border border-[#d8e3e6] text-[#0aa3c7] hover:bg-[#f2f8f9] text-[12.5px] font-bold px-4 py-1.5 transition-colors">
            {showMail ? "Hide email preview" : "✉ Preview email"}
          </button>
        {invites.length > 0 && (
          <div className="flex items-center gap-2.5">
            {sendMsg && <span className="text-[12px] font-semibold text-[#0f6e56]">{sendMsg}</span>}
            {remindable.length > 0 && (
              <button onClick={() => setRemindOpen((v) => !v)}
                className={`rounded-full border text-[12.5px] font-bold px-4 py-1.5 transition-colors ${remindOpen ? "border-[#b0791e] bg-[#fff3df] text-[#9a6b16]" : "border-[#e3cfa4] text-[#b0791e] hover:bg-[#fff8ec]"}`}>
                ↻ Remind non-responders ({remindable.length})
              </button>
            )}
            {unsent > 0 ? (
              <button onClick={sendAll} disabled={sending}
                className="rounded-full bg-[#0aa3c7] hover:bg-[#0891b2] text-white text-[12.5px] font-bold px-4 py-1.5 disabled:opacity-60 transition-colors">
                {sending ? "Sending…" : `Send invites (${unsent})`}
              </button>
            ) : (
              <span className="rounded-full bg-[#eef3f4] text-[#8a97a0] text-[12.5px] font-bold px-4 py-1.5 cursor-default">All invites sent ✓</span>
            )}
          </div>
        )}
        </div>
      </div>
      {remindOpen && (
        <div className="mt-3 rounded-xl border border-[#e3cfa4] bg-[#fffbf2] p-4">
          <p className="text-[12px] font-black uppercase tracking-[0.1em] text-[#b0791e]">Remind non-responders</p>
          <p className="text-[12.5px] text-[#8a7a58] mt-1">Re-sends the same invite email (one-tap buttons included) under a fresh subject. Skips everyone who answered, bounced, or was already reminded — <b>max one reminder per person</b>.</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {([["all", `Everyone silent (${remindable.length})`], ["opened", `✉ Opened, no answer (${remOpened})`], ["unopened", `Never opened (${remindable.length - remOpened})`]] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setRemTarget(v)}
                className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold transition-colors ${remTarget === v ? "bg-[#b0791e] text-white" : "bg-[#f7efdd] text-[#8a7a58] hover:bg-[#f0e3c6]"}`}>{lbl}</button>
            ))}
          </div>
          {remOpened === 0 && <p className="text-[11.5px] text-[#a99a76] mt-1.5">Open tracking only runs for emails sent since 14 Jul — earlier sends all count as “never opened”.</p>}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input value={remSubject} onChange={(e) => setRemSubject(e.target.value)} placeholder={`Quick reminder 🤙 — ${surveyTitle}`}
              className="flex-1 min-w-[240px] rounded-lg border border-[#e3cfa4] bg-white text-[#0a2a33] placeholder:text-[#c2b28c] px-3 py-2 text-[13.5px] outline-none focus:border-[#b0791e]" />
            <button onClick={sendReminders} disabled={!remCount || reminding}
              className="rounded-full bg-[#b0791e] hover:bg-[#9a6b16] text-white text-[12.5px] font-bold px-4 py-2 disabled:opacity-40 transition-colors">
              {reminding ? "Sending…" : `Send reminder (${remCount})`}
            </button>
          </div>
        </div>
      )}
      {showMail && (
        <div className="mt-3 rounded-xl border border-[#e7ddcb] overflow-hidden bg-white">
          <div className="px-3 py-1.5 text-[11px] text-[#9aa6ac] border-b border-[#efe8d8]">Exactly what recipients get — built from the <b>last saved</b> survey (save first if you just changed something). Buttons link to your team preview.</div>
          <iframe title="Invite email preview" src={`/api/admin/surveys/${surveyId}/email-preview`} sandbox="" className="w-full h-[560px] bg-white" />
        </div>
      )}
      {openToken && (
        <div className="mt-3 rounded-xl border border-[#d3e9ef] bg-[#f4fafc] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]">🔗 Open link</span>
            <code className="min-w-0 flex-1 truncate text-[12px] text-[#3a4a50]">{linkFor(openToken)}</code>
            <button onClick={() => copy(linkFor(openToken), "open-link")}
              className="shrink-0 rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[12px] font-bold px-3 py-1 hover:bg-[#eaf7fb] transition-colors">
              {copied === "open-link" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[11.5px] text-[#7a8f97] mt-1">Share it anywhere (WhatsApp, forums, …) — people leave their name + email, get their own personal link, and appear in the list below automatically.</p>
        </div>
      )}
      <div className="relative mt-2">
        <input className="w-full rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-3 py-2 text-[14px] outline-none focus:border-[#0aa3c7]" value={term} onChange={(e) => search(e.target.value)} placeholder="Search members by name or email…" />
        {results.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-[#e2e9ec] bg-white shadow-lg overflow-hidden">
            {results.map((r) => (
              <button key={r.id} onClick={() => addPick(r)} disabled={invitedIds.has(r.id)} className="block w-full text-left px-3 py-2 text-[14px] text-[#0a2a33] hover:bg-[#f2f8f9] disabled:opacity-40 disabled:cursor-not-allowed">
                {r.name}{invitedIds.has(r.id) ? " · already invited" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* whole-group add: pull in everyone carrying a contact tag */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#9aa6ac]">…or a whole group:</span>
        <div className="relative">
          <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addByTag(); }}
            onFocus={() => setTagFocus(true)} onBlur={() => setTagFocus(false)}
            placeholder='contact tag — e.g. Tenerife' className="w-48 rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-3 py-1.5 text-[13px] outline-none focus:border-[#0aa3c7]" />
          {tagFocus && tagMatches.length > 0 && (
            <div className="absolute z-10 left-0 top-full mt-1 w-64 rounded-lg border border-[#e2e9ec] bg-white shadow-lg overflow-hidden">
              {tagMatches.map((t) => (
                <button key={t.tag} type="button"
                  onMouseDown={(e) => { e.preventDefault(); setTag(t.tag); setTagFocus(false); addByTag(t.tag); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-[13.5px] text-[#0a2a33] hover:bg-[#f2f8f9]">
                  <span className="font-semibold truncate">{t.tag}</span>
                  <span className="shrink-0 text-[12px] text-[#8a97a0] tabular-nums">{t.count} contacts</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => addByTag()} disabled={!tag.trim() || tagBusy}
          className="rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[12.5px] font-bold px-3.5 py-1.5 hover:bg-[#eaf7fb] disabled:opacity-40 transition-colors">
          {tagBusy ? "Looking up…" : "Add everyone tagged"}
        </button>
        {!picked.length && msg && <span className="text-[12.5px] text-[#0f6e56] font-semibold">{msg}</span>}
      </div>

      {/* …or by what they actually booked. Tags are hand-maintained and drift;
          a booking is written by the act of booking. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#9aa6ac]">…or everyone who booked:</span>
        <select value={audExp} onChange={(e) => setAudExp(e.target.value)} className="rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#0aa3c7]">
          <option value="">Any experience</option>
          {audOpts.experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select value={audYear} onChange={(e) => setAudYear(e.target.value)} className="rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#0aa3c7]">
          <option value="">Any year</option>
          {audYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="flex flex-wrap items-center gap-1">
          {["attended", "paid", "confirmed", "reserved", "lead"].map((st) => {
            const on = audStatuses.includes(st);
            return (
              <button key={st} type="button"
                onClick={() => setAudStatuses((cur) => on ? cur.filter((x) => x !== st) : [...cur, st])}
                title={st === "lead" ? "Only ever enquired — never came" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${on ? "bg-[#0aa3c7] text-white" : "border border-[#d8e3e6] text-[#8a97a0] hover:text-[#0a2a33]"}`}>
                {st}
              </button>
            );
          })}
        </span>
        <button onClick={addByBooking} disabled={!audActive || audBusy || audCount === 0}
          className="rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[12.5px] font-bold px-3.5 py-1.5 hover:bg-[#eaf7fb] disabled:opacity-40 transition-colors">
          {audBusy ? "Adding…" : audCount != null ? `Add these ${audCount}` : "Add these"}
        </button>
        {audActive && audCount != null && (
          <span className="text-[12px] text-[#8a97a0]">{audCount} match{audCount === 1 ? "" : "es"} · opted-in only</span>
        )}
      </div>

      {picked.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfaff] border border-[#c7e7f0] px-3 py-1 text-[13px] font-semibold text-[#00374a]">
                {p.name}
                <button onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} className="text-[#8a97a0] hover:text-[#c0392b]">×</button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <label className="inline-flex items-center gap-2 text-[13px] text-[#3a4a50]">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email immediately <span className="text-[#9aa6ac]">(otherwise: review the list, then press Send invites)</span>
            </label>
            <button onClick={addInvites} disabled={busy} className="rounded-full bg-[#0aa3c7] text-white text-[13px] font-bold px-4 py-2 disabled:opacity-50">{busy ? "Adding…" : `Add ${picked.length}`}</button>
            {msg && <span className="text-[12.5px] text-[#0f6e56] font-semibold">{msg}</span>}
          </div>
        </div>
      )}

      {invites.length > 0 && (() => {
        // Long lists stay usable: status pills filter, the list folds past 12.
        const counts = { invited: 0, opened: 0, completed: 0 } as Record<string, number>;
        for (const i of invites) counts[i.status] = (counts[i.status] ?? 0) + 1;
        const mailOpened = invites.filter((i) => i.emailOpenedAt).length;
        const shown = invites.filter((i) =>
          (invFilter === "mail_opened" ? !!i.emailOpenedAt : (!invFilter || i.status === invFilter)) &&
          (!invSearch.trim() || (i.contactName ?? "").toLowerCase().includes(invSearch.trim().toLowerCase())));
        const list = invOpen ? shown : shown.slice(0, 12);
        return (
        <div className="mt-4 border-t border-[#f0e6d6] pt-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {([["", `All (${invites.length})`], ["invited", `Invited (${counts.invited ?? 0})`], ["opened", `Opened page (${counts.opened ?? 0})`], ["completed", `Completed (${counts.completed ?? 0})`], ...(mailOpened ? [["mail_opened", `✉ Opened mail (${mailOpened})`]] as const : [])] as ReadonlyArray<readonly [string, string]>).map(([v, lbl]) => (
              <button key={v} onClick={() => setInvFilter(v)} className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold transition-colors ${invFilter === v ? "bg-[#0aa3c7] text-white" : "bg-[#f2f8f9] text-[#5a6b72] hover:bg-[#e2f0f3]"}`}>{lbl}</button>
            ))}
            {invites.length > 12 && (
              <input value={invSearch} onChange={(e) => setInvSearch(e.target.value)} placeholder="Filter by name…"
                className="ml-auto w-[160px] rounded-lg border border-[#e2e9ec] bg-white text-[#0a2a33] placeholder:text-[#9aa6ac] px-2.5 py-1 text-[12.5px] outline-none focus:border-[#0aa3c7]" />
            )}
          </div>
          <div className="space-y-1.5">
          {list.map((i) => (
            <div key={i.id} className="flex items-center gap-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate text-[#00374a] font-semibold">{i.contactName || "Member"}</span>
              <span className={`shrink-0 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS[i.status]}`}>{i.status}</span>
              <span className={`shrink-0 text-[11px] font-bold ${i.emailEvent === "bounced" || i.emailEvent === "complained" ? "text-[#c0392b]" : i.emailOpenedAt ? "text-[#0f6e56]" : i.emailed ? "text-[#6a7a80]" : i.source === "open_link" ? "text-[#0aa3c7]" : "text-[#c9bda5]"}`}
                title={i.emailEvent === "bounced" ? "The invite email BOUNCED — wrong address?" : i.emailEvent === "complained" ? "Marked as spam" : i.emailOpenedAt ? `They opened the email (${new Date(i.emailOpenedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : i.emailed ? "Delivered — not opened yet (tracking runs since 14 Jul)" : i.source === "open_link" ? "Joined themselves via the open link — no invite email needed" : "No email sent yet — use Send invites"}>
                {i.emailEvent === "bounced" ? "✉ bounced" : i.emailEvent === "complained" ? "✉ spam" : i.emailOpenedAt ? "✉ opened" : i.emailed ? "✉ sent" : i.source === "open_link" ? "🔗 self-joined" : "✉ not sent"}</span>
              {i.remindedAt && (
                <span className="shrink-0 text-[11px] font-bold text-[#b0791e]"
                  title={`Reminder sent ${new Date(i.remindedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}>↻</span>
              )}
              <button onClick={() => copy(linkFor(i.token), i.id)} className="shrink-0 text-[12px] font-bold text-[#0aa3c7]">{copied === i.id ? "Copied!" : "Copy link"}</button>
              <button onClick={() => remove(i.id)} className="shrink-0 text-[12px] font-bold text-[#b6c2c7] hover:text-[#c0392b]">Remove</button>
            </div>
          ))}
          </div>
          {shown.length > 12 && (
            <button onClick={() => setInvOpen((o) => !o)} className="mt-2.5 w-full rounded-lg border border-dashed border-[#d8e3e6] py-1.5 text-[12.5px] font-bold text-[#0aa3c7] hover:bg-[#f2f8f9] transition-colors">
              {invOpen ? "Show fewer" : `Show all ${shown.length}`}
            </button>
          )}
          {shown.length === 0 && <p className="text-[12.5px] text-[#9aa6ac]">No invites match that filter.</p>}
        </div>
        );
      })()}
    </div>
  );
}

// ---------------- responses ----------------
function ResponsesSection({ survey, invites, fmtMoney }: { survey: Survey; invites: SurveyInvite[]; fmtMoney: (n: number | null) => string }) {
  const responded = invites.filter((i) => i.response);

  // Trips mode: every pick key IS a place+date window — results must show the
  // DATES (two windows in the same place would otherwise both read "Tenerife").
  const hasTrips = survey.destinations.some((d) => !!(d.start || d.end));
  const byKey = new Map(survey.destinations.map((d) => [d.key, d]));
  const fmtDay = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const fmtRange = (d?: { start?: string | null; end?: string | null }) => {
    if (!d || (!d.start && !d.end)) return "dates TBC";
    if (d.start && d.end) return `${fmtDay(d.start)} – ${fmtDay(d.end)} ${d.end.slice(0, 4)}`;
    return fmtDay((d.start ?? d.end)!);
  };
  const placeOf = (d: { groupId?: string | null; label?: string | null; location?: string | null; key: string }) =>
    (d.groupId ?? (d.label || d.location || d.key)) as string;
  const placeNames = new Map<string, string>();
  for (const d of survey.destinations) { const p = placeOf(d); if (!placeNames.has(p)) placeNames.set(p, (d.label || d.location || "Trip").trim()); }
  const multiPlace = placeNames.size > 1;
  const destLabel = (key: string | null) => {
    const d = key ? byKey.get(key) : undefined;
    if (!d) return key ?? "—";
    if (hasTrips && (d.start || d.end)) return multiPlace ? `${(d.label || d.location || "").trim()} · ${fmtRange(d)}` : fmtRange(d);
    return d.label ?? key ?? "—";
  };
  const weekLabel = (key: string) => survey.weeks.find((w) => w.key === key)?.label ?? key;
  const isDecline = (r: { other_destinations: string[]; looking_for: string | null }) =>
    r.other_destinations.length === 0 && !!r.looking_for?.startsWith("Can't make it");

  // aggregates
  const destTop = new Map<string, number>();       // chosen as #1
  const destInterest = new Map<string, number>();  // #1 OR "also up for" — in trips mode: per date window
  const placeInterest = new Map<string, number>(); // trips mode: distinct people per PLACE
  const weekTally = new Map<string, number>();
  const anchor = survey.budget_anchor;
  const budOk = { yes: 0, maybe: 0, no: 0 };
  let declines = 0;
  for (const i of responded) {
    const r = i.response!;
    if (isDecline(r)) { declines++; continue; }
    if (r.top_destination) destTop.set(r.top_destination, (destTop.get(r.top_destination) ?? 0) + 1);
    const keys = new Set([r.top_destination, ...r.other_destinations].filter(Boolean) as string[]);
    const myPlaces = new Set<string>();
    for (const k of keys) {
      destInterest.set(k, (destInterest.get(k) ?? 0) + 1);
      const d = byKey.get(k);
      if (d) myPlaces.add(placeOf(d));
    }
    for (const p of myPlaces) placeInterest.set(p, (placeInterest.get(p) ?? 0) + 1);
    for (const w of r.weeks) weekTally.set(w, (weekTally.get(w) ?? 0) + 1);
    if (r.budget_ok === "yes") budOk.yes++;
    else if (r.budget_ok === "maybe") budOk.maybe++;
    else if (r.budget_ok === "no") budOk.no++;
  }
  const rankedDests = hasTrips
    ? [...placeInterest.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => [placeNames.get(p) ?? p, n] as [string, number])
    : [...destInterest.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [destLabel(k), n] as [string, number]);
  // trips mode: "best weeks" = the date windows, ranked
  const topWeeks = hasTrips
    ? [...destInterest.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [destLabel(k), n] as [string, number])
    : [...weekTally.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [weekLabel(k), n] as [string, number]);
  const bestDest = rankedDests[0], bestWeek = topWeeks[0];
  const topByLabel = new Map([...destTop.entries()].map(([k, n]) => [destLabel(k), n]));
  const budRated = budOk.yes + budOk.maybe + budOk.no;

  return (
    <div className="rounded-2xl border border-[#e7ddcb] bg-white p-5">
      <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]">Responses <span className="text-[#b6c2c7]">({responded.length}/{invites.length})</span></span>
      {responded.length === 0 ? (
        <p className="text-[13px] text-[#9aa6ac] mt-2">No responses yet.</p>
      ) : (
        <>
          {/* planning takeaway — the one-line conclusion */}
          <div className="rounded-xl bg-[#eefaf3] border border-[#bfe6d7] p-3.5 mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#0f6e56] mb-1">Planning takeaway</p>
            <p className="text-[13.5px] text-[#00374a] leading-relaxed">
              {bestDest ? <><b>{bestDest[0]}</b> leads — {bestDest[1]} interested{topByLabel.get(bestDest[0]) ? `, ${topByLabel.get(bestDest[0])} as #1` : ""}</> : "No destination data yet"}
              {bestWeek ? <> · best {hasTrips ? "date" : "week"} <b>{bestWeek[0]}</b> ({bestWeek[1]} in)</> : ""}
              {anchor != null && budRated ? <> · budget <b>{budOk.yes} ok</b>{budOk.maybe ? `, ${budOk.maybe} maybe` : ""}{budOk.no ? `, ${budOk.no} no` : ""} at {fmtMoney(anchor)}</> : ""}
              {declines ? <> · {declines} can&apos;t make it</> : ""}
              {" · "}{responded.length}/{invites.length} replied
            </p>
          </div>

          {/* aggregates */}
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <div className="rounded-xl bg-[#f9fbfb] border border-[#eef3f4] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Demand (incl. also-up-for)</p>
              {rankedDests.length ? rankedDests.map(([lbl, n]) => <p key={lbl} className="text-[13px] text-[#00374a]"><b>{n}</b> · {lbl} <span className="text-[#9aa6ac]">{topByLabel.get(lbl) ? `(${topByLabel.get(lbl)}× #1)` : ""}</span></p>) : <p className="text-[13px] text-[#9aa6ac]">—</p>}
            </div>
            <div className="rounded-xl bg-[#f9fbfb] border border-[#eef3f4] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">{hasTrips ? "Best dates" : "Best weeks"}</p>
              {topWeeks.length ? topWeeks.map(([lbl, n]) => <p key={lbl} className="text-[13px] text-[#00374a]"><b>{n}</b> · {lbl} <span className="text-[#9aa6ac]">{hasTrips && topByLabel.get(lbl) ? `(${topByLabel.get(lbl)}× ⭐)` : ""}</span></p>) : <p className="text-[13px] text-[#9aa6ac]">—</p>}
            </div>
            <div className="rounded-xl bg-[#f9fbfb] border border-[#eef3f4] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Budget{anchor != null ? ` · ${fmtMoney(anchor)}` : ""}</p>
              {budRated ? (
                <p className="text-[13px] text-[#00374a]"><b className="text-[#0f6e56]">{budOk.yes}</b> yes · {budOk.maybe} maybe · <span className="text-[#a5432a]">{budOk.no}</span> too much</p>
              ) : <p className="text-[13px] text-[#9aa6ac]">—</p>}
            </div>
          </div>

          {/* per-person */}
          <div className="mt-4 space-y-2.5">
            {responded.map((i) => {
              const r = i.response!;
              return (
                <div key={i.id} className="rounded-xl border border-[#f0e6d6] p-3.5">
                  <p className="text-[14px] font-bold text-[#00374a]">{i.contactName || "Member"}</p>
                  <div className="text-[13px] text-[#5a6b72] mt-1 space-y-0.5">
                    {isDecline(r) ? (
                      <p className="text-[#a5432a] font-semibold">Can&apos;t make it this time{r.looking_for && r.looking_for.includes("—") ? ` — ${r.looking_for.split("—").slice(1).join("—").trim()}` : ""}</p>
                    ) : hasTrips ? (
                      <p><span className="text-[#9aa6ac]">In for:</span> <b>{r.other_destinations.length ? r.other_destinations.map((k) => `${k === r.top_destination ? "⭐ " : ""}${destLabel(k)}`).join(", ") : "—"}</b></p>
                    ) : (
                      <>
                        <p><span className="text-[#9aa6ac]">Top pick:</span> <b>{destLabel(r.top_destination)}</b>{r.other_destinations.length ? ` · also: ${r.other_destinations.map(destLabel).join(", ")}` : ""}</p>
                        <p><span className="text-[#9aa6ac]">Weeks:</span> {r.weeks.length ? r.weeks.map(weekLabel).join(", ") : "—"}</p>
                      </>
                    )}
                    {anchor != null && <p><span className="text-[#9aa6ac]">Budget:</span> {r.budget_ok === "yes" ? "👍 comfortable" : r.budget_ok === "maybe" ? "maybe" : r.budget_ok === "no" ? "too much" : "—"}</p>}
                    {r.looking_for && !isDecline(r) && <p className="text-[#3a4a50] mt-1"><span className="text-[#9aa6ac]">Wants:</span> {r.looking_for}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
