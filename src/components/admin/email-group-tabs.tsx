"use client";

import { useState } from "react";
import Link from "next/link";

export type EmailCard = {
  key: string;
  name: string;
  stage: string;
  trigger: string;
  source: string;
  isLive: boolean;
  hasOverride: boolean;
  html: string;
};

export type EmailGroup = { source: string; title: string; blurb: string; tab: string };

/**
 * The 23 automations as tabs rather than one long scroll.
 *
 * Grouped by WHO sets a mail off — "live vs paused" answers whether a mail CAN
 * send, this answers whether anyone has to do anything for it to. Each preview
 * is a rendered iframe, so showing all three groups at once meant 23 of them
 * stacked down the page; a tab shows one group's worth.
 */
export function EmailGroupTabs({ cards, groups }: { cards: EmailCard[]; groups: EmailGroup[] }) {
  const present = groups.filter((g) => cards.some((c) => c.source === g.source));
  const [active, setActive] = useState(present[0]?.source ?? "");
  const group = present.find((g) => g.source === active) ?? present[0];
  const shown = cards.filter((c) => c.source === group?.source);

  if (!present.length) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3" role="tablist">
        {present.map((g) => {
          const on = g.source === group?.source;
          const n = cards.filter((c) => c.source === g.source).length;
          return (
            <button
              key={g.source}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(g.source)}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors ${
                on ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"
              }`}
              style={on ? undefined : { border: "1px solid var(--admin-border)" }}
            >
              {g.tab} <span className={on ? "opacity-70" : "admin-faint"}>{n}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[12px] admin-muted mb-4">{group?.blurb}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((c) => (
          <Link
            key={c.key}
            href={`/admin/email-templates?edit=${c.key}`}
            className="group rounded-xl overflow-hidden flex flex-col transition-all hover:-translate-y-0.5"
            style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
          >
            <div className="p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--admin-accent)]/15 text-[#0aa3c7]">{c.stage}</span>
                  <h3 className="text-[13px] font-bold admin-heading truncate group-hover:text-[#0aa3c7] transition-colors">{c.name}</h3>
                </div>
                {c.isLive ? (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400"><span className="w-1 h-1 rounded-full bg-green-400" />LIVE</span>
                ) : (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300"><span className="w-1 h-1 rounded-full bg-amber-300" />PAUSED</span>
                )}
              </div>
              <p className="text-[11px] admin-muted truncate">{c.trigger}{c.hasOverride && <span className="ml-1.5 text-[#0aa3c7]">· edited</span>}</p>
            </div>
            <div className="relative bg-white border-t" style={{ borderColor: "var(--admin-border)" }}>
              <iframe title={`${c.name} preview`} srcDoc={c.html} sandbox="" loading="lazy" className="w-full h-[200px] pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-bold text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)] rounded-full px-2.5 py-1 shadow-lg">Click to edit →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
