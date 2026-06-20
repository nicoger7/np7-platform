import type { Database } from "@/lib/database.types";

type BlogWrite = Database["public"]["Tables"]["exp_blog_posts"]["Insert"];

/**
 * Columns the blog admin API is allowed to write. The routes use the
 * service-role client (RLS-bypassing), so the request body must be filtered to
 * these fields — otherwise a caller could mass-assign protected columns such as
 * id or created_at.
 */
const EDITABLE_FIELDS = [
  "title",
  "slug",
  "content",
  "cover_image",
  "status",
  "published_at",
  "excerpt",
  "category",
  "author",
  "template",
  "template_data",
  "world",
  "members_only",
] as const;

export function pickBlogFields(body: unknown): BlogWrite {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in src) out[key] = src[key];
  }
  // Column-level safety is enforced above; the DB validates types/constraints.
  return out as BlogWrite;
}
