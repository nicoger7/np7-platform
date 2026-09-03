import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { KB_TEMPLATES, openQuestionsFor, sectionStatus, type KbSectionTemplate } from "@/lib/kb-config";

export const dynamic = "force-dynamic";

/** Released the moment a section is created: the guest-facing sentence, and
 *  nothing else. Other fields may be released, but a person has to say so. */
const defaultPublic = (t: KbSectionTemplate) => t.fields.filter((f) => f.publicByDefault).map((f) => f.key);

/**
 * GET — the entry with its sections, spec-merged: every section of the
 * template appears in order, backed by a stored row or an empty one.
 *
 * Status and open questions are COMPUTED here from the data, never read back
 * from what the assistant claimed. Two bugs died with that change: a section a
 * coach had typed into stayed marked "missing" because the client's `undefined`
 * status never reached the upsert, and a question the coach had just answered
 * by hand kept being asked until someone re-ran the assistant.
 */
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
    const data = (r?.data ?? {}) as Record<string, unknown>;
    return {
      key: t.key,
      label: t.label,
      hint: t.hint,
      fields: t.fields,
      data,
      status: sectionStatus(t, data),
      openQuestions: openQuestionsFor(t, data),
      publicFields: Array.isArray(r?.public_fields) ? (r.public_fields as string[]) : defaultPublic(t),
      canUndo: !!r?.previous_data,
      /** Markdown parked by migration 202 on a non-production database. */
      legacyNotes: typeof data.legacy_notes === "string" ? data.legacy_notes : null,
    };
  });

  const complete = sections.filter((s) => s.status === "complete").length;
  return NextResponse.json({ entry, sections, progress: { complete, total: tpl.length } });
}

/** PATCH — entry fields, and/or one section's data and released fields. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { data: entry } = await db.from("kb_entries").select("id, kind").eq("id", id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tpl = KB_TEMPLATES[entry.kind as "skill" | "equipment"] ?? [];

  const patch: Record<string, unknown> = {};
  for (const k of ["title", "summary", "website_visible", "sort_order"]) if (k in body) patch[k] = body[k];
  if (Object.keys(patch).length) {
    const { error } = await db.from("kb_entries").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (body.section?.key) {
    const s = body.section;
    const t = tpl.find((x) => x.key === s.key);
    if (!t) return NextResponse.json({ error: "Unknown section" }, { status: 400 });
    const data = (s.data ?? {}) as Record<string, unknown>;
    /* Released fields are only ever set by a person, and only to fields the
       template actually allows out. A rogue payload cannot publish the
       coaching method by naming a field that was never meant to be public. */
    const allowed = new Set(t.fields.filter((f) => f.public).map((f) => f.key));
    const row = {
      entry_id: id,
      section_key: s.key,
      ...(s.data != null
        ? { data, status: sectionStatus(t, data), open_questions: openQuestionsFor(t, data) }
        : {}),
      ...(Array.isArray(s.publicFields)
        ? { public_fields: (s.publicFields as string[]).filter((k) => allowed.has(k)) }
        : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("kb_sections").upsert(row, { onConflict: "entry_id,section_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    /* The entry is complete when every section is, recomputed from what is
       stored. The old code decided this from the assistant's response array,
       so braindumping about one section alone demoted a finished entry. */
    const { data: all } = await db.from("kb_sections").select("section_key,data").eq("entry_id", id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stored = new Map(((all ?? []) as any[]).map((r) => [r.section_key, r.data ?? {}]));
    const done = tpl.every((x) => sectionStatus(x, (stored.get(x.key) ?? {}) as Record<string, unknown>) === "complete");
    await db.from("kb_entries").update({ status: done ? "complete" : "draft", updated_at: new Date().toISOString() }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
