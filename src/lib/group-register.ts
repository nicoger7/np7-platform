import "server-only";
import { bookingPrice } from "@/lib/tier-perks";
import { composeBookingName } from "@/lib/booking-name";
import { parseGearBaseline, parseGearChoice, recordGearChoice, type GearChoice, type GearInfo } from "@/lib/gear-choice";
import {
  appendBookingNote, findLiveBookings, isEmptyLead, isUniqueViolation, resolveContactIdsByEmail,
} from "@/lib/existing-booking";

/**
 * Group registration, phase 2: the payer books several people in one go.
 *
 * The public form sends companions alongside the payer's own selection. Each
 * companion becomes a REAL booking of their own — own contact, own package,
 * own agreed_price (the per-person figure the edition P&L and the §25 UStG
 * margin settlement need) — linked to the payer by `covered_by_booking_id`
 * (migration 198). From there the phase-1 machinery takes over: the payer's
 * pro-forma pools the group, covered guests are never invoiced or chased, and
 * their portal says who is covering them.
 *
 * Everything here is deliberately strict about WHO can be added: a companion's
 * package is re-validated against the same experience and week the payer chose,
 * because the client could otherwise post any package id and buy a €400 clinic
 * ticket into a €5k trip.
 */

/** Guests one payer may add in a single booking. A family or a group of
 *  friends, not a tour operator reselling the week. */
export const MAX_COMPANIONS = 6;

export type CompanionInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  packageId?: string;
  /** Their own gear choice. Absent = untouched, so their package's baseline. */
  gear?: string;
  /** Their own rental upgrade tier (component id), when they took one. */
  rentalId?: string | null;
};

export type ValidCompanion = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  packageId: string;
  packageName: string;
  price: number | null;
  /** null = they never touched it, which means this package's own baseline.
   *  Kept apart from the baseline so "they chose rental" and "rental came with
   *  it" stay two different facts. */
  gear: GearChoice | null;
  rentalId: string | null;
  /** What THEIR package price already contains, and what level it coaches.
   *  Both read off their own package, never the payer's: a friend on a
   *  beginner package gets no choice even when the payer had one. */
  gearBaseline: GearChoice;
  level: string | null;
  /** Their only row on this week is an empty lead ("tell me when it's live"),
   *  so their booking COMPLETES that row instead of inserting a second one.
   *  Optional because most companions have no history at all on the week. */
};

/** A companion after the form checks, before their package has been looked up:
 *  the gear fields are still raw, because only their package knows the rules. */
type CleanedCompanion = Pick<ValidCompanion, "firstName" | "lastName" | "fullName" | "email" | "packageId"> & {
  gear?: string;
  rentalId?: string | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A package row as far as the group rules care. */
export type CompanionPackageRow = {
  status?: string | null;
  archived_at?: string | null;
  experience_id?: string | null;
  edition_id?: string | null;
};

/**
 * Why a companion's package cannot ride this booking. null = it fits.
 *
 * One rule, two callers: the registration that writes the bookings and the
 * quote that prices them. If the quote counted a package the registration
 * would later refuse, the payment plan shown at signup would be for a group
 * that never existed.
 */
export function companionPackageIssue(
  p: CompanionPackageRow | null | undefined,
  scope: { experienceId: string; editionId: string | null },
): "unavailable" | "other-week" | null {
  if (!p || p.archived_at || p.status !== "active" || p.experience_id !== scope.experienceId) return "unavailable";
  // An edition-scoped package belongs to its week only; an edition-less one
  // is shared across weeks. Same rule the experience page renders by.
  if (p.edition_id && p.edition_id !== scope.editionId) return "other-week";
  return null;
}

/**
 * What the companions add to the payer's total: every chosen package counted
 * as often as it was chosen.
 *
 * Deliberately NOT a sum over distinct packages — two friends sharing the same
 * room type is the normal case, and de-duplicating them would quote the payer
 * one spot short. Ids the caller could not price (wrong experience, wrong
 * week, archived) are skipped, and `counted` says how many actually made it,
 * so nobody can present the plan as covering people it does not.
 *
 * The key is one chosen SPOT, package plus gear (`packageId:gear:rentalId`),
 * not a bare package: two friends in the same room, one of them on their own
 * board, are two different amounts of money.
 */
export function sumCompanionPrices(chosenSpecs: string[], priceByPackage: Map<string, number>): { total: number; counted: number } {
  let total = 0;
  let counted = 0;
  for (const id of chosenSpecs) {
    const price = priceByPackage.get(id);
    if (price == null) continue;
    total += price;
    counted++;
  }
  return { total: Math.round((total + Number.EPSILON) * 100) / 100, counted };
}

/**
 * Validate the companions against the DB, in the payer's experience + week.
 * Returns either the clean list or a guest-facing error message.
 *
 * `blocked` names the row the payer has to fix when the reason is that this
 * person is already on the week. The modal puts the note under their fields
 * instead of in the generic error line, and the route answers 409 rather than
 * 400 so the client can tell "already booked" from "bad input".
 *
 * It carries the EMAIL as well as the index, and the modal anchors on the
 * email. The index is a position in the list the client actually posted, which
 * is the roster with the half-typed rows dropped, so a payer with an unfinished
 * row above a blocked friend was reading "Ben is already registered" under
 * Anna. The email is the same identity on both sides, whatever was filtered.
 */
export async function validateCompanions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  raw: CompanionInput[],
  ctx: {
    experienceId: string;
    editionId: string | null;
    payerEmail: string;
    /** Rows already covered by THIS booking are this submission's own first
     *  attempt, not a duplicate. Set only by the same-submission check, which
     *  has to run the roster rules against a group it may itself have created
     *  seconds ago. */
    ignoreCoveredBy?: string | null;
  },
): Promise<
  | { ok: true; companions: ValidCompanion[] }
  | { ok: false; error: string; blocked?: { index: number; firstName: string; email: string } }
