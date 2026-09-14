import "server-only";
import { gearAddon, type GearInfo, type GearPick } from "@/lib/gear-choice";
import { validateCompanions, type CompanionInput } from "@/lib/group-register";
import { resolveContactIdsByEmail, type LiveBookingRow } from "@/lib/existing-booking";

/**
 * "Is this the SAME submission, or did they change something?"
 *
 * /api/register short-circuits a repeat of the same package within a minute and
 * answers 200 with the first booking's id. That is right for a reload or a
 * double click and wrong for everything else, because the short-circuit fired
 * before the companions were validated and before a single add-on was written.
 * A payer who registered alone, reopened the modal and added Mia was told
 * "2 spots held!" while Mia got no booking, no contact, no mail, and the
 * pro-forma still billed for one. A payer who reopened and switched to "Own
 * gear" was shown a figure from the discarded quote and billed the old one.
 *
 * So the window stays, but it fires only when this submission would write
 * EXACTLY what is already there. Anything else is a real change and takes the
 * conflict path, where the guest at least sees the booking they do have.
 *
 * Identity is the EFFECT, never the payload. What the first attempt chose is
 * not recoverable from the rows it left (a baseline choice writes nothing at
 * all, and "own gear" writes a negative row against the rental component), so
 * the comparison is between the add-on rows that exist and the add-on rows this
 * submission would produce, through the same gearAddon() the writer uses.
 *
 * Its own module rather than existing-booking.ts: this needs group-register,
 * which already imports existing-booking, and the cycle is not worth it.
 */

export type SubmissionAddon = { componentId: string; price: number };

export type Submission = {
  experienceId: string;
  editionId: string | null;
  payerEmail: string;
  companions: CompanionInput[];
  /** The payer's own choice, plus the level of THEIR package (never a friend's). */
  payerGear: GearPick & { level: string | null };
  /** Booking-time extras, ALREADY validated against this week: exactly the
   *  component ids and prices the insert would use. */
  extras: SubmissionAddon[];
  resolveGear: (level: string | null) => Promise<GearInfo>;
};

export type ResubmissionVerdict =
  | { identical: true; companions: { firstName: string; email: string }[] }
  | { identical: false };

/** One add-on as a comparable string. Component plus money, because those are
 *  the two things that decide what a guest is charged; the label is derived
 *  from the same choice and cannot differ on its own. */
const addonKey = (a: SubmissionAddon) => `${a.componentId}|${Number(a.price).toFixed(2)}`;

/** Multiset equality. Two friends in the same room on the same gear are two
 *  identical keys, and dropping one of them would hide a lost spot. */
const SEP = String.fromCharCode(0);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(SEP) === [...b].sort().join(SEP);

export async function isUnchangedResubmission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  args: { prior: LiveBookingRow; submission: Submission },
): Promise<ResubmissionVerdict> {
  const { prior, submission: sub } = args;
  const no: ResubmissionVerdict = { identical: false };

  try {
    // 1. The people already on this booking.
    const { data: coveredRows, error: cErr } = await db
      .from("exp_bookings").select("id,contact_id,package_id,agreed_price").eq("covered_by_booking_id", prior.id);
    /*
     * A read that failed is not evidence of sameness. Failing toward "changed"
     * costs the guest one warm screen naming the booking they already have;
     * failing the other way costs a friend their spot, silently, behind a
     * success screen.
     */
    if (cErr) return no;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const covered = ((coveredRows ?? []) as any[]).map((r) => ({
      id: String(r.id),
      contactId: String(r.contact_id ?? ""),
      // The package and the price belong in the identity, not just the people.
      // A companion moved from a shared room to a private one is the SAME
      // contact, and on a baseline gear choice writes no add-on on either
      // attempt, so comparing people plus add-ons alone called that unchanged
      // and dropped a 1,467 euro upgrade behind a success screen.
      packageId: r.package_id == null ? "" : String(r.package_id),
      price: r.agreed_price == null ? "" : String(Math.round(Number(r.agreed_price) * 100)),
    }));

    // 2. The people this submission asks for, by the same rules the write uses.
    //    ignoreCoveredBy, or the roster the FIRST attempt created comes back as
    //    a list of duplicates and nothing ever compares equal.
    const check = await validateCompanions(db, sub.companions, {
      experienceId: sub.experienceId,
      editionId: sub.editionId,
      payerEmail: sub.payerEmail,
      ignoreCoveredBy: prior.id,
    });
    if (!check.ok) return no;

    const contactByEmail = await resolveContactIdsByEmail(db, check.companions.map((c) => c.email));
    const wanted: { contactId: string; packageId: string; price: string; pick: GearPick; level: string | null }[] = [];
    for (const c of check.companions) {
      const contactId = contactByEmail.get(c.email);
      // No contact yet means this person has never existed here, so they cannot
      // be one of the rows already covered: the roster changed.
      if (!contactId) return no;
      wanted.push({
        contactId,
        level: c.level,
        packageId: c.packageId,
        price: String(Math.round(Number(c.price ?? 0) * 100)),
        pick: { gear: c.gear ?? c.gearBaseline, baseline: c.gearBaseline, rentalId: c.rentalId },
      });
    }

    /*
     * One key per person carrying who, which package and at what price, so a
     * swap of any of the three reads as changed. Price is in whole cents: a
     * float compared as a string is a bug waiting for a package ending .90.
     */
    const personKey = (x: { contactId: string; packageId: string; price: string }) =>
      [x.contactId, x.packageId, x.price].join(SEP);
    if (!sameSet(covered.map(personKey), wanted.map(personKey))) return no;

    // 3. What each of them would be charged, against what they already carry.
    const bookingByContact = new Map(covered.map((c) => [c.contactId, c.id]));
    const expected = new Map<string, string[]>();
    const payerAddon = gearAddon(await sub.resolveGear(sub.payerGear.level), sub.payerGear);
    expected.set(prior.id, [...sub.extras, ...(payerAddon ? [payerAddon] : [])].map(addonKey));
    for (const w of wanted) {
      const addon = gearAddon(await sub.resolveGear(w.level), w.pick);
      expected.set(bookingByContact.get(w.contactId)!, addon ? [addonKey(addon)] : []);
    }

    const ids = [prior.id, ...covered.map((c) => c.id)];
    const { data: rows, error: aErr } = await db
      .from("exp_booking_addons").select("booking_id,component_id,price")
      // source 'booking' is what registration writes. An 'admin' or 'member'
      // row is somebody else's work, and this submission would not touch it.
      .eq("source", "booking").in("booking_id", ids);
    if (aErr) return no;
    const actual = new Map<string, string[]>(ids.map((id) => [id, [] as string[]]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows ?? []) as any[]) {
      const list = actual.get(String(r.booking_id));
      if (list) list.push(addonKey({ componentId: String(r.component_id ?? ""), price: Number(r.price ?? 0) }));
    }

    for (const id of ids) {
      if (!sameSet(actual.get(id) ?? [], expected.get(id) ?? [])) return no;
    }

    return { identical: true, companions: check.companions.map((c) => ({ firstName: c.firstName, email: c.email })) };
  } catch {
    return no;
  }
}
