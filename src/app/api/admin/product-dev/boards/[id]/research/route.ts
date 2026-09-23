import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { pdDb, requirePdEdit } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";
import { NEEDS_KEY, PD_RESEARCH_MODEL, pdClaude } from "@/lib/pd-web";
import { openAiSearchThenRecord, pdAiKey } from "@/lib/pd-ai";
import { RESEARCH_FILLABLE, boardTitle, disciplineLabel, type BoardResearch } from "@/lib/board-measurements";

/**
 * POST /api/admin/product-dev/boards/:id/research — what the web knows about
 * this board: the published specs of this exact size, what riders and testers
 * say about it, and the links. Nico, 2026-09-23: "a button that can search the
 * web for relevant info (and what people say about this board pros/cons)".
 *
 * Claude runs the searches server-side and answers through one strict tool, so
 * the page gets a fixed shape back instead of prose to parse. The result is
 * kept on the board (migration 257) and replaced by the next run. The specs it
 * finds fill the board's EMPTY Details fields straight away (never one that
 * holds a value) and the research remembers which ones.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const nullable = (type: "string" | "number") => ({ type: [type, "null"] });
const sourced = {
  type: "array",
  items: {
    type: "object", additionalProperties: false, required: ["point", "source_url"],
    properties: { point: { type: "string" }, source_url: nullable("string") },
  },
};

const RECORD = {
  name: "record_research",
  description: "Record what you found about the board. Call it once, when the research is done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["identified_as", "confidence", "summary", "specs", "pros", "cons", "voices", "rd_notes", "links"],
    properties: {
      identified_as: { type: "string", description: "The exact model, size and year the findings are about." },
      confidence: { type: "string", enum: ["exact", "close", "unsure"], description: "How sure you are that this is the board we measured." },
      summary: { type: "string", description: "Three or four sentences: what the board is for and how it is regarded." },
      specs: {
        type: "object",
        additionalProperties: false,
        required: ["length_cm", "width_cm", "volume_l", "weight_kg", "tail_width_cm", "fin_box", "construction", "sail_range", "source_url"],
        properties: {
          length_cm: nullable("number"), width_cm: nullable("number"), volume_l: nullable("number"),
          weight_kg: nullable("number"), tail_width_cm: nullable("number"),
          fin_box: nullable("string"), construction: nullable("string"), sail_range: nullable("string"),
          source_url: nullable("string"),
        },
      },
      pros: sourced,
      cons: sourced,
      voices: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["who", "said", "source_url"],
          properties: { who: { type: "string" }, said: { type: "string" }, source_url: nullable("string") },
        },
      },
      rd_notes: { type: "array", items: { type: "string" } },
      links: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["title", "url", "kind"],
          properties: {
            title: { type: "string" }, url: { type: "string" },
            kind: { type: "string", enum: ["official", "review", "video", "forum", "shop", "other"] },
          },
        },
      },
    },
  },
};

const SYSTEM = `You research windsurf and windfoil boards for the product development team of NP7, a windsurf brand that measures boards by hand and designs its own.

For the board described in the message, find:
1. The brand's official product page and the published specs of this exact size. If the brand makes several sizes, pick the one that matches the name and our own measurements, and say which you picked and how sure you are.
2. What riders, testers and reviewers say about it: strengths and weaknesses, each tied to the page it came from. Independent tests, forum threads and videos count for more than shop copy. If little has been written about this model, say so instead of padding the lists.
3. What a board designer would want to know: outline, rocker, V and concave, cut-outs, construction, what changed from the previous version.

Write in your own words and keep every point short. Never copy more than a few words from a source. Numbers only from sources; leave a spec null when it is not published.

When you are done, call record_research once.`;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  const { id } = await params;

  const ai = pdAiKey();
  if (!ai) return NextResponse.json(NEEDS_KEY);

  const db = pdDb();
  const { data: board, error } = await db.from("pd_boards").select("*").eq("id", id).single();
  if (error || !board) return NextResponse.json({ error: "That board does not exist." }, { status: 404 });
  const { data: points } = await db.from("pd_board_points").select("metric,station,value").eq("board_id", id);

  const widths = ((points ?? []) as { metric: string; station: number; value: number | null }[])
    .filter((p) => p.metric === "width" && p.value != null);
  const widest = widths.reduce<{ station: number; value: number } | null>(
    (best, p) => (!best || (p.value as number) > best.value ? { station: p.station, value: p.value as number } : best), null);
  const t = boardTitle(board);
  const facts = {
    board: t.text,
    brand: t.brand, model: t.model, size: t.size, year: t.year,
    typed_name: board.name,
    discipline: disciplineLabel(board.category),
    whose: board.origin,
    stated: { length_cm: board.length_cm, max_width_cm: board.max_width_cm, volume_l: board.volume_l, weight_kg: board.weight_kg },
    our_measurements: {
      widest_bottom_width_cm: widest?.value ?? null,
      at_station_cm: widest?.station ?? null,
      measured_from: board.station_origin,
      furthest_station_cm: Math.max(0, ...((points ?? []) as { station: number }[]).map((p) => p.station)),
    },
  };

  const ask = `Research this board:\n${JSON.stringify(facts, null, 2)}`;
  async function save(found: BoardResearch, meta: NonNullable<BoardResearch["meta"]>) {
    // The published specs go straight into the Details fields that are still
    // EMPTY (Nico, 23.09.2026: "if we do a search it should also fill in
    // these"). A value somebody typed is never replaced; what was filled is
    // remembered, so the page can say it came from the web.
    const specs = (found.specs ?? {}) as Record<string, unknown>;
    const fill: Record<string, unknown> = {};
    for (const f of RESEARCH_FILLABLE) {
      const v = specs[f.spec];
      const cur = (board as Record<string, unknown>)[f.field];
      if (v != null && v !== "" && (cur == null || cur === "")) fill[f.field] = v;
    }
    const research = { ...found, meta, filled: Object.keys(fill) };
    const research_at = new Date().toISOString();
    const { error: saveError } = await db.from("pd_boards")
      .update({ research, research_at, ...fill, ...(Object.keys(fill).length ? { updated_at: research_at } : {}) })
      .eq("id", id);
    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
    return NextResponse.json({ research, research_at, filled: Object.keys(fill) });
  }

  // ChatGPT key: search, then answer through the same strict shape.
  if (ai.provider === "openai") {
    try {
      const r = await openAiSearchThenRecord<BoardResearch>({
        key: ai.key, instructions: SYSTEM, input: ask,
        fn: { name: RECORD.name, description: RECORD.description, parameters: RECORD.input_schema },
      });
      return save(r.args, { model: r.model, searches: r.searches, input_tokens: r.inputTokens, output_tokens: r.outputTokens });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "The web search failed." }, { status: 502 });
    }
  }

  const client = pdClaude();
  if (!client) return NextResponse.json(NEEDS_KEY);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  let searches = 0, inputTokens = 0, outputTokens = 0;

  try {
    // Server-side web search can pause a long turn; hand it back until it ends.
    for (let round = 0; round < 4; round++) {
      const msg = await client.beta.messages.stream({
        model: PD_RESEARCH_MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
          RECORD,
        ],
        // A declined request is retried on the fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).finalMessage();

      inputTokens += msg.usage.input_tokens ?? 0;
      outputTokens += msg.usage.output_tokens ?? 0;
      searches += msg.usage.server_tool_use?.web_search_requests ?? 0;

      const call = msg.content.find((b) => b.type === "tool_use" && b.name === "record_research");
      if (call && call.type === "tool_use") {
        return save(call.input as BoardResearch, { model: msg.model, searches, input_tokens: inputTokens, output_tokens: outputTokens });
      }
      if (msg.stop_reason === "refusal") {
        return NextResponse.json({ error: "The search was declined. Try again, or rename the board if the name is ambiguous." }, { status: 502 });
      }
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }
    return NextResponse.json({ error: "The search ended without a result. Try again." }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The web search failed." }, { status: 502 });
  }
}
