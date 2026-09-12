import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { parseMeasurementText, BOARD_METRICS, type FiledNote, type ParsedSeries } from "@/lib/board-measurements";

/**
 * Turn a note into filed measurements — "puts it into order into the board
 * you're working in".
 *
 * TWO paths, and the order matters:
 *
 *   1. The PARSER runs first, always, and it is not a fallback. A measuring
 *      session typed into a notes app already has a structure — a metric
 *      heading, then a station per line — and reading it with a regex is
 *      exact, instant, free and offline. Handing that to a model instead would
 *      mean a board's numbers depend on an API key and a network hop.
 *
 *   2. The MODEL runs only when the parser found nothing, which is the case
 *      the parser genuinely cannot do: dictation. "Thickness at ninety is
 *      thirteen eight, and the V goes inverted from the tail to about eighty."
 *
 * Neither path writes anything. Both return a PROPOSAL the review table shows
 * and a person imports, because a misheard station silently overwriting a
 * measured one is the only unrecoverable failure here — the board is back in
 * its bag by then.
 */

export const runtime = "nodejs";

const MODEL = process.env.PD_AI_MODEL || "claude-haiku-4-5";

/** The shape the model must answer in — the same shape the parser returns, so
 *  the review table downstream cannot tell the two apart. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["series", "summary"],
  properties: {
    summary: { type: "string", description: "One sentence on what this note says." },
    bullets: { type: "array", items: { type: "string" }, description: "Anything that is not a measurement: observations, to-dos, questions." },
    series: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "points"],
        properties: {
          metric: { type: "string", enum: BOARD_METRICS.map((m) => m.key) },
          variant: { type: ["string", "null"] },
          unit: { type: ["string", "null"], enum: ["mm", "cm", "in", null] },
          convention: { type: ["string", "null"], description: "Verbatim caveat about how it was measured." },
          points: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["station"],
              properties: {
                station: { type: "number" },
                value: { type: ["number", "null"] },
                text: { type: ["string", "null"] },
                note: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You file windsurf board measurements that were dictated or scribbled down.

Return ONLY what the note actually says. Never infer a reading that was not spoken, never fill a station because its neighbours have one, and never convert units.

Conventions you must follow:
- A station is a distance along the board from its measuring origin (usually the tail), in cm.
- V is ONE signed series. Positive = V (centreline lower than the rails). Negative = inverted V (rails lower). If the note says a run is inverted, those points are negative.
- Rocker is one line: the tail end is the tail kick, the nose end is the scoop. Zero through the flat.
- A caveat about how something was measured ("halve these", "minus the inverted V") goes in "convention" VERBATIM. Do not apply it to the numbers.
- A station mentioned with no reading is still a point: emit it with value null.
- Anything that is not a measurement goes in "bullets", not into a series.`;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { text?: string; noteId?: string; force?: "parser" | "model" };

  const db = pdDb();
  let text = (body.text ?? "").trim();
  if (!text && body.noteId) {
    const { data } = await db.from("pd_board_notes").select("body").eq("id", body.noteId).eq("board_id", id).single();
    text = (data?.body ?? "").trim();
  }
  if (!text) return NextResponse.json({ error: "There is nothing to sort — the note is empty." }, { status: 400 });

  // ── 1. The parser ──────────────────────────────────────────────────────────
  const parsed = parseMeasurementText(text);
  const hasReadings = parsed.series.some((s) => s.points.length > 0);
  if (hasReadings && body.force !== "model") {
    const filed: FiledNote = {
      summary: describe(parsed.series),
      bullets: parsed.ignored,
      proposals: parsed.series,
      sortedAt: new Date().toISOString(),
      by: "parser",
    };
    return NextResponse.json({ filed, warnings: parsed.warnings, by: "parser" });
  }

  // ── 2. The model ───────────────────────────────────────────────────────────
  const apiKey = process.env.PD_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Not an error state — this is the documented "connect the key later"
    // path, and it says exactly what would have happened and what to do now.
    return NextResponse.json({
      filed: {
        summary: "",
        bullets: [],
        proposals: [],
        error: "not_configured",
        by: "model",
      } satisfies FiledNote,
      warnings: parsed.warnings,
      by: "none",
      needsKey: true,
      message:
        "Nothing in this note is in the station format, so it needs the assistant — and PD_ANTHROPIC_API_KEY isn't set yet. " +
        "Until it is, write the note as a metric heading with one station per line and it files itself, no key needed.",
    }, { status: 200 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { format: { type: "json_schema", schema: SCHEMA } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const raw = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const answer = safeJson(raw) as { summary?: string; bullets?: string[]; series?: ParsedSeries[] } | null;
    if (!answer) throw new Error("The assistant returned an unreadable answer.");

    const proposals: ParsedSeries[] = (answer.series ?? []).map((s) => ({
      metric: s.metric,
      heading: s.metric,
      variant: s.variant ?? null,
      convention: s.convention ?? null,
      unit: s.unit ?? null,
      points: (s.points ?? []).map((p) => ({
        station: Number(p.station),
        value: p.value == null ? null : Number(p.value),
        unit: null,
        text: p.text ?? null,
        note: p.note ?? null,
      })),
      // The model is never trusted to decide a convention, only to report one.
      suggestions: [],
    }));

    const filed: FiledNote = {
      summary: answer.summary ?? describe(proposals),
      bullets: answer.bullets ?? [],
      proposals,
      sortedAt: new Date().toISOString(),
      by: "model",
    };
    return NextResponse.json({ filed, warnings: parsed.warnings, by: "model" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The assistant couldn't read that note." },
      { status: 502 },
    );
  }
}

function describe(series: ParsedSeries[]): string {
  if (!series.length) return "No measurements found in this note.";
  const parts = series.map((s) => {
    const n = s.points.filter((p) => p.value != null).length;
    return `${s.metric} (${n})`;
  });
  return `Readings for ${parts.join(", ")}.`;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
