import "server-only";
import { bookingPrice } from "@/lib/tier-perks";
import { composeBookingName } from "@/lib/booking-name";

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
};

export type ValidCompanion = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  packageId: string;
  packageName: string;
  price: number | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Validate the companions against the DB, in the payer's experience + week.
 * Returns either the clean list or a guest-facing error message.
 */
export async function validateCompanions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  raw: CompanionInput[],
  ctx: { experienceId: string; editionId: string | null; payerEmail: string },
): Promise<{ ok: true; companions: ValidCompanion[] } | { ok: false; error: string }> {
  if (raw.length > MAX_COMPANIONS) {
    return { ok: false, error: `You can add up to ${MAX_COMPANIONS} people here — for a bigger group, email us and we'll set it up.` };
  }

  const seen = new Set<string>([ctx.payerEmail.trim().toLowerCase()]);
  const cleaned: (Omit<ValidCompanion, "packageName" | "price"> & { packageId: string })[] = [];

  for (const c of raw) {
    const firstName = (c.firstName ?? "").trim();
    const lastName = (c.lastName ?? "").trim();
    const email = (c.email ?? "").trim().toLowerCase();
    const packageId = (c.packageId ?? "").trim();

    if (!firstName) return { ok: false, error: "Every person needs a first name." };
    if (!EMAIL_RE.test(email)) return { ok: false, error: `${firstName} needs a valid email address — that's how they get their own trip page.` };
    if (!packageId) return { ok: false, error: `Choose a package for ${firstName}.` };
    // The same inbox twice would collapse into one contact and one of the two
    // spots would silently vanish.
    if (seen.has(email)) return { ok: false, error: `${email} is already on this booking — each person needs their own email address.` };
    seen.add(email);

    cleaned.push({ firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email, packageId });
  }

  if (!cleaned.length) return { ok: true, companions: [] };

  // One query for every distinct package, then re-check each against the
  // payer's experience/week — never trust a package id from the client.
  const ids = [...new Set(cleaned.map((c) => c.packageId))];
  const { data: pkgs } = await db
    .from("exp_packages")
    .select("id, name, price, experience_id, edition_id, status, archived_at")
    .in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((pkgs ?? []) as any[]).map((p) => [p.id, p]));

  const companions: ValidCompanion[] = [];
  for (const c of cleaned) {
    const p = byId.get(c.packageId);
    if (!p || p.archived_at || p.status !== "active" || p.experience_id !== ctx.experienceId) {
      return { ok: false, error: `The package chosen for ${c.firstName} isn't available — please pick another.` };
    }
    // An edition-scoped package belongs to its week only; an edition-less one
    // is shared across weeks. Same rule the experience page renders by.
    if (p.edition_id && p.edition_id !== ctx.editionId) {
      return { ok: false, error: `The package chosen for ${c.firstName} isn't offered in this week — please pick another.` };
    }
    companions.push({ ...c, packageName: p.name, price: p.price ?? null });
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
          notes: `Website registration (group) · package: ${c.packageName} · paid for by ${ctx.payerName}${ctx.botFlag ? " · ⚠ BOT-CHECK FLAGGED — verify before invoicing" : ""}`,
        })
        .select("id").single();
      if (bErr || !booking) continue;

      out.push({ bookingId: booking.id, contactId: contactId!, firstName: c.firstName, email: c.email, packageName: c.packageName });
    } catch {
      // Skip this companion; the payer's booking and the others stand.
      continue;
    }
  }
  return out;
}
