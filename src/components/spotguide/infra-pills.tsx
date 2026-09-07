"use client";

import { useState } from "react";
import { useSpotguide } from "./spotguide-provider";
import type { InfraShare } from "@/lib/spotguide";

/** How green a pill goes, by how many riders have confirmed it. Four steps, not
 *  a gradient: a rider should be able to tell "one person said so" from "the
 *  whole crew says so" at a glance, without reading the number. */
function tier(count: number) {
  if (count >= 6) return { bg: "rgba(31,158,87,0.24)", fg: "#0d6349", bd: "rgba(31,158,87,0.42)" };
  if (count >= 3) return { bg: "rgba(31,158,87,0.15)", fg: "#137553", bd: "rgba(31,158,87,0.3)" };
  if (count >= 1) return { bg: "rgba(31,158,87,0.08)", fg: "#2c8562", bd: "rgba(31,158,87,0.2)" };
  return { bg: "#f3ede0", fg: "#5a6b72", bd: "#e7ddc9" };
}

const CheckIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    {filled
      ? <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="m8 12.2 2.7 2.7L16 9.6" stroke="#fff" /></>
      : <><circle cx="12" cy="12" r="9.2" opacity="0.45" /><path d="m8 12.2 2.7 2.7L16 9.6" opacity="0.55" /></>}
  </svg>
);

/**
 * "On site" — NP7's facility list, but every chip is a one-tap confirmation.
 *
 * It used to be dead text, while the member's own version of the same facts sat
 * three panels away inside "Members say" as `School (3) · Rental (2)`. Same
 * facts, two places, neither of them tappable. Now there is one row: the check
 * says you can vouch for it, the green says how many riders already did, and a
 * facility riders reported that NP7 never listed joins the row on its own.
 *
 * Guests get the chips and the join modal on tap — same as the forecast vote.
 */
export function InfraPills({ spotId, tags, member, accent = "#00afdb" }: {
  spotId: string;
  /** NP7's list, in NP7's order. */
  tags: string[];
  /** Crowd tally from the server render. */
  member: { shares: InfraShare[]; raters: number };
  accent?: string;
}) {
  const sg = useSpotguide();
  const serverMine = sg.mineSpot(spotId)?.infrastructure ?? [];
  const mineKey = JSON.stringify(serverMine);
  const [mine, setMine] = useState<string[]>(serverMine);
  const [counts, setCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(member.shares.map((s) => [s.tag, s.count])));
  const [busy, setBusy] = useState<string | null>(null);

  // The provider is the source of truth for "what I confirmed" — it also carries
  // the answer in from /mine after the (CDN-cached) page has already rendered.
  // Adjusted during render, React's own pattern for resetting state on a prop
  // change: no effect, no second paint with the stale value.
  const [seen, setSeen] = useState(mineKey);
  if (seen !== mineKey) { setSeen(mineKey); setMine(serverMine); }

  // riders can report a facility NP7 never listed — show it, at the end
  const extra = Object.keys(counts)
    .filter((t) => (counts[t] ?? 0) > 0 && !tags.includes(t))
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const all = [...tags, ...extra];
  if (all.length === 0) return null;

  async function toggle(tag: string) {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    if (busy) return;
    const on = !mine.includes(tag);
    const before = { mine, counts };
    setMine((m) => (on ? [...m, tag] : m.filter((t) => t !== tag)));
    setCounts((c) => ({ ...c, [tag]: Math.max(0, (c[tag] ?? 0) + (on ? 1 : -1)) }));
    setBusy(tag);
    const tally = await sg.toggleInfra(spotId, tag);
    setBusy(null);
    if (tally) setCounts(Object.fromEntries(tally.shares.map((s) => [s.tag, s.count])));
    else { setMine(before.mine); setCounts(before.counts); } // 401 opened the join modal, or it failed
  }

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac]">On site</span>
        <span className="text-[11.5px] text-[#b6aa95]">tap what you found there</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const n = counts[t] ?? 0;
          const isMine = mine.includes(t);
          const c = tier(n);
          return (
            <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={isMine} disabled={busy === t}
              title={isMine
                ? `You confirmed this${n > 1 ? `, with ${n - 1} other ${n === 2 ? "rider" : "riders"}` : ""}. Tap to undo.`
                : n > 0 ? `${n} ${n === 1 ? "rider" : "riders"} confirmed this. Tap if you found it too.`
                : "Tap if you found this here."}
              className="np7-infra-pill inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold disabled:opacity-60"
              style={{
                backgroundColor: c.bg,
                color: isMine ? "#0d6349" : c.fg,
                border: `1px solid ${isMine ? "rgba(31,158,87,0.55)" : c.bd}`,
                boxShadow: isMine ? "0 0 0 2.5px rgba(31,158,87,0.13)" : undefined,
                ["--pill-accent" as string]: accent,
              }}>
              <span style={{ color: isMine || n > 0 ? "#1f9e57" : "#a9b4ba" }}><CheckIcon filled={isMine} /></span>
              {t}
              {n > 0 && <span className="text-[10.5px] font-black tabular-nums rounded-full bg-white/70 px-1.5 leading-[1.45]">{n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
