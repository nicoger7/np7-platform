"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  id: string; at: string; kind: "trip" | "community";
  action: string; subject: string | null;
  contactId: string | null; contactName: string | null; href: string | null;
};

const TABS = [
  { key: "all", label: "Everything" },
  { key: "trip", label: "Trips" },
  { key: "community", label: "Everything else" },
] as const;

/** Relative time — "what happened today?" is the question this page answers,
 *  and an exact timestamp makes you do the subtraction yourself. */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = s / 60; if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60; if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24; if (d < 7) return `${Math.round(d)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function MemberActivityPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");

  useEffect(() => {
    fetch("/api/admin/member-activity")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d.items) ? d.items : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const shown = items.filter((i) => tab === "all" || i.kind === tab);
  const counts = {
    all: items.length,
    trip: items.filter((i) => i.kind === "trip").length,
    community: items.filter((i) => i.kind === "community").length,
  };

  // Group by day so a busy morning reads as a morning, not 20 loose rows.
  const days: { label: string; rows: Item[] }[] = [];
  for (const i of shown) {
    const label = dayLabel(i.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.rows.push(i);
    else days.push({ label, rows: [i] });
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold admin-heading mb-1">Member activity</h1>
        <p className="text-sm admin-muted">What members have been doing — bookings, payments and waivers alongside spotguide contributions.</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-5" role="tablist">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${on ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"}`}
              style={on ? undefined : { border: "1px solid var(--admin-border)" }}
            >
              {t.label} <span className={on ? "opacity-70" : "admin-faint"}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm admin-faint">Loading activity…</p>
      ) : !shown.length ? (
        <p className="text-sm admin-faint">Nothing here yet.</p>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <div key={d.label}>
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase admin-faint mb-2">{d.label}</p>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                {d.rows.map((i, idx) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
                    style={idx ? { borderTop: "1px solid var(--admin-border)" } : undefined}
                  >
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${i.kind === "trip" ? "bg-[#0aa3c7]" : "bg-[var(--admin-border)]"}`} />
                    <span className="flex-1 min-w-0 truncate">
                      {i.contactId ? (
                        <Link href={`/admin/members/${i.contactId}`} className="font-semibold admin-heading hover:text-[#0aa3c7] transition-colors">
                          {i.contactName || "A member"}
                        </Link>
                      ) : (
                        <span className="font-semibold admin-heading">{i.contactName || "A member"}</span>
                      )}
                      <span className="admin-muted"> · {i.action}</span>
                      {i.subject && <span className="admin-faint"> · {i.subject}</span>}
                    </span>
                    <span className="shrink-0 admin-faint text-xs">{ago(i.at)}</span>
                    {i.href && (
                      <Link href={i.href} className="shrink-0 text-xs font-semibold text-[#0aa3c7] hover:underline">Open</Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
