"use client";

import { useEffect, useRef, useState } from "react";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** delay in ms before the reveal animation starts */
  delay?: number;
  /** translate direction on enter */
  from?: "up" | "down" | "left" | "right" | "none";
  as?: "div" | "section" | "li" | "article";
};

const OFFSET: Record<NonNullable<RevealProps["from"]>, string> = {
  up: "translate-y-8",
  down: "-translate-y-8",
  left: "translate-x-8",
  right: "-translate-x-8",
  none: "",
};

/**
 * Fades + slides its children into view the first time they enter the viewport.
 * Uses IntersectionObserver (broad support) and honours prefers-reduced-motion
 * via the `.reveal` class hook in globals.css.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  from = "up",
  as = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as as "div";

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${OFFSET[from]}`
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
