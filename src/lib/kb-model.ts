import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place the knowledge base talks to a model.
 *
 * It exists for two reasons and no more. First, the model is chosen by
 * environment, not hardcoded at the call site: the authoring prompts were
 * written against a strong model so that a cheap one can execute them, and
 * that only pays off if switching is one variable. Second, the answer comes
 * back schema-constrained, so a small model cannot return a shape the caller
 * has to defend against.
 *
 * Deliberately not a provider framework. When an OpenAI key arrives, this file
 * grows a branch on KB_AI_PROVIDER and every caller stays as it is. Anything
 * more abstract would be guessing at a second provider we do not have yet.
 *
 * Thinking is off on purpose. Schema-constrained extraction does not reason,
 * it transcribes into fields, and the two other intake prompts in this repo
 * (blog and spotguide) ask for adaptive thinking because they genuinely do
 * reason. Off here is a decision, not an oversight.
 */

const MODEL = process.env.KB_AI_MODEL || "claude-haiku-4-5";

export type KbCompleteArgs = {
  system: string;
  user: string;
  /** JSON Schema the answer must satisfy. */
  schema: Record<string, unknown>;
  maxTokens?: number;
};

export async function kbComplete({ system, user, schema, maxTokens = 8000 }: KbCompleteArgs): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output_config: { format: { type: "json_schema", schema } } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    // A constrained answer should always parse; if the format was ignored,
    // fall back to the outermost object rather than failing the whole run.
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a === -1 || b <= a) throw new Error("The assistant returned an unreadable answer — try again.");
    return JSON.parse(text.slice(a, b + 1));
  }
}
