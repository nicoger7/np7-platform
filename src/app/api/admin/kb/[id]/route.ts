import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { KB_TEMPLATES } from "@/lib/kb-config";

export const dynamic = "force-dynamic";

/** GET — the entry with its sections, template-merged: every template section
 *  appears (existing row or a virtual "missing" one), in template order. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: entry } = await db.from("kb_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: rows } = await db.from("kb_sections").select("*").eq("entry_id", id);
  const tpl = KB_TEMPLATES[entry.kind as "skill" | "equipment"] ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKey = new Map(((rows ?? []) as any[]).map((r) => [r.section_key, r]));
  const sections = tpl.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = byKey.get(t.key) as any;
    return {
      key: t.key, label: t.label, hint: t.hint, questions: t.questions,
      content: r?.content ?? "", status: r?.status ?? "missing",
      openQuestions: Array.isArray(r?.open_questions) ? r.open_questions : t.questions,
    };
  });
  return NextResponse.json({ entry, sections });
}

/** PATCH — entry fields and/or one section's content/status. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  for (const k of ["title", "summary", "website_visible", "status", "sort_order"]) if (k in body) patch[k] = body[k];
  if (Object.keys(patch).length) {
    const { error } = await db.from("kb_entries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.section?.key) {
    const s = body.section;
    const row = {
      entry_id: id, section_key: s.key,
      ...(s.content != null ? { content: String(s.content) } : {}),
      ...(s.status ? { status: s.status } : {}),
      ...(Array.isArray(s.openQuestions) ? { open_questions: s.openQuestions } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("kb_sections").upsert(row, { onConflict: "entry_id,section_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