> {
  if (raw.length > MAX_COMPANIONS) {
    return { ok: false, error: `You can add up to ${MAX_COMPANIONS} people here. For a bigger group, email us and we'll set it up.` };
  }

  const seen = new Set<string>([ctx.payerEmail.trim().toLowerCase()]);
  const cleaned: CleanedCompanion[] = [];

  for (const c of raw) {
    const firstName = (c.firstName ?? "").trim();
    const lastName = (c.lastName ?? "").trim();
    const email = (c.email ?? "").trim().toLowerCase();
    const packageId = (c.packageId ?? "").trim();

    if (!firstName) return { ok: false, error: "Every person needs a first name." };
    if (!EMAIL_RE.test(email)) return { ok: false, error: `${firstName} needs a valid email address. That's how they get their own trip page.` };
    if (!packageId) return { ok: false, error: `Choose a package for ${firstName}.` };
    // The same inbox twice would collapse into one contact and one of the two
    // spots would silently vanish.
    if (seen.has(email)) return { ok: false, error: `${email} is already on this booking. Each person needs their own email address.` };
    seen.add(email);

    // Gear rides along raw: what it MEANS depends on the package behind it,
    // which is only looked up below.
    cleaned.push({
      firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email, packageId,
      gear: c.gear, rentalId: c.rentalId ?? null,
    });
  }

  if (!cleaned.length) return { ok: true, companions: [] };

  // One query for every distinct package, then re-check each against the
  // payer's experience/week — never trust a package id from the client.
  const ids = [...new Set(cleaned.map((c) => c.packageId))];
  const { data: pkgs } = await db
    .from("exp_packages")
    .select("id, name, price, experience_id, edition_id, status, archived_at, category, gear_baseline")
    .in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((pkgs ?? []) as any[]).map((p) => [p.id, p]));

  const companions: ValidCompanion[] = [];
  for (const c of cleaned) {
    const p = byId.get(c.packageId);
    const issue = companionPackageIssue(p, { experienceId: ctx.experienceId, editionId: ctx.editionId });
    if (issue === "unavailable") {
      return { ok: false, error: `The package chosen for ${c.firstName} isn't available. Please pick another.` };
    }
    if (issue === "other-week") {
      return { ok: false, error: `The package chosen for ${c.firstName} isn't offered in this week. Please pick another.` };
    }
    companions.push({
      ...c,
      packageName: p.name,
      price: p.price ?? null,
      gearBaseline: parseGearBaseline(p.gear_baseline),
      level: p.category ?? null,
      gear: c.gear == null ? null : parseGearChoice(c.gear),
      rentalId: typeof c.rentalId === "string" ? c.rentalId : null,
    });
  }

  // Last gate, and deliberately last: package problems keep their priority and
  // the bookings query only runs for a roster that is otherwise good to go.
  // Placed here rather than in createCompanionBookings for the reason the
  // caller already argues, that everything is validated before a single row is
  // written, so a rejected companion never leaves the payer with half a group.
  const contactByEmail = await resolveContactIdsByEmail(db, companions.map((c) => c.email));
  if (contactByEmail.size) {
    const live = await findLiveBookings(db, {
      contactIds: [...contactByEmail.values()],
      experienceId: ctx.experienceId,
      editionId: ctx.editionId,
    });
    for (let i = 0; i < companions.length; i++) {
      const c = companions[i];
      const contactId = contactByEmail.get(c.email);
      const row = contactId ? live.get(contactId) : undefined;
      if (!row) continue;
      // Already on this booking: the payer resubmitting, not a second person.
      if (ctx.ignoreCoveredBy && row.covered_by_booking_id === ctx.ignoreCoveredBy) continue;
      // She asked to be told when the week went live, and never got a package.
      // That is not a booking, so it must not block the payer from booking her.
      // It is also not something to WRITE to: this runs from a public endpoint
      // that knows the caller only by a typed email, so completing her row in
      // place would let anyone who knows her address overwrite her booking.
      // She gets a fresh booking and the old lead stays as the CRM row it was.
      if (isEmptyLead(row)) continue;
      // The payer typed this first name themselves, so naming it back tells
      // them nothing they did not already know. The other booking's status,
      // package, price and id stay out of it: the payer is not its owner.
      return {
        ok: false,
        error: `${c.firstName} is already registered for this week with that email. Take them off this list to carry on, or they can register themselves.`,
        blocked: { index: i, firstName: c.firstName, email: c.email },
      };
    }
  }

  return { ok: true, companions };
}

