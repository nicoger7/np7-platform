"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";

/** One bookable package for the week, as the roster needs to show it. */
export type WeekPackage = {
  id: string;
  /** "Advanced · Standard Room" — the joined form, kept for callers that
   *  cannot split it and as the fallback label. */
  label: string;
  price: number;
  /** The three facts a guest actually weighs, kept apart so they can be shown
   *  apart. Optional: a caller may only have the joined label. */
  level?: string;
  accommodation?: string;
  /** What separates two otherwise identical rows: "Advanced · Standard Room"
   *  at €3,915 and at €4,590 are two different hotels, and without the name
   *  the guest is choosing blind at a €675 difference. */
  hotelName?: string | null;
};

type Row = { id: string; price: number; level: string; primary: string; secondary: string | null };

/**
 * "Boutique Hotel Wanapa" over "WANAPA Double Deluxe Patio" says the place
 * twice. Drop a leading word the hotel name already carries, but only from a
 * room that still reads as a room afterwards, so a "Standard Room" at a
 * "Standard Hotel" never shrinks to "Room".
 */
function trimHotelFromRoom(room: string, hotel: string | null): string {
  if (!hotel) return room;
  const words = room.split(/\s+/);
  const hotelWords = new Set(hotel.toLowerCase().split(/\s+/));
  // Word by word, because the prefix is not always one: Sorobon's own catalogue
  // says "SOROBON RESORT Premium Ocean Front Beach House".
  while (words.length > 2 && words[0].length >= 4 && hotelWords.has(words[0].toLowerCase())) words.shift();
  return words.join(" ");
}

/** Split a package into the level, the place and the room. */
function toRow(p: WeekPackage): Row {
  const [first, ...rest] = p.label.split(" · ");
  const level = (p.level ?? first ?? "").trim();
  const room = (p.accommodation ?? rest.join(" · ")).trim() || p.label;
  const hotel = p.hotelName?.trim() || null;
  // "No Hotel - Advanced" is the same option as "No Hotel": the level is
  // already the group heading, so the row only has to say there is no bed.
  const noHotel = /^no\s*hotel\b/i.test(room);
  return {
    id: p.id,
    price: p.price,
    level,
    // The hotel leads when there is one: it is the line that differs between
    // two "Standard Room" rows, so it has to be the line read first.
    primary: hotel ?? (noHotel ? "No hotel" : room),
    secondary: hotel ? trimHotelFromRoom(room, hotel) : noHotel ? "Coaching only, you sort your own stay" : null,
  };
}

const beginnerLast = (a: string, b: string) =>
  (/beginner|starter/i.test(a) ? 1 : 0) - (/beginner|starter/i.test(b) ? 1 : 0);

/**
 * The per-person package chooser in the group roster.
 *
 * It replaces a native <select>, which macOS drew as a grey OS list of
 * middot-separated lines at the exact moment a guest decides how much to spend
 * on a friend. Three facts, read as three facts: the level groups the list, the
 * hotel and room name the row, the price sits on the right.
 *
 * The list opens INLINE rather than as a floating popover on purpose. This sits
 * in a modal that scrolls (`overflow-y-auto`), which clips absolutely
 * positioned children and would cut the options in half on a phone. Growing in
 * the flow can never be clipped and never moves the page under a thumb.
 *
 * Keyboard: the trigger opens with Enter, Space or Down; the list itself takes
 * focus and drives a real listbox with aria-activedescendant, so arrows, Home,
 * End, Enter and Escape all behave, and a screen reader hears the level group,
 * the row and the price.
 */
