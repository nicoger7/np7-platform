import "server-only";
import { computePaymentPlan, balanceDue, dueUrgency } from "@/lib/payments";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";

/**
 * Who a CONDITION-driven mail may be sent to by hand.
 *
 * The nightly cron fires these per guest when a condition turns true — a
 * balance falls due, a spot goes unsecured. When one is switched OFF (or its
 * window is inconvenient) an admin still needs to send it to the RIGHT guests
 * for one edition: "the final invoice is coming up, mail the people who owe".
 *
 * The danger a naive "send to everyone" button carries is precise: a balance
 * reminder to someone already paid in full, a "your spot is gone" to a
 * confirmed guest. So this recomputes each guest's real payment state with the
 * SAME engine the cron, the invoices and the member view use, and every
 * template gets an explicit predicate. A key with no predicate has no button —
 * safer than guessing a recipient set.
 */

const SECURED = ["confirmed", "downpayment_paid", "paid", "attended"];
const AWAITING = ["lead", "reserved", "payment_pending"];

/** The conditional mails an admin may hand-send per edition, and the plain-word
 *  description of who each one reaches (shown in the confirm + the row). */
export const MANUAL_CONDITIONAL: Record<string, { targets: string }> = {
  balance_invoice_reminder: { targets: "secured guests who still owe a balance" },
  balance_paid_confirmation: { targets: "guests whose balance is fully paid" },
  payment_pending_nudge: { targets: "guests who haven't secured their spot yet" },
  downpayment_last_chance: { targets: "unsecured guests near their down-payment deadline" },
  spot_released: { targets: "unsecured guests whose down-payment deadline has passed" },
};

export type EligibleBooking = {
  id: string;
  contactId: string | null;
  email: string | null;
  firstName: string;
  status: string;
  start: string | null;
  end: string | null;
  whatsappLink: string | null;
  balance: number;
  securingAmount: number | null;
  securingDue: string | null;
};

type PayRow = { booking_id: string | null; amount: number | null; received_at?: string | null; date?: string | null; created_at?: string | null; status?: string | null; direction?: string | null; type?: string | null };
type AddonRow = { booking_id: string | null; price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingRow = Record<string, any>;

/**
 * Load every booking on an edition with its real payment state, then bucket the
 * bookings by which conditional mail they'd be eligible for. Returns the
 * per-key eligible lists (for POST to send to) and, derived from them, counts
 * (for GET to show). One pass, one payment engine — GET and POST never drift.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadConditionalEligibility(db: any, editionId: string): Promise<{
  byKey: Record<string, EligibleBooking[]>;
  countByKey: Record<string, number>;
}> {
  const empty = () => Object.fromEntries(Object.keys(MANUAL_CONDITIONAL).map((k) => [k, [] as EligibleBooking[]]));
  const byKey: Record<string, EligibleBooking[]> = empty();

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id, status, agreed_price, contact_id, deposit_received, downpayment_received, final_payment_received, created_at, contacts(name,email), exp_experiences(title), exp_editions(deposit,date_start,date_end,whatsapp_group_link), exp_packages(deposit,deposit_refund_days,downpayment_percent,final_days_before)")
    .eq("edition_id", editionId);

  const rows = (bookings ?? []) as BookingRow[];
  const ids = rows.map((b) => b.id);
  const receivedBy = new Map<string, number>();
  const addonsBy = new Map<string, number>();
  if (ids.length) {
    const [{ data: pays }, { data: extras }] = await Promise.all([
      db.from("exp_payments").select("booking_id, amount, received_at, date, created_at, status, direction, type").in("booking_id", ids),
      db.from("exp_booking_addons").select("booking_id, price, status, notes, payment_mode").in("booking_id", ids),
    ]);
    for (const id of ids) {
      receivedBy.set(id, sumReceived(((pays ?? []) as PayRow[]).filter((p) => p.booking_id === id)));
      addonsBy.set(id, ((extras ?? []) as AddonRow[])
        .filter((a) => a.booking_id === id && effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
        .reduce((n, a) => n + (Number(a.price) || 0), 0));
    }
  }

  for (const b of rows) {
    const email = b.contacts?.email ?? null;
    if (!email) continue;
    const status = String(b.status ?? "").toLowerCase();
    const pkgCfg = b.exp_packages ?? {};
    const payCfg = {
      deposit: b.exp_editions?.deposit ?? pkgCfg.deposit ?? null,
      deposit_refund_days: pkgCfg.deposit_refund_days ?? null,
      downpayment_percent: pkgCfg.downpayment_percent ?? null,
      final_days_before: pkgCfg.final_days_before ?? null,
    };
    const start = (b.exp_editions?.date_start as string | null) ?? null;
    const payState = {
      total: (b.agreed_price ?? 0) + (addonsBy.get(b.id) ?? 0),
      paidAmount: receivedBy.get(b.id) ?? 0,
      editionStart: start,
      bookedAt: b.created_at ?? null,
      depositReceived: b.deposit_received ?? null,
      downpaymentReceived: b.downpayment_received ?? null,
      finalPaymentReceived: b.final_payment_received ?? null,
    };
    const plan = computePaymentPlan(payCfg, payState);
    const securing = plan.find((m) => (m.kind === "deposit" || m.kind === "downpayment") && m.status !== "paid");
    const balance = balanceDue(payCfg, payState);
    const secured = b.downpayment_received || SECURED.includes(status);
    const awaiting = AWAITING.includes(status) && !secured;
    // Same "mute the chase when either hand-flag or ledger says paid" rule the cron uses.
    const flaggedPaid = !!b.final_payment_received || ["paid", "attended"].includes(status);
    const balancePaid = flaggedPaid || balance <= 0.01;
    const urgency = securing ? dueUrgency(securing) : "ok";

    const rec: EligibleBooking = {
      id: b.id, contactId: b.contact_id ?? null, email,
      firstName: String(b.contacts?.name ?? "").split(" ")[0] || "there",
      status, start, end: (b.exp_editions?.date_end as string | null) ?? null,
      whatsappLink: b.exp_editions?.whatsapp_group_link ?? null,
      balance, securingAmount: securing?.amount ?? null, securingDue: securing?.dueDate ?? null,
    };

    if (secured && balance > 0.01 && !balancePaid) byKey.balance_invoice_reminder.push(rec);
    if (secured && balancePaid) byKey.balance_paid_confirmation.push(rec);
    if (awaiting) byKey.payment_pending_nudge.push(rec);
    if (awaiting && urgency === "last_chance") byKey.downpayment_last_chance.push(rec);
    if (awaiting && urgency === "expired") byKey.spot_released.push(rec);
  }

  const countByKey = Object.fromEntries(Object.entries(byKey).map(([k, v]) => [k, v.length]));
  return { byKey, countByKey };
}
