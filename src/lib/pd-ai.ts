import "server-only";

/**
 * Which AI the Product Dev features talk to, and the ChatGPT half of it.
 *
 * The web research, the picture search and the note sorter were written for
 * Claude. Nico has a ChatGPT (OpenAI) key, and pasted it into the variable that
 * was there (PD_ANTHROPIC_API_KEY), so the key itself decides: Claude keys start
 * "sk-ant-", everything else "sk-..." is OpenAI. Either variable name works for
 * either key.
 */

export type PdAiKey = { provider: "anthropic" | "openai"; key: string };

export function pdAiKey(): PdAiKey | null {
  const key = (process.env.PD_ANTHROPIC_API_KEY || process.env.PD_OPENAI_API_KEY
    || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  return { provider: key.startsWith("sk-ant-") ? "anthropic" : "openai", key };
}

// The cheapest current model on purpose (Nico: "you need a lower model"):
// finding a product page and summing up what testers say does not need more.
export const PD_OPENAI_MODEL = process.env.PD_OPENAI_MODEL || "gpt-6-luna";

type OpenAiItem = {
  type: string;
  name?: string;
  arguments?: string;
  content?: { type: string; text?: string }[];
};
type OpenAiResponse = {
  id: string;
  model?: string;
  output?: OpenAiItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string } | null;
};

async function respond(key: string, body: Record<string, unknown>, timeoutMs = 240_000): Promise<OpenAiResponse> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await res.json().catch(() => ({}))) as OpenAiResponse & { error?: { message?: string } };
  if (!res.ok) throw new Error(`ChatGPT answered ${res.status}: ${j.error?.message ?? "no details"}`);
  return j;
}

/** The text a response wrote, joined. */
export function openAiText(r: OpenAiResponse): string {
  return (r.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

/**
 * Search the web, then hand back the findings in a fixed shape.
 *
 * Two calls on purpose: the first one only searches and writes, the second one
 * (continuing the same conversation) is made to answer through the strict
 * function and nothing else. That does not depend on web search and function
 * tools behaving well together in one call.
 */
export async function openAiSearchThenRecord<T>(opts: {
  key: string;
  instructions: string;
  input: string;
  fn: { name: string; description: string; parameters: Record<string, unknown> };
  searchContext?: "low" | "medium" | "high";
}): Promise<{ args: T; searches: number; inputTokens: number; outputTokens: number; model: string }> {
  const first = await respond(opts.key, {
    model: PD_OPENAI_MODEL,
    instructions: opts.instructions,
    input: opts.input,
    tools: [{ type: "web_search", search_context_size: opts.searchContext ?? "medium" }],
    max_output_tokens: 12000,
  });
  const second = await respond(opts.key, {
    model: PD_OPENAI_MODEL,
    previous_response_id: first.id,
    input: `Now call ${opts.fn.name} with what you found. Use the source URLs you actually read.`,
    tools: [{ type: "function", name: opts.fn.name, description: opts.fn.description, parameters: opts.fn.parameters, strict: true }],
    tool_choice: { type: "function", name: opts.fn.name },
    max_output_tokens: 8000,
  });
  const call = (second.output ?? []).find((o) => o.type === "function_call" && o.name === opts.fn.name);
  if (!call?.arguments) throw new Error("ChatGPT searched but did not hand back a result. Try again.");
  return {
    args: JSON.parse(call.arguments) as T,
    searches: (first.output ?? []).filter((o) => o.type === "web_search_call").length,
    inputTokens: (first.usage?.input_tokens ?? 0) + (second.usage?.input_tokens ?? 0),
    outputTokens: (first.usage?.output_tokens ?? 0) + (second.usage?.output_tokens ?? 0),
    model: second.model ?? PD_OPENAI_MODEL,
  };
}

/** One call, answered as JSON in the given shape (no web). */
export async function openAiJson<T>(opts: { key: string; instructions: string; input: string; name: string; schema: Record<string, unknown> }): Promise<T | null> {
  const r = await respond(opts.key, {
    model: PD_OPENAI_MODEL,
    instructions: opts.instructions,
    input: opts.input,
    text: { format: { type: "json_schema", name: opts.name, schema: opts.schema, strict: false } },
    max_output_tokens: 6000,
  }, 120_000);
  const raw = openAiText(r);
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * One call with a picture, answered as JSON in the given (strict) shape. The
 * picture goes in as a data URL. Used by the fittings finder, which draws a
 * labelled centimetre grid onto the board so positions are READ off the grid
 * labels rather than estimated from pixels.
 */
export async function openAiVisionJson<T>(opts: {
  key: string; instructions: string; text: string; image: string; name: string; schema: Record<string, unknown>;
}): Promise<{ data: T | null; model: string; inputTokens: number; outputTokens: number }> {
  const model = process.env.PD_OPENAI_VISION_MODEL || PD_OPENAI_MODEL;
  const r = await respond(opts.key, {
    model,
    instructions: opts.instructions,
    input: [{ role: "user", content: [
      { type: "input_text", text: opts.text },
      { type: "input_image", image_url: opts.image, detail: "high" },
    ] }],
    text: { format: { type: "json_schema", name: opts.name, schema: opts.schema, strict: true } },
    max_output_tokens: 6000,
  }, 180_000);
  let data: T | null = null;
  try { data = JSON.parse(openAiText(r)) as T; } catch { data = null; }
  return { data, model: r.model ?? model, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 };
}

