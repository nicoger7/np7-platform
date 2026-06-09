"use client";

import { useState, useEffect, useRef } from "react";

export interface ContactLite {
  id: string;
  name: string;
  email?: string | null;
}

interface Props {
  value: string | null;
  /** Current selection for display (so the chosen contact shows even if not in the search page) */
  display?: ContactLite | null;
  onChange: (id: string | null, contact: ContactLite | null) => void;
  placeholder?: string;
}

export function ContactPicker({ value, display, onChange, placeholder = "Search by name, email or phone…" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ContactLite | null>(display ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // keep local selection in sync with the parent-provided display
  useEffect(() => { setSelected(display ?? null); }, [display?.id, display?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // close on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // focus the search field when opened
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // debounced search against the contacts API
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/contacts?limit=25${query ? `&search=${encodeURIComponent(query)}` : ""}`)
        .then((r) => r.json())
        .then((d) => {
          setResults(((d.data as Record<string, string>[]) || []).map((c) => ({ id: c.id, name: c.name, email: c.email })));
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query, open]);

  function pick(c: ContactLite | null) {
    setSelected(c);
    onChange(c?.id ?? null, c);
    setOpen(false);
    setQuery("");
  }

  const triggerClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {selected ? (
          <span className="truncate">
            <span className="admin-heading">{selected.name}</span>
            {selected.email && <span className="admin-faint"> · {selected.email}</span>}
          </span>
        ) : (
          <span className="admin-faint">{value ? "Loading…" : "None — click to search"}</span>
        )}
        <svg className="w-4 h-4 admin-faint shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}
        >
          <div className="p-2" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7]"
            />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            <button type="button" onClick={() => pick(null)} className="w-full text-left px-3 py-2 text-sm admin-faint hover:bg-[var(--admin-surface-hover)] transition-colors">
              Clear selection
            </button>
            {loading && <div className="px-3 py-2 text-xs admin-faint">Searching…</div>}
            {!loading && results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className={`w-full text-left px-3 py-2 hover:bg-[var(--admin-surface-hover)] transition-colors ${c.id === value ? "bg-[#0aa3c7]/10" : ""}`}
              >
                <div className="text-sm admin-heading truncate">{c.name}</div>
                {c.email && <div className="text-xs admin-faint truncate">{c.email}</div>}
              </button>
            ))}
            {!loading && results.length === 0 && (
              <div className="px-3 py-3 text-xs admin-faint">No matching contacts.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
