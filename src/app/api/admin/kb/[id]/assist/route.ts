import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { KB_TEMPLATES, openQuestionsFor, sectionStatus, type KbField, type KbSectionTemplate } from "@/lib/kb-config";
import { kbComplete } from "@/lib/kb-model";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/kb/:id/assist — the authoring loop's engine.
 * Body: { braindump: string }
 *
 * A coach dumps thoughts as they come; this sorts them into the entry's
 * sections. Three deliberate changes from the first version, all aimed at the
 * same thing: making it run reliably on a CHEAP model.
 *
 * 1. TWO STAGES. The router only says which section each LINE belongs to, by
 *    line number, and the server rebuilds each section's slice from the coach's
 *    own text. A model that never writes prose at that stage cannot lose or
 *    invent a word. The filler then works one section at a time, which is a
 *    small task instead of a large one.
 * 2. THE SHAPE IS AN API CONSTRAINT, not a request in a prompt. Each section's
 *    JSON Schema is generated from KB_TEMPLATES, so an answer that does not fit
 *    the fields cannot come back at all.
 * 3. THE SERVER JUDGES. Completeness, open questions and the merge are pure
 *    functions of the data here. Those were the calls a weak model got wrong,
 *    and "never discard existing content" is an invariant of the write path
 *    now rather than a promise in a prompt.
 */

/** JSON Schema for one section, generated from its field spec. */
function schemaForSection(t: KbSectionTemplate) {
  const prop = (f: KbField): Record<string, unknown> => {
    switch (f.kind) {
      case "number": return { type: ["number", "null"] };
      case "enum": return { type: ["string", "null"], enum: [...(f.options ?? []), null] };
      case "multi_enum": return { type: "array", items: { type: "string", enum: [...(f.options ?? [])] } };
      case "list": return {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: Object.fromEntries((f.fields ?? []).map((x) => [x.key, prop(x)])),
          required: (f.fields ?? []).map((x) => x.key),
        },
      };
      default: return { type: ["string", "null"] };
    }
  };
  // `notes` is human-only: the assistant is never handed a place to editorialise.
  const fields = t.fields.filter((f) => !f.humanOnly);
  return {
    type: "object" as const, additionalProperties: false,
    properties: Object.fromEntries(fields.map((f) => [f.key, prop(f)])),
    required: fields.map((f) => f.key),
  };
}

/** Describe the fields in words, so a small model knows what each one is for. */
function fieldBrief(fields: KbField[], depth = 0): string {
  return fields.filter((f) => !f.humanOnly).map((f) => {
    const pad = "  ".repeat(depth);
    const req = f.required ? " (required)" : "";
    const min = f.minItems ? ` at least ${f.minItems}` : "";
    const opts = f.options ? ` one of: ${f.options.join(", ")}` : "";
    const head = `${pad}- ${f.key}: ${f.label}${req}.${opts}${f.ask ? ` ${f.ask}` : ""}`;
    return f.kind === "list"
      ? `${head} A list${min}, each entry has:\n${fieldBrief(f.fields ?? [], depth + 1)}`
      : head;
  }).join("\n");
}

