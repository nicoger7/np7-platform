import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { ACCEPTABLE_CHECKS } from "@/lib/go-live";

export const dynamic = "force-dynamic";

/**
 * "Keep the standard" — recorded as the answer it is.
 *
 * Some checks can only be cleared by making the content DIFFERENT: the week
 * headline, the outcome cards, the program, the FAQ. But sharing the standard
 * week across trips is the whole point of the template system, so a trip that
 * legitimately runs it sat at 12/14 forever with ambers no amount of work could
 * close — and a checklist that cannot reach the end is one people stop reading.
 *
 * Accepting appends the check id to `exp_content.accepted_defaults` (migration
 * 160). Un-accepting removes it. Nothing else changes, so it is always
 * reversible, and the row keeps saying the content IS standard — silently going
 * green would hide the very thing the check exists to surface.
 */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  let body: { experienceId?: string; checkId?: string; accept?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { experienceId, checkId, accept } = body;
  if (!experienceId || !checkId) return NextResponse.json({ error: "Missing experience or check." }, { status: 400 });
  // Only checks where keeping the standard is genuinely an answer. Anything
  // else — a missing photo, no location, a package with no hotel — is a gap,
  // and a gap you can dismiss is a checklist that protects nothing.
  if (!ACCEPTABLE_CHECKS.has(checkId)) {
    return NextResponse.json({ error: "That check can't be answered with “keep the standard” — it needs fixing." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: row, error: readErr } = await db
    .from("exp_content").select("experience_id, accepted_defaults")
    .eq("experience_id", experienceId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });

  const current: string[] = Array.isArray(row?.accepted_defaults)
    ? row.accepted_defaults.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const next = accept === false
    ? current.filter((x) => x !== checkId)
    : Array.from(new Set([...current, checkId]));

  // The content row may not exist yet for a trip nobody has edited — upsert so
  // the first answer doesn't fail on a missing row.
  const { error } = row
    ? await db.from("exp_content").update({ accepted_defaults: next, updated_at: new Date().toISOString() }).eq("experience_id", experienceId)
    : await db.from("exp_content").insert({ experience_id: experienceId, accepted_defaults: next });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, accepted: next });
}
