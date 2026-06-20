import type { ReactNode } from "react";

/**
 * Icon set shared by the blog admin (template picker) and the public pages
 * (template chips + key-fact strip). Keys are referenced from
 * src/lib/blog-templates.ts (template `icon` and field `factIcon`).
 */
const P = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  // template icons
  article: (<><path d="M4 5h16M4 10h16M4 15h10" {...P} /></>),
  review: (<><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" {...P} /></>),
  rocket: (<><path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 11a4 4 0 015-5c2 0 3 1 3 3a4 4 0 01-5 5" {...P} /><path d="M14 7l3 3M9 11l4 4-3 3-4-4 3-3z" {...P} /></>),
  pin: (<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" {...P} /><circle cx="12" cy="10" r="2.6" {...P} /></>),
  academy: (<><path d="M12 4l9 4-9 4-9-4 9-4z" {...P} /><path d="M6 10v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4" {...P} /></>),

  // fact icons
  star: (<><path d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 15.8 7.4 18.2l.9-5.1L4.5 9.5l5.2-.8L12 4z" {...P} /></>),
  target: (<><circle cx="12" cy="12" r="8" {...P} /><circle cx="12" cy="12" r="3.4" {...P} /></>),
  tag: (<><path d="M4 12V5h7l9 9-7 7-9-9z" {...P} /><circle cx="8.5" cy="8.5" r="1.4" {...P} /></>),
  calendar: (<><rect x="4" y="5" width="16" height="16" rx="2" {...P} /><path d="M16 3v4M8 3v4M4 11h16" {...P} /></>),
  box: (<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" {...P} /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...P} /></>),
  sun: (<><circle cx="12" cy="12" r="4" {...P} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" {...P} /></>),
  wind: (<><path d="M3 8h11a3 3 0 10-3-3M3 16h15a3 3 0 11-3 3M3 12h9" {...P} /></>),
  wave: (<><path d="M3 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M3 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" {...P} /></>),
  gauge: (<><path d="M5 19a8 8 0 1114 0" {...P} /><path d="M12 14l4-3" {...P} /></>),
  sail: (<><path d="M12 3v15M12 3C8 6 5 11 4 18h8M19 18l-3-9" {...P} /><path d="M3 21h18" {...P} /></>),
  clock: (<><circle cx="12" cy="12" r="8" {...P} /><path d="M12 8v4l3 2" {...P} /></>),
  family: (<><circle cx="8" cy="8" r="2.6" {...P} /><circle cx="16.5" cy="9" r="2.1" {...P} /><path d="M3.5 19v-1.5a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4V19M14 19v-1a3.2 3.2 0 0 1 3.2-3.2h.6A3.2 3.2 0 0 1 21 18v1" {...P} /></>),
};

export function BlogIcon({ name, className = "w-4 h-4" }: { name: string; className?: string }) {
  const body = ICONS[name];
  if (!body) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}
