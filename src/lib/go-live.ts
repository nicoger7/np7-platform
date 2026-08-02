import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { isLostStatus } from "@/lib/types";

/**
 * Is this trip ready to be sold?
 *
 * One registry, so the page and any inline panel can never disagree. Modelled
 * on the mail-readiness shape that already works: every row says what is wrong,
 * whether it stops you, and where to go and fix it.
 *
 * Two rules learned the hard way:
 *  - BLOCKER means a buyer sees something broken or we take money against
 *    something incomplete. Everything else is a warning. A list where
 *    everything is red is a list nobody reads.
 *  - Scope matters. "Has a hero photo" is about an experience; "has packages"
 *    is about a week. A single flat score per experience hides a broken week,
 *    which is exactly how the old widget missed things.
 */

export type CheckSeverity = "blocker" | "warning";
export type CheckScope = "experience" | "edition";

export type CheckResult = {
  id: string;
  label: string;
  severity: CheckSeverity;
  ok: boolean;
  /** What's actually wrong, in words — shown only when !ok. */
  detail?: string;
  /** Where to fix it. */
  href: string;
};

export type EditionReport = {
  id: string;
  label: string;
  dateStart: string | null;
  status: string | null;
  checks: CheckResult[];
  blockers: number;
  warnings: number;
};

export type ExperienceReport = {
  id: string;
  title: string;
  websiteVisible: boolean;
  checks: CheckResult[];
  editions: EditionReport[];
  /** Blockers across the experience AND its editions. */
  blockers: number;
  warnings: number;
};

const ok = (id: string, label: string, severity: CheckSeverity, pass: boolean, href: string, detail?: string): CheckResult =>
  ({ id, label, severity, ok: pass, href, ...(pass ? {} : { detail }) });

const has = (v: unknown) => v != null && String(v).trim() !== "";

export async function runGoLiveChecks(): Promise<ExperienceReport[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // One pass, five queries — not one query per check per experience.
  const [{ data: exps }, { data: content }, { data: editions }, { data: packages }, { data: bookings }, { data: hotels }] =
    await Promise.all([
      db.from("exp_experiences").select("id,title,location,description,hero_image,gallery,price,website_visible,cancellation_policy,status").is("archived_at", null),
      db.from("exp_content").select("experience_id,hero_image,gallery,packing_list,pre_trip_note"),
      db.from("exp_editions").select("id,experience_id,label,date_start,date_end,max_spots,status,deposit,whatsapp_group_link").is("archived_at", null),
      db.from("exp_packages").select("id,experience_id,edition_id,name,price,status,website_visible,hotel_id").is("archived_at", null),
      db.from("exp_bookings").select("id,edition_id,status,downpayment_received,final_payment_received"),
      db.from("hotels").select("id,name,image_url,description").is("archived_at", null),
    ]);

  type Row = Record<string, unknown>;
  const contentBy = new Map<string, Row>();
  for (const c of (content ?? []) as Row[]) contentBy.set(String(c.experience_id), c);
  const hotelById = new Map<string, Row>();
  for (const h of (hotels ?? []) as Row[]) hotelById.set(String(h.id), h);

  const securedByEdition = new Map<string, number>();
  for (const b of (bookings ?? []) as Row[]) {
    if (!b.edition_id || isLostStatus(b.status as string)) continue;
    const counts = b.downpayment_received || b.final_payment_received
      || ["confirmed", "paid", "attended"].includes(String(b.status));
    if (counts) securedByEdition.set(String(b.edition_id), (securedByEdition.get(String(b.edition_id)) ?? 0) + 1);
  }

  const reports: ExperienceReport[] = [];

  for (const e of (exps ?? []) as Row[]) {
    const id = String(e.id);
    const c = contentBy.get(id) ?? {};
    const content_ = `/admin/content/${id}`;
    const detail = `/admin/experiences/${id}`;
    const gallery = (e.gallery as unknown[] | null)?.length || (c.gallery as unknown[] | null)?.length || 0;

    const expChecks: CheckResult[] = [
      ok("tileImage", "Card & hero photo", "blocker", has(e.hero_image) || has(c.hero_image), content_, "No image — the listing card and page hero are empty"),
      ok("location", "Location", "blocker", has(e.location), detail, "No place name on the card or page"),
      ok("description", "Intro text", "warning", has(e.description), detail, "The page opens with nothing to read"),
      ok("gallery", "Photo gallery", gallery === 0 ? "blocker" : "warning", gallery >= 3, content_,
        gallery === 0 ? "No photos at all" : `Only ${gallery} photo${gallery === 1 ? "" : "s"} — aim for 3+`),
      ok("cancellationPolicy", "Cancellation terms", "blocker", has(e.cancellation_policy), detail,
        "Nothing to show a buyer before they pay — required for package travel"),
      ok("packingList", "Packing list", "warning", has(c.packing_list), content_, "The pre-trip email is held back without it"),
    ];

    const eds = ((editions ?? []) as Row[]).filter((x) => String(x.experience_id) === id);
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
        ok("maxSpots", "Capacity set", "blocker", cap != null, `${base}?tab=details`, "No capacity — nothing stops it overselling"),
        ok("packages", "Sellable packages", "blocker", sellable.length > 0, `${base}?tab=packages`,
          pkgs.length ? `${pkgs.length} package${pkgs.length === 1 ? "" : "s"}, none active + visible + priced` : "No packages at all"),
        ok("capacitySane", "Capacity vs bookings", "warning", cap == null || secured <= cap, `${base}?tab=details`,
          `${secured} secured against a capacity of ${cap} — the page will say "fully booked"`),
        ok("packageHotel", "Packages have a hotel", "warning", noHotel.length === 0, `${base}?tab=packages`,
          `${noHotel.length} package${noHotel.length === 1 ? "" : "s"} with no hotel — the trip page can't show where they stay`),
        ok("hotelContent", "Hotel has photo & description", "warning", thinHotels.length === 0, "/admin/hotels",
          `${thinHotels.length} hotel${thinHotels.length === 1 ? "" : "s"} missing a photo or description`),
        ok("deposit", "Deposit decided", "warning", ed.deposit != null, `${base}?tab=details`,
          "Not set — the payment plan falls back to a €300 default nobody chose"),
        ok("whatsapp", "Group chat link", "warning", has(ed.whatsapp_group_link), `${base}?tab=details`,
          "The crew-forming email is held back without it"),
      ];
      return {
        id: edId,
        label: String(ed.label ?? "") || (ed.date_start ? String(ed.date_start).slice(0, 10) : "Untitled"),
        dateStart: (ed.date_start as string | null) ?? null,
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
      checks: expChecks,
      editions: edReports,
      blockers: expChecks.filter((k) => !k.ok && k.severity === "blocker").length + edReports.reduce((s, r) => s + r.blockers, 0),
      warnings: expChecks.filter((k) => !k.ok && k.severity === "warning").length + edReports.reduce((s, r) => s + r.warnings, 0),
    });
  }

  // Most broken first — the point of the page is what to work on next.
  return reports.sort((a, b) => b.blockers - a.blockers || b.warnings - a.warnings || a.title.localeCompare(b.title));
}
