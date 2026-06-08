"use client";

import { useEffect, useRef, useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean; // cannot be hidden
  width: string;
}

interface ColumnToggleProps {
  columns: ColumnDef[];
  visible: Set<string>;
  onChange: (visible: Set<string>) => void;
  storageKey: string;
}

export function ColumnToggle({ columns, visible, onChange, storageKey }: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`p-2 rounded-lg transition-colors ${
          open ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-faint"
        }`}
        style={{ border: "1px solid var(--admin-border)" }}
        title="Show/hide columns"
      >
        {/* Gear / settings icon */}
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 py-1.5 rounded-xl min-w-[160px]"
          style={{
            border: "1px solid var(--admin-border)",
            backgroundColor: "var(--admin-bg)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div className="px-3 pb-1.5 mb-1 text-[10px] font-bold tracking-[0.1em] admin-faint uppercase" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            Columns
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
  return new Set(columns.map((c) => c.key));
}
