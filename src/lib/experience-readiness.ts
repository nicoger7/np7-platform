import "server-only";
import { createAdminClient } from "@/lib/supabase";
import {
  DEFAULT_DAILY_PROGRAM,
  DEFAULT_FAQ,
  DEFAULT_OUTCOMES,
  DEFAULT_WEEK_TITLE,
  sameAsDefault,
} from "@/lib/experience-defaults";

/**
 * What still needs writing on an experience before it goes public.
 *
 * Two different problems, deliberately kept apart:
 *
 *  - MISSING — the field is empty. A page with no hero photo or no spot
 *    description is visibly unfinished.
 *  - GENERIC — the field has text, but it is still word-for-word the copy every
 *    other trip carries. This one is invisible without help: the page looks
 *    complete, and a wave clinic cheerfully promises "better jibes". Seeding the
 *    defaults into the database made them editable but also made "never written"
 *    indistinguishable from "written" — comparing against the default is how we
 *    get that signal back, with no extra column to maintain.
 *
 * The NP7 method is NOT checked. It is the same on every trip on purpose;
 * flagging it would be noise, and noise is what stops people reading a list.
 */

export type ReadinessCheck = { label: string; where: string };

export type ExperienceReadiness = {
  id: string;
  title: string;
  slug: string | null;
  websiteVisible: boolean;
  published: boolean;
  /** the soonest upcoming edition, if any — drives ordering */
  nextStart: string | null;
  missing: ReadinessCheck[];
  generic: ReadinessCheck[];
  /** how many of the checks are satisfied, for a calm "7/10" rather than a wall of red */
  done: number;
  total: number;
};

const WHERE_CONTENT = "Website → Event Content";

export async function getExperienceReadiness(): Promise<ExperienceReadiness[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: exps } = await db
    .from("exp_experiences")
    .select("id, title, slug, status, website_visible, archived_at, destination_id")
    .is("archived_at", null)
    .order("title");
  if (!exps?.length) return [];

  const ids = exps.map((e: { id: string }) => e.id);
  // "The spot" section falls back to the linked destination's intro/tagline, so
  // an empty location_about is only a gap when there is nothing to fall back on.
  const destIds = [...new Set((exps as { destination_id: string | null }[]).map((e) => e.destination_id).filter(Boolean))] as string[];
  const destHasText = new Set<string>();
  if (destIds.length) {
    const { data: dests } = await db.from("destinations").select("id, intro, tagline").in("id", destIds);
    for (const d of (dests ?? []) as { id: string; intro: string | null; tagline: string | null }[]) {
      if ((d.intro ?? "").trim() || (d.tagline ?? "").trim()) destHasText.add(d.id);
    }
  }
  const [{ data: contents }, { data: editions }, { data: placements }] = await Promise.all([
    db.from("exp_content").select("*").in("experience_id", ids),
    db.from("exp_editions").select("experience_id, date_start, status, archived_at").in("experience_id", ids),
    db.from("exp_review_placements").select("experience_id").in("experience_id", ids),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentBy = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (contents ?? []) as any[]) contentBy.set(c.experience_id, c);

  const today = new Date().toISOString().slice(0, 10);
  const nextBy = new Map<string, string>();
  for (const e of (editions ?? []) as { experience_id: string; date_start: string | null; status: string | null; archived_at: string | null }[]) {
    if (e.archived_at || !e.date_start || e.date_start < today) continue;
    const cur = nextBy.get(e.experience_id);
    if (!cur || e.date_start < cur) nextBy.set(e.experience_id, e.date_start);
  }

  const reviewCount = new Map<string, number>();
  for (const p of (placements ?? []) as { experience_id: string }[]) {
    reviewCount.set(p.experience_id, (reviewCount.get(p.experience_id) ?? 0) + 1);
  }

  const out: ExperienceReadiness[] = [];
  for (const e of exps as { id: string; title: string; slug: string | null; status: string | null; website_visible: boolean | null; destination_id: string | null }[]) {
    const c = contentBy.get(e.id) ?? {};
    const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    const missing: ReadinessCheck[] = [];
    const generic: ReadinessCheck[] = [];

    // ── empty ────────────────────────────────────────────────────────────
    if (!has(c.hero_image)) missing.push({ label: "Hero photo", where: `${WHERE_CONTENT} → Media` });
    const spotCovered = has(c.location_about) || (!!e.destination_id && destHasText.has(e.destination_id));
    if (!spotCovered) missing.push({ label: "About the spot", where: WHERE_CONTENT });
    if (!has(c.week_info)) missing.push({ label: "Your week", where: WHERE_CONTENT });
    if (!has(c.wind_range) && !has(c.wind_probability)) missing.push({ label: "Wind facts", where: WHERE_CONTENT });
    // Blocks the pre-trip email outright, not just the page.
    if (!has(c.packing_list)) missing.push({ label: "Packing list", where: `${WHERE_CONTENT} — also blocks the pre-trip email` });
    if ((c.gallery?.length ?? 0) < 3) missing.push({ label: "Photos (3+)", where: `${WHERE_CONTENT} → Media` });
    if ((reviewCount.get(e.id) ?? 0) === 0) missing.push({ label: "A guest review", where: "Guest Reviews" });

    // ── still the shared default ─────────────────────────────────────────
    if (!has(c.week_title) || c.week_title.trim() === DEFAULT_WEEK_TITLE) {
      generic.push({ label: "Week headline", where: WHERE_CONTENT });
    }
    if (sameAsDefault(c.week_outcomes, DEFAULT_OUTCOMES)) {
      generic.push({ label: "What you take home", where: WHERE_CONTENT });
    }
    if (sameAsDefault(c.daily_program, DEFAULT_DAILY_PROGRAM)) {
      generic.push({ label: "Day by day", where: WHERE_CONTENT });
    }
    if (sameAsDefault(c.faq, DEFAULT_FAQ)) {
      generic.push({ label: "FAQ", where: WHERE_CONTENT });
    }

    const total = 11;
    out.push({
      id: e.id,
      title: e.title,
      slug: e.slug,
      websiteVisible: e.website_visible !== false,
      published: e.status === "published",
      nextStart: nextBy.get(e.id) ?? null,
      missing,
      generic,
      done: Math.max(0, total - missing.length - generic.length),
      total,
    });
  }

  // Soonest trip first, then anything already public, then the rest. What you
  // are about to sell matters more than a draft with no dates.
  out.sort((a, b) => {
    if (a.nextStart && b.nextStart) return a.nextStart < b.nextStart ? -1 : 1;
    if (a.nextStart) return -1;
    if (b.nextStart) return 1;
    if (a.websiteVisible !== b.websiteVisible) return a.websiteVisible ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return out;
}
