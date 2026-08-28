"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; hint?: string; sub?: string };

/**
 * A modern, searchable single-select — a drop-in replacement for the native
 * <select> across admin. Type to filter, arrow-key + Enter to pick, Esc / click
 * away to close. Styled with the admin design tokens. Handy when a list is long
 * (e.g. packages) where a bare <select> is unusable.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  allowClear = true,
  clearLabel = "None",
  disabled = false,
  emptyLabel = "No matches",
  wideMenu = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  emptyLabel?: string;
  /** Let the menu grow past the trigger. For pickers in narrow grid cells whose
   *  option labels are long ("Sorobon - 1 Night - Garden View Studio - Low
   *  Season") — inheriting the trigger width truncated them into guesswork. */
  wideMenu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(s) || (o.hint ?? "").toLowerCase().includes(s) || (o.sub ?? "").toLowerCase().includes(s));
  }, [q, options]);

  // The clear row shows only when nothing is being searched.
  type Row = { value: string | null; label: string; hint?: string; sub?: string };
  const rows: Row[] = allowClear && !q.trim() ? [{ value: null, label: clearLabel }, ...filtered] : filtered;

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHi(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  const choose = (v: string | null) => { onChange(v); setOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = rows[hi]; if (r) choose(r.value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 admin-input border rounded-lg text-sm text-left focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors disabled:opacity-50"
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? "admin-heading" : "admin-faint"}`}>
          {selected ? selected.label : placeholder}
          {selected?.hint && <span className="admin-faint"> · {selected.hint}</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 admin-faint transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 rounded-xl border shadow-[0_12px_34px_rgba(0,0,0,0.14)] overflow-hidden ${wideMenu ? "min-w-full w-max max-w-[min(560px,calc(100vw-2rem))]" : "w-full"}`} style={{ borderColor: "var(--admin-border)", background: "var(--admin-surface)" }}>
          <div className="p-2 border-b" style={{ borderColor: "var(--admin-border)" }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setHi(0); }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              className="w-full px-2.5 py-1.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]"
            />
          </div>
          <div className={`overflow-y-auto py-1 ${wideMenu ? "max-h-80" : "max-h-64"}`} role="listbox">
            {rows.length === 0 ? (
              <p className="px-3 py-2.5 text-sm admin-faint">{emptyLabel}</p>
            ) : (
              rows.map((o, i) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value ?? "__none"}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => choose(o.value)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === hi ? "bg-[var(--admin-accent)]/10" : ""}`}
                    style={active ? { color: "var(--admin-accent)", fontWeight: 600 } : undefined}
                  >
                    <span className={`flex-1 min-w-0 ${active ? "" : "admin-heading"}`}>
                      <span className={wideMenu ? "block" : "block truncate"}>{o.label}</span>
                      {o.sub && <span className="block truncate text-xs admin-faint">{o.sub}</span>}
                    </span>
                    {o.hint && <span className="shrink-0 text-xs admin-faint">{o.hint}</span>}
                    {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6 9 17l-5-5" /></svg>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
