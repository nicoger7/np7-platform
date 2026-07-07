import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * Member self-logs a skill ("I can do this") — verified_via='self'.
 *
 * Self-logs unlock the next skills in the chain and pre-fill the coach's
 * verify list on a trip, but NEVER count toward rank (that needs a coach or
 * the Wind Coach App). Never downgrades an existing verification; DELETE
 * only removes a member's own self-log.
 */

async function requireUser() {
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  return user ?? null;
}

async function parseMilestoneId(request: NextRequest): Promise<string | null> {
  try {
    const body = (await request.json()) as { milestoneId?: string };
    const id = (body.milestoneId ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const milestoneId = await parseMilestoneId(request);
  if (!milestoneId) return NextResponse.json({ error: "Missing skill." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: milestone } = await db
    .from("level_milestones").select("id").eq("id", milestoneId).eq("active", true).maybeSingle();
  if (!milestone) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });

  const { data: existing } = await db
    .from("contact_milestones").select("verified_via")
    .eq("contact_id", user.contactId).eq("milestone_id", milestoneId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, via: existing.verified_via }); // never downgrade

  const { error } = await db.from("contact_milestones").insert({
    contact_id: user.contactId,
    milestone_id: milestoneId,
    verified_via: "self",
    achieved_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, via: "self" });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const milestoneId = await parseMilestoneId(request);
  if (!milestoneId) return NextResponse.json({ error: "Missing skill." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Only a member's own SELF log can be undone — coach/Wind Coach App stay.
  const { error } = await db
    .from("contact_milestones").delete()
    .eq("contact_id", user.contactId).eq("milestone_id", milestoneId).eq("verified_via", "self");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
