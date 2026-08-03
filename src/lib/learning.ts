/**
 * The staff academy — shared shapes and the few pure helpers both halves need.
 *
 * Pure on purpose (no next/headers, no supabase): the reader pages, the author
 * pages and the API routes all import from here, and anything server-only in
 * this module would break the client bundle the moment a page imported a type.
 * The write guard lives in the routes themselves for exactly that reason.
 */

import { youtubeId } from "./youtube";

export type LearningStatus = "draft" | "published";

export type LearningCourse = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number;
  status: LearningStatus;
  role_ids: string[];
  required: boolean;
  owner_id: string | null;
  reviewed_at: string | null;
  review_every_days: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type LearningLesson = {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  video_url: string | null;
  minutes: number;
  sort_order: number;
  status: LearningStatus;
  route_hint: string | null;
  takeaways: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** A lesson as the reader receives it in a catalog listing — no body, so the
 *  home screen stays small however long the lessons get. */
export type LessonCard = Pick<
  LearningLesson,
  "id" | "slug" | "title" | "summary" | "minutes" | "sort_order" | "route_hint" | "status"
> & { completed: boolean };

export type CourseCard = Pick<
  LearningCourse,
  "id" | "slug" | "title" | "summary" | "description" | "icon" | "required" | "sort_order" | "status"
> & {
  lessons: LessonCard[];
  /** Set when the course names roles and this reader holds one of them. */
  for_me: boolean;
};

/** The colour a course card and its progress bar take. Keyed by icon so a course
 *  keeps one identity across the home screen, the course page and the lesson. */
export const COURSE_ICONS: { key: string; label: string; color: string }[] = [
  { key: "grid", label: "Admin / screens", color: "#0aa3c7" },
  { key: "compass", label: "Coaching / on the water", color: "#f47b20" },
  { key: "users", label: "People / guests", color: "#7c5cff" },
  { key: "box", label: "Gear / hardware", color: "#c2ff38" },
  { key: "receipt", label: "Money / admin paperwork", color: "#10b981" },
  { key: "shield", label: "Safety / rules", color: "#e11d48" },
];

export function courseColor(icon: string | null | undefined): string {
  return COURSE_ICONS.find((i) => i.key === icon)?.color ?? "#0aa3c7";
}

/**
 * Admin paths worth pointing a lesson at, offered as suggestions rather than a
 * closed list. The nav lives in admin-shell.tsx, which is a client component —
 * importing it into an API route would drag the whole shell server-side — and a
 * hard-coded `<select>` would silently stop covering pages added later. So this
 * feeds a `<datalist>`: the common answers are one keystroke away, anything else
 * is still typeable.
 */
export const ROUTE_HINT_SUGGESTIONS = [
  "/admin",
  "/admin/bookings",
  "/admin/contacts",
  "/admin/experiences",
  "/admin/editions",
  "/admin/packages",
  "/admin/components",
  "/admin/hotel-rooms",
  "/admin/hotels",
  "/admin/payments",
  "/admin/vouchers",
  "/admin/campaigns",
  "/admin/emails",
  "/admin/content",
  "/admin/images",
  "/admin/members",
  "/admin/skills",
  "/admin/go-live",
  "/admin/archive",
  "/admin/hours-log",
];

/** Slugs the router already owns under /admin/learning — a course may not take
 *  one, or its reader page would never render. */
export const RESERVED_COURSE_SLUGS = ["manage", "new", "api"];

export function slugifyLearning(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A YouTube/Vimeo link → an embeddable src, or null if it is neither. Authors
 *  paste whatever the share button gave them; nobody should have to know the
 *  difference between a watch URL and an embed URL. */
export function videoEmbedSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vimeo = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * How stale a course is allowed to be, as a traffic light — the same vocabulary
 * as the Launch check legend so nobody has to learn a second one.
 *
 * Never-reviewed reads amber, not red: a course written yesterday is not rotten,
 * it just has not been through a review cycle yet.
 */
export type Freshness = { tone: "ok" | "due" | "overdue"; color: string; label: string };

export function freshness(reviewedAt: string | null, everyDays: number): Freshness {
  if (!reviewedAt) return { tone: "due", color: "#f0a500", label: "never reviewed" };
  const days = Math.floor((Date.now() - new Date(reviewedAt).getTime()) / 86_400_000);
  if (days > everyDays) return { tone: "overdue", color: "#e11d48", label: `${days}d — review overdue` };
  if (days > everyDays * 0.75) return { tone: "due", color: "#f0a500", label: `${days}d — review soon` };
  return { tone: "ok", color: "#10b981", label: `reviewed ${days}d ago` };
}

/** Lessons done / lessons published, plus the phrasing the UI shows. Counts only
 *  published lessons, so a draft in progress never dents anyone's progress. */
export function courseProgress(lessons: LessonCard[]): { done: number; total: number; pct: number } {
  const live = lessons.filter((l) => l.status === "published");
  const done = live.filter((l) => l.completed).length;
  return { done, total: live.length, pct: live.length ? Math.round((done / live.length) * 100) : 0 };
}

export function readingTime(lessons: LessonCard[]): number {
  return lessons.filter((l) => l.status === "published").reduce((n, l) => n + (l.minutes || 0), 0);
}
