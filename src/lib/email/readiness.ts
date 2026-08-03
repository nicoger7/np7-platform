import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS } from "@/lib/email/automations";

/**
 * Is an edition's content ready for the mails it is about to send?
 *
 * The lifecycle cron fires on a schedule derived from the trip start date, and
 * the templates degrade silently: `pre_trip_info` renders
 * `(v.packingList ? … : "")`, so an empty packing list simply drops the section
 * and a "Getting ready" mail goes out 21 days before the trip with nothing in
 * it, unlogged. Nothing checked, nothing warned, no deadline anywhere.
 *
 * This module is the missing check. It is deliberately data-only and pure of
 * UI: the edition panel, the dashboard warning and the cron's skip guard all
 * read the same requirements, so what you see on screen is exactly what the
 * cron will do.
 */

/**
 * The BUILT-IN lead times, in days BEFORE the edition start date.
 *
 * These are defaults, not the truth: a row in `email_send_timing` (migration
 * 138) replaces any of them, and everything that needs a real send date goes
 * through `getSendTiming()` rather than reading this directly.
 */
export const SEND_SCHEDULE = {
  crew_forming: 60,
  pre_trip_info: 21,
  pre_trip_excitement: 12,
  waiver_reminder: 14,
  pre_trip_final: 3,
} as const;

/**
 * Mails timed from the END of the trip, in days after.
 *
 * Same nightly job, same arithmetic — the only difference from SEND_SCHEDULE is
 * which end of the week it counts from. Leaving these out made a perfectly
 * dated mail look condition-driven, and the panel then told Nico there was
 * "no send date" for a mail that goes out three days after everyone flies home.
 */
export const SEND_AFTER_END = {
  post_trip_thank_you: 3,
} as const;

/**
 * Which mails hand over to each other.
 *
 * The cron fires anywhere inside a WINDOW, not on the single ideal day — a
 * guest who books five weeks out must still get the pre-trip mail. Those
 * windows used to be a second hand-written copy of the lead times
 * (60→21→12→3), so editing one lead without editing its neighbour's boundary
 * opened a stretch of days where nothing fired at all, silently.
 *
 * So the boundaries are derived instead (see `deriveWindows`): inside a chain
 * the mails are sorted and each one's window runs until the next one opens,
 * which makes a gap arithmetically impossible whatever leads are set.
 *
 * Why chains rather than one global sort: the waiver reminder runs ALONGSIDE
 * the pre-trip chain, not in it (14→2 overlaps three of them by design — it is
 * conditional on an unsigned waiver, so it is not "the mail of that week"). Put
 * it in the same chain and it would cut the pre-trip mails in half. `floor` is
 * where the last mail of a chain stops: -1 for the pre-trip chain means "still
 * fires on the start day itself", 2 for the waiver means "stop nagging two
 * days out".
 */
const BEFORE_CHAINS: { keys: string[]; floor: number }[] = [
  { keys: ["crew_forming", "pre_trip_info", "pre_trip_excitement", "pre_trip_final"], floor: -1 },
  { keys: ["waiver_reminder"], floor: 2 },
];
/** Same idea counting forward from the last day of the trip. */
const AFTER_CHAINS: { keys: string[]; ceiling: number }[] = [
  { keys: ["post_trip_thank_you"], ceiling: 14 },
];

export type SendTiming = {
  /** effective lead, in days before the trip starts */
  before: Record<string, number>;
  /** effective lead, in days after the trip ends */
  afterEnd: Record<string, number>;
  /** derived: the cron may fire while `daysToStart > close` (exclusive) */
  windowClose: Record<string, number>;
  /** derived: the cron may fire while `daysSinceEnd <= close` (inclusive) */
  windowCloseAfterEnd: Record<string, number>;
  /** which keys are running on an admin-set value rather than the built-in one */
  overridden: string[];
};

/**
 * Turn a set of leads into the windows the cron fires in.
 *
 * Pure, and the ONLY place a window boundary is decided. Within a chain the
 * leads are sorted from earliest to latest; each mail's window closes exactly
 * where the next mail's opens, so the chain tiles the run-up to the trip with
 * no gap — whatever leads are set, and even if an edit reorders them.
 *
 * The clamp handles the one case sorting can't: two mails on the same day would
 * leave the first with a window of no days at all, so it keeps its own due day
 * and the other covers the rest. An overlap sends one mail twice on one day; a
 * gap sends nothing, ever, and says nothing about it.
 */
