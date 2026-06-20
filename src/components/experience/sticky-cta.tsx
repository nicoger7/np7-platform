"use client";

import { useEffect, useState } from "react";

type Props = {
  title: string;
  priceFrom: number;
  currency?: string;
  spotsLeft?: number | null;
  /** anchor to scroll to when the button is clicked */
  target?: string;
};

/**
 * Fixed bottom booking bar. Slides up once the user scrolls past the hero,
 * keeping price + urgency + CTA one tap away at all times. Mobile-first.
 */
export function StickyCta({
  title,
  priceFrom,
  currency = "€",
  spotsLeft,
  target = "#packages",
}: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 transition-transform duration-300 ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-[#111]/95 backdrop-blur-lg border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-3 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white truncate">{title}</p>
            <div className="flex items-center gap-2.5 text-[12px]">
              <span className="text-white/60">
                from <span className="text-white font-bold">{currency}{priceFrom.toLocaleString("en-US")}</span>
              </span>
              {typeof spotsLeft === "number" && spotsLeft > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[#5fd0e8] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
                  {spotsLeft} spots left
                </span>
              )}
            </div>
          </div>
          <a
            href={target}
            className="shrink-0 px-6 py-3 rounded-full text-[13px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_16px_rgba(10,163,199,0.3)] hover:bg-[#0bb6dd] transition-colors"
          >
            Reserve
          </a>
        </div>
      </div>
    </div>
  );
}
