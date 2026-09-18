"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MailReadiness } from "@/components/admin/mail-readiness";
import { useMailConfirm } from "@/components/admin/mail-confirm";
import { sentLine } from "@/lib/email/mail-warning";

type Uses = {
  key: "packingList" | "preTripNote" | "whatsappLink";
  label: string;
  blocking: boolean;
  value: string | null;
  source: "edition" | "experience" | null;
  inherited: string | null;
};
/** The editable lead — global, not per week. */
type Timing = {
  anchor: "before" | "afterEnd";
  days: number;
  defaultDays: number;
  windowClose: number;
  overridden: boolean;
};
type Scheduled = {
  key: string; name: string; trigger: string;
  whenKind: "date" | "condition";
  daysBefore: number | null; daysAfterEnd: number | null; dueAt: string | null; daysAway: number | null;
  windowPassed: boolean;
  /** Applies here, but the nightly job never sends it by itself (an event's group-chat mail). */
  byHandOnly?: boolean;
  timing: Timing | null;
  kind: "transactional" | "lifecycle";
  enabled: boolean; canDisable: boolean;
  missing: string[]; uses: Uses[]; sent: number; lastSent: string | null;
  /** Condition-driven mail an admin may hand-send: who it reaches + how many qualify now. */
  manualSendable?: boolean; manualTargets?: string | null; manualEligible?: number;
  /** Switched off for THIS week only, on this tab. The Emails switch is global. */
  skippedThisWeek?: boolean;
};
/** Why a hand-send is happening, so the confirm dialog says the true thing. */
type SendWhy = { kind: "early" | "overdue" | "catchup" | "byhand"; dueAt?: string | null; daysAway?: number | null };
type Data = {
  startDate: string | null; endDate: string | null;
  guests: number; securedGuests: number;
  /** Secured guests the nightly job never mails (booked before automatic mail started). */
  manualOnlyGuests?: number;
  lifecycleLive: boolean;
  content: { packingList: boolean; preTripNote: boolean; whatsappLink: boolean };
  scheduled: Scheduled[];
  other: { key: string; name: string; sent: number; last: string | null }[];
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
// For date-ONLY values ("2026-08-05"): new Date() makes that UTC midnight, so a
// viewer west of UTC saw "4 Aug". Format in UTC and the date stays the date.
// (fmt above stays local — lastSent is a real timestamp and local is correct.)
const fmtDay = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/**
 * Everything this week's guests get, on one timeline.
 *
 * Sent mail lived in the Email Log, the schedule in the cron, held mail on the
 * Branding tab and the forecast on the dashboard — so the obvious question,
 * "what has this week actually had from us?", had no answer anywhere. Ordered
 * by when each mail fires rather than by when it was sent, because that is how
 * you think about a trip that hasn't happened yet.
 *
 * Two things were unreadable here and are now fixed:
 *  - The condition-driven mails have no date, so they rendered as "—" with
 *    "Due —" beside them, sitting under the dated ones as if something had
 *    failed. They are their own section now, with what sets each one off.
 *  - The content a mail sends — packing list, pre-trip note, group link — was
 *    edited two pages away. You only ever ask "what does the pre-trip mail
 *    actually say?", so opening the mail is where you answer it, with the
 *    inherited default shown next to your override.
 */
export function EditionMailing({ editionId }: { editionId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // One dialog for every admin action that writes to a guest (Nico, 14 Sep 2026).
  const { ask: askMail, dialog: mailDialog } = useMailConfirm();

  /* Hover to see the mail, click to open it full size: the Email Log's
     behaviour, so the two previews in the admin work the same way. Rendered
     from THIS week's content before anything is sent. */
  const [preview, setPreview] = useState<{ key: string; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrl = (key: string) => `/api/admin/editions/${editionId}/mailing/preview?key=${encodeURIComponent(key)}`;
  const showPreview = (key: string, clientY: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const h = 520, pad = 16;
    setPreview({ key, top: Math.min(Math.max(clientY - h / 3, pad), window.innerHeight - h - pad) });
  };
  const keepPreview = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  const hidePreview = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPreview(null), 220);
  };

  /** "Don't send this mail for this week." Writes nothing to a guest, so no
   *  confirmation dialog; it is undone by the same switch. */
  async function setSkip(key: string, name: string, value: boolean) {
    setMsg(null);
    const r = await fetch(`/api/admin/editions/${editionId}/mailing`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skip: key, value }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setMsg(j.error || "Couldn't change that."); return; }
    setMsg(value ? `${name} won't be sent for this week.` : `${name} is back on for this week.`);
    await load();
  }

  const load = useCallback(async () => {
    const x = await fetch(`/api/admin/editions/${editionId}/mailing`).then((r) => r.json());
    setD(x);
  }, [editionId]);

  const toggle = (k: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  /** Hand-send a scheduled mail: the catch-up after a passed window, or an
   *  early send before the date. Same endpoint, same per-guest dedupe, so the
   *  nightly job later skips whoever got it here. */
  async function sendNow(key: string, name: string, guests: number, targets?: string, why?: SendWhy) {
    /* Same dialog as every other sender in the admin. This one already named
       who and what, which is exactly why its wording became the template. */
    const go = await askMail({
      title: why?.kind === "early" ? `Send "${name}" early` : `Send "${name}" now`,
      mail: name,
      to: { kind: "people", count: guests, describe: targets ?? `secured guest${guests === 1 ? "" : "s"}` },
      also: targets
        ? "Only the guests who qualify right now receive it. Anyone who already got it is skipped."
        : why?.kind === "early"
          ? `It is scheduled for ${fmtDay(why.dueAt ?? null)}${why.daysAway != null && why.daysAway > 0 ? `, ${why.daysAway} day${why.daysAway === 1 ? "" : "s"} from now` : ""}. Whoever gets it now is skipped by the automatic send.`
          : why?.kind === "overdue"
            ? `It was due ${fmtDay(why.dueAt ?? null)} and has not gone out. Anyone who already got it is skipped.`
            : why?.kind === "byhand"
              ? "For an event this mail never goes out by itself, only when someone presses send. Anyone who already got it is skipped."
              : "Its window has passed, so this is a catch-up. Anyone who already got it is skipped.",
    });
    if (!go) return;
    setSending(key); setMsg(null);
    try {
      const r = await fetch(`/api/admin/editions/${editionId}/mailing`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: key }),
      });
      const j = await r.json();
      // "sent to 0" read like a success. Say what actually happened.
      setMsg(r.ok
        ? `${name}: ${sentLine(j.sent, targets ?? "guests", j.skipped ? "everyone eligible already had it" : null)}${j.sent > 0 && j.skipped ? ` ${j.skipped} skipped.` : ""}`
        : (j.error || "Send failed."));
      if (r.ok) await load();
    } catch { setMsg("Send failed."); }
    finally { setSending(null); }
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/editions/${editionId}/mailing`)
      .then((r) => r.json())
      .then((x) => { if (alive) { setD(x); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [editionId]);

  if (loading) return <p className="text-sm admin-faint">Loading this week&apos;s mail…</p>;
  if (!d) return <p className="text-sm admin-faint">Couldn&apos;t load the mailing timeline.</p>;

  const dated = d.scheduled.filter((m) => m.whenKind === "date");
  const conditional = d.scheduled.filter((m) => m.whenKind === "condition");

  return (
    <div className="max-w-[860px]">
      <h3 className="text-base font-bold admin-heading mb-1">Mailing</h3>
      <p className="text-[13px] admin-muted mb-4">
        Every automated mail for this week — what has gone, what is next, and what each still needs.
        {d.guests > 0 && <> {d.securedGuests} of {d.guests} guests are secured; only those receive pre-trip mail.</>}
      </p>

      {/* Readiness first: it decides whether anything on the timeline below can
          actually go out. */}
      <div className="mb-5"><MailReadiness editionId={editionId} /></div>

      {msg && <p className="text-[12.5px] font-semibold mb-3 admin-heading">{msg}</p>}

      <p className="text-[11px] font-bold tracking-[0.12em] uppercase admin-faint mb-2">On a date, worked out from the trip</p>
      <div className="rounded-xl overflow-hidden mb-5" style={{ border: "1px solid var(--admin-border)" }}>
        {dated.map((m, i) => (
          <MailRow key={m.key} m={m} i={i} editionId={editionId} securedGuests={d.securedGuests} manualOnlyGuests={d.manualOnlyGuests ?? 0} lifecycleLive={d.lifecycleLive}
            isOpen={open.has(m.key)} onToggle={() => toggle(m.key)} sending={sending} onSendNow={sendNow} onSaved={load}
            onPreview={showPreview} onPreviewLeave={hidePreview} previewUrl={previewUrl(m.key)} onSkip={setSkip} />
        ))}
      </div>

      {conditional.length > 0 && (
        <>
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase admin-faint mb-1">When something happens</p>
          <p className="text-[12px] admin-muted mb-2 max-w-[62ch]">
            These have no send date — the nightly job checks each night and sends the first night the condition is
            true, per guest. So one guest can get a payment reminder while another never does. Nothing is wrong when
            these show nothing.
          </p>
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--admin-border)" }}>
            {conditional.map((m, i) => (
              <MailRow key={m.key} m={m} i={i} editionId={editionId} securedGuests={d.securedGuests} manualOnlyGuests={d.manualOnlyGuests ?? 0} lifecycleLive={d.lifecycleLive}
                isOpen={open.has(m.key)} onToggle={() => toggle(m.key)} sending={sending} onSendNow={sendNow} onSaved={load}
            onPreview={showPreview} onPreviewLeave={hidePreview} previewUrl={previewUrl(m.key)} onSkip={setSkip} />
            ))}
          </div>
        </>
      )}

      {d.other.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase admin-faint mb-2">Also sent to this week</p>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
            {d.other.map((o, i) => (
              <div key={o.key} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
                style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined, backgroundColor: "var(--admin-surface)" }}>
                <span className="flex-1 admin-heading truncate">{o.name}</span>
                <span className="admin-muted">{o.sent}</span>
                <span className="admin-faint text-[11px] w-24 text-right">{fmt(o.last)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs admin-faint mt-4">
        Every send is logged in <Link href="/admin/email-log" className="text-[#0aa3c7] hover:underline">Email Log</Link>.
        Wording and on/off switches live in <Link href="/admin/emails" className="text-[#0aa3c7] hover:underline">Emails</Link>.
      </p>
      {preview && (
        <div
          className="hidden md:block fixed right-6 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{ top: preview.top, width: 400, height: 520, border: "1px solid var(--admin-border)", backgroundColor: "#fff" }}
          onMouseEnter={keepPreview}
          onMouseLeave={hidePreview}
        >
          <iframe title="Email preview" src={previewUrl(preview.key)} sandbox="" className="w-full h-full bg-white" />
        </div>
      )}
      {mailDialog}
    </div>
  );
}

/**
 * One mail on the timeline.
 *
 * Declared at module scope on purpose. Nested inside EditionMailing it was a
 * brand-new component type on every parent render, so React unmounted the whole
 * row — including any open editor and its "Saved" confirmation — the instant the
 * save refreshed the data. A stable key does not help; the type itself changes.
 */
function MailRow({
  m, i, editionId, securedGuests, manualOnlyGuests, lifecycleLive, isOpen, onToggle, sending, onSendNow, onSaved, onPreview, onPreviewLeave, previewUrl, onSkip,
}: {
  m: Scheduled; i: number; editionId: string; securedGuests: number; manualOnlyGuests: number; lifecycleLive: boolean;
  isOpen: boolean; onToggle: () => void; sending: string | null;
  onSendNow: (key: string, name: string, guests: number, targets?: string, why?: SendWhy) => void; onSaved: () => void;
  onPreview: (key: string, clientY: number) => void; onPreviewLeave: () => void; previewUrl: string;
  onSkip: (key: string, name: string, value: boolean) => void;
}) {
  const gone = m.sent > 0;
  const skippedHere = !!m.skippedThisWeek;
  // A mail switched off for this week offers no send button, the same way a
  // mail missing its content offers none.
  const blocked = m.missing.length > 0 || skippedHere;
  const past = m.windowPassed;
  /* Its day has gone by but the window is still open. This row used to offer
     "Send early" against a date in the past (OBX Wind's crew mail, due 11 Aug,
     still "Send early" on 18 Sep), which hid that the mail never went out. */
  const overdue = m.whenKind === "date" && !m.byHandOnly && !past && m.daysAway != null && m.daysAway < 0;
  const off = !m.enabled || (m.kind === "lifecycle" && !lifecycleLive);
  // A dateless mail says "when…" even if it carries a lead — a row reading
  // "3d after" inside the "no send date" section contradicts its own section.
  const byHand = !!m.byHandOnly;
  const when = m.whenKind !== "date" ? "when…"
    : byHand ? "by hand"
    : m.daysBefore != null ? `${m.daysBefore}d before`
    : `${m.daysAfterEnd}d after`;

  return (
    <div style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined, backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={onToggle}
          className={`shrink-0 w-16 text-right text-[12px] font-bold ${gone ? "text-green-500" : blocked ? "text-amber-500" : "admin-faint"}`}>
          {when}
        </button>
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <span className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold admin-heading">{m.name}</span>
            {off && (
              <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--admin-surface-hover)] admin-faint">
                {!m.enabled ? "off" : "paused"}
              </span>
            )}
            {skippedHere && (
              <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
                off this week
              </span>
            )}
            <svg className={`w-3.5 h-3.5 admin-faint transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
          </span>
          <span className="block text-[11.5px] admin-faint">{m.trigger}</span>
          {m.missing.length > 0 && !gone && !skippedHere && (
            <span className="block text-[11.5px] text-amber-500 mt-0.5">Held, needs {m.missing.join(", ")}</span>
          )}
        </button>
        <span className="shrink-0 text-right">
          <button
            type="button"
            onMouseEnter={(e) => onPreview(m.key, e.clientY)}
            onMouseLeave={onPreviewLeave}
            onClick={() => window.open(previewUrl, "_blank")}
            title="Hover to preview · click to open full size"
            className="block ml-auto mb-0.5 text-[12px] font-bold admin-muted hover:text-[#0aa3c7] hover:underline">
            Preview
          </button>
          {/* A passed window used to be a dead end: the cron won't fire it any
              more and there was nothing to press. */}
          {/* Never sent by the nightly job for this kind of week: the button IS
              the send, so it is "Send now", not "Send early" against a date
              that means nothing here. */}
          {!gone && byHand && !blocked && securedGuests > 0 && (
            <button onClick={() => onSendNow(m.key, m.name, securedGuests, undefined, { kind: "byhand" })} disabled={sending === m.key}
              className="block ml-auto mb-0.5 text-[12px] font-bold text-[#0aa3c7] hover:underline disabled:opacity-50">
              {sending === m.key ? "Sending…" : "Send now →"}
            </button>
          )}
          {!gone && !byHand && past && !blocked && m.whenKind === "date" && securedGuests > 0 && (
            <button onClick={() => onSendNow(m.key, m.name, securedGuests, undefined, { kind: "catchup" })} disabled={sending === m.key}
              className="block ml-auto mb-0.5 text-[12px] font-bold text-[#0aa3c7] hover:underline disabled:opacity-50">
              {sending === m.key ? "Sending…" : "Send now →"}
            </button>
          )}
          {/* Due date gone by, window still open, nothing sent: overdue, so the
              button is the plain "Send now", never "Send early". */}
          {!gone && overdue && !blocked && securedGuests > 0 && (
            <button onClick={() => onSendNow(m.key, m.name, securedGuests, undefined, { kind: "overdue", dueAt: m.dueAt })} disabled={sending === m.key}
              className="block ml-auto mb-0.5 text-[12px] font-bold text-[#0aa3c7] hover:underline disabled:opacity-50">
              {sending === m.key ? "Sending…" : "Send now →"}
            </button>
          )}
          {/* Before the date the same send is available, quieter: the content
              is ready and sometimes the week needs it sooner (a late change,
              a guest asking). The nightly job then skips whoever got it. */}
          {!gone && !byHand && !past && !overdue && !blocked && m.whenKind === "date" && securedGuests > 0 && (
            <button onClick={() => onSendNow(m.key, m.name, securedGuests, undefined, { kind: "early", dueAt: m.dueAt, daysAway: m.daysAway })} disabled={sending === m.key}
              className="block ml-auto mb-0.5 text-[12px] font-bold admin-muted hover:text-[#0aa3c7] hover:underline disabled:opacity-50">
              {sending === m.key ? "Sending…" : "Send early →"}
            </button>
          )}
          {/* Condition-driven mail (incl. the switched-OFF ones): a hand-send to
              exactly the guests who qualify right now — the balance invoice to
              those who still owe, never a blanket blast. Disabled at zero. */}
          {!blocked && m.whenKind === "condition" && m.manualSendable && (
            <button
              onClick={() => onSendNow(m.key, m.name, m.manualEligible ?? 0, m.manualTargets ?? undefined)}
              disabled={sending === m.key || (m.manualEligible ?? 0) === 0}
              className="block ml-auto mb-0.5 text-[12px] font-bold text-[#0aa3c7] hover:underline disabled:opacity-40 disabled:no-underline">
              {sending === m.key ? "Sending…" : `Send now${(m.manualEligible ?? 0) > 0 ? ` → ${m.manualEligible}` : ""}`}
            </button>
          )}
          {skippedHere && !gone ? (
            <span className="block text-[12.5px] text-amber-500">Won&apos;t send</span>
          ) : gone ? (
            <>
              <span className="block text-[12.5px] font-bold text-green-500">Sent to {m.sent}</span>
              <span className="block text-[11px] admin-faint">{fmt(m.lastSent)}</span>
            </>
          ) : byHand ? (
            m.daysAway != null && m.daysAway < 0 ? (
              <>
                <span className="block text-[12.5px] font-bold text-amber-500">Not sent yet</span>
                <span className="block text-[11px] admin-faint">only by hand</span>
              </>
            ) : (
              <span className="block text-[11.5px] admin-faint">Not automatic</span>
            )
          ) : overdue ? (
            <>
              <span className="block text-[12.5px] font-bold text-amber-500">Not sent yet</span>
              <span className="block text-[11px] admin-faint">was due {fmtDay(m.dueAt)}</span>
            </>
          ) : m.whenKind === "date" ? (
            <>
              <span className="block text-[12.5px] admin-muted">{past ? "Window passed" : "Due"}</span>
              <span className="block text-[11px] admin-faint">{fmtDay(m.dueAt)}</span>
            </>
          ) : m.manualSendable ? (
            <span className="block text-[11.5px] admin-faint">{m.manualEligible ?? 0} qualify now</span>
          ) : (
            <span className="block text-[12.5px] admin-faint">Not yet</span>
          )}
        </span>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 pl-[76px]" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <p className="text-[12px] admin-muted pt-3 mb-3 max-w-[60ch]">
            {byHand
              ? <>For an event the nightly job never sends this one, so it has no due date. It goes out only when you press Send now, to every secured guest on this week.</>
              : m.daysBefore != null
              ? <>The nightly job works this out from the trip start date — {m.daysBefore} days before, which is {fmt(m.dueAt)}. Nobody presses anything.</>
              : m.daysAfterEnd != null
                ? <>The nightly job counts {m.daysAfterEnd} days from the day the trip ends, which is {fmt(m.dueAt)}. Nobody presses anything.</>
                : <>No date: the nightly job checks every night and sends it the first night the condition is true. That&apos;s why there&apos;s nothing to count down to.</>}
            {" "}
            {skippedHere
              ? <>It is <strong>switched off for this week</strong>, so no guest on this week gets it. Other weeks are not affected.</>
              : !m.enabled
              ? <>It is <strong>switched off</strong> everywhere, nothing goes out until you turn it back on.</>
              : m.kind === "lifecycle" && !lifecycleLive
                ? <>The switch is on, but the whole lifecycle pipeline is <strong>paused</strong>, so it is worked out and held.</>
                : <>It is <strong>live</strong>.</>}
            {overdue && !gone && !skippedHere && m.enabled && (
              <>
                {" "}
                <strong>Its date has passed and it has not gone out.</strong>{" "}
                {m.kind === "lifecycle" && !lifecycleLive
                  ? <>That is the pause.</>
                  : m.missing.length > 0
                    ? <>It is held until {m.missing.join(", ")} is filled in.</>
                    : manualOnlyGuests >= securedGuests
                      ? <>These guests booked before automatic mail started, so the nightly job never mails them. Only Send now reaches them.</>
                      : manualOnlyGuests > 0
                        ? <>The nightly job sends it at its next run (09:00 UTC) to the {securedGuests - manualOnlyGuests} who booked after automatic mail started. The other {manualOnlyGuests} booked before, and only Send now reaches them.</>
                        : <>The nightly job sends it at its next run, 09:00 UTC.</>}
              </>
            )}
            {" "}
            <Link href={`/admin/emails/${m.key}`} className="text-[#0aa3c7] hover:underline">Wording &amp; switch →</Link>
          </p>

          {!gone && (
            <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skippedHere}
                onChange={(e) => onSkip(m.key, m.name, e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span className="text-[12.5px]">
                <span className="font-semibold admin-heading">Don&apos;t send this for this week</span>
                <span className="block text-[11.5px] admin-faint">
                  Only this week. Nothing is used up: switch it back on while its date is still ahead and it goes out as normal.
                </span>
              </span>
            </label>
          )}

          {m.timing && <TimingField t={m.timing} templateKey={m.key} onSaved={onSaved} />}

          {m.uses.length === 0
            ? <p className="text-[12px] admin-faint">This one writes itself — no content from you.</p>
            : m.uses.map((u) => <ContentField key={u.key} editionId={editionId} use={u} onSaved={onSaved} />)}
        </div>
      )}
    </div>
  );
}

