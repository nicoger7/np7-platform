import type { MemberBooking } from "@/lib/portal-data";

export type StatusChip = { label: string; tone: "amber" | "blue" | "green" | "gray" };

/** Friendly booking status for the member portal. */
export function bookingStatus(b: Pick<MemberBooking, "status" | "downpayment_received" | "final_payment_received">): StatusChip {
  const s = (b.status ?? "").toLowerCase();
  if (b.final_payment_received || s === "paid") return { label: "Fully paid", tone: "green" };
  if (b.downpayment_received || s === "downpayment_paid") return { label: "Deposit paid · balance open", tone: "blue" };
  if (s === "confirmed") return { label: "Confirmed", tone: "blue" };
  if (s === "attended") return { label: "Completed", tone: "gray" };
  if (s === "lost") return { label: "Cancelled", tone: "gray" };
  if (s === "payment_pending") return { label: "Deposit pending", tone: "amber" };
  return { label: "Reserved", tone: "amber" };
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
