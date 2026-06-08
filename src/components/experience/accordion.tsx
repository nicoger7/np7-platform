"use client";

import { useState } from "react";

export type AccordionItem = {
  /** short label shown on the trigger row (e.g. "Day 1", "Q") */
  eyebrow?: string;
  title: string;
  content: React.ReactNode;
};

type AccordionProps = {
  items: AccordionItem[];
  /** index open by default; null = all closed */
  defaultOpen?: number | null;
  /** allow multiple panels open at once */
  allowMultiple?: boolean;
  variant?: "timeline" | "plain";
};

export function Accordion({
  items,
  defaultOpen = null,
  allowMultiple = false,
  variant = "plain",
}: AccordionProps) {
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(defaultOpen === null ? [] : [defaultOpen])
  );

  const toggle = (i: number) => {
    setOpen((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className={variant === "timeline" ? "relative" : ""}>
      {variant === "timeline" && (
        <span className="absolute left-[15px] top-2 bottom-2 w-px bg-[#ebebeb]" aria-hidden />
      )}
      <ul className="space-y-3">
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <li
              key={i}
              className={
                variant === "timeline"
                  ? "relative pl-12"
                  : "border border-[#ebebeb] rounded-2xl overflow-hidden"
              }
            >
              {variant === "timeline" && (
                <span
                  className={`absolute left-0 top-3 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                    isOpen ? "bg-[#0aa3c7] text-white" : "bg-[#f0f0f0] text-[#777]"
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
              )}
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className={`w-full flex items-center justify-between gap-4 text-left ${
                    variant === "timeline"
                      ? "py-3"
                      : "px-5 py-4 hover:bg-[#fafafa]"
                  } transition-colors`}
                >
                  <span className="min-w-0">
                    {item.eyebrow && (
                      <span className="block text-[10px] font-bold tracking-[0.18em] uppercase text-[#0aa3c7] mb-0.5">
                        {item.eyebrow}
                      </span>
                    )}
                    <span className="block text-[15px] font-bold text-[#111] tracking-[-0.01em]">
                      {item.title}
                    </span>
                  </span>
                  <svg
                    className={`shrink-0 w-5 h-5 text-[#999] transition-transform duration-300 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </h3>
              <div
                className={`grid transition-all duration-300 ease-out ${
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div
                    className={`text-[14.5px] text-[#555] leading-relaxed ${
                      variant === "timeline" ? "pb-4 pr-2" : "px-5 pb-5"
                    }`}
                  >
                    {item.content}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