export function deriveWindows(
  before: Record<string, number>,
  afterEnd: Record<string, number>,
): { windowClose: Record<string, number>; windowCloseAfterEnd: Record<string, number> } {
  const windowClose: Record<string, number> = {};
  for (const chain of BEFORE_CHAINS) {
    const ordered = chain.keys
      .filter((k) => before[k] != null)
      .sort((a, b) => before[b] - before[a]); // furthest out first
    ordered.forEach((key, i) => {
      const next = ordered[i + 1];
      const close = next != null ? before[next] : chain.floor;
      // A boundary at or past this mail's own lead would give it no days to
      // fire in. Clamp so every mail keeps at least the day it is due.
      windowClose[key] = Math.min(close, before[key] - 1);
    });
  }

  const windowCloseAfterEnd: Record<string, number> = {};
  for (const chain of AFTER_CHAINS) {
    const ordered = chain.keys
      .filter((k) => afterEnd[k] != null)
      .sort((a, b) => afterEnd[a] - afterEnd[b]); // soonest after the trip first
    ordered.forEach((key, i) => {
      const next = ordered[i + 1];
      const close = next != null ? afterEnd[next] - 1 : chain.ceiling;
      windowCloseAfterEnd[key] = Math.max(close, afterEnd[key]);
    });
  }

  return { windowClose, windowCloseAfterEnd };
}

/** Shape the admin UI saves and the resolver reads. */
export type TimingOverrideRow = { template_key: string; days_before: number | null; days_after_end: number | null };

/** The built-in schedule plus any saved overrides, with windows derived from the result. */
export function applyTimingOverrides(rows: TimingOverrideRow[]): SendTiming {
  const before: Record<string, number> = { ...SEND_SCHEDULE };
  const afterEnd: Record<string, number> = { ...SEND_AFTER_END };
  const overridden: string[] = [];
  for (const r of rows) {
    if (!r?.template_key) continue;
    // An override only counts on the anchor the mail actually uses — a
    // days_after_end on a pre-trip mail would otherwise invent a second date.
    if (r.days_before != null && r.template_key in before) {
      before[r.template_key] = r.days_before;
      overridden.push(r.template_key);
    } else if (r.days_after_end != null && r.template_key in afterEnd) {
      afterEnd[r.template_key] = r.days_after_end;
      overridden.push(r.template_key);
    }
  }
  return { before, afterEnd, ...deriveWindows(before, afterEnd), overridden };
}

/**
 * The effective schedule. One source of truth: the cron, the edition Mailing
 * tab and the Emails page all call this, so what the admin reads is exactly
 * what the nightly job will do.
 */
export async function getSendTiming(): Promise<SendTiming> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("email_send_timing").select("template_key, days_before, days_after_end");
    return applyTimingOverrides((data ?? []) as TimingOverrideRow[]);
  } catch {
    // Table not migrated yet — the built-in schedule is a complete answer.
    return applyTimingOverrides([]);
  }
}

/** Which anchor a mail counts from, or null if it has no send date at all. */
export const timingAnchor = (key: string): "before" | "afterEnd" | null =>
  key in SEND_SCHEDULE ? "before" : key in SEND_AFTER_END ? "afterEnd" : null;

export type SendTimingRow = {
  key: string;
  name: string;
  trigger: string;
  anchor: "before" | "afterEnd";
  days: number;
  /** what it would be with nothing saved — the way back from a regretted number */
  defaultDays: number;
  windowClose: number;
  overridden: boolean;
};

/**
 * Every dated mail with its effective timing, in trip order.
 *
 * Both admin surfaces (the Emails page and the edition Mailing tab) render this
 * exact list, so neither can drift from the other or from the cron.
 */
export async function listSendTiming(): Promise<SendTimingRow[]> {
  const timing = await getSendTiming();
  const overridden = new Set(timing.overridden);
  return AUTOMATIONS.filter((a) => timingAnchor(a.key)).map((a) => {
    const anchor = timingAnchor(a.key)!;
    return {
      key: a.key,
      name: a.name,
      trigger: a.trigger,
      anchor,
      days: anchor === "before" ? timing.before[a.key] : timing.afterEnd[a.key],
      defaultDays: anchor === "before"
        ? SEND_SCHEDULE[a.key as keyof typeof SEND_SCHEDULE]
        : SEND_AFTER_END[a.key as keyof typeof SEND_AFTER_END],
      windowClose: anchor === "before" ? timing.windowClose[a.key] : timing.windowCloseAfterEnd[a.key],
      overridden: overridden.has(a.key),
    };
  }).sort((x, y) => {
    // Trip order: furthest out first, post-trip last.
    const k = (m: SendTimingRow) => (m.anchor === "before" ? m.days : -m.days);
    return k(y) - k(x);
  });
}