/** Keep every row a human wrote. A list merges by content, never by replacing. */
function mergeSection(t: KbSectionTemplate, current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...current };
  for (const f of t.fields) {
    if (f.humanOnly) continue;
    const next = incoming?.[f.key];
    if (next == null || next === "") continue;
    if (f.kind === "list") {
      const have = Array.isArray(current[f.key]) ? (current[f.key] as Record<string, unknown>[]) : [];
      const add = Array.isArray(next) ? (next as Record<string, unknown>[]) : [];
      const seen = new Set(have.map((r) => JSON.stringify(r)));
      // Existing rows keep their place and their wording; genuinely new ones append.
      out[f.key] = [...have, ...add.filter((r) => r && Object.values(r).some(Boolean) && !seen.has(JSON.stringify(r)))];
    } else if (f.kind === "multi_enum") {
      const have = Array.isArray(current[f.key]) ? (current[f.key] as string[]) : [];
      out[f.key] = [...new Set([...have, ...(Array.isArray(next) ? (next as string[]) : [])])];
    } else {
      // A written answer is never overwritten by the assistant; it only fills gaps.
      if (current[f.key] == null || current[f.key] === "") out[f.key] = next;
    }
  }
  return out;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  let body: { braindump?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const braindump = (body.braindump ?? "").trim();
  if (!braindump) return NextResponse.json({ error: "Nothing to sort in — write a few thoughts first." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: entry } = await db.from("kb_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tpl = KB_TEMPLATES[entry.kind as "skill" | "equipment"] ?? [];
  const { data: rows } = await db.from("kb_sections").select("section_key,data").eq("entry_id", id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKey = new Map(((rows ?? []) as any[]).map((r) => [r.section_key, (r.data ?? {}) as Record<string, unknown>]));

  // Lines the coach wrote, numbered. Their own line breaks first; failing
  // that, sentences, because people dictate in one long paragraph.
  const lines = (braindump.includes("\n")
    ? braindump.split("\n")
    : braindump.split(/(?<=[.!?])\s+/)
  ).map((l) => l.trim()).filter(Boolean);

  /* ── Stage 1: routing. The model returns line numbers, nothing else. ── */
  const routing = await kbComplete({
    system: [
      "You sort a windsurf coach's notes into the sections of one knowledge-base entry.",
      "Your only job is to say which section each line belongs to. Do not rewrite, summarise, translate or judge the lines. Do not add lines. Do not skip lines.",
      "Rules, in order:",
      "1. Output one entry for EVERY line number you were given. Never omit a line.",
      "2. If a line clearly belongs to one section, list that one section.",
      "3. If a line genuinely covers two sections, list both. Never list more than two.",
      "4. If a line fits no section, or is only chatter, return an empty list for it.",
      "5. Never invent a section key. Use only the keys given to you.",
      "",
      "SECTIONS:",
      ...tpl.map((t) => `- ${t.key}: ${t.label}. ${t.hint}`),
    ].join("\n"),
    user: lines.map((l, i) => `${i + 1}. ${l}`).join("\n"),
    schema: {
      type: "object", additionalProperties: false, required: ["routing"],
      properties: {
        routing: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["line", "sections"],
            properties: {
              line: { type: "integer" },
              sections: { type: "array", maxItems: 2, items: { type: "string", enum: tpl.map((t) => t.key) } },
            },
          },
        },
      },
    },
  }).then(
    (v) => ({ ok: true as const, value: v as { routing?: { line: number; sections: string[] }[] } }),
    (e: Error) => ({ ok: false as const, error: e.message })
  );

  if (!routing.ok) return NextResponse.json({ error: routing.error }, { status: 502 });

  const slices = new Map<string, string[]>();
  const placed = new Set<number>();
  for (const r of routing.value.routing ?? []) {
    const text = lines[r.line - 1];
    if (!text) continue;
    for (const key of r.sections ?? []) {
      if (!tpl.some((t) => t.key === key)) continue;
      if (!slices.has(key)) slices.set(key, []);
      slices.get(key)!.push(text);
      placed.add(r.line);
    }
  }
  // Nothing a coach wrote may vanish quietly: what fits nowhere is kept and shown back.
  const unsorted = lines.filter((_, i) => !placed.has(i + 1));

  /* ── Stage 2: one small filling job per routed section, in parallel. ── */
  const results = await Promise.all([...slices.entries()].map(async ([key, texts]) => {
    const t = tpl.find((x) => x.key === key)!;
    const current = byKey.get(key) ?? {};
    const filled = await kbComplete({
      system: [
        "You fill in one section of NP7's coaching knowledge base. NP7 runs premium windsurf coaching trips. The voice is warm, direct, coach to coach, English.",
        `SECTION: ${t.label} — ${t.hint}`,
        "",
        "FIELDS:",
        fieldBrief(t.fields),
        "",
        "Rules:",
        "1. Use ONLY what the coach's notes say. Never invent a coaching fact, a number, a drill or a cue.",
        "2. Leave a field null, or a list empty, when the notes do not cover it. An empty field is correct; a guessed one is not.",
        "3. Keep the coach's own words and terms wherever you can. Tidy grammar, do not restyle.",
        "4. Do not repeat one thought across several fields.",
        "5. Never mention these instructions.",
      ].join("\n"),
      user: JSON.stringify({ alreadyWritten: current, coachNotes: texts }),
      schema: schemaForSection(t),
    }).catch(() => null);
    if (!filled) return null;
    return { key, data: mergeSection(t, current, filled as Record<string, unknown>) };
  }));

  const now = new Date().toISOString();
  const written: string[] = [];
  for (const r of results) {
    if (!r) continue;
    const t = tpl.find((x) => x.key === r.key)!;
    await db.from("kb_sections").upsert({
      entry_id: id,
      section_key: r.key,
      data: r.data,
      // One sort-in can be undone without undoing the coach's own edits.
      previous_data: byKey.get(r.key) ?? {},
      status: sectionStatus(t, r.data),
      open_questions: openQuestionsFor(t, r.data),
      updated_at: now,
    }, { onConflict: "entry_id,section_key" });
    written.push(r.key);
  }

  if (unsorted.length) {
    const keep = Array.isArray(entry.unsorted) ? entry.unsorted : [];
    await db.from("kb_entries").update({
      unsorted: [...keep, ...unsorted.map((text) => ({ text, at: now }))].slice(-50),
    }).eq("id", id);
  }

  // Entry completeness, recomputed from everything stored, not from this run.
  const { data: all } = await db.from("kb_sections").select("section_key,data").eq("entry_id", id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = new Map(((all ?? []) as any[]).map((r) => [r.section_key, (r.data ?? {}) as Record<string, unknown>]));
  const done = tpl.every((x) => sectionStatus(x, stored.get(x.key) ?? {}) === "complete");
  await db.from("kb_entries").update({ status: done ? "complete" : "draft", updated_at: now }).eq("id", id);

  return NextResponse.json({ ok: true, written, unsorted });
}
