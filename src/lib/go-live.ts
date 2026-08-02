import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { isLostStatus } from "@/lib/types";
import { defaultCancellationPolicy } from "@/lib/cancellation-policy";
import {
  DEFAULT_DAILY_PROGRAM, DEFAULT_FAQ, DEFAULT_OUTCOMES, DEFAULT_WEEK_TITLE, sameAsDefault,
} from "@/lib/experience-defaults";

/**
 * Is this trip ready to be sold?
 *
 * One registry, so the page and any inline panel can never disagree. Modelled
 * on the mail-readiness shape that already works: every row says what is wrong,
 * whether it stops you, and where to go and fix it.
 *
 * Rules learned the hard way:
 *  - BLOCKER means a buyer sees something broken or we take money against
 *    something incomplete. Everything else is a warning. A list where
 *    everything is red is a list nobody reads.
 *  - Scope matters. "Has a hero photo" is about an experience; "has packages"
 *    is about a week. A single flat score per experience hides a broken week,
 *    which is exactly how the old widget missed things.
 *  - Only weeks that are still ahead. A week that already ran cannot be made
 *    ready, and listing it just inflates the count with work nobody will do.
 *  - An empty field is not automatically a gap. Where a sensible platform-wide
 *    default already applies (cancellation terms), the check passes and the
 *    field stays there as an override.
 */

export type CheckSeverity = "blocker" | "warning";

/**
 * Enough to edit the field from the checklist itself.
 *
 * Only for single plain fields — anything involving a picker, an upload or a
 * child table links out to the real editor instead. `table` + `column` are
 * whitelisted server-side; nothing here is trusted.
 */
export type CheckFix = {
  table: "exp_experiences" | "exp_editions" | "exp_content";
  /** Row id — for exp_content this is the EXPERIENCE id (the row is upserted). */
  id: string;
  column: string;
  kind: "text" | "textarea" | "number" | "url";
  /** Heading in the edit box. */
  title: string;
  help?: string;
  value: string | number | null;
  /** What guests get when this is left empty. Shown under the box — you cannot
   *  judge whether to override something you cannot read. */
  fallback?: string;
};

export type CheckResult = {
  id: string;
  label: string;
  severity: CheckSeverity;
  ok: boolean;
  /** What's wrong — shown when !ok. */
  detail?: string;
  /** Shown on a passing row, when there's something worth saying. */
  okDetail?: string;
  /** Where to fix it. */
  href: string;
  /** Editable right here, without leaving the list. */
  fix?: CheckFix;
};

export type EditionReport = {
  id: string;
  /** Only when it says something the dates don't — "2026-08-17" as a label is
   *  the date twice over, so it is dropped rather than printed beside itself. */
  label: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  status: string | null;
  checks: CheckResult[];
  blockers: number;
  warnings: number;
};

export type ExperienceReport = {
  id: string;
  title: string;
  websiteVisible: boolean;
  /** published / draft / archived — same grouping as the Experiences overview. */
  status: string | null;
  /** Soonest upcoming week, for ordering within a group. */
  nextStart: string | null;
  checks: CheckResult[];
  editions: EditionReport[];
  /** Blockers across the experience AND its upcoming editions. */
  blockers: number;
  warnings: number;
};

const ok = (
  id: string,
  label: string,
  severity: CheckSeverity,
  pass: boolean,
  href: string,
  detail?: string,
  extra?: { fix?: CheckFix; okDetail?: string },
): CheckResult => ({
  id, label, severity, ok: pass, href,
  ...(pass ? {} : { detail }),
  ...(pass && extra?.okDetail ? { okDetail: extra.okDetail } : {}),
  ...(extra?.fix ? { fix: extra.fix } : {}),
});

const has = (v: unknown) => v != null && String(v).trim() !== "";

