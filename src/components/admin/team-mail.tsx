"use client";

import { useState } from "react";

/**
 * Admin → Emails → Team: who at NP7 hears about what.
 *
 * Every other screen in this hub is about mail to guests. This is the only one
 * about mail to us, and it is deliberately the plainest thing in the admin: a
 * list of events, the people on each, a switch per person. Nothing to preview,
 * because nobody needs to approve the wording of an alert they wrote the
 * recipient list for.
 *
 * Adding someone is two paths on purpose. The dropdown is the team, because
 * "Simona" is easier to be sure about than an address typed from memory; the
 * free field is for shared inboxes, which have no person and no team row.
 */

export type TeamEvent = { key: string; title: string; blurb: string };
export type Recipient = { id: string; event_key: string; email: string; name: string | null; enabled: boolean };
export type TeamMate = { name: string | null; email: string };

export function TeamMail({ events, recipients, team }: { events: TeamEvent[]; recipients: Recipient[]; team: TeamMate[] }) {
  const [rows, setRows] = useState<Recipient[]>(recipients);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function call(body: unknown) {
    setMsg(null);
    const r = await fetch("/api/admin/team-mail", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setMsg(r?.error || "Could not save."); return null; }
    return r;
  }

  async function toggle(rec: Recipient) {
    setBusy(rec.id);
    const next = !rec.enabled;
    setRows((rs) => rs.map((x) => (x.id === rec.id ? { ...x, enabled: next } : x)));   // optimistic
    const r = await call({ action: "toggle", id: rec.id, enabled: next });
    if (!r) setRows((rs) => rs.map((x) => (x.id === rec.id ? { ...x, enabled: !next } : x)));
    setBusy(null);
  }

  async function remove(rec: Recipient) {
    if (!confirm(`Stop sending "${rec.name || rec.email}" these?`)) return;
    setBusy(rec.id);
    const before = rows;
    setRows((rs) => rs.filter((x) => x.id !== rec.id));
    if (!(await call({ action: "remove", id: rec.id }))) setRows(before);
    setBusy(null);
  }

  async function add(eventKey: string, email: string, name?: string | null) {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes("@")) { setMsg("That does not look like an email address."); return; }
    if (rows.some((x) => x.event_key === eventKey && x.email.toLowerCase() === clean)) {
      setMsg("They are already on this one."); return;
    }
    setBusy(eventKey);
    const r = await call({ action: "add", eventKey, email: clean, name: name ?? null });
    if (r?.recipient) setRows((rs) => [...rs, r.recipient as Recipient]);
    setDraft((d) => ({ ...d, [eventKey]: "" }));
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      {msg && <p className="text-[12px] admin-muted">{msg}</p>}
      {events.map((ev) => {
        const mine = rows.filter((r) => r.event_key === ev.key)
          .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
        const on = mine.filter((r) => r.enabled).length;
        const free = team.filter((t) => !mine.some((m) => m.email.toLowerCase() === t.email.toLowerCase()));
        return (
          <div key={ev.key} className="admin-tablecard p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="admin-heading font-bold text-[15px]">{ev.title}</h3>
                <p className="admin-muted text-[12.5px] mt-1 max-w-[62ch] leading-relaxed">{ev.blurb}</p>
              </div>
              <span className="text-[11px] admin-faint shrink-0">
                {on === 0 ? "nobody gets this" : `${on} ${on === 1 ? "person gets" : "people get"} this`}
              </span>
            </div>

            <div className="mt-4 space-y-1.5">
              {mine.length === 0 && <p className="text-[12.5px] admin-faint">Nobody yet. Add someone below.</p>}
              {mine.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <button type="button" onClick={() => toggle(r)} disabled={busy === r.id}
                    aria-pressed={r.enabled}
                    title={r.enabled ? "Sending — click to stop" : "Not sending — click to start"}
                    className="shrink-0 w-[38px] h-[21px] rounded-full transition-colors relative disabled:opacity-50"
                    style={{ background: r.enabled ? "#0aa3c7" : "rgba(255,255,255,0.16)" }}>
                    <span className="absolute top-[3px] w-[15px] h-[15px] rounded-full bg-white transition-all"
                      style={{ left: r.enabled ? "20px" : "3px" }} />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block admin-heading text-[13px] font-bold truncate">{r.name || r.email}</span>
                    {r.name && <span className="block admin-faint text-[11.5px] truncate">{r.email}</span>}
                  </span>
                  {!r.enabled && <span className="text-[11px] admin-faint shrink-0">off</span>}
                  <button type="button" onClick={() => remove(r)} disabled={busy === r.id}
                    className="text-[11px] admin-faint hover:text-[#ef4444] shrink-0">Remove</button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {free.length > 0 && (
                <select defaultValue="" onChange={(e) => {
                  const t = free.find((x) => x.email === e.target.value);
                  if (t) add(ev.key, t.email, t.name);
                  e.currentTarget.value = "";
                }} className="text-[12px] px-2.5 py-2 rounded admin-input">
                  <option value="">Add from the team…</option>
                  {free.map((t) => <option key={t.email} value={t.email}>{t.name || t.email}</option>)}
                </select>
              )}
              <input
                value={draft[ev.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [ev.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") add(ev.key, draft[ev.key] ?? ""); }}
                placeholder="or an address, e.g. experience@np-seven.com"
                className="text-[12px] px-2.5 py-2 rounded admin-input flex-1 min-w-[240px]" />
              <button type="button" disabled={busy === ev.key} onClick={() => add(ev.key, draft[ev.key] ?? "")}
                className="text-[12px] px-3 py-2 rounded font-bold disabled:opacity-50"
                style={{ backgroundColor: "#0aa3c7", color: "#fff" }}>Add</button>
            </div>
          </div>
        );
      })}
      <p className="text-xs admin-faint">
        These never reach a guest. They are swept every quarter hour, so a booking is announced within about
        fifteen minutes of landing, and a booking already announced is never announced twice.
      </p>
    </div>
  );
}
