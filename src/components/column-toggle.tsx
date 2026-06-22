"use client";

import { useEffect, useRef, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean; // cannot be hidden
  defaultHidden?: boolean; // available in the toggle, but off by default
  width: string;
}

interface ColumnToggleProps {
  columns: ColumnDef[];
  visible: Set<string>;
  onChange: (visible: Set<string>) => void;
  storageKey: string;
  /** What the toggle controls, e.g. "Columns" (default) or "Properties". */
  label?: string;
}

export function ColumnToggle({ columns, visible, onChange, storageKey, label = "Columns" }: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  // `visible` is derived from localStorage by callers, so it differs between the
  // server render (defaults) and the client. Only show the count once mounted to
  // keep the first client render matching the server (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(key: string) {
    const next = new Set(visible);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    }
  }

  const toggleable = columns.filter((c) => !c.required);
  const shown = toggleable.filter((c) => visible.has(c.key)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-lg text-xs font-semibold transition-colors ${
          open
            ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
            : "admin-muted hover:admin-heading hover:bg-[var(--admin-surface-hover)]"
        }`}
        style={open ? { border: "1px solid transparent" } : { border: "1px solid var(--admin-border)" }}
        title={`Show/hide ${label.toLowerCase()}`}
      >
        {/* Sliders icon — distinct from a generic settings gear */}
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="6" r="2" fill="var(--admin-bg)" /><circle cx="15" cy="12" r="2" fill="var(--admin-bg)" /><circle cx="8" cy="18" r="2" fill="var(--admin-bg)" />
        </svg>
        <span>{label}</span>
        {mounted && <span className={`ml-0.5 px-1.5 h-4 grid place-items-center rounded text-[10px] font-bold tabular-nums ${open ? "bg-[var(--admin-accent-contrast)]/20" : "bg-[var(--admin-surface)] admin-faint"}`}>{shown}/{toggleable.length}</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 py-1.5 rounded-xl min-w-[180px]"
          style={{
            border: "1px solid var(--admin-border)",
            backgroundColor: "var(--admin-bg)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {label}
          </div>
          {toggleable.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-sm admin-muted hover:admin-heading transition-colors"
            >
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => toggle(col.key)}
                className="w-3.5 h-3.5 accent-[#0aa3c7]"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Build a CSS grid-template-columns string from column definitions + visible set */
export function buildGridTemplate(columns: ColumnDef[], visible: Set<string>): string {
  return columns
    .filter((c) => c.required || visible.has(c.key))
    .map((c) => c.width)
    .join(" ");
}

/** Load visible columns from localStorage or return default (all) */
export function loadVisibleColumns(storageKey: string, columns: ColumnDef[]): Set<string> {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return new Set(JSON.parse(stored) as string[]);
      } catch {
        // ignore
      }
    }
  }
  return new Set(columns.filter((c) => c.required || !c.defaultHidden).map((c) => c.key));
}
