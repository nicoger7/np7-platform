import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { isLostStatus } from "@/lib/types";
import { defaultCancellationPolicy } from "@/lib/cancellation-policy";
import {
  DEFAULT_DAILY_PROGRAM, DEFAULT_FAQ, DEFAULT_OUTCOMES, DEFAULT_WEEK_INFO, DEFAULT_WEEK_TITLE, sameAsDefault,
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
  /** "Keep the standard" is a valid answer to this one — offer the decision. */
  acceptable?: boolean;
  /** …and it has been taken, so this passes by choice rather than by content. */
  accepted?: boolean;
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
  /** Blockers across the experience AND its upcoming editions that are actually
   *  on sale. A draft week's gaps are counted separately — see draftBlockers. */
  blockers: number;
  warnings: number;
  /**
   * Gaps in weeks that are still DRAFTS, kept out of the headline count.
   *
   * A trip selling in ninety days was reading "3 blocking" because next
   * season's draft weeks had no packages yet — which is what a draft is. An
   * employee then went hunting for a fault in the week that sells, found
   * nothing, and learned to distrust the number. With five destinations across
   * two seasons that is the page's whole future: permanently red, permanently
   * ignored. Nothing is hidden — the draft weeks still list every check when
   * the card is open — it just is not called a blocker until the week is real.
   */
  draftBlockers: number;
  /**
   * How urgent this trip's gaps are, which is not the same as how broken it is.
   *   selling   — on the website with a week ahead: a gap here costs money now
   *   upcoming  — dated and coming, but not yet on sale
   *   unscheduled — no dates yet, so nothing can be sold or go wrong today
   * Unscheduled trips still count and still show; they just sit last, because
   * "we need it ready at some point" is not "a buyer is looking at it".
   */
  tier: "selling" | "upcoming" | "unscheduled";
  /** Days until the next week starts — null when there is none. */
  daysToNext: number | null;
  /** The blocking checks by name, so the closed card can say WHAT is wrong. */
  blockerLabels: string[];
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

/**
 * Checks a trip can settle by DECIDING rather than by changing something.
 *
 * These all ask the same question — "is the shared standard right for this
 * trip?" — and for most trips the honest answer is yes: the template system
 * exists precisely so a week's outcomes, program and FAQ can be shared. But
 * the only way to clear them was to make the content DIFFERENT, so a trip that
 * legitimately runs the standard sat at 12/14 forever with two ambers that no
 * amount of work could close. A checklist that cannot reach the end is one you
 * stop reading — and then it stops protecting the things that DO matter.
 *
 * So "keep the standard" is recorded as the answer it is (migration 160). The
 * row still says the content is standard; it just stops calling it unfinished.
 */
export const ACCEPTABLE_CHECKS = new Set(["weekTitle", "outcomes", "program", "faq", "review"]);

/**
 * Apply the recorded decisions. An accepted check passes and SAYS it is
 * running the standard — silently going green would hide the very thing the
 * check exists to surface.
 */
function applyAccepted(checks: CheckResult[], acceptedRaw: unknown): CheckResult[] {
  const accepted = new Set(
    Array.isArray(acceptedRaw) ? acceptedRaw.filter((x): x is string => typeof x === "string") : [],
  );
  return checks.map((c) => {
    if (!ACCEPTABLE_CHECKS.has(c.id)) return c;
    if (c.ok) return c;   // organisch erfüllt — nichts anzubieten, der Knopf
                          // täte sichtbar nichts (der Bug am Guest-Review)
    if (!accepted.has(c.id)) return { ...c, acceptable: true };
    const { detail: _drop, ...rest } = c;
    return { ...rest, ok: true, acceptable: true, accepted: true, okDetail: `${c.detail} — kept on purpose` };
  });
}

export async function runGoLiveChecks(): Promise<ExperienceReport[]> {
  // The group-chat link is only NEEDED once the crew-forming mail approaches
  // (lead is 60 days by default, admin-overridable). Flagging a week a year
  // out taught people the row is noise. 30 days of runway on top ≈ 90 days.
  const { getSendTiming } = await import("@/lib/email/readiness");
  const crewLead = (await getSendTiming().catch(() => null))?.before?.crew_forming ?? 60;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // One pass, eleven queries — not one query per check per experience.
  const [{ data: exps }, { data: content }, { data: editions }, { data: packages }, { data: bookings }, { data: hotels }, { data: destinations }, { data: placements }, { data: pkgComponents }, { data: physRooms }, { data: pools }, { data: rooms }] =
    await Promise.all([
      db.from("exp_experiences").select("id,title,location,description,hero_image,gallery,price,website_visible,cancellation_policy,status,destination_id").is("archived_at", null),
      db.from("exp_content").select("*"),
      db.from("exp_editions").select("id,experience_id,label,date_start,date_end,max_spots,status,deposit,whatsapp_group_link,packing_list").is("archived_at", null),
      db.from("exp_packages").select("id,experience_id,edition_id,name,price,status,website_visible,hotel_id,room_type").is("archived_at", null),
      db.from("exp_bookings").select("id,edition_id,status,downpayment_received,final_payment_received"),
      db.from("hotels").select("id,name,image_url,description").is("archived_at", null),
      db.from("destinations").select("id,intro,tagline"),
      db.from("exp_review_placements").select("experience_id"),
      db.from("exp_package_components").select("package_id"),
      db.from("exp_rooms").select("id,sleeps").is("archived_at", null),
      // The effective week cap, which may come from the level caps rather than
      // the typed max_spots (migration 149) — reading the column alone would
      // flag "no capacity" on a week that is properly capped by its levels.
      db.from("exp_edition_pool").select("edition_id, cap, cap_from_levels, used"),
      // released_at filtered out: a room the hotel took back is not ours, and
      // leaving it in would have it still vouching for the guests it once held.
      db.from("exp_hotel_rooms").select("edition_id,booking_id,extra_booking_ids,room_id,hotel_id,room_type,name,released_at").is("archived_at", null).is("released_at", null),
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

  // Secured guests per edition — the IDs, not just a count, because the beds
  // check needs to know WHICH guests still sleep nowhere.
  const securedIdsByEdition = new Map<string, string[]>();
  for (const b of (bookings ?? []) as Row[]) {
    if (!b.edition_id || isLostStatus(b.status as string)) continue;
    const counts = b.downpayment_received || b.final_payment_received
      || ["confirmed", "paid", "attended"].includes(String(b.status));
    if (counts) {
      const arr = securedIdsByEdition.get(String(b.edition_id)) ?? [];
      arr.push(String(b.id));
      securedIdsByEdition.set(String(b.edition_id), arr);
    }
  }

  const componentLinks = new Map<string, number>();
  for (const pc of (pkgComponents ?? []) as Row[]) {
    componentLinks.set(String(pc.package_id), (componentLinks.get(String(pc.package_id)) ?? 0) + 1);
  }

  // Beds live on the physical room. A room nobody has sized limits nothing, so
  // its whole pool is untrustworthy — that is a gap to chase, not a number.
  const sleepsByRoom = new Map<string, number | null>();
  for (const r of (physRooms ?? []) as Row[]) sleepsByRoom.set(String(r.id), (r.sleeps as number | null) ?? null);
  const bedGapByEdition = new Map<string, string[]>();
  for (const rm of (rooms ?? []) as Row[]) {
    if (!rm.edition_id) continue;
    const sleeps = rm.room_id ? sleepsByRoom.get(String(rm.room_id)) ?? null : null;
    if (sleeps == null) {
      const arr = bedGapByEdition.get(String(rm.edition_id)) ?? [];
      arr.push(String(rm.name ?? rm.room_type ?? "room"));
      bedGapByEdition.set(String(rm.edition_id), arr);
    }
  }
  // Effective cap per week: the levels' sum where they exist, else max_spots.
  const capByEdition = new Map<string, { cap: number | null; fromLevels: boolean }>();
  for (const p of (pools ?? []) as Row[]) {
    capByEdition.set(String(p.edition_id), {
      cap: (p.cap as number | null) ?? null,
      fromLevels: p.cap_from_levels === true,
    });
  }

  const roomsByEdition = new Map<string, number>();
  for (const rm of (rooms ?? []) as Row[]) {
    if (!rm.edition_id) continue;
    roomsByEdition.set(String(rm.edition_id), (roomsByEdition.get(String(rm.edition_id)) ?? 0) + 1);
  }

  // Who has a bed: a room row names one booking plus any sharing partners.
  const beddedByEdition = new Map<string, Set<string>>();
  for (const rm of (rooms ?? []) as Row[]) {
    if (!rm.edition_id) continue;
    const set = beddedByEdition.get(String(rm.edition_id)) ?? new Set<string>();
    if (rm.booking_id) set.add(String(rm.booking_id));
    for (const x of (rm.extra_booking_ids as string[] | null) ?? []) set.add(String(x));
    beddedByEdition.set(String(rm.edition_id), set);
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

    const eds = ((editions ?? []) as Row[]).filter((x) => String(x.experience_id) === id && stillAhead(x));

    const expChecksRaw: CheckResult[] = [
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
      // A week can carry its own list, and the mail prefers it — so an experience
      // with none is still covered when every upcoming week has one. Warning
      // otherwise, because the weeks that don't are the ones that break.
      ok("packingList", "Packing list", "warning",
        has(c.packing_list) || (eds.length > 0 && eds.every((x) => has(x.packing_list))),
        `${content_}?tab=pretrip`, "The pre-trip email is held back without it", {
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
      ok("weekInfo", "Your week", "warning", true, `${content_}?tab=story`, undefined, {
        okDetail: has(c.week_info) ? "Own text" : "Standard NP7 paragraph — write your own to replace it",
        fix: { table: "exp_content", id, column: "week_info", kind: "textarea", title: "About the week",
          help: "The paragraph under the ‘Your week’ intro. Leave empty and every trip shows the standard promise below.",
          value: (c.week_info as string) ?? null, fallback: DEFAULT_WEEK_INFO },
      }),
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
    // "Keep the standard" is an answer — fold the recorded decisions in before
    // anything counts blockers, warnings or progress.
    const expChecks = applyAccepted(expChecksRaw, c.accepted_defaults);

    const edReports: EditionReport[] = eds.map((ed) => {
      const edId = String(ed.id);
      const base = `/admin/editions/${edId}`;
      const edDaysToStart = ed.date_start
        ? Math.ceil((new Date(String(ed.date_start)).getTime() - Date.now()) / 86_400_000)
        : null;
      const pkgs = ((packages ?? []) as Row[]).filter(
        (p) => String(p.edition_id) === edId || (!p.edition_id && String(p.experience_id) === id),
      );
      const sellable = pkgs.filter((p) => p.status === "active" && p.website_visible !== false && p.price != null);
      // A package without a hotel is a PRODUCT ("Advanced – No Hotel", own-gear
      // variants), not a mistake — flagging those trained people to ignore the
      // row. The real defect is a package that CLAIMS accommodation (room_type
      // set) while naming no hotel: that is the one the trip page cannot place.
      const noHotel = sellable.filter((p) => p.room_type && !p.hotel_id);
      const hotelIds = [...new Set(sellable.map((p) => p.hotel_id).filter(Boolean))] as string[];
      const thinHotels = hotelIds.filter((h) => {
        const hotel = hotelById.get(h);
        return !hotel || !has(hotel.image_url) || !has(hotel.description);
      });
      const securedIds = securedIdsByEdition.get(edId) ?? [];
      const secured = securedIds.length;
      const noComponents = sellable.filter((pk) => !componentLinks.get(String(pk.id)));
      // Beds only matter on trips that sleep people — a package with a hotel
      // says this one does. Events without accommodation stay silent.
      const sleeps = sellable.some((pk) => pk.hotel_id);
      const bedded = beddedByEdition.get(edId) ?? new Set<string>();
      const unbedded = securedIds.filter((bid) => !bedded.has(bid));
      const capInfo = capByEdition.get(edId);
      const cap = capInfo?.cap ?? (ed.max_spots as number | null);
      const capFromLevels = capInfo?.fromLevels === true;
      // Room-pool readiness. Both of these leave the hotel unable to limit
      // anything, so a package sells straight past the last bed — quietly.
      const bedGaps = bedGapByEdition.get(edId) ?? [];
      const roomCount = roomsByEdition.get(edId) ?? 0;
      const hotelPkgs = sellable.filter((pk) => pk.hotel_id);
      const noRoomType = hotelPkgs.filter((pk) => !has(pk.room_type));

      const checks: CheckResult[] = [
        ok("dates", "Dates set", "blocker", has(ed.date_start) && has(ed.date_end), `${base}?tab=details`, "No dates — it can't be sold or scheduled"),
        ok("maxSpots", "Capacity set", "blocker", cap != null, `${base}?tab=details`, "No capacity — nothing stops it overselling", {
          okDetail: cap != null ? `${cap} spots${capFromLevels ? " (from the levels)" : ""}` : undefined,
          fix: { table: "exp_editions", id: edId, column: "max_spots", kind: "number", title: "Capacity", help: "How many guests this week can take.", value: cap },
        }),
        ok("packages", "Sellable packages", "blocker", sellable.length > 0, `${base}?tab=packages`,
          pkgs.length ? `${pkgs.length} package${pkgs.length === 1 ? "" : "s"}, none active + visible + priced` : "No packages at all",
          { okDetail: `${sellable.length} on sale` }),
        ok("capacitySane", "Capacity vs bookings", "warning", cap == null || secured <= cap, `${base}?tab=details`,
          capFromLevels
            ? `${secured} secured against ${cap} across the levels — ${(secured - (cap ?? 0))} over. Someone was let in past a level's cap.`
            : `${secured} secured against a capacity of ${cap} — ${(secured - (cap ?? 0))} over. The page says "fully booked" either way, so if the cap is just stale you are turning people away for nothing.`,
          {
            okDetail: cap != null ? `${secured}/${cap} secured` : undefined,
            fix: { table: "exp_editions", id: edId, column: "max_spots", kind: "number", title: "Max spots", help: "How many guests this week actually takes. Set it to the real number — the page reads 'fully booked' the moment bookings reach it.", value: cap },
          }),
        // Bed counts stopped being a blocker in migration 161: availability counts
        // ROOMS now, so an unset `sleeps` limits nothing and chasing it was busywork
        // on a list that must only show real work. Kept as a passing row, because
        // knowing whether a partner fits is still worth having.
        ok("bedCounts", "Bed counts", "warning", true, `${base}?tab=rooms`, undefined,
          { okDetail: bedGaps.length === 0 && roomCount > 0 ? `All ${roomCount} rooms sized` : "Optional — availability counts rooms, not beds" }),
        ok("roomsEntered", "Rooms entered", "warning", hotelPkgs.length === 0 || roomCount > 0, `${base}?tab=rooms`,
          `Packages sell a hotel but no rooms are in the system for this week, so nothing limits how many we sell`,
          { okDetail: hotelPkgs.length ? `${roomCount} rooms` : undefined }),
        ok("roomTypes", "Packages know their room", "warning", noRoomType.length === 0, `${base}?tab=packages`,
          `${noRoomType.length} package${noRoomType.length === 1 ? "" : "s"} name a hotel but not which room type they sell, so the beds don't limit them`,
          { okDetail: hotelPkgs.length ? "Every hotel package has a room type" : undefined }),
        ok("packageHotel", "Packages have a hotel", "warning", noHotel.length === 0, `${base}?tab=packages`,
          `${noHotel.length} package${noHotel.length === 1 ? "" : "s"} with no hotel — the trip page can't show where they stay`),
        ok("hotelContent", "Hotel has photo & description", "warning", thinHotels.length === 0, "/admin/hotels",
          `${thinHotels.length} hotel${thinHotels.length === 1 ? "" : "s"} missing a photo or description`),
        ok("components", "Components linked", "warning", sellable.length === 0 || noComponents.length === 0, `${base}?tab=packages`,
          `${noComponents.length} of ${sellable.length} sellable package${sellable.length === 1 ? "" : "s"} with no components — the included-list and the cost sheet run empty`,
          { okDetail: sellable.length ? "Every sellable package has components" : undefined }),
        ok("beds", "Beds assigned", "warning", !sleeps || secured === 0 || unbedded.length === 0, `${base}?tab=rooms`,
          `${unbedded.length} of ${secured} secured guest${secured === 1 ? "" : "s"} with no bed yet`,
          { okDetail: sleeps && secured > 0 ? `All ${secured} secured guests have a bed` : undefined }),
        ok("deposit", "Deposit decided", "warning", ed.deposit != null, `${base}?tab=details`,
          "Not set — the payment plan falls back to a €300 default nobody chose", {
            okDetail: Number(ed.deposit) === 0 ? "No deposit — 50% downpayment secures the spot" : `€${ed.deposit}`,
            fix: { table: "exp_editions", id: edId, column: "deposit", kind: "number", title: "Deposit", help: "Enter 0 when there is no deposit and the 50% downpayment secures the spot. Left empty, the plan falls back to €300.", value: (ed.deposit as number) ?? null },
          }),
        ok("whatsapp", "Group chat link", "warning",
          has(ed.whatsapp_group_link)
            // far out = fine without one; the row says when it becomes real
            || (edDaysToStart != null && edDaysToStart > crewLead + 30),
          `${base}?tab=details`,
          "The crew-forming email is held back without it", {
            okDetail: has(ed.whatsapp_group_link) ? undefined : `Not needed yet — due ${crewLead + 30} days before the trip`,
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

    const nextStart = (edReports.map((r) => r.dateStart).filter(Boolean).sort()[0] ?? null) as string | null;

    // A week nobody can buy yet is setup work, not a fault.
    const isDraft = (r: EditionReport) => String(r.status ?? "").toLowerCase() === "draft";
    const liveEds = edReports.filter((r) => !isDraft(r));
    const draftEds = edReports.filter(isDraft);

    reports.push({
      id,
      title: String(e.title ?? "Untitled"),
      websiteVisible: e.website_visible !== false,
      status: (e.status as string | null) ?? null,
      nextStart,
      checks: expChecks,
      editions: edReports,
      blockers: expChecks.filter((k) => !k.ok && k.severity === "blocker").length + liveEds.reduce((s, r) => s + r.blockers, 0),
      warnings: expChecks.filter((k) => !k.ok && k.severity === "warning").length + liveEds.reduce((s, r) => s + r.warnings, 0),
      draftBlockers: draftEds.reduce((s, r) => s + r.blockers, 0),
      tier: nextStart == null
        ? "unscheduled"
        : (e.status === "published" && e.website_visible !== false ? "selling" : "upcoming"),
      daysToNext: nextStart
        ? Math.round((new Date(nextStart + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000)
        : null,
      // Named, de-duplicated: "Card & hero photo" tells you what to do,
      // "3 blocking" makes you open the card to find out.
      blockerLabels: [...new Set([
        ...expChecks.filter((k) => !k.ok && k.severity === "blocker").map((k) => k.label),
        ...liveEds.flatMap((r) => r.checks.filter((k) => !k.ok && k.severity === "blocker").map((k) => k.label)),
      ])],
    });
  }

  /**
   * Ordered by what it costs to leave alone, not by status.
   *
   * The old order was published → draft, which put a 2027 draft above a trip
   * selling in twelve days whenever the draft happened to be "published". What
   * actually matters is: is a buyer looking at this now, is it coming, or has it
   * no dates at all. Within a tier, soonest first — the calendar is the deadline.
   *
   * Nothing is hidden or uncounted. An unscheduled trip still has to be made
   * ready eventually; it just isn't today's problem.
   */
  const TIER_ORDER = ["selling", "upcoming", "unscheduled"];
  return reports.sort((a, b) =>
    TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    || (a.nextStart ?? "9999").localeCompare(b.nextStart ?? "9999")
    || b.blockers - a.blockers
    || a.title.localeCompare(b.title));
}
