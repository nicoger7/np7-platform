"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "How does this page work?" — answered on the page.
 *
 * The admin track of the Academy is reference material, and reference material
 * you have to remember to go and open is reference material nobody opens twice.
 * Every lesson carries a route hint, so whichever admin page you are standing
 * on can offer the lesson that covers it.
 *
 * Deliberately quiet: a small link in the sidebar footer, nothing when no
 * lesson matches. It should feel like a signpost, not a tour guide.
 */
export function PageHelp() {
  const pathname = usePathname();
  const [lesson, setLesson] = useState<{ href: string; title: string; minutes: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    setLesson(null);
    fetch(`/api/admin/learning/help?path=${encodeURIComponent(pathname)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setLesson(d.lesson ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  if (!lesson) return null;
  return (
    <Link
      href={lesson.href}
      className="flex items-center gap-1.5 text-[11px] transition-colors hover:text-[var(--admin-accent)]"
      style={{ color: "var(--admin-text-faint)" }}
      title={`Academy: ${lesson.title}`}
    >
      <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.6.3-1 .9-1 1.7" />
        <path d="M12 17h.01" />
      </svg>
      <span className="truncate">How this page works{lesson.minutes ? ` · ${lesson.minutes} min` : ""}</span>
    </Link>
  );
}
