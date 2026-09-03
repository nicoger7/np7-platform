import { createAdminClient } from "@/lib/supabase";
import { getSendTiming } from "@/lib/email/readiness";

/**
 * The four values behind the "what happens next" block in the mails.
 *
 * Built in one place because the block is used by the signup mail, the
 * payment-received mail and the balance mail, and three copies of "when does
 * the crew chat open" would answer differently within a month. Every value is
 * derived: the chat date comes from the admin's own mail schedule, so moving
 * the lead time moves the sentence.
 */
export type NextStepsVars = {
  crewChatWhen?: string;
  experienceLink?: string;
  supportWhatsapp?: string;
  addonsSummary?: string;
};

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export async function nextStepsVars(opts: {
  experienceId?: string | null;
  editionId?: string | null;
  /** The booked package. Decides whether extra NIGHTS can be offered at all. */
  packageId?: string | null;
  origin: string;
}): Promise<NextStepsVars> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const out: NextStepsVars = {};

  const [timing, edRes, expRes, coRes] = await Promise.all([
    getSendTiming().catch(() => null),
    opts.editionId
      ? db.from("exp_editions").select("date_start").eq("id", opts.editionId).maybeSingle()
      : Promise.resolve({ data: null }),
    opts.experienceId
      ? db.from("exp_experiences").select("slug").eq("id", opts.experienceId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("company_settings").select("phone").eq("division", "experience").maybeSingle(),
  ]);

  // The crew chat date is the mail schedule's own crew_forming lead time, so
  // the promise and the send can never drift apart.
  /* One answer, in three states, never a vague one when a date exists. The
     first version left crewChatWhen empty once the date had passed, so two
     mails about the same trip said different things: one named a date, the
     other said "a few weeks before". A guest reading both learns that we do
     not know. */
  const lead = (timing as { before?: Record<string, number | null | undefined> } | null)?.before?.crew_forming;
  const start = edRes?.data?.date_start as string | undefined;
  if (start && lead != null) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - lead);
    out.crewChatWhen = d.getTime() > Date.now() ? fmt(d) : "open";
  }

  if (expRes?.data?.slug) out.experienceLink = `${opts.origin}/experience/${expRes.data.slug}`;

  const phone = String(coRes?.data?.phone ?? "").replace(/[^\d]/g, "");
  if (phone) out.supportWhatsapp = `https://wa.me/${phone}`;

  /* Only name add-ons this booking can actually take.
   *
   * The first version listed component CATEGORIES for the experience, and on a
   * "No Hotel" package it cheerfully offered accommodation. Extra nights are
   * only ever the guest's OWN room (the portal enforces that), so a package
   * with no hotel cannot be sold a night at all, and the mail was promising the
   * one thing that booking can never have. Accommodation is therefore named
   * only when the booked package has a hotel. */
  let packageHasHotel = false;
  if (opts.packageId) {
    const { data: pkg } = await db.from("exp_packages").select("hotel_id").eq("id", opts.packageId).maybeSingle();
    packageHasHotel = !!pkg?.hotel_id;
  }
  if (opts.experienceId) {
    const { data: comps } = await db
      .from("exp_components")
      .select("name, category, addon_available, experience_id, is_global")
      .is("archived_at", null)
      .eq("addon_available", true)
      .or(`experience_id.eq.${opts.experienceId},experience_id.is.null,is_global.eq.true`)
      .limit(20);
    // Categories, not product names: "extra nights and gear" is a sentence a
    // guest understands, four component names is a list they skim past.
    const ACCO = /accommodation|hotel|room|night/i;
    const cats = [...new Set(
      ((comps ?? []) as { name: string | null; category: string | null }[])
        .map((c) => String(c.category ?? c.name ?? "").trim().toLowerCase())
        .filter(Boolean)
        // A room this booking has no claim to is not an add-on, it is a wrong promise.
        .filter((c) => packageHasHotel || !ACCO.test(c))
        .map((c) => (ACCO.test(c) ? "extra nights" : c))
    )].slice(0, 3);
    if (cats.length) {
      out.addonsSummary = cats.length === 1
        ? cats[0]
        : `${cats.slice(0, -1).join(", ")} and ${cats[cats.length - 1]}`;
    }
  }

  return out;
}
