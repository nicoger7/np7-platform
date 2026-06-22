"use client";

import { useEffect, useRef, useState } from "react";

export type SSOption = { value: string; label: string; sublabel?: string };

/**
 * The modern type-to-filter dropdown (same feel as the package "What's included"
 * picker) — a drop-in replacement for a plain <select> where the option list can
 * get long. Keyboard-light: click to open, type to filter, click to choose.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SSOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); } }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(ql)) : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 admin-input border rounded-lg text-sm text-left flex items-center justify-between gap-2 transition-colors focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? "admin-text" : "admin-faint"}`}>{selected ? selected.label : placeholder}</span>
        <svg className={`w-4 h-4 shrink-0 admin-faint transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
          {options.length > 6 && (
            <div className="p-1.5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 admin-faint pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-8 pl-8 pr-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]" />
              </div>
            </div>
          )}
          <div className="max-h-[260px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-xs admin-faint">No matches</p>
            ) : filtered.map((o) => {
              const active = o.value === value;
              return (
                <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(""); }} className="w-full text-left px-3 py-2 transition-colors hover:bg-[var(--admin-surface-hover)]" style={active ? { background: "var(--admin-accent-weak)" } : undefined}>
                  <span className={`block text-sm truncate ${active ? "text-[var(--admin-accent)] font-semibold" : "admin-heading"}`}>{o.label}</span>
                  {o.sublabel && <span className="block text-[11px] admin-faint truncate">{o.sublabel}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