export type CreatedCompanion = { bookingId: string; contactId: string; firstName: string; email: string; packageName: string };

/**
 * Create the companion bookings under a payer. Best-effort per companion: one
 * failure must not lose the others or the payer's own booking, which already
 * exists by the time this runs. Returns what actually got created, so the
 * caller can invite exactly those people.
 */
export async function createCompanionBookings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  companions: ValidCompanion[],
  ctx: {
    payerBookingId: string;
    payerName: string;
    experienceId: string;
    experienceTitle: string;
    editionId: string | null;
    editionLabel: string | null;
    editionStart: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    edition: any;
    botFlag: boolean;
    /** The payer's own gear resolver, handed down so the whole group shares
     *  one component scan per level. */
    resolveGear: (level: string | null) => Promise<GearInfo>;
  },
): Promise<CreatedCompanion[]> {
  const out: CreatedCompanion[] = [];

  for (const c of companions) {
    try {
      // Contact: reuse the oldest match by email (same rule as the payer path),
      // else create one. A companion who is already a member keeps their history.
      let contactId: string | undefined;
      const { data: dupes } = await db
        .from("contacts").select("id").ilike("email", c.email)
        .order("created_at", { ascending: true }).limit(1);
      contactId = dupes?.[0]?.id;
      if (!contactId) {
        const { data: created, error } = await db
          .from("contacts")
          .insert({ name: c.fullName, email: c.email, source: "website-register-group" })
          .select("id").single();
        if (error || !created) continue;
        contactId = created.id;
      }

      // Their own price, from their own package — discounts that apply to the
      // week apply to them too. This is the figure the P&L and the VAT margin
      // settlement read; the payer's invoice only SUMS these.
      const priced = await bookingPrice(db, {
        price: c.price ?? 0, experienceId: ctx.experienceId, editionId: ctx.editionId,
        packageId: c.packageId, edition: ctx.edition, contactId: contactId ?? null,
      }).catch(() => ({ price: c.price ?? 0 }));

      const note = `Website registration (group) · package: ${c.packageName} · paid for by ${ctx.payerName}${ctx.botFlag ? " · ⚠ BOT-CHECK FLAGGED · verify before invoicing" : ""}`;
      const stamp = new Date().toISOString();

      let bookingId: string | null = null;
      {
        const { data: booking, error: bErr } = await db
          .from("exp_bookings")
          .insert({
            name: composeBookingName({
              contactName: c.fullName,
              experienceTitle: ctx.experienceTitle,
              editionLabel: ctx.editionLabel ?? undefined,
              year: ctx.editionStart ? new Date(ctx.editionStart).getFullYear() : null,
            }),
            contact_id: contactId,
            experience_id: ctx.experienceId,
            edition_id: ctx.editionId ?? null,
            package_id: c.packageId,
            status: "lead",
            agreed_price: priced.price,
            covered_by_booking_id: ctx.payerBookingId,
            notes: note,
          })
          .select("id").single();
        if (booking) {
          bookingId = booking.id;
        } else if (isUniqueViolation(bErr)) {
          // The one-booking-per-week index refused it, which means a racing
          // request wrote this companion a moment ago. If that row is covered
          // by THIS payer it is the same spot and we simply use it; anything
          // else belongs to somebody else and is not ours to touch.
          const live = await findLiveBookings(db, {
            contactIds: [contactId!], experienceId: ctx.experienceId, editionId: ctx.editionId ?? null,
          });
          const row = live.get(contactId!);
          if (!row || row.covered_by_booking_id !== ctx.payerBookingId) continue;
          bookingId = row.id;
        } else {
          continue;
        }
      }

      // Neither branch can leave this unset without having skipped the
      // companion, but say so rather than assert it.
      if (!bookingId) continue;

      // Their gear choice, on their own booking, through the same writer the
      // payer goes through. Inside this try on purpose: recordGearChoice
      // swallows its own failures, and a companion must never lose the booking
      // that already exists over an add-on row.
      await recordGearChoice(db, {
        bookingId,
        level: c.level,
        gear: c.gear ?? c.gearBaseline,
        baseline: c.gearBaseline,
        rentalId: c.rentalId,
        resolve: ctx.resolveGear,
      });

      out.push({ bookingId, contactId: contactId!, firstName: c.firstName, email: c.email, packageName: c.packageName });
    } catch {
      // Skip this companion; the payer's booking and the others stand.
      continue;
    }
  }
  return out;
}
