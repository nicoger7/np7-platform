import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";

// Shared website copy blocks (migration 153). One template, many experiences —
// the list carries used-by counts because that number is the safety rail:
// whoever edits a template should know they are editing thirteen pages.

// GET /api/admin/content-templates → { templates: [{id, kind, name, body, usedBy}] }
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: tpls }, { data: uses }] = await Promise.all([
    db.from("content_templates").select("*").order("kind").order("name"),
    db.from("exp_content").select("method_template_id, outcomes_template_id"),
  ]);
  const count = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (uses ?? []) as any[]) {
    for (const k of [u.method_template_id, u.outcomes_template_id]) {
      if (k) count.set(k, (count.get(k) || 0) + 1);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ templates: ((tpls ?? []) as any[]).map((t) => ({ ...t, usedBy: count.get(t.id) || 0 })) });
}

// POST /api/admin/content-templates { kind, name, body } → create (e.g. "Save as new template")
export async function POST(request: Request) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  if (!body?.kind || !body?.name) return NextResponse.json({ error: "kind and name required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("content_templates")
    .insert({ kind: String(body.kind), name: String(body.name).slice(0, 120), body: body.body ?? {} })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
