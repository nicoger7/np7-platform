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
  enabled: boolean;
  /** the magic link can't be switched off — it's how members sign in */
  locked: boolean;
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
  // Optimistic switch state, so flicking a card doesn't wait on a round-trip.
  const [off, setOff] = useState<Record<string, boolean>>(
    () => Object.fromEntries(cards.filter((c) => !c.enabled).map((c) => [c.key, true])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const group = present.find((g) => g.source === active) ?? present[0];
  const shown = cards.filter((c) => c.source === group?.source);

  async function toggle(key: string, next: boolean) {
    setBusy(key);
    setOff((m) => ({ ...m, [key]: !next }));
    try {
      const res = await fetch("/api/admin/emails/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: key, enabled: next }),
      });
      if (!res.ok) setOff((m) => ({ ...m, [key]: next })); // put it back
    } catch {
      setOff((m) => ({ ...m, [key]: next }));
    } finally {
      setBusy(null);
    }
  }

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
        {shown.map((c) => {
          const isOff = !!off[c.key];
          return (
            <div
              key={c.key}
              className={`group rounded-xl overflow-hidden flex flex-col transition-all ${isOff ? "opacity-55" : ""}`}
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              <div className="p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Link href={`/admin/emails/${c.key}`} className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--admin-accent)]/15 text-[#0aa3c7]">{c.stage}</span>
                    <h3 className="text-[13px] font-bold admin-heading truncate group-hover:text-[#0aa3c7] transition-colors">{c.name}</h3>
                  </Link>
                  {/* Switched on but the pipeline is paused: the green switch
                      alone would read as "this is going out". It isn't. */}
                  {!isOff && !c.isLive && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500"
                      title="Allowed, but held — the lifecycle pipeline is switched off, so this never leaves the building">held</span>
                  )}
                  <button
                    onClick={() => !c.locked && toggle(c.key, isOff)}
                    disabled={c.locked || busy === c.key}
                    role="switch"
                    aria-checked={!isOff}
                    aria-label={`${isOff ? "Switch on" : "Switch off"} ${c.name}`}
                    title={c.locked ? "Always on — this is how members sign in" : isOff ? "Switched off — this email never sends" : c.isLive ? "On — sends at its trigger" : "Allowed, but held: the lifecycle pipeline is off, so nothing goes out yet"}
                    className={`shrink-0 relative w-9 h-5 rounded-full transition-colors ${c.locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${isOff ? "bg-[var(--admin-border)]" : "bg-green-500"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isOff ? "left-0.5" : "left-[18px]"}`} />
                  </button>
                </div>
                <Link href={`/admin/emails/${c.key}`} className="block">
                  <p className="text-[11px] admin-muted truncate">{c.trigger}{c.hasOverride && <span className="ml-1.5 text-[#0aa3c7]">· edited</span>}</p>
                </Link>
              </div>
              {/* The email's header photo is ~200px tall, so a 200px window showed
                  the banner and nothing else — every card looked identical and
                  told you nothing. Render at half scale so the greeting, the
                  first paragraph and the button land inside the same box. */}
              <Link href={`/admin/emails/${c.key}`} className="relative bg-white border-t block overflow-hidden h-[230px]" style={{ borderColor: "var(--admin-border)" }}>
                <iframe
                  title={`${c.name} preview`}
                  srcDoc={c.html}
                  sandbox=""
                  loading="lazy"
                  className="pointer-events-none border-0"
                  style={{ width: "200%", height: "920px", transform: "scale(0.5)", transformOrigin: "top left" }}
                />
                <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-bold text-[var(--admin-accent-contrast)] bg-[var(--admin-accent)] rounded-full px-2.5 py-1 shadow-lg">Click to edit →</span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
