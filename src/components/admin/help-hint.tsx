"use client";

import { useEffect, useRef, useState } from "react";
import { GLOSSARY } from "@/lib/hardware/glossary";

/**
 * A small (?) next to a field label that opens a plain-language explanation.
 * Click-to-open (not hover) so it works on the phone at a boat show; closes on
 * outside click or Escape. Content lives in the glossary so wording stays
 * consistent wherever the same term appears.
 */
export function HelpHint({ term, align = "left" }: { term: keyof typeof GLOSSARY | string; align?: "left" | "right" }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <span className="relative inline-flex align-middle" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`What is ${entry.title.split("—")[0].trim()}?`}
        aria-expanded={open}
        className="w-[15px] h-[15px] ml-1 grid place-items-center rounded-full text-[10px] font-bold leading-none transition-colors"
        style={{
          border: "1px solid var(--admin-border-strong)",
          color: open ? "var(--admin-accent-contrast)" : "var(--admin-text-faint)",
          backgroundColor: open ? "var(--admin-accent)" : "transparent",
        }}
      >
        ?
      </button>

      {open && (
        <span
          role="dialog"
          className="absolute z-50 top-6 w-[320px] sm:w-[380px] rounded-xl p-4 text-left font-normal normal-case tracking-normal block"
          style={{
            [align === "right" ? "right" : "left"]: 0,
            backgroundColor: "var(--admin-surface)",
            border: "1px solid var(--admin-border-strong)",
            boxShadow: "var(--admin-shadow)",
          }}
        >
          <span className="block text-[13px] font-bold admin-heading mb-1.5">{entry.title}</span>
          <span className="block text-[12px] leading-relaxed admin-muted">{entry.intro}</span>

          {entry.rows && (
            <span className="block mt-3 space-y-2">
              {entry.rows.map((r) => (
                <span key={r.term} className="block">
                  <span className="block text-[11.5px] font-bold admin-heading">{r.term}</span>
                  <span className="block text-[11.5px] leading-relaxed admin-faint">{r.text}</span>
                </span>
              ))}
            </span>
          )}

          {entry.footer && (
            <span
              className="block mt-3 pt-2.5 text-[11.5px] leading-relaxed admin-muted"
              style={{ borderTop: "1px solid var(--admin-border)" }}
            >
              {entry.footer}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
