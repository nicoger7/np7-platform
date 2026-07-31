"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Gap = { editionId: string; title: string; startDate: string; daysToStart: number | null; missing: string[]; overdue: boolean };

/**
 * Dashboard warning: trips starting soon whose mails will be held back.
 *
 * Renders nothing when there is nothing to say — a banner that is always there
 * stops being read.
 */
export function MailGapsBanner() {
  const [gaps, setGaps] = useState<Gap[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/mail-gaps")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.gaps) setGaps(d.gaps); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!gaps.length) return null;

  return (
    <div className="mb-5 rounded-xl p-4" style={{ border: "1px solid rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.07)" }}>
      <p className="text-sm font-bold admin-heading">
        {gaps.length} trip{gaps.length > 1 ? "s" : ""} starting soon {gaps.length > 1 ? "are" : "is"} missing content its emails need
      </p>
      <p className="text-xs admin-faint mt-0.5 mb-2.5">These mails are held back until it&apos;s filled in — nothing hollow goes out.</p>
      <div className="space-y-1.5">
        {gaps.map((g) => (
          <Link key={g.editionId} href={`/admin/editions/${g.editionId}`}
            className="flex flex-wrap items-baseline gap-x-2 text-[13px] hover:underline">
            <span className="font-semibold admin-heading">{g.title}</span>
            <span className={g.overdue ? "text-red-400 font-bold" : "text-amber-500"}>
              {g.overdue ? "overdue" : g.daysToStart != null ? `in ${g.daysToStart}d` : ""}
            </span>
            <span className="admin-faint">— needs {g.missing.join(", ")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
