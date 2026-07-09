import type { Division } from "./layout";

/**
 * The real email automations — the single source of truth for what the system
 * actually sends (mirrors the code templates + the cron's lifecycle sequence).
 *
 * kind:
 *  - "transactional" → always sends (user-triggered, no admin data). Live now.
 *  - "lifecycle"     → automated customer mail. Sends only when EMAIL_LIFECYCLE_LIVE=true
 *                       (the soft-launch guard). Paused until you flip it on.
 */
export type AutomationKind = "transactional" | "lifecycle";

export type Automation = {
  key: string;
  name: string;
  stage: string;
  trigger: string;
  division: Division;
  kind: AutomationKind;
};

export const AUTOMATIONS: Automation[] = [
  { key: "account_magic_link", name: "Login / sign-up link", stage: "Account", trigger: "When someone signs up or requests a login link", division: "experience", kind: "transactional" },
  { key: "reservation_received", name: "Welcome / how it works", stage: "Register", trigger: "Right after someone registers (free)", division: "experience", kind: "transactional" },
  { key: "trip_invite", name: "Invite a friend", stage: "Referral", trigger: "When a member emails a friend an invite to their trip", division: "experience", kind: "transactional" },
  { key: "voucher_purchased", name: "Gift voucher — buyer", stage: "Vouchers", trigger: "When you confirm a gift-voucher payment (PDF attached)", division: "experience", kind: "transactional" },
  { key: "voucher_gift", name: "Gift voucher — recipient", stage: "Vouchers", trigger: "Delivered to the recipient when a voucher is confirmed (PDF attached)", division: "experience", kind: "transactional" },
  { key: "deposit_confirmation", name: "Spot secured — you're in", stage: "Securing", trigger: "When the securing payment lands (the down-payment, or the deposit if one is set) — activates their trip account", division: "experience", kind: "lifecycle" },
  { key: "payment_pending_nudge", name: "Down-payment reminder", stage: "Securing", trigger: "A couple of days after signing up, if the spot isn't secured yet", division: "experience", kind: "lifecycle" },
  { key: "downpayment_last_chance", name: "Last chance to secure", stage: "Securing", trigger: "A few days before the down-payment deadline, if it's still unpaid", division: "experience", kind: "lifecycle" },
  { key: "spot_released", name: "Spot released", stage: "Securing", trigger: "Once the down-payment deadline has passed and the spot is no longer held for them", division: "experience", kind: "lifecycle" },
  { key: "balance_invoice_reminder", name: "Balance invoice & reminder", stage: "Balance", trigger: "Around the final-payment due date (~90 days before the trip by default)", division: "experience", kind: "lifecycle" },
  { key: "balance_paid_confirmation", name: "Balance paid", stage: "Balance", trigger: "When the remaining balance is paid in full", division: "experience", kind: "lifecycle" },
  { key: "pre_trip_info", name: "Pre-trip info & packing list", stage: "Pre-trip", trigger: "~21 days before — packing list + your note (from Event Content)", division: "experience", kind: "lifecycle" },
  { key: "pre_trip_excitement", name: "Countdown / excitement", stage: "Pre-trip", trigger: "~10 days before — build anticipation", division: "experience", kind: "lifecycle" },
  { key: "pre_trip_final", name: "Final details", stage: "Pre-trip", trigger: "~3 days before the trip — packing, arrival, group chat", division: "experience", kind: "lifecycle" },
  { key: "waiver_reminder", name: "Waiver reminder", stage: "Pre-trip", trigger: "~14→2 days before, if the waiver isn't signed yet", division: "experience", kind: "lifecycle" },
  { key: "post_trip_thank_you", name: "Thank you + review", stage: "Post-trip", trigger: "~3 days after the trip ends", division: "experience", kind: "lifecycle" },
  { key: "photos_ready", name: "Photos are ready", stage: "Post-trip", trigger: "Once photos land in the member's gallery", division: "experience", kind: "lifecycle" },
  { key: "cancellation_confirmed", name: "Cancellation confirmed", stage: "Cancellation", trigger: "When you confirm a cancellation on the booking (manual)", division: "experience", kind: "transactional" },
  { key: "addon_confirmed", name: "Add-on confirmed", stage: "Add-ons", trigger: "When you confirm a requested add-on", division: "experience", kind: "lifecycle" },
];

/** Whether the automated lifecycle pipeline is switched on (env, server-only). */
export function lifecycleLive(): boolean {
  return process.env.EMAIL_LIFECYCLE_LIVE === "true" || process.env.EMAIL_LIFECYCLE_LIVE === "1";
}
