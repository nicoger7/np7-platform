"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExperienceReport, CheckResult } from "@/lib/go-live";

/**
 * What still stands between each trip and being sold.
 *
 * The old dashboard widget only listed experiences that were already public or
 * already dated — so everything actually being *prepared* was invisible to it
 * until it was too late to matter. This lists drafts first, because those are
 * the ones with work left.
 *
 * Blockers are red and mean a buyer would see something broken or we would take
 * money against something incomplete. Everything else is amber. Every row is a
 * link to the field that fixes it.
 */
export default function GoLivePage() {
  const [data, setData] = useState<ExperienceReport[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(true);

  useEffect(() => {
    fetch("/api/admin/go-live").then((r) => r.json()).then((d) => setData(d.experiences ?? [])).catch(() => setData([]));
  }, []);

  const toggle = (id: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (!data) return <p className="p-8 text-sm admin-faint">Checking every trip…</p>;

  const totalBlockers = data.reduce((s, e) => s + e.blockers, 0);
  const ready = data.filter((e) => e.blockers === 0).length;

  const Row = ({ c }: { c: CheckResult }) => {
    if (c.ok || (!showWarnings && c.severity === "warning")) return null;
    const red = c.severity === "blocker";
    return (
      <Link href={c.href} className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--admin-surface-hover)] transition-colors">
        <span className={`mt-[3px] shrink-0 w-1.5 h-1.5 rounded-full ${red ? "bg-red-500" : "bg-amber-500"}`} />
        <span className="min-w-0">
          <span className={`block text-[13px] font-semibold ${red ? "text-red-400" : "text-amber-500"}`}>{c.label}</span>
          {c.detail && <span className="block text-[12px] admin-faint leading-snug">{c.detail}</span>}
        </span>
      </Link>
    );
  };

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl font-bold admin-heading">Ready to sell?</h1>
        <label className="flex items-center gap-2 text-[12.5px] admin-muted cursor-pointer">
          <input type="checkbox" checked={showWarnings} onChange={(e) => setShowWarnings(e.target.checked)} className="accent-[var(--admin-accent)]" />
          Show warnings too
        </label>
      </div>
      <p className="text-sm admin-muted mb-6">
        {totalBlockers === 0
          ? "Nothing is blocking any trip."
          : <><strong className="text-red-400">{totalBlockers} blocker{totalBlockers === 1 ? "" : "s"}</strong> across {data.length - ready} trip{data.length - ready === 1 ? "" : "s"}. Red means a buyer would see something broken, or we would take money against something incomplete.</>}
      </p>

      <div className="space-y-2.5">
        {data.map((e) => {
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
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint px-3 pt-3 pb-1">The experience</p>
                  {e.checks.every((c) => c.ok) ? <p className="px-3 py-1.5 text-[12.5px] text-green-500">All good</p> : e.checks.map((c) => <Row key={c.id} c={c} />)}

                  {e.editions.map((ed) => (
                    <div key={ed.id} className="mt-1">
                      <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint px-3 pt-3 pb-1">
                        {ed.label}
                        {ed.dateStart && <span className="ml-1.5 normal-case tracking-normal font-normal">{new Date(ed.dateStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
                        {ed.status && ed.status !== "published" && <span className="ml-1.5 normal-case tracking-normal font-normal">· {ed.status}</span>}
                      </p>
                      {ed.checks.every((c) => c.ok) ? <p className="px-3 py-1.5 text-[12.5px] text-green-500">All good</p> : ed.checks.map((c) => <Row key={c.id} c={c} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
