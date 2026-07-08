"use client";

import { useEffect, useRef, useState } from "react";

export type PaletteItem = { label: string; href: string; group: string; env: string; envColor: string };

/** Contains > prefix-of-word > subsequence. Higher = better; 0 = no match. */
function score(q: string, label: string, group: string): number {
  const idx = label.indexOf(q);
  if (idx === 0) return 200;
  if (idx > 0) return 120 - idx;
  if (group.indexOf(q) >= 0) return 50;
  // subsequence on the label (typed chars appear in order)
  let li = 0;
  for (let qi = 0; qi < q.length; qi++) {
    li = label.indexOf(q[qi], li);
    if (li === -1) return 0;
    li++;
  }
  return 20;
}

/**
 * ⌘K command palette for the admin. Indexes every nav destination the member can
 * reach (across all worlds they may enter), so the whole back-office is one
 * keystroke + a few letters away — no hunting through the sidebar. Navigation
 * only; no side-effecting actions. Mounted only while open (fresh state each time).
 */
export function CommandPalette({
  onClose,
  items,
  onNavigate,
}: {
  onClose: () => void;
  items: PaletteItem[];
  onNavigate: (item: PaletteItem) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus the field on open and close on a global Escape (DOM/external sync only).
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the highlighted row in view as you arrow through.
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const s = q.trim().toLowerCase();
  const results = !s
    ? items
    : items
        .map((it) => ({ it, s: score(s, it.label.toLowerCase(), it.group.toLowerCase()) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.it);

  function choose(item?: PaletteItem) {
    const target = item ?? results[idx];
    if (!target) return;
    onClose();
    onNavigate(target);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border-strong)" }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: "var(--admin-border)" }}>
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--admin-text-faint)" }}>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Jump to a page…"
            className="flex-1 bg-transparent outline-none text-[15px]"
            style={{ color: "var(--admin-text)" }}
          />
          <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-faint)" }}>esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--admin-text-faint)" }}>No matches for “{q}”</p>
          ) : (
            results.map((it, i) => (
              <button
                key={it.env + it.href}
                data-i={i}
                onMouseMove={() => setIdx(i)}
                onClick={() => choose(it)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ backgroundColor: i === idx ? "var(--admin-active)" : "transparent" }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: it.envColor }} />
                <span className="text-sm truncate" style={{ color: "var(--admin-text)" }}>{it.label}</span>
                <span className="ml-auto text-[10px] font-bold tracking-[0.12em] uppercase shrink-0" style={{ color: "var(--admin-text-faint)" }}>{it.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
