import { createAdminClient } from "@/lib/supabase";
import { eventPricing, type EventInfo } from "@/lib/events";
import { EventTicket, type TicketDate } from "@/components/experience/event-ticket";

/**
 * The clinic's buy box, on the trip page.
 *
 * A clinic is now the trip page with the trip-sized parts switched off, so the
 * package picker's slot needs the one thing a clinic actually sells: a seat.
 * The pricing rules — pay-now split, refund window, which date is on sale, when
 * a past clinic must stop selling itself — are the ones the slim event page
 * already used, lifted out rather than rewritten, because they were learned the
 * hard way and a second copy would drift from the till.
 */

const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 0 }).format(n);

function fmtRange(start: string, end: string | null): string {
  const s = new Date(start);
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (!end || end === start) return `${d(s)} ${s.getUTCFullYear()}`;
  const e = new Date(end);
  return `${d(s)} – ${d(e)} ${e.getUTCFullYear()}`;
}

function toTicketDate(d: EventInfo["dates"][number]): TicketDate {
  return {
    id: d.id,
    label: d.label || fmtRange(d.date_start, d.date_end),
    sub: d.label ? fmtRange(d.date_start, d.date_end) : undefined,
  };
}

export async function ClinicTicketBox({
  event, isMember, paid, paidBookingId = null,
}: { event: EventInfo; isMember: boolean; paid: boolean; paidBookingId?: string | null }) {
  // "You're in" was once a claim made by the URL alone, which is how a page
  // congratulates someone the platform never recorded. Ask the booking.
  const paidBooking = paid && paidBookingId
    ? await (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createAdminClient() as any;
        const { data } = await db.from("exp_bookings").select("id,status").eq("id", paidBookingId).maybeSingle();
        return (data as { id: string; status: string | null } | null) ?? null;
      })()
    : null;
  const paidConfirmed = ["paid", "reserved", "confirmed", "attended"].includes(String(paidBooking?.status ?? "").toLowerCase());

  const price = event.price ?? 0;
  const cur = event.currency ?? "EUR";
  const { deposit, balance, refund } = eventPricing(price, event.depositPct, event.refundPct);

  const candidateDates = event.dates.filter((d) => d.status === "candidate").map(toTicketDate);
  const confirmed = event.dates.find((d) => d.status === "confirmed");
  const fixedDate: TicketDate | null = confirmed
    ? toTicketDate(confirmed)
    : event.mode === "fixed" && event.dates[0] ? toTicketDate(event.dates[0]) : null;

  // A clinic whose date has passed must stop selling itself — the series page
  // otherwise falls back to the PAST edition and offers a balance due date that
  // has already been and gone.
  const today = new Date().toISOString().slice(0, 10);
  const over = event.dates.length > 0 && event.dates.every((d) => (d.date_end ?? d.date_start) < today);
  const canBook = !over && price > 0 && (event.mode === "standby" ? candidateDates.length > 0 : !!fixedDate);

  if (paidConfirmed) {
    return (
      <div className="rounded-2xl bg-white border border-[#cfe9d9] p-7 text-center">
        <p className="text-[15px] font-black text-[#1a7f60]">You&apos;re in 🤙</p>
        <p className="text-[13.5px] text-[#6a7a80] mt-2">Your spot is booked — check your inbox for the details.</p>
      </div>
    );
  }

  if (!canBook) {
    return (
      <div className="rounded-2xl bg-white border border-[#e3e9ec] p-7 text-center">
        <p className="text-[15px] font-bold text-[#00374a]">{over ? "This clinic has run" : "Dates coming soon"}</p>
        <p className="text-[13.5px] text-[#6a7a80] mt-2">
          {over
            ? "New dates are in the works — check back, or ping us and we'll tell you first."
            : "Not open for booking yet. Check back shortly."}
        </p>
      </div>
    );
  }

  return (
    <EventTicket
      experienceId={event.id}
      mode={event.mode}
      priceLabel={money(price, cur)}
      depositLabel={money(deposit, cur)}
      balanceLabel={money(balance, cur)}
      refundLabel={money(refund, cur)}
      dates={candidateDates}
      fixedDate={fixedDate}
      isMember={isMember}
      eventDate={(confirmed ?? event.dates[0])?.date_start ?? null}
      editionSlug={event.editionSlug ?? null}
      adultsOnly={event.adultsOnly === true}
      priceNote={event.priceNote ?? null}
      location={event.location}
      partPayment={event.plan.partPayment}
      dueNowLabel={money(event.plan.dueNow, cur)}
      planBalanceLabel={money(event.plan.balance, cur)}
      balanceDueLabel={event.plan.balanceDue
        ? new Date(`${event.plan.balanceDue}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        : null}
    />
  );
}
