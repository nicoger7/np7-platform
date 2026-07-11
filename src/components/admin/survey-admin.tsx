"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  // ---- destinations / weeks repeaters ----
  const addDest = () => patch({ destinations: [...s.destinations, { key: uid(), label: "", location: "", start: null, end: null, blurb: "" }] });
  const setDest = (i: number, p: Partial<SurveyDestination>) => patch({ destinations: s.destinations.map((d, j) => j === i ? { ...d, ...p } : d) });
  const delDest = (i: number) => patch({ destinations: s.destinations.filter((_, j) => j !== i) });
  // Offer a second date window for the same place with one tap (riders then pick a period).
  const addPeriod = (i: number) => { const d = s.destinations[i]; patch({ destinations: [...s.destinations.slice(0, i + 1), { key: uid(), label: d.label, location: d.location, blurb: d.blurb, start: null, end: null }, ...s.destinations.slice(i + 1)] }); };
  const addWeek = () => patch({ weeks: [...s.weeks, { key: uid(), label: "", start: null, end: null }] });
  const setWeek = (i: number, p: Partial<SurveyWeek>) => patch({ weeks: s.weeks.map((w, j) => j === i ? { ...w, ...p } : w) });
  const delWeek = (i: number) => patch({ weeks: s.weeks.filter((_, j) => j !== i) });

  const card = "rounded-2xl border border-[#e7ddcb] bg-white p-5";
  const lbl = "text-[12px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]";
  const input = "w-full rounded-lg border border-[#d8e3e6] px-3 py-2 text-[14px] outline-none focus:border-[#0aa3c7] transition-colors";

  return (
    <div className="max-w-[900px] space-y-4">
      {/* header */}
      <div className="flex items-center gap-2.5">
        <Link href="/admin/surveys" className="text-[13px] font-bold text-[#6a7a80] hover:text-[#0a2a33]">← Surveys</Link>
        <span className="ml-auto text-[12px] text-[#9aa6ac] hidden sm:inline">{savedAt ? `Saved ${savedAt}` : ""}</span>
        <a href={`${origin}/survey/${PREVIEW_PREFIX}${s.id}`} target="_blank" rel="noopener" className="rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[13px] font-bold px-4 py-2 hover:bg-[#eaf7fb] transition-colors">Preview ↗</a>
        <button onClick={save} disabled={saving} className="rounded-full bg-[#0aa3c7] text-white text-[13px] font-bold px-5 py-2 hover:bg-[#0891b2] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>

      {/* settings */}
      <div className={card}>
        <label className="block mb-3">
          <span className={lbl}>Title</span>
          <input className={`${input} mt-1 text-[16px] font-bold`} value={s.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="block mb-3">
          <span className={lbl}>Intro (shown on the form + email)</span>
          <textarea className={`${input} mt-1 min-h-[70px] resize-y`} value={s.intro ?? ""} onChange={(e) => patch({ intro: e.target.value })} placeholder="e.g. I'm cooking up a small, special trip for a handful of riders…" />
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
      </div>

      {/* destinations = fixed date + place trips */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <span className={lbl}>Trips</span>
          <button onClick={addDest} className="text-[12.5px] font-bold text-[#0aa3c7]">+ Add trip</button>
        </div>
        <p className="text-[12px] text-[#9aa6ac] mb-3">Each trip is a <b>place + a date window</b> a rider can tick. Give it a blurb so they know what it is. Want to offer <b>the same place on different dates?</b> Use <b>“+ Another date”</b> — riders then see one card for the place with a period to pick under it. (Leave the dates empty to fall back to the old “pick a spot + a week” style.)</p>
        {s.destinations.length === 0 ? <p className="text-[13px] text-[#9aa6ac]">No trips yet.</p> : (
          <div className="space-y-2.5">
            {s.destinations.map((d, i) => (
              <div key={d.key} className="rounded-xl border border-[#ece3d3] bg-[#fdfaf3] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input className={`${input} font-semibold`} value={d.label} onChange={(e) => setDest(i, { label: e.target.value })} placeholder="Place — e.g. Langebaan" />
                  <button onClick={() => delDest(i)} className="shrink-0 text-[#c0392b] text-[13px] font-bold px-2">Remove</button>
                </div>
                <input className={input} value={d.location ?? ""} onChange={(e) => setDest(i, { location: e.target.value })} placeholder="Location — e.g. Cape Town, South Africa (optional)" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-bold text-[#6a7a80]">Dates</span>
                  <input type="date" className={`${input} w-[150px]`} value={d.start ?? ""} onChange={(e) => setDest(i, { start: e.target.value || null })} />
                  <span className="text-[#9aa6ac]">→</span>
                  <input type="date" className={`${input} w-[150px]`} value={d.end ?? ""} onChange={(e) => setDest(i, { end: e.target.value || null })} />
                  <button onClick={() => addPeriod(i)} className="text-[12px] font-bold text-[#0aa3c7] ml-1">+ Another date for this place</button>
                </div>
                <textarea className={`${input} min-h-[60px] resize-y`} value={d.blurb ?? ""} onChange={(e) => setDest(i, { blurb: e.target.value })} placeholder="Write about the trip — the spot, the vibe, what's included…" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* weeks */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <span className={lbl}>Possible weeks</span>
          <button onClick={addWeek} className="text-[12.5px] font-bold text-[#0aa3c7]">+ Add week</button>
        </div>
        <p className="text-[12px] text-[#9aa6ac] mb-3">Constrain availability to a few windows — riders tick the ones that work.</p>
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

      {/* budget */}
      <div className={card}>
        <span className={lbl}>Budget</span>
        <p className="text-[12px] text-[#9aa6ac] mt-1 mb-3">The approximate per-person figure riders see — they confirm if it&apos;s comfortable (yes / maybe / too much).</p>
        <div className="grid grid-cols-2 gap-3 max-w-[320px]">
          <label className="block"><span className="text-[12px] font-bold text-[#6a7a80]">Currency</span><input className={`${input} mt-1`} value={s.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase().slice(0, 3) })} /></label>
          <label className="block"><span className="text-[12px] font-bold text-[#6a7a80]">Approx. €/person</span><input type="number" className={`${input} mt-1`} value={s.budget_anchor ?? ""} onChange={(e) => patch({ budget_anchor: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
      </div>

      <InviteSection surveyId={s.id} invites={invites} setInvites={setInvites} linkFor={linkFor} />

      <ResponsesSection survey={s} invites={invites} fmtMoney={fmtMoney} />

      <div className="pt-2">
        <button onClick={archive} className="text-[13px] font-bold text-[#c0392b] hover:underline">Archive survey</button>
      </div>
    </div>
  );
}

// ---------------- invites ----------------
type Picked = { id: string; name: string };
function InviteSection({ surveyId, invites, setInvites, linkFor }: {
  surveyId: string; invites: SurveyInvite[]; setInvites: (v: SurveyInvite[]) => void; linkFor: (t: string) => string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
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
      <span className="text-[12px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]">Invite members</span>
      <div className="relative mt-2">
        <input className="w-full rounded-lg border border-[#d8e3e6] px-3 py-2 text-[14px] outline-none focus:border-[#0aa3c7]" value={term} onChange={(e) => search(e.target.value)} placeholder="Search members by name or email…" />
        {results.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-[#e2e9ec] bg-white shadow-lg overflow-hidden">
            {results.map((r) => (
              <button key={r.id} onClick={() => addPick(r)} disabled={invitedIds.has(r.id)} className="block w-full text-left px-3 py-2 text-[14px] hover:bg-[#f2f8f9] disabled:opacity-40 disabled:cursor-not-allowed">
                {r.name}{invitedIds.has(r.id) ? " · already invited" : ""}
              </button>
            ))}
          </div>
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
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Send invite email
            </label>
            <button onClick={addInvites} disabled={busy} className="rounded-full bg-[#0aa3c7] text-white text-[13px] font-bold px-4 py-2 disabled:opacity-50">{busy ? "Adding…" : `Add ${picked.length}`}</button>
            {msg && <span className="text-[12.5px] text-[#0f6e56] font-semibold">{msg}</span>}
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-4 border-t border-[#f0e6d6] pt-3 space-y-1.5">
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate text-[#00374a] font-semibold">{i.contactName || "Member"}</span>
              <span className={`shrink-0 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS[i.status]}`}>{i.status}</span>
              <button onClick={() => copy(linkFor(i.token), i.id)} className="shrink-0 text-[12px] font-bold text-[#0aa3c7]">{copied === i.id ? "Copied!" : "Copy link"}</button>
              <button onClick={() => remove(i.id)} className="shrink-0 text-[12px] font-bold text-[#b6c2c7] hover:text-[#c0392b]">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- responses ----------------
function ResponsesSection({ survey, invites, fmtMoney }: { survey: Survey; invites: SurveyInvite[]; fmtMoney: (n: number | null) => string }) {
  const responded = invites.filter((i) => i.response);
  const destLabel = (key: string | null) => survey.destinations.find((d) => d.key === key)?.label ?? key ?? "—";
  const weekLabel = (key: string) => survey.weeks.find((w) => w.key === key)?.label ?? key;

  // aggregates
  const destTop = new Map<string, number>();       // chosen as #1
  const destInterest = new Map<string, number>();  // #1 OR "also up for"
  const weekTally = new Map<string, number>();
  const anchor = survey.budget_anchor;
  const budOk = { yes: 0, maybe: 0, no: 0 };
  for (const i of responded) {
    const r = i.response!;
    if (r.top_destination) destTop.set(r.top_destination, (destTop.get(r.top_destination) ?? 0) + 1);
    const keys = new Set([r.top_destination, ...r.other_destinations].filter(Boolean) as string[]);
    for (const k of keys) destInterest.set(k, (destInterest.get(k) ?? 0) + 1);
    for (const w of r.weeks) weekTally.set(w, (weekTally.get(w) ?? 0) + 1);
    if (r.budget_ok === "yes") budOk.yes++;
    else if (r.budget_ok === "maybe") budOk.maybe++;
    else if (r.budget_ok === "no") budOk.no++;
  }
  const rankedDests = [...destInterest.entries()].sort((a, b) => b[1] - a[1]);
  const topWeeks = [...weekTally.entries()].sort((a, b) => b[1] - a[1]);
  const bestDest = rankedDests[0], bestWeek = topWeeks[0];
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
              {bestDest ? <><b>{destLabel(bestDest[0])}</b> leads — {bestDest[1]} interested{destTop.get(bestDest[0]) ? `, ${destTop.get(bestDest[0])} as #1` : ""}</> : "No destination data yet"}
              {bestWeek ? <> · best week <b>{weekLabel(bestWeek[0])}</b> ({bestWeek[1]} free)</> : ""}
              {anchor != null && budRated ? <> · budget <b>{budOk.yes} ok</b>{budOk.maybe ? `, ${budOk.maybe} maybe` : ""}{budOk.no ? `, ${budOk.no} no` : ""} at {fmtMoney(anchor)}</> : ""}
              {" · "}{responded.length}/{invites.length} replied
            </p>
          </div>

          {/* aggregates */}
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <div className="rounded-xl bg-[#f9fbfb] border border-[#eef3f4] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Demand (incl. also-up-for)</p>
              {rankedDests.length ? rankedDests.map(([k, n]) => <p key={k} className="text-[13px] text-[#00374a]"><b>{n}</b> · {destLabel(k)} <span className="text-[#9aa6ac]">{destTop.get(k) ? `(${destTop.get(k)}× #1)` : ""}</span></p>) : <p className="text-[13px] text-[#9aa6ac]">—</p>}
            </div>
            <div className="rounded-xl bg-[#f9fbfb] border border-[#eef3f4] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5">Best weeks</p>
              {topWeeks.length ? topWeeks.map(([k, n]) => <p key={k} className="text-[13px] text-[#00374a]"><b>{n}</b> · {weekLabel(k)}</p>) : <p className="text-[13px] text-[#9aa6ac]">—</p>}
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
                    <p><span className="text-[#9aa6ac]">Top pick:</span> <b>{destLabel(r.top_destination)}</b>{r.other_destinations.length ? ` · also: ${r.other_destinations.map(destLabel).join(", ")}` : ""}</p>
                    <p><span className="text-[#9aa6ac]">Weeks:</span> {r.weeks.length ? r.weeks.map(weekLabel).join(", ") : "—"}</p>
                    <p><span className="text-[#9aa6ac]">Budget:</span> {r.budget_ok === "yes" ? "👍 comfortable" : r.budget_ok === "maybe" ? "maybe" : r.budget_ok === "no" ? "too much" : "—"}</p>
                    {r.looking_for && <p className="text-[#3a4a50] mt-1"><span className="text-[#9aa6ac]">Wants:</span> {r.looking_for}</p>}
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