export async function runGoLiveChecks(): Promise<ExperienceReport[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // One pass, eight queries — not one query per check per experience.
  const [{ data: exps }, { data: content }, { data: editions }, { data: packages }, { data: bookings }, { data: hotels }, { data: destinations }, { data: placements }] =
    await Promise.all([
      db.from("exp_experiences").select("id,title,location,description,hero_image,gallery,price,website_visible,cancellation_policy,status,destination_id").is("archived_at", null),
      db.from("exp_content").select("*"),
      db.from("exp_editions").select("id,experience_id,label,date_start,date_end,max_spots,status,deposit,whatsapp_group_link").is("archived_at", null),
      db.from("exp_packages").select("id,experience_id,edition_id,name,price,status,website_visible,hotel_id").is("archived_at", null),
      db.from("exp_bookings").select("id,edition_id,status,downpayment_received,final_payment_received"),
      db.from("hotels").select("id,name,image_url,description").is("archived_at", null),
      db.from("destinations").select("id,intro,tagline"),
      db.from("exp_review_placements").select("experience_id"),
    ]);

  type Row = Record<string, unknown>;
  const contentBy = new Map<string, Row>();
  for (const c of (content ?? []) as Row[]) contentBy.set(String(c.experience_id), c);
  const hotelById = new Map<string, Row>();
  for (const h of (hotels ?? []) as Row[]) hotelById.set(String(h.id), h);

  // "The spot" falls back to the linked destination's own intro, so an empty
  // location_about is only a gap when there is nothing behind it.
  const destHasText = new Set<string>();
  for (const d of (destinations ?? []) as Row[]) {
    if (has(d.intro) || has(d.tagline)) destHasText.add(String(d.id));
  }
  const reviewCount = new Map<string, number>();
  for (const pl of (placements ?? []) as Row[]) {
    reviewCount.set(String(pl.experience_id), (reviewCount.get(String(pl.experience_id)) ?? 0) + 1);
  }

  const securedByEdition = new Map<string, number>();
  for (const b of (bookings ?? []) as Row[]) {
    if (!b.edition_id || isLostStatus(b.status as string)) continue;
    const counts = b.downpayment_received || b.final_payment_received
      || ["confirmed", "paid", "attended"].includes(String(b.status));
    if (counts) securedByEdition.set(String(b.edition_id), (securedByEdition.get(String(b.edition_id)) ?? 0) + 1);
  }

  const today = new Date().toISOString().slice(0, 10);
  /** Still ahead of us — or undated, since missing dates is itself a blocker. */
  const stillAhead = (ed: Row) => {
    const end = (ed.date_end as string | null) ?? (ed.date_start as string | null);
    if (!end) return true;
    return String(end).slice(0, 10) >= today;
  };

  const reports: ExperienceReport[] = [];

  for (const e of (exps ?? []) as Row[]) {
    const id = String(e.id);
    const c = contentBy.get(id) ?? {};
    const content_ = `/admin/content/${id}`;
    const detail = `/admin/experiences/${id}`;
    const gallery = (e.gallery as unknown[] | null)?.length || (c.gallery as unknown[] | null)?.length || 0;

    const expChecks: CheckResult[] = [
      ok("tileImage", "Card & hero photo", "blocker", has(e.hero_image) || has(c.hero_image), `${content_}?tab=media`, "No image — the listing card and page hero are empty"),
      ok("location", "Location", "blocker", has(e.location), detail, "No place name on the card or page", {
        fix: { table: "exp_experiences", id, column: "location", kind: "text", title: "Location", help: "Town and country, as it should read on the card — e.g. “Alacati, Turkey”.", value: (e.location as string) ?? null },
      }),
      ok("description", "Intro text", "warning", has(e.description), detail, "The page opens with nothing to read", {
        fix: { table: "exp_experiences", id, column: "description", kind: "textarea", title: "Intro text", help: "The first paragraph on the experience page.", value: (e.description as string) ?? null },
      }),
      ok("gallery", "Photo gallery", gallery === 0 ? "blocker" : "warning", gallery >= 3, `${content_}?tab=media`,
        gallery === 0 ? "No photos at all" : `Only ${gallery} photo${gallery === 1 ? "" : "s"} — aim for 3+`,
        { okDetail: `${gallery} photos` }),
      // Not a gap: the standard EU package-travel terms cover every trip and are
      // in the Terms and the trip files. This field is an override for the ones
      // that genuinely differ.
      ok("cancellationPolicy", "Cancellation terms", "warning", true, detail, undefined, {
        okDetail: has(e.cancellation_policy) ? "Own terms set for this trip" : "Standard EU terms — override only if this trip differs",
        fix: { table: "exp_experiences", id, column: "cancellation_policy", kind: "textarea", title: "Cancellation terms", help: "This is the short summary a guest reads on their trip page — not the full legal terms, which live on /terms and in the trip files. Leave it empty and every guest gets the standard wording below. Fill it in only when this trip genuinely differs (a charter, a non-refundable flight block).", value: (e.cancellation_policy as string) ?? null, fallback: defaultCancellationPolicy(false) },
      }),
      ok("packingList", "Packing list", "warning", has(c.packing_list), `${content_}?tab=pretrip`, "The pre-trip email is held back without it", {
        fix: { table: "exp_content", id, column: "packing_list", kind: "textarea", title: "Packing list", help: "One item per line. Shown in the member portal and the pre-trip email.", value: (c.packing_list as string) ?? null },
      }),

      // ── the page copy ────────────────────────────────────────────────────
      // Two different failures, and the second one is invisible without help:
      // a field can be full and still be the shared default every other trip
      // carries, so the page looks finished while a wave clinic promises
      // "better jibes". Comparing against the default is how we see it.
      ok("locationAbout", "About the spot", "blocker",
        has(c.location_about) || (!!e.destination_id && destHasText.has(String(e.destination_id))),
        `${content_}?tab=story`, "The spot section is empty and there's no destination text behind it"),
      ok("weekInfo", "Your week", "warning", has(c.week_info), `${content_}?tab=story`,
        "The paragraph under the ‘Your week’ intro is blank"),
      ok("windFacts", "Wind facts", "warning", has(c.wind_range) || has(c.wind_probability), `${content_}?tab=story`,
        "No wind range or probability — the quick-facts bar and the ‘You can count on it’ band have nothing"),
      ok("review", "A guest review", "warning", (reviewCount.get(id) ?? 0) > 0, "/admin/guest-reviews",
        "No review on this experience — the strongest thing on the page is missing",
        { okDetail: `${reviewCount.get(id) ?? 0} on the page` }),
      ok("weekTitle", "Week headline", "warning",
        has(c.week_title) && String(c.week_title).trim() !== DEFAULT_WEEK_TITLE,
        `${content_}?tab=story`, "Still the standard headline every trip carries"),
      ok("outcomes", "What you take home", "warning", !sameAsDefault(c.week_outcomes, DEFAULT_OUTCOMES),
        `${content_}?tab=story`, "Still the standard six cards"),
      ok("program", "Day by day", "warning", !sameAsDefault(c.daily_program, DEFAULT_DAILY_PROGRAM),
        `${content_}?tab=program`, "Still the standard week — a buyer sees the same plan on every trip"),
      ok("faq", "FAQ", "warning", !sameAsDefault(c.faq, DEFAULT_FAQ),
        `${content_}?tab=faq`, "Still the standard answers"),
    ];

    const eds = ((editions ?? []) as Row[]).filter((x) => String(x.experience_id) === id && stillAhead(x));
    const edReports: EditionReport[] = eds.map((ed) => {
      const edId = String(ed.id);
      const base = `/admin/editions/${edId}`;
      const pkgs = ((packages ?? []) as Row[]).filter(
        (p) => String(p.edition_id) === edId || (!p.edition_id && String(p.experience_id) === id),
      );
      const sellable = pkgs.filter((p) => p.status === "active" && p.website_visible !== false && p.price != null);
      const noHotel = sellable.filter((p) => !p.hotel_id);
      const hotelIds = [...new Set(sellable.map((p) => p.hotel_id).filter(Boolean))] as string[];
      const thinHotels = hotelIds.filter((h) => {
        const hotel = hotelById.get(h);
        return !hotel || !has(hotel.image_url) || !has(hotel.description);
      });
      const secured = securedByEdition.get(edId) ?? 0;
      const cap = ed.max_spots as number | null;

      const checks: CheckResult[] = [
        ok("dates", "Dates set", "blocker", has(ed.date_start) && has(ed.date_end), `${base}?tab=details`, "No dates — it can't be sold or scheduled"),
        ok("maxSpots", "Capacity set", "blocker", cap != null, `${base}?tab=details`, "No capacity — nothing stops it overselling", {
          okDetail: cap != null ? `${cap} spots` : undefined,
          fix: { table: "exp_editions", id: edId, column: "max_spots", kind: "number", title: "Capacity", help: "How many guests this week can take.", value: cap },
        }),
        ok("packages", "Sellable packages", "blocker", sellable.length > 0, `${base}?tab=packages`,
          pkgs.length ? `${pkgs.length} package${pkgs.length === 1 ? "" : "s"}, none active + visible + priced` : "No packages at all",
          { okDetail: `${sellable.length} on sale` }),
        ok("capacitySane", "Capacity vs bookings", "warning", cap == null || secured <= cap, `${base}?tab=details`,
          `${secured} secured against a capacity of ${cap} — the page will say "fully booked"`,
          { okDetail: cap != null ? `${secured}/${cap} secured` : undefined }),
        ok("packageHotel", "Packages have a hotel", "warning", noHotel.length === 0, `${base}?tab=packages`,
          `${noHotel.length} package${noHotel.length === 1 ? "" : "s"} with no hotel — the trip page can't show where they stay`),
        ok("hotelContent", "Hotel has photo & description", "warning", thinHotels.length === 0, "/admin/hotels",
          `${thinHotels.length} hotel${thinHotels.length === 1 ? "" : "s"} missing a photo or description`),
        ok("deposit", "Deposit decided", "warning", ed.deposit != null, `${base}?tab=details`,
          "Not set — the payment plan falls back to a €300 default nobody chose", {
            okDetail: Number(ed.deposit) === 0 ? "No deposit — 50% downpayment secures the spot" : `€${ed.deposit}`,
            fix: { table: "exp_editions", id: edId, column: "deposit", kind: "number", title: "Deposit", help: "Enter 0 when there is no deposit and the 50% downpayment secures the spot. Left empty, the plan falls back to €300.", value: (ed.deposit as number) ?? null },
          }),
        ok("whatsapp", "Group chat link", "warning", has(ed.whatsapp_group_link), `${base}?tab=details`,
          "The crew-forming email is held back without it", {
            fix: { table: "exp_editions", id: edId, column: "whatsapp_group_link", kind: "url", title: "Group chat link", help: "The WhatsApp invite link for this week's crew.", value: (ed.whatsapp_group_link as string) ?? null },
          }),
      ];
      // A label that is just the start date is noise next to the formatted range.
      const rawLabel = String(ed.label ?? "").trim();
      const dateish = /^\d{4}-\d{2}-\d{2}$/.test(rawLabel)
        || rawLabel === String(ed.date_start ?? "").slice(0, 10);
      return {
        id: edId,
        label: rawLabel && !dateish ? rawLabel : null,
        dateStart: (ed.date_start as string | null) ?? null,
        dateEnd: (ed.date_end as string | null) ?? null,
        status: (ed.status as string | null) ?? null,
        checks,
        blockers: checks.filter((k) => !k.ok && k.severity === "blocker").length,
        warnings: checks.filter((k) => !k.ok && k.severity === "warning").length,
      };
    }).sort((a, b) => (a.dateStart ?? "9999").localeCompare(b.dateStart ?? "9999"));

    reports.push({
      id,
      title: String(e.title ?? "Untitled"),
      websiteVisible: e.website_visible !== false,
      status: (e.status as string | null) ?? null,
      nextStart: edReports.map((r) => r.dateStart).filter(Boolean).sort()[0] ?? null,
      checks: expChecks,
      editions: edReports,
      blockers: expChecks.filter((k) => !k.ok && k.severity === "blocker").length + edReports.reduce((s, r) => s + r.blockers, 0),
      warnings: expChecks.filter((k) => !k.ok && k.severity === "warning").length + edReports.reduce((s, r) => s + r.warnings, 0),
    });
  }

  // Ordered the way the Experiences overview is: active first, then draft, then
  // archived — and inside each group by the next week's date. Sorting by
  // brokenness put every unfinished draft above the trips actually being sold,
  // which is backwards: the live ones are the ones that cost money to get wrong.
  const STATUS_ORDER = ["published", "draft", "archived"];
  const rank = (s: string | null) => {
    const i = STATUS_ORDER.indexOf(String(s ?? "draft"));
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return reports.sort((a, b) =>
    rank(a.status) - rank(b.status)
    || (a.nextStart ?? "9999").localeCompare(b.nextStart ?? "9999")
    || a.title.localeCompare(b.title));
}
