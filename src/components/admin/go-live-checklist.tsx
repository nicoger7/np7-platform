"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ExperienceReport, CheckResult, CheckFix } from "@/lib/go-live";

/**
 * The readiness rows, rendered once.
 *
 * Used by /admin/go-live (every trip) and by an experience's own "Ready to
 * sell" tab (just that one, expanded). Two copies of this would drift within a
 * month and then neither would be trusted — which is how the platform ended up
 * with three different content-readiness widgets in the first place.
 *
 * Done rows stay on the list with a green tick rather than disappearing: a
 * checklist you can see yourself completing is one you finish. And the simple
 * fields are editable right here — leaving the page for a one-line value is
 * where working through a list stalls.
 */

/** Fill in one field without leaving the list. */
function FixBox({ fix, onClose, onSaved }: { fix: CheckFix; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(fix.value == null ? "" : String(fix.value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/go-live/fix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: fix.table, id: fix.id, column: fix.column, value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? "Couldn't save that."); return; }
      onSaved();
      onClose();
    } catch {
      setError("Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg px-3 py-2 text-[13.5px] outline-none focus:border-[#0aa3c7]";
  const fieldStyle = { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", color: "var(--admin-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onMouseDown={onClose}>
      <div
        className="w-full max-w-[480px] rounded-2xl p-5"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold admin-heading mb-1">{fix.title}</p>
        {fix.help && <p className="text-[12.5px] admin-faint leading-snug mb-3">{fix.help}</p>}

        {fix.kind === "textarea" ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={7}
            className={`${field} resize-y`}
            style={fieldStyle}
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={fix.kind === "number" ? "number" : fix.kind === "url" ? "url" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            className={field}
            style={fieldStyle}
          />
        )}

        {fix.fallback && !value.trim() && (
          <div className="mt-2.5 rounded-lg px-3 py-2" style={{ border: "1px dashed var(--admin-border)" }}>
            <p className="text-[10px] font-bold admin-faint uppercase tracking-[0.1em] mb-1">What guests get if you leave this empty</p>
            <p className="text-[12px] admin-muted leading-snug whitespace-pre-wrap">{fix.fallback}</p>
          </div>
        )}

        {error && <p className="text-[12.5px] text-red-400 mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-[13px] font-semibold admin-muted px-3 py-1.5 rounded-lg hover:bg-[var(--admin-surface-hover)]">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="text-[13px] font-bold px-4 py-1.5 rounded-lg bg-[#0aa3c7] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg className="mt-[2px] shrink-0 w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Row({ c, showDone, onFix }: { c: CheckResult; showDone: boolean; onFix: (f: CheckFix) => void }) {
  if (c.ok && !showDone) return null;
  const red = !c.ok && c.severity === "blocker";
  const amber = !c.ok && c.severity === "warning";

  const inner = (
    <>
      {c.ok
        ? <Tick />
        : <span className={`mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full ${red ? "bg-red-500" : "bg-amber-500"}`} />}
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${red ? "text-red-400" : amber ? "text-amber-500" : "admin-muted"}`}>{c.label}</span>
        {!c.ok && c.detail && <span className="block text-[12px] admin-faint leading-snug">{c.detail}</span>}
        {c.ok && c.okDetail && <span className="block text-[12px] admin-faint leading-snug">{c.okDetail}</span>}
      </span>
      <span className="shrink-0 text-[11.5px] font-bold text-[#0aa3c7] opacity-0 group-hover:opacity-100 transition-opacity">
        {c.fix ? "Edit" : "Open →"}
      </span>
    </>
  );

  const cls = "w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--admin-surface-hover)] transition-colors";

  // A plain field opens here; anything needing a picker, an upload or a child
  // table opens where it actually lives.
  return c.fix
    ? <button onClick={() => onFix(c.fix!)} className={cls}>{inner}</button>
    : <Link href={c.href} className={cls}>{inner}</Link>;
}

/** A trip week, written the way you'd say it: "17–23 Aug 2026". */
function weekDates(start: string | null, end: string | null): string {
  if (!start) return "Dates not set";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const D = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", opts);
  if (!e) return D(s, { day: "numeric", month: "short", year: "numeric" });
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth
    ? `${s.getDate()}\u2013${D(e, { day: "numeric", month: "short", year: "numeric" })}`
    : `${D(s, { day: "numeric", month: "short" })} \u2013 ${D(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** How far through a group you are — the whole point of a checklist. */
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <span className="flex items-center gap-2 shrink-0">
      <span className="hidden sm:block w-14 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-border)" }}>
        <span className={`block h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-[#0aa3c7]"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`text-[11px] font-bold tabular-nums ${pct === 100 ? "text-green-500" : "admin-faint"}`}>{done}/{total}</span>
    </span>
  );
}

/**
 * One block of checks under its own header — the whole trip, or one week.
 *
 * Boxed rather than run together. A flat list with a small caption every few
 * rows reads as one long column of unrelated complaints: you cannot see at a
 * glance that six of these belong to the same week and three belong to the trip
 * as a whole, which is precisely the distinction that tells you where to go.
 */
function Group({
  title, meta, tone, checks, showDone, onFix, href,
}: {
  title: string; meta?: React.ReactNode; tone: "experience" | "edition";
  checks: CheckResult[]; showDone: boolean; onFix: (f: CheckFix) => void; href?: string;
}) {
  const done = checks.filter((c) => c.ok).length;
  const blockers = checks.filter((c) => !c.ok && c.severity === "blocker").length;
  const visible = checks.filter((c) => !c.ok || showDone);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="flex items-center gap-2.5 px-3.5 py-2"
        style={{ backgroundColor: "var(--admin-surface-hover)", borderBottom: visible.length ? "1px solid var(--admin-border)" : undefined }}>
        <span className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
          {href
            ? <Link href={href} className="text-[12.5px] font-bold admin-heading hover:text-[#0aa3c7] transition-colors">{title}</Link>
            : <span className={`text-[10px] font-bold tracking-[0.14em] uppercase ${tone === "experience" ? "text-[#0aa3c7]" : "admin-heading"}`}>{title}</span>}
          {meta}
        </span>
        {blockers > 0 && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{blockers} blocking</span>
        )}
        <Progress done={done} total={checks.length} />
      </div>

      {visible.length === 0
        ? <p className="px-3.5 py-2 text-[12.5px] text-green-500">All done</p>
        : <div className="py-1">{visible.map((c) => <Row key={c.id} c={c} showDone={showDone} onFix={onFix} />)}</div>}
    </div>
  );
}

/** One experience's rows — the trip itself first, then each upcoming week. */
export function ExperienceChecks({
  report, showDone, onFix,
}: { report: ExperienceReport; showDone: boolean; onFix: (f: CheckFix) => void }) {
  return (
    <div className="group space-y-2.5 pt-3">
      <Group
        title="The whole trip"
        meta={<span className="text-[11px] admin-faint">page, photos, terms \u2014 shared by every week</span>}
        tone="experience"
        checks={report.checks} showDone={showDone} onFix={onFix}
      />

      {report.editions.length === 0 ? (
        <p className="rounded-xl px-3.5 py-2.5 text-[12.5px] text-amber-500" style={{ border: "1px solid var(--admin-border)" }}>
          No upcoming weeks — add an edition before this can be sold.
        </p>
      ) : (
        report.editions.map((ed) => (
          <Group
            key={ed.id}
            href={`/admin/editions/${ed.id}`}
            title={weekDates(ed.dateStart, ed.dateEnd)}
            meta={
              <>
                {ed.label && <span className="text-[11px] admin-muted">{ed.label}</span>}
                {ed.status && ed.status !== "published" && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded admin-faint" style={{ backgroundColor: "var(--admin-surface)" }}>{ed.status}</span>
                )}
              </>
            }
            tone="edition"
            checks={ed.checks} showDone={showDone} onFix={onFix}
          />
        ))
      )}
    </div>
  );
}

/** Shared "show what's done" toggle. */
function DoneToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] admin-muted cursor-pointer shrink-0">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--admin-accent)]" />
      Show what&apos;s already done
    </label>
  );
}

/** The whole list, one collapsible card per experience. */
export function GoLiveList({ reports, onRefresh }: { reports: ExperienceReport[]; onRefresh: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(true);
  const [fix, setFix] = useState<CheckFix | null>(null);

  const toggle = (id: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const totalBlockers = reports.reduce((s, e) => s + e.blockers, 0);
  const notReady = reports.filter((e) => e.blockers > 0).length;

  return (
    <>
      {fix && <FixBox fix={fix} onClose={() => setFix(null)} onSaved={onRefresh} />}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <p className="text-sm admin-muted max-w-[60ch]">
          {totalBlockers === 0
            ? "Nothing is blocking any trip."
            : <><strong className="text-red-400">{totalBlockers} blocker{totalBlockers === 1 ? "" : "s"}</strong> across {notReady} trip{notReady === 1 ? "" : "s"}. Red means a buyer would see something broken, or we would take money against something incomplete. Only weeks still ahead are counted.</>}
        </p>
        <DoneToggle value={showDone} onChange={setShowDone} />
      </div>

      <div className="space-y-2.5">
        {reports.map((e, i) => {
          // A heading the first time each status appears — the list is already
          // sorted, so this just names the groups you can see.
          const groupLabel = i === 0 || reports[i - 1].status !== e.status
            ? ({ published: "Active", draft: "Draft", archived: "Archived" }[String(e.status ?? "draft")] ?? "Other")
            : null;
          const isOpen = open.has(e.id);
          const clean = e.blockers === 0 && e.warnings === 0;
          const total = e.checks.length + e.editions.reduce((s, x) => s + x.checks.length, 0);
          const done = total - e.blockers - e.warnings;
          return (
            <div key={e.id}>
              {groupLabel && (
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase admin-faint mt-5 mb-1.5 first:mt-0">{groupLabel}</p>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <button onClick={() => toggle(e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--admin-surface-hover)] transition-colors">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-bold admin-heading truncate">
                      {e.title}
                      {!e.websiteVisible && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded admin-surface admin-faint">draft</span>}
                    </span>
                    <span className="block text-[11.5px] admin-faint">
                      {e.editions.length} upcoming week{e.editions.length === 1 ? "" : "s"}
                      {e.nextStart && <> · next {new Date(e.nextStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}
                    </span>
                  </span>
                  {e.blockers > 0 && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400">{e.blockers} blocking</span>}
                  {e.warnings > 0 && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">{e.warnings} to polish</span>}
                  {clean && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-green-500/15 text-green-500">ready</span>}
                  <Progress done={done} total={total} />
                  <svg className={`shrink-0 w-4 h-4 admin-faint transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}>
                    <ExperienceChecks report={e} showDone={showDone} onFix={setFix} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** One experience, always expanded — for its own tab. */
export function GoLivePanel({ report, onRefresh }: { report: ExperienceReport | null; onRefresh: () => void }) {
  const [showDone, setShowDone] = useState(true);
  const [fix, setFix] = useState<CheckFix | null>(null);
  if (!report) return <p className="text-sm admin-faint">Checking…</p>;
  return (
    <div className="max-w-[760px]">
      {fix && <FixBox fix={fix} onClose={() => setFix(null)} onSaved={onRefresh} />}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <p className="text-sm admin-muted max-w-[54ch]">
          {report.blockers === 0
            ? report.warnings === 0
              ? "Everything's in place — this one is ready to sell."
              : "Nothing is blocking a sale. The amber items are worth doing before you push it."
            : <><strong className="text-red-400">{report.blockers} blocker{report.blockers === 1 ? "" : "s"}</strong> — a buyer would see something broken, or we would take money against something incomplete.</>}
        </p>
        <DoneToggle value={showDone} onChange={setShowDone} />
      </div>
      <ExperienceChecks report={report} showDone={showDone} onFix={setFix} />
      <p className="text-xs admin-faint mt-3">
        Only weeks still ahead are checked. Every line opens the field that fixes it — the simple ones right here.{" "}
        <Link href="/admin/go-live" className="text-[#0aa3c7] hover:underline">All trips →</Link>
      </p>
    </div>
  );
}
