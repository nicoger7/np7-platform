import Anthropic from "@anthropic-ai/sdk";
import type { World } from "@/lib/blog-templates";

/**
 * AI Magazine intake — turn any pile of text (a video transcript, trip notes,
 * a voice-to-text ramble) into a DRAFT post a human then reviews.
 *
 * Mirrors the spotguide intake: the model gets no write freedom, only a shape
 * to fill. Everything it returns lands in the queue as a proposal — the post
 * itself is created by a person pressing a button, always as a draft.
 */

export const BLOG_TABS = ["spotguide", "gear", "technique"] as const;
export type BlogTab = (typeof BLOG_TABS)[number];

/** The public Magazine tabs are `world` filters: /blog/spotguide = experience. */
const TAB_WORLD: Record<BlogTab, World> = {
  spotguide: "experience",
  gear: "hardware",
  technique: "technique",
};
const TAB_LABEL: Record<BlogTab, string> = {
  spotguide: "Spotguide",
  gear: "Gear",
  technique: "Technique",
};

export function worldForTab(tab: BlogTab): World {
  return TAB_WORLD[tab];
}
export function tabLabel(tab: BlogTab): string {
  return TAB_LABEL[tab];
}
export function isBlogTab(v: unknown): v is BlogTab {
  return typeof v === "string" && (BLOG_TABS as readonly string[]).includes(v);
}

export const slugifyPost = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

export type BlogDraft = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tab: BlogTab;
  notes: string[];
};

/** What a queue row carries in `notes` — the proposal plus where it came from. */
export type IntakeNotes = {
  draft?: BlogDraft | null;
  /** why there is no draft: no API key, bad JSON, model couldn't find a post */
  error?: string;
  source?: { kind: "youtube"; url: string; title?: string; channel?: string | null };
};

/**
 * Coerce whatever came back (or whatever an editor PATCHed) into a draft.
 * Returns null when there is no usable title or body — the queue keeps the raw
 * text in that case and the reviewer writes the post themselves.
 */
export function coerceDraft(raw: unknown): BlogDraft | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(r.title);
  const content = str(r.content);
  if (!title || !content) return null;
  return {
    title: title.slice(0, 160),
    slug: slugifyPost(str(r.slug) || title),
    excerpt: str(r.excerpt).slice(0, 320),
    content,
    tab: isBlogTab(r.tab) ? r.tab : "spotguide",
    notes: Array.isArray(r.notes) ? r.notes.map((n) => String(n ?? "").trim()).filter(Boolean).slice(0, 8) : [],
  };
}

const SYSTEM = `You draft posts for the NP7 Magazine — the windsurf magazine of Nico Prien (GER-7) and the NP7 crew, at np-seven.com/blog. Reply with ONLY a JSON object, no prose, matching:
{
  "title": "a specific, searchable headline — no clickbait, no colon-subtitle padding",
  "slug": "url-safe-lowercase-words",
  "excerpt": "one or two sentences that make a rider want to read it",
  "content": "the post body in markdown",
  "tab": "spotguide" | "gear" | "technique",
  "notes": ["anything you were unsure about, or a gap a human should fill"]
}

Rules:
- Write ONLY from the source text. Never invent conditions, prices, spec numbers, dates, names or claims that aren't in it. If something obvious is missing, say so in notes instead of filling it in.
- Body markdown supports exactly: ## and ### headings, **bold**, *italic*, \`code\`, [link](url), - bullets, 1. numbered lists, > quotes and --- dividers. No tables, no HTML, no images (the editor adds those).
- Open with the payoff, not a warm-up. Short paragraphs, ## sections, plain words. Write rider to rider — direct, specific, no marketing gloss and no filler like "in today's world" or "let's dive in".
- Keep the source's own numbers, spot names, gear names and quotes exactly as given.
- If the text is a video transcript, turn it into an article: drop the spoken filler, the greetings and the "smash that subscribe", keep the substance.
- tab: "spotguide" for spots, destinations and trips; "gear" for boards, sails, fins and equipment; "technique" for how-to, moves and coaching.
- A draft is a starting point for a human editor, not a finished post. Length follows the source: don't pad thin notes into a long article.`;

/**
 * Draft a post from free text. Returns an error string rather than throwing —
 * a failed draft still leaves the raw text queued for a human.
 */
export async function draftMagazinePost(
  text: string,
): Promise<{ draft: BlogDraft } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "No ANTHROPIC_API_KEY on this deployment — the text is queued for you to write up yourself." };

  const client = new Anthropic({ apiKey });
  let raw = "";
  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    raw = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  } catch (e) {
    return { error: `The AI call failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { error: "The AI reply wasn't valid JSON — try again, or shorten the source text." };
  }
  const draft = coerceDraft(parsed);
  if (!draft) return { error: "Couldn't find a post in that text — add a bit more to work with." };
  return { draft };
}