/**
 * When this mail goes out — edited from the row that shows it.
 *
 * "60d before" was a fact you could read and not change: the lead lived in
 * code, so moving the packing list a week earlier was a deploy. It is one
 * schedule for every trip, which the row has to say out loud — otherwise
 * editing it here reads like a change to this week only, and the week after
 * quietly gets it too.
 *
 * The whole panel reloads after a save because moving one mail moves its
 * neighbour's handover: the row above would otherwise keep showing a window
 * that no longer exists.
 */
function TimingField({ t, templateKey, onSaved }: { t: Timing; templateKey: string; onSaved: () => void }) {
  const [value, setValue] = useState(String(t.days));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (days: number | null) => {
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/admin/emails/timing", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, days }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || "Couldn't save that."); return; }
      // The box has to follow the save, or "back to default" would leave the
      // old number sitting in it next to a Save button offering to re-apply it.
      setValue(String(days ?? t.defaultDays));
      onSaved();
    } catch { setErr("Couldn't save that."); }
    finally { setSaving(false); }
  };

  const dirty = value.trim() !== "" && Number(value) !== t.days;
  const lastDay = t.windowClose + 1;

  return (
    <div className="mb-4 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--admin-border)" }}>
      <p className="text-[12px] font-bold admin-heading mb-1.5">When it goes out</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="number" min={0} max={400} inputMode="numeric" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) save(Number(value)); }}
          className="w-16 rounded-lg px-2 py-1.5 text-[13px] text-right outline-none focus:border-[#0aa3c7]"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", color: "var(--admin-text)" }} />
        <span className="text-[12px] admin-muted">
          {t.anchor === "before" ? "days before the trip starts" : "days after the trip ends"}
        </span>
        {dirty && (
          <button onClick={() => save(Number(value))} disabled={saving}
            className="text-[12px] font-bold px-3 py-1 rounded-lg bg-[#0aa3c7] text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {t.overridden && !dirty && (
          <button onClick={() => save(null)} disabled={saving}
            className="text-[11.5px] admin-faint hover:text-[#0aa3c7] transition-colors">↺ Back to {t.defaultDays}d</button>
        )}
      </div>
      <p className="text-[11.5px] admin-faint mt-1.5">
        {t.anchor === "before"
          ? (lastDay <= 0
            ? `Keeps sending from ${t.days} days out until the trip starts.`
            : `Keeps sending from ${t.days} to ${lastDay} days out, then the next mail takes over.`)
          : `Keeps sending from ${t.days} to ${t.windowClose} days after the trip ends.`}
        {" "}This is the schedule for <strong className="admin-muted">every trip</strong>, not just this week.
      </p>
      {err && <p className="text-[11.5px] text-red-400 mt-1">{err}</p>}
    </div>
  );
}

