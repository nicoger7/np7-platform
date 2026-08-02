"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExperienceReport, CheckResult } from "@/lib/go-live";

/**
 * The readiness rows, rendered once.
 *
 * Used by /admin/go-live (every trip) and by an experience's own "Ready to
 * sell" tab (just that one, expanded). Two copies of this would drift within a
 * month and then neither would be trusted — which is how the platform ended up
 * with three different content-readiness widgets in the first place.
 */

function Row({ c, showWarnings }: { c: CheckResult; showWarnings: boolean }) {
  if (c.ok || (!showWarnings && c.severity === "warning")) return null;
  const red = c.severity === "blocker";
  return (
    <Link href={c.href} className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--admin-surface-hover)] transition-colors">
      <span className={`mt-[3px] shrink-0 w-1.5 h-1.5 rounded-full ${red ? "bg-red-500" : "bg-amber-500"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${red ? "text-red-400" : "text-amber-500"}`}>{c.label}</span>
        {c.detail && <span className="block text-[12px] admin-faint leading-snug">{c.detail}</span>}
      </span>
      <span className="shrink-0 text-[11.5px] font-bold text-[#0aa3c7] opacity-0 group-hover:opacity-100 transition-opacity">Fix →</span>
    </Link>
  );
}

/** One experience's rows — its own checks, then each week's. */
export function ExperienceChecks({ report, showWarnings }: { report: ExperienceReport; showWarnings: boolean }) {
  const clean = (list: CheckResult[]) => list.every((c) => c.ok || (!showWarnings && c.severity === "warning"));
  return (
    <div className="group">
      <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint px-3 pt-3 pb-1">The experience</p>
      {clean(report.checks)
        ? <p className="px-3 py-1.5 text-[12.5px] text-green-500">Nothing outstanding</p>
        : report.checks.map((c) => <Row key={c.id} c={c} showWarnings={showWarnings} />)}

      {report.editions.length === 0 && (
        <p className="px-3 py-2 text-[12.5px] text-amber-500">No weeks yet — add an edition before this can be sold.</p>
      )}

      {report.editions.map((ed) => (
        <div key={ed.id} className="mt-1">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint px-3 pt-3 pb-1 flex items-center gap-2">
            <Link href={`/admin/editions/${ed.id}`} className="hover:text-[#0aa3c7] transition-colors">{ed.label}</Link>
            {ed.dateStart && (
              <span className="normal-case tracking-normal font-normal">
                {new Date(ed.dateStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {ed.status && ed.status !== "published" && (
              <span className="normal-case tracking-normal font-normal admin-faint">· {ed.status}</span>
            )}
            {ed.blockers > 0 && <span className="normal-case tracking-normal text-red-400">· {ed.blockers} blocking</span>}
          </p>
          {clean(ed.checks)
            ? <p className="px-3 py-1.5 text-[12.5px] text-green-500">Ready</p>
            : ed.checks.map((c) => <Row key={c.id} c={c} showWarnings={showWarnings} />)}
        </div>
      ))}
    </div>
  );
}

/** The whole list, one collapsible card per experience. */
export function GoLiveList({ reports }: { reports: ExperienceReport[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(true);

  const toggle = (id: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const totalBlockers = reports.reduce((s, e) => s + e.blockers, 0);
  const notReady = reports.filter((e) => e.blockers > 0).length;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <p className="text-sm admin-muted max-w-[60ch]">
          {totalBlockers === 0
            ? "Nothing is blocking any trip."
            : <><strong className="text-red-400">{totalBlockers} blocker{totalBlockers === 1 ? "" : "s"}</strong> across {notReady} trip{notReady === 1 ? "" : "s"}. Red means a buyer would see something broken, or we would take money against something incomplete.</>}
        </p>
        <label className="flex items-center gap-2 text-[12.5px] admin-muted cursor-pointer shrink-0">
          <input type="checkbox" checked={showWarnings} onChange={(e) => setShowWarnings(e.target.checked)} className="accent-[var(--admin-accent)]" />
          Show warnings too
        </label>
      </div>

      <div className="space-y-2.5">
        {reports.map((e) => {
          const isOpen = open.has(e.id);
          const clean = e.blockers === 0 && e.warnings === 0;
          return (
            <div key={e.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <button onClick={() => toggle(e.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--admin-surface-hover)] transition-colors">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold admin-heading truncate">
                    {e.title}
                    {!e.websiteVisible && <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded admin-surface admin-faint">draft</span>}
                  </span>
                  <span className="block text-[11.5px] admin-faint">{e.editions.length} week{e.editions.length === 1 ? "" : "s"}</span>
                </span>
                {e.blockers > 0 && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400">{e.blockers} blocking</span>}
                {e.warnings > 0 && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">{e.warnings}</span>}
                {clean && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded bg-green-500/15 text-green-500">ready</span>}
                <svg className={`shrink-0 w-4 h-4 admin-faint transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {isOpen && (
                <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                  <ExperienceChecks report={e} showWarnings={showWarnings} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** One experience, always expanded — for its own tab. */
export function GoLivePanel({ report }: { report: ExperienceReport | null }) {
  const [showWarnings, setShowWarnings] = useState(true);
  if (!report) return <p className="text-sm admin-faint">Checking…</p>;
  return (
    <div className="max-w-[760px]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <p className="text-sm admin-muted max-w-[54ch]">
          {report.blockers === 0
            ? report.warnings === 0
              ? "Everything's in place — this one is ready to sell."
              : "Nothing is blocking a sale. The amber items are worth doing before you push it."
            : <><strong className="text-red-400">{report.blockers} blocker{report.blockers === 1 ? "" : "s"}</strong> — a buyer would see something broken, or we would take money against something incomplete.</>}
        </p>
        <label className="flex items-center gap-2 text-[12.5px] admin-muted cursor-pointer shrink-0">
          <input type="checkbox" checked={showWarnings} onChange={(e) => setShowWarnings(e.target.checked)} className="accent-[var(--admin-accent)]" />
          Show warnings too
        </label>
      </div>
      <div className="rounded-xl px-3 pb-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <ExperienceChecks report={report} showWarnings={showWarnings} />
      </div>
      <p className="text-xs admin-faint mt-3">
        Every line links to the field that fixes it. The same checks across all trips live on{" "}
        <Link href="/admin/go-live" className="text-[#0aa3c7] hover:underline">Ready to sell?</Link>
      </p>
    </div>
  );
}