export function PackageChoice({ value, onChange, options, money, caption, action }: {
  value: string;
  onChange: (id: string) => void;
  options: WeekPackage[];
  money: (n: number) => string;
  /** Whose package this is, e.g. "Anna's package". Shown, and part of the
   *  control's accessible name so both say the same thing. */
  caption: string;
  /** Rides the caption line (the Remove button), which keeps the chooser the
   *  full width of a phone screen. */
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const captionId = `${uid}-cap`;
  const valueId = `${uid}-val`;
  const listId = `${uid}-list`;
  const optId = (id: string) => `${uid}-o-${id}`;

  const rows = options.map(toRow);
  const groups: { level: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.level === r.level);
    if (g) g.rows.push(r);
    else groups.push({ level: r.level, rows: [r] });
  }
  groups.sort((a, b) => beginnerLast(a.level, b.level));
  for (const g of groups) g.rows.sort((a, b) => a.price - b.price);
  const flat = groups.flatMap((g) => g.rows);
  const current = flat.find((r) => r.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    // Focus without the browser's own scroll, then nudge only if the list is
    // actually cut off by the modal's scroller.
    listRef.current?.focus({ preventScroll: true });
    const id = requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optId(activeId))?.scrollIntoView({ block: "nearest" });
    // optId is derived from a stable useId, so it needs no dependency of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, open]);

  // Opening always starts on what is chosen, so the arrows walk from there.
  const openList = () => { setActiveId(value); setOpen(true); };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const choose = (id: string) => { onChange(id); close(); };
  const move = (delta: number) => {
    const at = flat.findIndex((r) => r.id === activeId);
    const next = flat[Math.min(Math.max((at < 0 ? 0 : at) + delta, 0), flat.length - 1)];
    if (next) setActiveId(next.id);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); if (flat[0]) setActiveId(flat[0].id); }
    else if (e.key === "End") { e.preventDefault(); const last = flat[flat.length - 1]; if (last) setActiveId(last.id); }
    // Enter would otherwise submit the registration form under this control.
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(activeId); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p id={captionId} className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac] truncate">{caption}</p>
        {action}
      </div>

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${captionId} ${valueId}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openList(); } }}
        className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl border bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00afdb]/30 ${
          open ? "border-[#00afdb]" : "border-[#dde6e9] hover:border-[#bcd]"
        }`}
      >
        {/* Two lines, price on the first: on a 375px phone one line put the
            chip, the name and the price in a fight the name lost, leaving
            "ADVANCED  No …  €2,990". */}
        <span id={valueId} className="min-w-0 flex-1">
          {current ? (
            <>
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="truncate text-[14px] font-bold text-[#00374a]">{current.primary}</span>
                <span className="ml-auto shrink-0 text-[14px] font-bold text-[#00374a] tabular-nums">{money(current.price)}</span>
              </span>
              <span className="flex items-center gap-1.5 min-w-0 mt-0.5">
                {current.level && (
                  <span className="shrink-0 rounded-full bg-[#00afdb]/12 text-[#0782a0] text-[10px] font-extrabold uppercase tracking-[0.06em] px-2 py-0.5">
                    {current.level}
                  </span>
                )}
                {current.secondary && <span className="truncate text-[12px] text-[#7a8a90]">{current.secondary}</span>}
              </span>
            </>
          ) : (
            <span className="text-[14px] text-[#9aa6ac]">Choose a package</span>
          )}
        </span>
        <svg className={`shrink-0 w-4 h-4 text-[#9aa6ac] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={caption}
          aria-activedescendant={activeId ? optId(activeId) : undefined}
          onKeyDown={onListKey}
          /* overscroll-contain: scrolling to the end of the options must not
             carry on and scroll the modal behind them. */
          className="mt-1.5 py-1 rounded-xl border border-[#dde6e9] bg-white shadow-[0_12px_30px_rgba(0,20,30,0.12)] overflow-y-auto overscroll-contain max-h-[min(320px,46svh)] focus:outline-none"
        >
          {groups.map((g) => {
            const items = g.rows.map((r) => {
              const chosen = r.id === value;
              const active = r.id === activeId;
              return (
                <div
                  key={r.id}
                  id={optId(r.id)}
                  role="option"
                  aria-selected={chosen}
                  onClick={() => choose(r.id)}
                  onMouseMove={() => setActiveId(r.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 min-h-[46px] cursor-pointer ${
                    active ? "bg-[#e9f7fc]" : chosen ? "bg-[#f4fafc]" : ""
                  }`}
                >
                  <span className={`shrink-0 w-4 h-4 rounded-full border-2 grid place-items-center ${chosen ? "border-[#00afdb]" : "border-[#cbd5d9]"}`} aria-hidden="true">
                    {chosen && <span className="w-2 h-2 rounded-full bg-[#00afdb]" />}
                  </span>
                  {/* Wraps rather than truncates: on a phone three cut-off
                      "Boutique Hotel W…" rows would be the old problem again,
                      and the whole point is that the guest can tell them
                      apart before spending €675 more on a friend. */}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold text-[#1f3138] leading-snug">{r.primary}</span>
                    {r.secondary && <span className="block text-[12px] text-[#7a8a90] leading-snug">{r.secondary}</span>}
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold text-[#00374a] tabular-nums">{money(r.price)}</span>
                </div>
              );
            });
            if (groups.length === 1) return <Fragment key={g.level}>{items}</Fragment>;
            return (
              <div key={g.level} role="group" aria-label={g.level}>
                <p aria-hidden="true" className="px-3 pt-2 pb-1 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#9aa6ac]">{g.level}</p>
                {items}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
