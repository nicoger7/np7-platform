import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { requireAdminGate } from "@/lib/admin-auth";
import { requirePdEdit } from "@/lib/product-dev-api";
import { NEEDS_KEY, PD_RESEARCH_MODEL, pdClaude } from "@/lib/pd-web";
import { openAiVisionJson, pdAiKey } from "@/lib/pd-ai";

/**
 * POST /api/admin/product-dev/boards/:id/fittings — find the fittings in the
 * board's picture: mast track, footstraps, fin and foil boxes, vents, handles.
 * Nico, 23.09.2026: "a fin-hole, mastbase and footstrap detector (including
 * the corresponding measurements)".
 *
 * The page sends the board as it lies under the 2D plan: straightened, tail on
 * the left, with a centimetre grid drawn on it and labelled (cm from the tail
 * along the top and bottom, cm off the centreline on the left). The AI reads
 * positions off those labels, which is far more reliable than asking a model
 * for pixel coordinates. Nothing is stored here: the page shows what came
 * back on the plan, and a person adds what is right to the Cut-outs tab.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE = 4_000_000; // characters of data URL

const num = { type: "number" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["view", "items"],
  properties: {
    view: { type: "string", enum: ["top", "bottom", "unclear"], description: "Which face of the board the picture shows." },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "from_cm", "to_cm", "offset_from_cm", "offset_to_cm", "confidence", "note"],
        properties: {
          kind: { type: "string", enum: ["mast_track", "footstrap", "fin_box", "foil_box", "vent", "handle", "other"] },
          label: { type: "string", description: "Short and specific, e.g. \"Front strap, upper side\" or \"Mast track\"." },
          from_cm: { ...num, description: "Along the board, cm from the tail, of the end nearer the tail." },
          to_cm: { ...num, description: "Along the board, cm from the tail, of the end nearer the nose." },
          offset_from_cm: { ...num, description: "cm off the centreline at from_cm: positive above it in the picture, negative below." },
          offset_to_cm: { ...num, description: "cm off the centreline at to_cm." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: { type: "string", description: "One short line: what you saw, e.g. \"4 insert holes per plug\"." },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You look at pictures of windsurf and windfoil boards for a board designer, and report where the fittings are.

The picture shows one board from straight above, TAIL ON THE LEFT, nose on the right. A grid is drawn on it:
- vertical lines every 10 cm along the board, labelled along the top and bottom edges with the distance FROM THE TAIL in cm;
- horizontal lines every 5 cm across the board, labelled on the left with the distance from the centreline in cm (+ above the centreline, - below). The 0 line is the centreline.

Report every fitting you can see, reading its position off the grid labels to the nearest centimetre (interpolate between lines):
- mast_track: the slot for the mast base, from its tail end to its nose end.
- footstrap: each strap separately. from_cm/offset_from_cm is where its tail-side end is screwed in, to_cm/offset_to_cm its nose-side end. If a pad offers several insert holes, give the middle of the holes and say how many in the note.
- fin_box and foil_box: only visible on the bottom. A foil box is usually two parallel tracks; report each track.
- vent, handle, other: if clearly visible.
Only report what is really in the picture. If a position is hard to read, still give your best reading and set the confidence low. Never invent fittings that are hidden.`;

type Found = { view: "top" | "bottom" | "unclear"; items: Array<Record<string, unknown>> };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;
  await params;

  const body = (await request.json().catch(() => null)) as { image?: string; lengthCm?: number; halfWidthCm?: number } | null;
  const image = typeof body?.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE) {
    return NextResponse.json({ error: "The picture did not come through. Try again." }, { status: 400 });
  }
  const ai = pdAiKey();
  if (!ai) return NextResponse.json(NEEDS_KEY);

  const text = `Board length about ${Math.round(Number(body?.lengthCm) || 0)} cm${body?.halfWidthCm ? `, widest about ${Math.round(Number(body.halfWidthCm) * 2)} cm` : ""}. Find the fittings.`;
  try {
    if (ai.provider === "openai") {
      const r = await openAiVisionJson<Found>({ key: ai.key, instructions: INSTRUCTIONS, text, image, name: "board_fittings", schema: SCHEMA });
      if (!r.data) return NextResponse.json({ error: "The picture was read, but no answer came back. Try again." }, { status: 502 });
      return NextResponse.json({ ...r.data, model: r.model });
    }
    const client = pdClaude();
    if (!client) return NextResponse.json(NEEDS_KEY);
    const [, mediaType, data] = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/) ?? [];
    const msg = await client.messages.create({
      model: PD_RESEARCH_MODEL,
      max_tokens: 6000,
      system: INSTRUCTIONS,
      tools: [{ name: "record_fittings", description: "Record the fittings found in the picture.", input_schema: SCHEMA as Anthropic.Tool.InputSchema, strict: true } as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record_fittings" },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data } },
        { type: "text", text },
      ] }],
    });
    const call = msg.content.find((c) => c.type === "tool_use");
    if (!call || call.type !== "tool_use") return NextResponse.json({ error: "The picture was read, but no answer came back. Try again." }, { status: 502 });
    return NextResponse.json({ ...(call.input as Found), model: msg.model });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Reading the picture failed." }, { status: 502 });
  }
}
