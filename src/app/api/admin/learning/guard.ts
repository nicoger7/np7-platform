import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember, getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanEdit } from "@/lib/access";

/**
 * The two questions every academy route asks first.
 *
 * Reading is not a role grant — /admin/learning and its read/progress routes are
 * registered as personal paths in src/lib/access.ts, so every active team member
 * reaches them whatever their role. Authoring is: it runs under the `learning`
 * section, and the middleware already refuses a write from a view-only role.
 * `requireAuthor` repeats that check at the route because the middleware only
 * ever sees the request path, and a route that trusts an upstream guard is one
 * matcher edit away from being open.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = any;

export function learningDb(): DB {
  return createAdminClient() as DB;
}

/** The signed-in team member, or null if the session isn't one. */
export async function actingMember(): Promise<{ id: string; name: string; roleIds: string[] } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const member = await getActiveTeamMember(user);
  if (!member) return null;
  const { data } = await learningDb().from("team_members").select("name").eq("id", member.id).maybeSingle();
  return { id: member.id, name: (data?.name as string) ?? "", roleIds: member.roleIds ?? [] };
}

/** Reject an authoring request from someone who may only read the academy.
 *  Returns a response to return, or null to proceed. */
export async function requireAuthor(): Promise<NextResponse | null> {
  const access = await getRequestAccess();
  // A null here means the session vanished mid-flight, so fail closed.
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!effectiveCanEdit(access, "/api/admin/learning/courses")) {
    return NextResponse.json({ error: "You can read the academy, but not edit it." }, { status: 403 });
  }
  return null;
}

/** "" → null, so clearing a field stores NULL rather than an empty string. */
export function clean(v: unknown): unknown {
  return v === "" ? null : v;
}

/** Copy only the whitelisted keys out of a request body. The whitelist is the
 *  only place a column becomes writable — note what is absent from both:
 *  id, course_id, created_at. A lesson does not change course by PATCH. */
export function pick<T extends string>(body: Record<string, unknown>, keys: readonly T[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = clean(body[k]);
  return out;
}

export const COURSE_FIELDS = [
  "slug", "title", "summary", "description", "icon", "sort_order", "status",
  "role_ids", "required", "owner_id", "reviewed_at", "review_every_days",
] as const;

export const LESSON_FIELDS = [
  "slug", "title", "summary", "body", "video_url", "minutes",
  "sort_order", "status", "route_hint", "takeaways",
] as const;