export type ContentKey = "packingList" | "preTripNote" | "whatsappLink" | "finalDetailsNote";

/**
 * What each mail needs.
 *
 * `blocking` — the mail is pointless or embarrassing without it, so the cron
 *   holds it back rather than sending a hollow one. The packing list IS the
 *   pre-trip mail; sending "here's how to get ready" with no list is worse than
 *   sending nothing, because the guest reads it and stops expecting one.
 *
 * `soft` — nice to have, degrades honestly. A missing pre-trip note just means
 *   one less paragraph; a missing WhatsApp link is one less line. These show as
 *   warnings on the panel and never hold a mail back.
 */
export const MAIL_REQUIREMENTS: Record<string, { blocking: ContentKey[]; soft: ContentKey[]; label: string }> = {
  // The whole mail is "join the chat" — without a link there is nothing to join,
  // so it holds rather than going out hollow.
  crew_forming: { blocking: ["whatsappLink"], soft: [], label: "Crew forming (group chat)" },
  pre_trip_info: { blocking: ["packingList"], soft: ["preTripNote"], label: "Pre-trip info (packing)" },
  pre_trip_excitement: { blocking: [], soft: ["whatsappLink"], label: "Excitement beat" },
  pre_trip_final: { blocking: [], soft: ["whatsappLink", "finalDetailsNote"], label: "Final countdown" },
  waiver_reminder: { blocking: [], soft: [], label: "Waiver reminder" },
};

export const CONTENT_LABELS: Record<ContentKey, { label: string; where: string }> = {
  packingList: { label: "Packing list", where: "Edition → Details, or the experience's Event Content" },
  preTripNote: { label: "Pre-trip note", where: "Edition → Details, or the experience's Event Content" },
  whatsappLink: { label: "WhatsApp group link", where: "Edition → Details" },
  finalDetailsNote: { label: "Final-details note", where: "Edition → Mailing (the 3-days-before mail)" },
};

export type ReadinessItem = {
  key: ContentKey;
  label: string;
  where: string;
  present: boolean;
  /** mails that will be HELD BACK while this is missing */
  blocks: string[];
  /** mails that merely lose a section */
  degrades: string[];
  /** last day this can be filled in before the earliest mail needing it fires */
  dueDate: string | null;
  daysLeft: number | null;
  /** the earliest blocked mail has already passed its send window */
  overdue: boolean;
};

export type EditionReadiness = {
  editionId: string;
  startDate: string | null;
  inherited: { packingList: string | null; preTripNote: string | null };
  daysToStart: number | null;
  items: ReadinessItem[];
  blockingMissing: number;
  softMissing: number;
};

