import "server-only";
import { createAdminClient } from "@/lib/supabase";

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

/** When each scheduled mail fires, in days BEFORE the edition start date. */
export const SEND_SCHEDULE = {
  pre_trip_info: 21,
  pre_trip_excitement: 12,
  waiver_reminder: 14,
  pre_trip_final: 3,
} as const;

export type ContentKey = "packingList" | "preTripNote" | "whatsappLink";

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
  pre_trip_info: { blocking: ["packingList"], soft: ["preTripNote"], label: "Pre-trip info (packing)" },
  pre_trip_excitement: { blocking: [], soft: ["whatsappLink"], label: "Excitement beat" },
  pre_trip_final: { blocking: [], soft: ["whatsappLink"], label: "Final countdown" },
  waiver_reminder: { blocking: [], soft: [], label: "Waiver reminder" },
};

export const CONTENT_LABELS: Record<ContentKey, { label: string; where: string }> = {
  packingList: { label: "Packing list", where: "Edition → Details, or the experience's Event Content" },
  preTripNote: { label: "Pre-trip note", where: "Edition → Details, or the experience's Event Content" },
  whatsappLink: { label: "WhatsApp group link", where: "Edition → Details" },
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
  daysToStart: number | null;
  items: ReadinessItem[];
  blockingMissing: number;
  softMissing: number;
};

/** The content an edition actually resolves to, edition value overriding the experience. */
export async function resolveEditionContent(editionId: string): Promise<{
  startDate: string | null;
  values: Record<ContentKey, string | null>;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: ed } = await db
    .from("exp_editions")
    .select("id, date_start, experience_id, pre_trip_note, packing_list, whatsapp_group_link")
    .eq("id", editionId)
    .maybeSingle();
  if (!ed) return { startDate: null, values: { packingList: null, preTripNote: null, whatsappLink: null } };

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
  return {
    startDate: ed.date_start ?? null,
    values: {
      // edition wins, experience is the fallback — same rule the cron uses
      packingList: pick(ed.packing_list, expContent.packing_list),
      preTripNote: pick(ed.pre_trip_note, expContent.pre_trip_note),
      whatsappLink: pick(ed.whatsapp_group_link, null),
    },
  };
}

const DAY = 86_400_000;

export async function getEditionReadiness(editionId: string, now = new Date()): Promise<EditionReadiness> {
  const { startDate, values } = await resolveEditionContent(editionId);
  const daysToStart = startDate
    ? Math.ceil((new Date(startDate).getTime() - now.getTime()) / DAY)
    : null;

  const items: ReadinessItem[] = (Object.keys(CONTENT_LABELS) as ContentKey[]).map((key) => {
    const blocks: string[] = [];
    const degrades: string[] = [];
    let earliestLead: number | null = null;

    for (const [mail, req] of Object.entries(MAIL_REQUIREMENTS)) {
      const lead = SEND_SCHEDULE[mail as keyof typeof SEND_SCHEDULE];
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
