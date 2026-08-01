import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS, CANNOT_DISABLE } from "@/lib/email/automations";

/**
 * POST { templateKey, enabled } — the per-email master switch.
 *
 * Upserts, because most automations have no `email_templates` row until someone
 * edits their wording: switching a mail off must work whether or not anyone has
 * ever customised it.
 */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const templateKey = typeof body?.templateKey === "string" ? body.templateKey : "";
  const enabled = body?.enabled !== false;

  const automation = AUTOMATIONS.find((a) => a.key === templateKey);
  if (!automation) return NextResponse.json({ error: "Unknown email." }, { status: 404 });

  if (!enabled && CANNOT_DISABLE.has(templateKey)) {
    return NextResponse.json(
      { error: "This is how members sign in — switching it off would lock them out." },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("email_templates")
    .upsert({ template_key: templateKey, name: automation.name, enabled }, { onConflict: "template_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, templateKey, enabled });
}
