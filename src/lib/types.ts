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

// Pipeline status type (matches DB CHECK constraint)
export type BookingStatus =
  | "lead"
  | "interested"
  | "enquiring"
  | "contact_by_phone"
  | "ready_to_book"
  | "payment_pending"
  | "downpayment_paid"
  | "create_invoice"
  | "paid"
  | "confirmed"
  | "attended"
  | "lost";

// Pipeline status labels for UI
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  lead: "Lead",
  interested: "Interested",
  enquiring: "Enquiring",
  contact_by_phone: "Contact by Phone",
  ready_to_book: "Ready to Book",
  payment_pending: "Payment Pending",
  downpayment_paid: "Downpayment Paid",
  create_invoice: "Create Invoice",
  paid: "Paid",
  confirmed: "Confirmed",
  attended: "Attended",
  lost: "Lost",
};

// Pipeline status order (for sorting and kanban)
export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "lead",
  "interested",
  "enquiring",
  "contact_by_phone",
  "ready_to_book",
  "payment_pending",
  "downpayment_paid",
  "create_invoice",
  "paid",
  "confirmed",
  "attended",
  "lost",
];
