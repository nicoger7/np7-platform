"use client";

import { useEffect, useState } from "react";

/**
 * The packing list, actually tickable.
 *
 * It already looked like a checklist — square outlines next to every line — but
 * the squares were decorative `<span>`s. Tapping one did nothing, which is worse
 * than plain bullets: it invites an action and then ignores it.
 *
 * State lives in localStorage, deliberately. Which socks someone has packed is
 * their business, it doesn't belong in our database, and it should survive a
 * refresh on the phone they're packing next to — which localStorage does and a
 * server round-trip doesn't need to.
 */
export function PackingChecklist({ bookingId, items }: { bookingId: string; items: string[] }) {
  const key = `np7:packing:${bookingId}`;
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch { /* private mode, corrupt value — start fresh, never break the page */ }
    setReady(true);
  }, [key]);

  const toggle = (item: string) => {
    setDone((prev) => {
      const next = { ...prev, [item]: !prev[item] };
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* nothing to do */ }
      return next;
    });
  };

  // Keyed on the text, not the index: reorder or add an item in Event Content
  // and the ticks stay with the right lines instead of sliding one across.
  const packed = items.filter((i) => done[i]).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#9aa6ac]">What to bring</p>
        {ready && packed > 0 && (
          <p className="text-[11.5px] font-bold text-[#00afdb]">
            {packed === items.length ? "All packed 🤙" : `${packed} of ${items.length} packed`}
          </p>
        )}
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        {items.map((it) => {
          const on = !!done[it];
          return (
            <li key={it}>
              <button type="button" onClick={() => toggle(it)} aria-pressed={on}
                className="w-full flex items-start gap-2.5 text-left text-[13.5px] leading-snug py-1 rounded-lg hover:bg-[#f7fbfc] transition-colors">
                <span className={`mt-[3px] w-3.5 h-3.5 rounded shrink-0 grid place-items-center transition-colors ${on ? "bg-[#00afdb] border border-[#00afdb]" : "border border-[#c9d6da]"}`}>
                  {on && (
                    <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </span>
                <span className={on ? "text-[#9aa6ac] line-through decoration-[#c9d6da]" : "text-[#3a4a50]"}>{it}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-[#9aa6ac] mt-2.5">
        Tick things off as you pack — saved on this device. We&apos;ll remind you closer to departure anyway.
      </p>
    </div>
  );
}
