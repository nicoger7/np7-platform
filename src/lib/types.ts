import type { Database } from "./database.types";

// Convenience type aliases for table rows
type Tables = Database["public"]["Tables"];

export type Contact = Tables["contacts"]["Row"];
export type ContactInsert = Tables["contacts"]["Insert"];
export type ContactUpdate = Tables["contacts"]["Update"];

export type Experience = Tables["exp_experiences"]["Row"];
export type ExperienceInsert = Tables["exp_experiences"]["Insert"];
export type ExperienceUpdate = Tables["exp_experiences"]["Update"];

export type Package = Tables["exp_packages"]["Row"];
export type PackageInsert = Tables["exp_packages"]["Insert"];
export type PackageUpdate = Tables["exp_packages"]["Update"];

export type Component = Tables["exp_components"]["Row"];
export type ComponentInsert = Tables["exp_components"]["Insert"];
export type ComponentUpdate = Tables["exp_components"]["Update"];

export type Booking = Tables["exp_bookings"]["Row"];
export type BookingInsert = Tables["exp_bookings"]["Insert"];
export type BookingUpdate = Tables["exp_bookings"]["Update"];

export type Payment = Tables["exp_payments"]["Row"];
export type PaymentInsert = Tables["exp_payments"]["Insert"];
export type PaymentUpdate = Tables["exp_payments"]["Update"];

export type Vendor = Tables["vendors"]["Row"];
export type VendorInsert = Tables["vendors"]["Insert"];
export type VendorUpdate = Tables["vendors"]["Update"];

export type HotelRoom = Tables["exp_hotel_rooms"]["Row"];
export type HotelRoomInsert = Tables["exp_hotel_rooms"]["Insert"];
export type HotelRoomUpdate = Tables["exp_hotel_rooms"]["Update"];

export type ExpCost = Tables["exp_costs"]["Row"];
export type ExpCostInsert = Tables["exp_costs"]["Insert"];
export type ExpCostUpdate = Tables["exp_costs"]["Update"];

export type ExpTask = Tables["exp_tasks"]["Row"];
export type ExpTaskInsert = Tables["exp_tasks"]["Insert"];
export type ExpTaskUpdate = Tables["exp_tasks"]["Update"];

export type TaskTemplate = Tables["exp_task_templates"]["Row"];

export type TeamMember = Tables["team_members"]["Row"];
export type HoursLog = Tables["hours_log"]["Row"];

export type HwProduct = Tables["hw_products"]["Row"];
export type HwVariant = Tables["hw_variants"]["Row"];

// ── Booking pipeline ──────────────────────────────────────────────────────────
// The lean, self-serve funnel. A lead either secures their spot by paying the
// Stripe hold-deposit (→ confirmed) or it doesn't. Payment progress (Stripe
// deposit → downpayment → full) is tracked separately on the booking + Payments
// page, NOT as pipeline columns. "Confirmed" = attending, from the deposit on.
export type BookingStatus =
  | "lead"       // free signup / enquiry, no commitment, no spot held
  | "reserved"   // checkout started, awaiting the Stripe hold-deposit
  | "confirmed"  // hold-deposit paid → spot secured & attending (14-day refundable)
  | "paid"       // balance fully settled
  | "attended"   // trip completed
  | "lost";      // cancelled, or hold-deposit not paid within 14 days

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  lead: "Lead",
  reserved: "Reserved",
  confirmed: "Confirmed",
  paid: "Fully paid",
  attended: "Attended",
  lost: "Lost",
};

// Order for sorting + the kanban columns.
export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "lead", "reserved", "confirmed", "paid", "attended", "lost",
];

// Map any legacy / Notion status onto the lean pipeline. Keeps reads correct for
// rows not yet rewritten by the migration, and is the single source the migration
// mirrors. Unknown / null → "lead".
export const LEGACY_STATUS_MAP: Record<string, BookingStatus> = {
  // pre-deposit nurture stages all collapse to a plain lead
  registered: "lead", interested: "lead", enquiring: "lead",
  contact_by_phone: "lead", ready_to_book: "lead",
  payment_pending: "reserved",
  // the hold-deposit being paid = confirmed; "create invoice" was a post-deposit task
  downpayment_paid: "confirmed", create_invoice: "confirmed",
  cancelled: "lost",
  // already canonical
  lead: "lead", reserved: "reserved", confirmed: "confirmed",
  paid: "paid", attended: "attended", lost: "lost",
};

export function normalizeBookingStatus(s: string | null | undefined): BookingStatus {
  return LEGACY_STATUS_MAP[(s ?? "").toLowerCase()] ?? "lead";
}

// "Confirmed / attending" — the spot is secured from the hold-deposit onward.
export const ATTENDING_STATUSES: BookingStatus[] = ["confirmed", "paid", "attended"];
export function isAttending(s: string | null | undefined): boolean {
  return ATTENDING_STATUSES.includes(normalizeBookingStatus(s));
}
/** Balance fully settled (drives "Fully paid"). */
export function isFullyPaid(s: string | null | undefined): boolean {
  const n = normalizeBookingStatus(s);
  return n === "paid" || n === "attended";
}
/** Dead / cancelled. */
export function isLostStatus(s: string | null | undefined): boolean {
  return normalizeBookingStatus(s) === "lost";
}
