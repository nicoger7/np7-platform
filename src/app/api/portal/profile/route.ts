import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { normalizeUsername, parseVisibility } from "@/lib/member-profile";

// PUT — a member updates their own profile (details, marketing consent, and the
// opt-in community profile). The community fields (migration 035) are written in
// a separate, tolerant update so the base details always save even before the
// migration is applied.
export async function PUT(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;

  const body = await request.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

  // base, always-present fields
  const base: Record<string, unknown> = {};
  if (str(body.name) !== undefined) base.name = str(body.name);
  if (str(body.phone) !== undefined) base.phone = str(body.phone);
  if (str(body.country) !== undefined) base.country = str(body.country);
  if (str(body.tshirt_size) !== undefined) {
    // The DB CHECK constraint allows only lowercase sizes (or null) — normalise
    // so an uppercase value or an empty "Select…" never 400s the whole save.
    const t = str(body.tshirt_size)?.toLowerCase();
    base.tshirt_size = t && ["xs", "s", "m", "l", "xl", "xxl"].includes(t) ? t : null;
  }
  if (str(body.diet_allergies) !== undefined) base.diet_allergies = str(body.diet_allergies);
  if (str(body.date_of_birth) !== undefined) base.date_of_birth = str(body.date_of_birth) || null;
  if (typeof body.marketing_opt_in === "boolean") {
    base.marketing_opt_in = body.marketing_opt_in;
    base.marketing_opt_in_at = body.marketing_opt_in ? new Date().toISOString() : null;
  }
  base.updated_at = new Date().toISOString();

  // community-profile fields (migration 035)
  const community: Record<string, unknown> = {};
  if ("username" in body) {
    const u = normalizeUsername(body.username);
    if ("error" in u) return NextResponse.json({ error: u.error, field: "username" }, { status: 400 });
    community.username = u.value === "" ? null : u.value;
  }
  if ("avatar_url" in body) community.avatar_url = str(body.avatar_url) || null;
  if ("display_city" in body) community.display_city = str(body.display_city) || null;
  if ("profile_visibility" in body) community.profile_visibility = parseVisibility(body.profile_visibility);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // username uniqueness (best-effort: pre-migration the column is missing → the
  // query errors and we just skip the community write below)
  let communityAvailable = true;
  if (typeof community.username === "string") {
    const { data: clash, error } = await db.from("contacts")
      .select("id").eq("username", community.username).neq("id", auth.user.contactId).maybeSingle();
    if (error) communityAvailable = false;
    else if (clash) return NextResponse.json({ error: "That username is taken.", field: "username" }, { status: 400 });
  }

  const { error: baseErr } = await db.from("contacts").update(base).eq("id", auth.user.contactId);
  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 });

  if (communityAvailable && Object.keys(community).length) {
    const { error: cErr } = await db.from("contacts").update(community).eq("id", auth.user.contactId);
    if (cErr) return NextResponse.json({ ok: true, communityUnavailable: true });
  }
  return NextResponse.json({ ok: true });
}
