import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { KB_TEMPLATES } from "@/lib/kb-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/kb/:id/assist — the authoring loop's engine.
 * Body: { braindump: string }
 *
 * Nico/Simona dump thoughts as they come; the model sorts them into the
 * entry's sections (merging with what's already written, never losing
 * existing content), decides which required questions each section still
 * leaves open, and returns those questions — so the human is always asked
 * exactly what's missing, and the document keeps its shape.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 503 });

  let body: { braindump?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const braindump = (body.braindump ?? "").trim();
  if (!braindump) return NextResponse.json({ error: "Nothing to sort in — write a few thoughts first." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: entry } = await db.from("kb_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: rows } = await db.from("kb_sections").select("section_key,content,status").eq("entry_id", id);
  const tpl = KB_TEMPLATES[entry.kind as "skill" | "equipment"] ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKey = new Map(((rows ?? []) as any[]).map((r) => [r.section_key, r]));

  const sectionsForPrompt = tpl.map((t) => ({
    key: t.key, label: t.label, requiredQuestions: t.questions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentContent: (byKey.get(t.key) as any)?.content ?? "",
  }));

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: [
      `You are NP7's knowledge-base editor. NP7 runs premium windsurf coaching trips; the voice is warm, direct, coach-to-coach, English.`,
      `You receive the sections of ONE ${entry.kind} entry ("${entry.title}"), each with required questions and its current content, plus a new braindump from the coach.`,
      `Your job: merge the braindump into the sections. Rules:`,
      `- NEVER discard existing content — integrate, refine, restructure. Markdown allowed (lists, bold).`,
      `- Only write what the braindump or existing content supports. Do not invent coaching facts.`,
      `- For each section decide which required questions are genuinely ANSWERED by the resulting content; the rest stay open.`,
      `- status: "complete" only when every required question is answered; "draft" when partially filled; "missing" when still empty.`,
      `Return ONLY valid JSON: {"sections":[{"key":string,"content":string,"status":"missing"|"draft"|"complete","openQuestions":string[]}]} — one object per section, template order, no commentary.`,
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ sections: sectionsForPrompt, braindump }) }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return NextResponse.json({ error: "The assistant returned an unreadable answer — try again." }, { status: 502 });
  }
  const valid = Array.isArray(parsed?.sections) ? parsed.sections.filter((s: { key?: string }) => tpl.some((t) => t.key === s?.key)) : [];
  if (!valid.length) return NextResponse.json({ error: "The assistant produced no usable sections — try again." }, { status: 502 });

  const now = new Date().toISOString();
  for (const s of valid) {
    await db.from("kb_sections").upsert({
      entry_id: id, section_key: s.key,
      content: String(s.content ?? ""),
      status: ["missing", "draft", "complete"].includes(s.status) ? s.status : "draft",
      open_questions: Array.isArray(s.openQuestions) ? s.openQuestions.slice(0, 8) : [],
      updated_at: now,
    }, { onConflict: "entry_id,section_key" });
  }
  const allComplete = valid.length === tpl.length && valid.every((s: { status?: string }) => s.status === "complete");
  await db.from("kb_entries").update({ status: allComplete ? "complete" : "draft", updated_at: now }).eq("id", id);

  const openQuestions = valid.flatMap((s: { key: string; openQuestions?: string[] }) => {
    const label = tpl.find((t) => t.key === s.key)?.label ?? s.key;
    return (Array.isArray(s.openQuestions) ? s.openQuestions : []).map((q: string) => ({ section: label, question: q }));
  });
  return NextResponse.json({ ok: true, openQuestions, complete: allComplete });
}
