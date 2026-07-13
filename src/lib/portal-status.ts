import type { MemberBooking } from "@/lib/portal-data";
import { normalizeBookingStatus } from "@/lib/types";

export type StatusChip = { label: string; tone: "amber" | "blue" | "green" | "gray" };

/** Friendly booking status for the member portal. The pipeline status gives the
 *  stage; the payment flags split a confirmed booking into deposit-paid vs fully-paid. */
export function bookingStatus(b: Pick<MemberBooking, "status" | "downpayment_received" | "final_payment_received">): StatusChip {
  const s = normalizeBookingStatus(b.status);
  if (s === "attended") return { label: "Completed", tone: "gray" };
  if (b.final_payment_received || s === "paid") return { label: "Fully paid", tone: "green" };
  // deposit-neutral: most packages have NO deposit (explicit 0) — never claim
  // one was paid. "Spot secured" is true in both configs.
  if (b.downpayment_received || s === "confirmed") return { label: "Spot secured · balance open", tone: "blue" };
  if (s === "lost") return { label: "Cancelled", tone: "gray" };
  if (s === "reserved") return { label: "Payment pending", tone: "amber" };
  return { label: "Spot not secured yet", tone: "amber" }; // lead
}

/** A booking whose spot isn't secured yet → show the "Secure your spot" CTA. */
export function needsDownpayment(b: Pick<MemberBooking, "status" | "downpayment_received" | "final_payment_received">): boolean {
  if (b.downpayment_received || b.final_payment_received) return false;
  const s = normalizeBookingStatus(b.status);
  return s === "lead" || s === "reserved";
}

export const CHIP_CLASS: Record<StatusChip["tone"], string> = {
  amber: "bg-[#f47b20]/12 text-[#c4621a]",
  blue: "bg-[#00afdb]/12 text-[#0782a0]",
  green: "bg-green-500/12 text-green-700",
  gray: "bg-[#8a9aa0]/15 text-[#5a6b72]",
};

export function fmtDates(start?: string | null, end?: string | null) {
  if (!start) return "Dates to be confirmed";
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} – ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
}

export function money(n: number | null | undefined, currency?: string | null) {
  if (n == null) return null;
  const sym = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${sym}${n.toLocaleString("en-US")}`;
}
