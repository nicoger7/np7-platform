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

/**
 * WHO sets the mail off — a different axis from `kind`, which only says whether
 * the soft-launch flag gates it.
 *
 *  - "guest"     → the guest's own action fires it (signs up, pays, invites a
 *                  friend). Nobody at NP7 is involved; it goes out at 3am if
 *                  that's when they book.
 *  - "scheduled" → the nightly cron works the date out from the trip. Nobody
 *                  presses anything, and nobody's behaviour triggers it — which
 *                  is why missing content has to be caught BEFORE the date.
 *  - "staff"     → only goes out because someone at NP7 clicked send, confirm
 *                  or settle in the admin.
 */
export type TriggerSource = "guest" | "scheduled" | "staff";

export type Automation = {
  key: string;
  name: string;
  stage: string;
  trigger: string;
  division: Division;
  kind: AutomationKind;
  source: TriggerSource;
};

export const AUTOMATIONS: Automation[] = [
  { key: "account_magic_link", name: "Login / sign-up link", stage: "Account", trigger: "When someone signs up or requests a login link", division: "experience", kind: "transactional" , source: "guest" },
  { key: "reservation_received", name: "Welcome / how it works", stage: "Register", trigger: "Right after someone registers (free)", division: "experience", kind: "transactional" , source: "guest" },
  { key: "trip_invite", name: "Invite a friend", stage: "Referral", trigger: "When a member emails a friend an invite to their trip", division: "experience", kind: "transactional" , source: "guest" },
  { key: "voucher_purchased", name: "Gift voucher — buyer", stage: "Vouchers", trigger: "When you confirm a gift-voucher payment (PDF attached)", division: "experience", kind: "transactional" , source: "staff" },
  { key: "voucher_gift", name: "Gift voucher — recipient", stage: "Vouchers", trigger: "Delivered to the recipient when a voucher is confirmed (PDF attached)", division: "experience", kind: "transactional" , source: "staff" },
  { key: "deposit_confirmation", name: "Spot secured — you're in", stage: "Securing", trigger: "When the securing payment lands (the down-payment, or the deposit if one is set) — activates their trip account", division: "experience", kind: "lifecycle" , source: "guest" },
  { key: "payment_pending_nudge", name: "Down-payment reminder", stage: "Securing", trigger: "A couple of days after signing up, if the spot isn't secured yet", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "downpayment_last_chance", name: "Last chance to secure", stage: "Securing", trigger: "A few days before the down-payment deadline, if it's still unpaid", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "spot_released", name: "Spot released", stage: "Securing", trigger: "Once the down-payment deadline has passed and the spot is no longer held for them", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "balance_invoice_reminder", name: "Balance invoice & reminder", stage: "Balance", trigger: "Around the final-payment due date (~90 days before the trip by default)", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "balance_paid_confirmation", name: "Balance paid", stage: "Balance", trigger: "When the remaining balance is paid in full", division: "experience", kind: "lifecycle" , source: "scheduled" },
  // Events pay by card, so these fire off the Stripe webhook the moment the
  // money lands — transactional, not part of the soft-launch lifecycle hold.
  { key: "event_ticket_confirmed", name: "Event ticket confirmed", stage: "Events", trigger: "When an event ticket is paid in full via Stripe", division: "experience", kind: "transactional", source: "guest" },
  { key: "event_deposit_received", name: "Event deposit received", stage: "Events", trigger: "When a stand-by event deposit is paid via Stripe", division: "experience", kind: "transactional", source: "guest" },
  { key: "event_part_received", name: "Event deposit received — fixed date", stage: "Events", trigger: "When a deposit is paid on a fixed-date clinic (spot confirmed, balance still due)", division: "experience", kind: "transactional", source: "guest" },
  { key: "crew_forming", name: "Your crew is forming", stage: "Pre-trip", trigger: "~60 days before — opens the group chat while there is still time to plan together", division: "experience", kind: "lifecycle", source: "scheduled" },
  { key: "pre_trip_info", name: "Pre-trip info & packing list", stage: "Pre-trip", trigger: "~21 days before — packing list + your note (from Event Content)", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "pre_trip_excitement", name: "Countdown / excitement", stage: "Pre-trip", trigger: "~10 days before — build anticipation", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "pre_trip_final", name: "Final details", stage: "Pre-trip", trigger: "~3 days before the trip — packing, arrival, group chat", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "waiver_reminder", name: "Waiver reminder", stage: "Pre-trip", trigger: "~14→2 days before, if the waiver isn't signed yet", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "waiver_final_call", name: "Waiver — final call", stage: "Pre-trip", trigger: "Sent by hand when the gentle reminder hasn't worked and the trip is close", division: "experience", kind: "lifecycle", source: "staff" },
  { key: "post_trip_thank_you", name: "Thank you + review", stage: "Post-trip", trigger: "~3 days after the trip ends", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "photos_ready", name: "Photos are ready", stage: "Post-trip", trigger: "Once photos land in the member's gallery", division: "experience", kind: "lifecycle" , source: "scheduled" },
  { key: "invoice_sent", name: "Invoice sent (manual)", stage: "Billing", trigger: "When you email an invoice / pro-forma from a booking's Documents tab (PDF attached)", division: "experience", kind: "transactional" , source: "staff" },
  { key: "invoice_after_payment", name: "Invoice after payment", stage: "Billing", trigger: "When a payment lands and the official invoice replaces the pro-forma (PDF attached)", division: "experience", kind: "lifecycle" , source: "staff" },
  { key: "payment_shortfall_reminder", name: "Shortfall reminder", stage: "Billing", trigger: "When you settle a payment that doesn't quite cover the amount due — friendly ask for the difference", division: "experience", kind: "transactional" , source: "staff" },
  { key: "survey_invite", name: "Trip interest survey", stage: "Surveys", trigger: "When you press 'Send invites' on an interest survey (personal link; quick mode = one-tap answer buttons)", division: "experience", kind: "transactional" , source: "staff" },
  { key: "cancellation_confirmed", name: "Cancellation confirmed", stage: "Cancellation", trigger: "When you confirm a cancellation on the booking (manual)", division: "experience", kind: "transactional" , source: "staff" },
  { key: "addon_confirmed", name: "Add-on confirmed", stage: "Add-ons", trigger: "When you confirm a requested add-on", division: "experience", kind: "lifecycle" , source: "staff" },
];

/**
 * Emails with no off switch.
 *
 * The magic link IS the way a member signs in. Switching it off would lock
 * people out of their own account with nothing on screen to explain why, and
 * the person best placed to notice — the member — has no way to report it. A
 * switch whose failure mode is silent lockout is not worth having.
 */
export const CANNOT_DISABLE = new Set(["account_magic_link"]);

/** Whether the automated lifecycle pipeline is switched on (env, server-only). */
export function lifecycleLive(): boolean {
  return process.env.EMAIL_LIFECYCLE_LIVE === "true" || process.env.EMAIL_LIFECYCLE_LIVE === "1";
}