/**
 * One piece of content a mail pulls in — edited here, with what it falls back to.
 *
 * Empty is a legitimate answer for most of these: the experience-level version
 * is used instead. Showing that text greyed out under the box is the difference
 * between "nothing is set" and "this is what will go out".
 */
function ContentField({ editionId, use, onSaved }: { editionId: string; use: Uses; onSaved: () => void }) {
  const [value, setValue] = useState(use.source === "edition" ? (use.value ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const save = async () => {
    setSaving(true); setDone(false);
    try {
      const r = await fetch(`/api/admin/editions/${editionId}/mailing`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: use.key, value }),
      });
      if (r.ok) { setDone(true); onSaved(); }
    } finally { setSaving(false); }
  };

  const multiline = use.key !== "whatsappLink";

  return (
    <div className="mb-3.5">
      <p className="text-[12px] font-bold admin-heading mb-1 flex items-center gap-2">
        {use.label}
        {use.blocking
          ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">holds the mail</span>
          : <span className="text-[10px] admin-faint font-normal">optional</span>}
        {use.source === "experience" && <span className="text-[10px] admin-faint font-normal">using the experience&apos;s</span>}
        {/* "Nothing to fall back on" was only ever true for a field that HOLDS
            the mail. An optional note is an EXTRA paragraph dropped into a
            template that is already written — the mail sends fine without it,
            and an amber warning saying otherwise sends you looking for work
            that doesn't exist. */}
        {use.source === null && (use.blocking
          ? <span className="text-[10px] text-amber-500 font-normal">nothing set anywhere</span>
          : <span className="text-[10px] admin-faint font-normal">not set — the mail sends without it</span>)}
      </p>

      {multiline ? (
        <textarea value={value} onChange={(e) => { setValue(e.target.value); setDone(false); }} rows={4}
          placeholder={use.inherited
            ? "Leave empty to use the experience's — shown below"
            : use.blocking
              ? "Nothing here and nothing to fall back on — the mail is held until this is written"
              : "Optional — an extra paragraph for this week. The mail sends without it."}
          className="w-full rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#0aa3c7] resize-y"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", color: "var(--admin-text)" }} />
      ) : (
        <input value={value} onChange={(e) => { setValue(e.target.value); setDone(false); }}
          placeholder="https://chat.whatsapp.com/…"
          className="w-full rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#0aa3c7]"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", color: "var(--admin-text)" }} />
      )}

      <div className="flex items-center gap-2 mt-1.5">
        <button onClick={save} disabled={saving}
          className="text-[12px] font-bold px-3 py-1 rounded-lg bg-[#0aa3c7] text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save for this week"}
        </button>
        {done && <span className="text-[12px] text-green-500 font-semibold">Saved</span>}
      </div>

      {use.inherited && !value.trim() && (
        <div className="mt-2 rounded-lg px-3 py-2" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-[11px] font-bold admin-faint uppercase tracking-[0.1em] mb-1">What guests get instead</p>
          <p className="text-[12px] admin-muted whitespace-pre-wrap line-clamp-6">{use.inherited}</p>
        </div>
      )}
    </div>
  );
}
