"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailReadiness } from "@/components/admin/mail-readiness";

type Scheduled = {
  key: string; name: string; trigger: string;
  daysBefore: number | null; dueAt: string | null; daysAway: number | null;
  missing: string[]; sent: number; lastSent: string | null;
};
type Data = {
  startDate: string | null; endDate: string | null;
  guests: number; securedGuests: number;
  content: { packingList: boolean; preTripNote: boolean; whatsappLink: boolean };
  scheduled: Scheduled[];
  other: { key: string; name: string; sent: number; last: string | null }[];
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Everything this week's guests get, on one timeline.
 *
 * Sent mail lived in the Email Log, the schedule in the cron, held mail on the
 * Branding tab and the forecast on the dashboard — so the obvious question,
 * "what has this week actually had from us?", had no answer anywhere. Ordered
 * by when each mail fires rather than by when it was sent, because that is how
 * you think about a trip that hasn't happened yet.
 */
export function EditionMailing({ editionId }: { editionId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-[860px]">
      <h3 className="text-base font-bold admin-heading mb-1">Mailing</h3>
      <p className="text-[13px] admin-muted mb-4">
        Every automated mail for this week — what has gone, what is next, and what each still needs.
        {d.guests > 0 && <> {d.securedGuests} of {d.guests} guests are secured; only those receive pre-trip mail.</>}
      </p>

      <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--admin-border)" }}>
        {d.scheduled.map((m, i) => {
          const gone = m.sent > 0;
          const blocked = m.missing.length > 0;
          const past = m.daysAway != null && m.daysAway < 0;
          return (
            <div key={m.key}
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined, backgroundColor: "var(--admin-surface)" }}>
              <span className={`shrink-0 w-16 text-right text-[12px] font-bold ${gone ? "text-green-500" : blocked ? "text-amber-500" : "admin-faint"}`}>
                {m.daysBefore != null ? `${m.daysBefore}d before` : "—"}
              </span>
              <span className="flex-1 min-w-0">
                <Link href={`/admin/emails/${m.key}`} className="text-[13.5px] font-bold admin-heading hover:text-[#0aa3c7] transition-colors">{m.name}</Link>
                <span className="block text-[11.5px] admin-faint truncate">{m.trigger}</span>
                {blocked && !gone && (
                  <span className="block text-[11.5px] text-amber-500 mt-0.5">
                    Held — needs {m.missing.join(", ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {gone ? (
                  <>
                    <span className="block text-[12.5px] font-bold text-green-500">Sent to {m.sent}</span>
                    <span className="block text-[11px] admin-faint">{fmt(m.lastSent)}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-[12.5px] admin-muted">{past ? "Window passed" : "Due"}</span>
                    <span className="block text-[11px] admin-faint">{fmt(m.dueAt)}</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

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

      {/* The readiness checklist and any held mail — the same panel as before,
          now beside the timeline it explains rather than buried under branding. */}
      <MailReadiness editionId={editionId} />

      <p className="text-xs admin-faint mt-4">
        Every send is logged in <Link href="/admin/email-log" className="text-[#0aa3c7] hover:underline">Email Log</Link>.
        Wording and on/off switches live in <Link href="/admin/emails" className="text-[#0aa3c7] hover:underline">Emails</Link>.
      </p>
    </div>
  );
}
