# Prompt for jibe — import Stripe card payments into the NP7 admin

> Companion to `docs/jibe-payments-sync-prompt.md` (that one handles bank
> transfers from the accountant's Google Sheet). **This one handles card payments,
> pulled straight from Stripe** — the authoritative source, with no manual
> transcription lag. (Example: Dennis Robinson's Madagascar payment is on Stripe
> but never made it into the sheet's Stripe tab.)
>
> **⚠️ Temporary bridge** until our own system + direct bank API. Best-effort,
> human-reviews the unmatched. Don't over-engineer.

## What you do
Read **succeeded charges from Stripe** and write them into Supabase `exp_payments`,
matched to the right booking. **Once this runs, STOP importing the sheet's
"Client (income) Stripe" tab** in the other prompt — Stripe-direct supersedes it,
so we don't double-count.

## How NP7's Stripe works (verified, so you match correctly)
- No Stripe SDK — it's raw REST (`api.stripe.com`). Keys live in Vercel/prod.
- Website reservations create a **Checkout Session** (`mode=payment`) with
  **`metadata.booking_id`** on the session, and a payment-intent description
  `"NP7 deposit · booking <id>"`. Members also have a Stripe **Customer** carrying
  `metadata.contact_id` (stored as `contacts.stripe_customer_id`).
- The existing **webhook only sets booking flags** (`status=confirmed`,
  `downpayment_received`) — it does **NOT** write `exp_payments`. So **no Stripe
  payment is recorded as a payment row today**: this import is the *sole* source of
  Stripe payment records, and there's **no double-import risk with the webhook**.
- Manual charges (e.g. the private Madagascar trip via payment links/invoices) will
  **not** carry `metadata.booking_id` — match those by customer email / name.

## Access (Nico provides)
- **Stripe**: a read-only restricted API key (charges/payment-intents read).
- **Supabase**: the service role key + URL (same as the sheet prompt).

## Pull from Stripe
List **succeeded** PaymentIntents / Charges in the relevant date range. For each, take:
- `id` (stable — your idempotency key)
- `amount` (gross, in cents → /100) and `currency`
- `created` (the payment date)
- customer **email + name** (`billing_details` / `customer`)
- `metadata` / description — website charges carry **`metadata.booking_id`** on the session (and `"booking <id>"` in the payment-intent description); the Customer carries `metadata.contact_id`.
- refunds: a charge with a refund → record a `refund` row for the refunded amount.

## Match to a booking (in priority order)
1. **session/payment-intent `metadata.booking_id`** (or the `booking <id>` in the description) → match that booking directly. This is the reliable one for website charges.
2. Else the Customer's **`metadata.contact_id`** (or `contacts.stripe_customer_id`) → that contact → their booking.
3. Else **email** match to a `contacts` row → their booking.
4. Else **name** match + plausibility (amount vs agreed).
5. No confident match → insert `booking_id = null`, `unmatched = true` (set `contact_id` if clear). Team resolves at `/admin/payments`.

Be conservative — unmatched beats a wrong match.

## Write to `exp_payments`
| column | value |
|---|---|
| `booking_id` / `contact_id` | matched (or null + unmatched) |
| `amount` | **gross** charge amount (what the customer actually paid, incl. the Stripe fee — this is why a Stripe payer "paid a bit more") |
| `type` | infer from running total vs `agreed_price`: ~50% & first → `downpayment`; settles balance → `final`; else `partial`; refund → `refund` |
| `direction` | `revenue` |
| `status` | `paid` |
| `method` | `stripe` |
| `date` / `received_at` | the charge `created` date |
| `reference` | **`"stripe:" + <charge/payment_intent id>`** |
| `notes` | description / statement descriptor |
| `unmatched` | `true` when no confident booking match |

Then per matched booking recompute `paid = Σ revenue − refunds` and PATCH
`downpayment_received` / `final_payment_received`. **Never change `exp_bookings.status`.**

## Idempotency & no double-counting
- Dedupe on `reference = "stripe:<id>"`. Exists & unchanged → skip; changed → PATCH; new → insert.
- A card payment must exist **once**: from Stripe-direct (preferred). So **don't also import it from the sheet's Stripe tab.** If any sheet-sourced Stripe rows already exist (method=stripe, no `stripe:` reference) for the same booking+amount+~date, treat the Stripe-direct row as authoritative and remove/skip the duplicate.
- Never delete rows you didn't create; never wipe-and-reload.

## Stripe fees
Record the **gross** as the customer's payment (above). The Stripe fee is a *cost*,
not member-facing — optionally log fees as a separate expense later, but it's not
needed for member balances.

## Run safely
1. **Dry-run** first: log intended insert/update/skip + match decision + the unmatched list; write nothing. Send Nico the counts.
2. After approval, run for real. Reruns apply only diffs.

## Acceptance
- Re-running twice → **zero** new rows the 2nd time.
- Every succeeded Stripe charge is either matched to a booking or present with `unmatched=true`.
- No card payment exists twice (Stripe-direct vs sheet).
- No booking `status` changes; no deletions.

## Confirm with Nico before the first real run
- Which Stripe account + the read-only key, and the date range to import.
- Is `metadata.contact_id` reliably set for **manual** charges (e.g. Madagascar payment links/invoices), or should those match by email only?
- Cut over fully to Stripe-direct (and drop the sheet's Stripe tab from the other sync)?
