"use client";

import { useState } from "react";

export type AccordionItem = {
  /** short label shown on the trigger row (e.g. "Day 1", "Q") */
  eyebrow?: string;
  title: string;
  content: React.ReactNode;
  /** optional photo shown inside the expanded panel (timeline variant) */
  image?: string;
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
        <span className="absolute left-[17px] top-3 bottom-3 w-[2px] rounded-full bg-gradient-to-b from-[#0aa3c7]/40 via-[#e6eef0] to-[#e6eef0]" aria-hidden />
      )}
      <ul className={variant === "timeline" ? "space-y-2" : "space-y-3"}>
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <li
              key={i}
              className={
                variant === "timeline"
                  ? `relative pl-12 rounded-2xl overflow-hidden transition-all duration-300 ease-out ring-1 ${isOpen ? "bg-[#f4fafc] ring-[#0aa3c7]/15" : "bg-transparent ring-transparent"} ${item.image ? (isOpen ? "md:pr-[264px] md:min-h-[176px]" : "md:min-h-0") : ""}`
                  : "border border-[#ebebeb] rounded-2xl overflow-hidden"
              }
            >
              {/* photo = full-height right panel of the open card, fading into the
                  card background — a proper media card, no floating thumbnail */}
              {variant === "timeline" && item.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className={`hidden md:block absolute inset-y-0 right-0 w-[240px] object-cover transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                  style={{
                    WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 22%)",
                    maskImage: "linear-gradient(to right, transparent 0%, #000 22%)",
                  }}
                />
              )}
              {variant === "timeline" && (
                <span
                  className={`absolute left-0 top-3 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                    isOpen
                      ? "bg-gradient-to-br from-[#00afdb] to-[#0a7ea3] text-white shadow-[0_4px_14px_rgba(0,175,219,0.4)]"
                      : "bg-white text-[#7a8a90] ring-1 ring-[#e3e9ec]"
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
                      variant === "timeline" ? "pb-4 pr-4" : "px-5 pb-5"
                    }`}
                  >
                    {variant === "timeline" && item.image ? (
                      <>
                        {item.content}
                        {/* mobile: clean full-width image below the text */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          className="md:hidden mt-4 w-full aspect-[16/9] object-cover rounded-xl"
                        />
                      </>
                    ) : (
                      item.content
                    )}
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