/** The content an edition actually resolves to, edition value overriding the experience. */
export async function resolveEditionContent(editionId: string): Promise<{
  startDate: string | null;
  values: Record<ContentKey, string | null>;
  /** what the EXPERIENCE level holds, so the edition editor can show what it
   *  would fall back to — you cannot judge whether to override something you
   *  cannot see. */
  inherited: { packingList: string | null; preTripNote: string | null };
  /** which level supplied the value actually in use */
  source: Record<ContentKey, "edition" | "experience" | null>;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: ed } = await db
    .from("exp_editions")
    .select("id, date_start, experience_id, pre_trip_note, packing_list, whatsapp_group_link, final_details_note")
    .eq("id", editionId)
    .maybeSingle();
  if (!ed) {
    return {
      startDate: null,
      values: { packingList: null, preTripNote: null, whatsappLink: null, finalDetailsNote: null },
      inherited: { packingList: null, preTripNote: null },
      source: { packingList: null, preTripNote: null, whatsappLink: null, finalDetailsNote: null },
    };
  }

  let expContent: { packing_list?: string | null; pre_trip_note?: string | null } = {};
  if (ed.experience_id) {
    const { data } = await db
      .from("exp_content")
      .select("packing_list, pre_trip_note")
      .eq("experience_id", ed.experience_id)
      .maybeSingle();
    expContent = data ?? {};
  }

  const pick = (a: unknown, b: unknown) => {
    const v = (typeof a === "string" && a.trim()) || (typeof b === "string" && b.trim()) || "";
    return v || null;
  };
  const trim = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const from = (edVal: unknown, expVal: unknown): "edition" | "experience" | null =>
    trim(edVal) ? "edition" : trim(expVal) ? "experience" : null;

  return {
    startDate: ed.date_start ?? null,
    values: {
      // edition wins, experience is the fallback — same rule the cron uses
      packingList: pick(ed.packing_list, expContent.packing_list),
      preTripNote: pick(ed.pre_trip_note, expContent.pre_trip_note),
      whatsappLink: pick(ed.whatsapp_group_link, null),
      // Edition-only on purpose: "final details" are this week's logistics —
      // there is nothing meaningful to inherit from the experience.
      finalDetailsNote: pick(ed.final_details_note, null),
    },
    inherited: {
      packingList: trim(expContent.packing_list),
      preTripNote: trim(expContent.pre_trip_note),
    },
    source: {
      packingList: from(ed.packing_list, expContent.packing_list),
      preTripNote: from(ed.pre_trip_note, expContent.pre_trip_note),
      whatsappLink: from(ed.whatsapp_group_link, null),
      finalDetailsNote: from(ed.final_details_note, null),
    },
  };
}

const DAY = 86_400_000;

export async function getEditionReadiness(editionId: string, now = new Date()): Promise<EditionReadiness> {
  const { startDate, values, inherited } = await resolveEditionContent(editionId);
  // The deadline shown to the admin has to be the deadline the cron works to,
  // so it comes from the effective schedule and not the built-in constant.
  const timing = await getSendTiming();
  const daysToStart = startDate
    ? Math.ceil((new Date(startDate).getTime() - now.getTime()) / DAY)
    : null;

  const items: ReadinessItem[] = (Object.keys(CONTENT_LABELS) as ContentKey[]).map((key) => {
    const blocks: string[] = [];
    const degrades: string[] = [];
    let earliestLead: number | null = null;

    for (const [mail, req] of Object.entries(MAIL_REQUIREMENTS)) {
      const lead = timing.before[mail];
      if (req.blocking.includes(key)) {
        blocks.push(req.label);
        if (lead != null) earliestLead = earliestLead == null ? lead : Math.max(earliestLead, lead);
      } else if (req.soft.includes(key)) {
        degrades.push(req.label);
        if (lead != null) earliestLead = earliestLead == null ? lead : Math.max(earliestLead, lead);
      }
    }

    // Due the day BEFORE the first mail that needs it goes out.
    const dueDate =
      startDate && earliestLead != null
        ? new Date(new Date(startDate).getTime() - (earliestLead + 1) * DAY).toISOString().slice(0, 10)
        : null;
    const daysLeft = dueDate ? Math.ceil((new Date(dueDate).getTime() - now.getTime()) / DAY) : null;

    return {
      key,
      label: CONTENT_LABELS[key].label,
      where: CONTENT_LABELS[key].where,
      present: !!values[key],
      blocks,
      degrades,
      dueDate,
      daysLeft,
      overdue: !values[key] && daysLeft != null && daysLeft < 0,
    };
  });

  return {
    editionId,
    startDate,
    inherited,
    daysToStart,
    items,
    blockingMissing: items.filter((i) => !i.present && i.blocks.length > 0).length,
    softMissing: items.filter((i) => !i.present && i.blocks.length === 0 && i.degrades.length > 0).length,
  };
}

/**
 * The cron's guard. Given the vars it already assembled, may this mail go out?
 * Pure and synchronous — the cron has the values in hand and must not do
 * another round-trip per booking.
 */
export function mailContentReady(
  templateKey: string,
  vars: Record<string, unknown>,
): { ok: true } | { ok: false; missing: ContentKey[] } {
  const req = MAIL_REQUIREMENTS[templateKey];
  if (!req || req.blocking.length === 0) return { ok: true };
  const missing = req.blocking.filter((k) => {
    const v = vars[k];
    return !(typeof v === "string" ? v.trim() : v);
  });
  return missing.length ? { ok: false, missing } : { ok: true };
}
