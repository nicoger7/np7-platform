import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { revalidateExperience } from "@/lib/revalidate-public";

// PATCH /api/admin/content-templates/[id] { name?, body? } — editing a template
// edits every experience that follows it; the caller shows the used-by count
// before letting anyone pull that trigger.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const input = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim().slice(0, 120);
  if (input.body && typeof input.body === "object") patch.body = input.body;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("content_templates").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Every follower's public page just changed — refresh the whole pattern.
  revalidateExperience();
  return NextResponse.json({ template: data });
}

// DELETE — only when nothing follows it (a used template disappearing would
// silently revert thirteen pages to the built-in default).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: uses } = await db
    .from("exp_content")
    .select("id")
    .or(`method_template_id.eq.${id},outcomes_template_id.eq.${id}`)
    .limit(1);
  if ((uses ?? []).length) {
    return NextResponse.json({ error: "This template is in use — point those experiences elsewhere first." }, { status: 409 });
  }
  const { error } = await db.from("content_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
