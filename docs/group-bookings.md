# Group orders: one payer, several travellers

> Design doc, 2026-08-02. Researched against the live codebase by 17 parallel agents
> (7 subsystem maps, 3 competing designs, 3 judges, 3 adversarial verifiers).
> **Nothing here is built yet.** It supersedes the June 2026 decision recorded in
> memory `project-group-bookings` — see §9 for what changed and why.

## 1. How it works — the story

**Mathias wants to book Bonaire for himself, his wife Anna, and their 12-year-old Lena. He pays for all three.**

He lands on `/experience/bonaire`, picks the week, picks *his* package (Advanced Coaching Week, double room). Under the Reserve button there's one line he can ignore: *"Booking for more than one person? You can add them in the next step."*

He taps **Reserve**. The modal opens on the form that exists today — first name, last name, email. At the bottom, collapsed: **+ Add someone to this booking**.

He opens it. Anna's card: first name, last name, email, and a package picker defaulted to his own — he switches her to *Beginner Coaching Week · sharing your room*. Then Lena's card: first name, last name, and instead of an email he ticks **"No email — my child"**, which reveals a package picker (*Beginner · extra bed*) and nothing else. No date of birth, no diet, no shirt size, no level. One checkbox at the bottom: *"I have their okay to give NP7 their details, and I'll let them know we'll be in touch."*

Review screen:

```
Bonaire · 7–14 March 2027

Mathias Weber    Advanced · double room              €2,850
Anna Weber       Beginner · sharing your room        €1,950
Lena Weber (12)  Beginner · extra bed                €1,450
                                        Trip total   €6,250

Secure all 3 spots   €3,125   by 16 Aug 2026
Balance              €3,125   by 7 Dec 2026

Bank transfer. Details are in your email and your account.
3 spots left this week.
```

**Reserve our spots.** Three bookings are created. One pro-forma PDF, one amount, one reference, one email — to Mathias.

Success screen:

> **You're in. 🤙 Three spots held.**
> **Mathias** — reserved ✓ · **Anna** — invite on its way to a•••@gmail.com · **Lena** — you'll manage her details from your account
> [ Tell Anna on WhatsApp ] [ Copy link ]
> Next: €3,125 by 16 Aug. Bank details are in your inbox.
> [ Open my account ]

He taps WhatsApp and sends Anna *"babe we're going to Bonaire 🤙 <link>"* at 23:04. NP7's email lands at 23:06, from **Mathias Weber (via NP7)**, so it reads as confirmation rather than ambush. Its button goes to a public page showing the spot, the week, her package, and one line: *"Mathias is paying for your spot. There is nothing for you to pay."* Two buttons: **This is me — open my trip** (which emails a login link to *her* address, never auto-logs in from a forwarded link) and **This isn't for me** (one click, no login, stops all mail, tells Mathias, raises an admin task).

She clicks through, lands in the portal on her own trip page. Where Mathias sees a payment plan, she sees **"Covered by Mathias ✓"** and her own package price — nothing else about money. Her prep checklist opens already 40% done, because it genuinely is. What's hers: sign her waiver, add her flight times, tell us about diet and level.

Lena never gets an email. Everything about her — her waiver (signed by Mathias as guardian), her diet, her shirt size — is filled in from Mathias's account.

Mathias transfers €3,125 quoting the reference. Admin records it. All three bookings flip to secured in one write: three spots consumed, dunning stops for everyone, and Anna and Lena drop into the crew chat, the packing list and the arrival-info stream that they'd otherwise be silently excluded from.

That's the whole flow.

---

## 2. The decisions that matter

### 2.1 One booking per person — keep it

Not negotiable and not new. Per-person bookings are what make the waiver legal (`exp_waiver_signatures` is `unique (booking_id)`, `supabase/migrations/20260620_031_waiver.sql:19`), the level/coaching group correct, capacity honest (`src/lib/availability.ts:22-25` counts bookings), photos and progression attributable, and per-package revenue real. Mathias-on-Advanced / Anna-on-sharing is already a real row shape in the DB. The industry "one party booking with traveller records" model would throw all of that away.

### 2.2 The money does **not** move — this is the core call, and it overrides June

**Rejected: the June proportional split** (`docs/jibe-payments-sync-prompt.md:125-152` — "every member ends at the same %"). Under that rule, €3,125 becomes three `exp_payments` rows: Mathias €1,425, Anna €975, Lena €725.

Why I'm rejecting it, concretely:

- `exp_payments.booking_id` is a single FK with `ON DELETE CASCADE` (`supabase/migrations/001_experience_backend.sql:122`). Money physically sitting on Anna's row is money that vanishes if her booking is ever deleted, and money that is stranded if she cancels.
- `reconcileInvoice` matches payments to an invoice by exact `document_id` over **one booking's** payment array (`src/lib/reconcile.ts:92`, and every caller passes `.eq("booking_id", id)`). A combined invoice settled by three split rows can therefore **never** read as paid on any screen — it will show `partial` forever.
- `promoteProformaIfPaid` sums inflow with `.eq("booking_id", bookingId)` (`src/lib/invoices/promote.ts:34-40`). Split money means the promotion logic has to be re-implemented group-wide, which means a second copy of the gapless German invoice-number machinery. That is the one thing in this codebase where a bug is not fixable after the fact.
- Shares are not stable. Confirm a €180 add-on on Anna's booking in October and every stored share is wrong against a bank line that already reconciled.
- And it shows Anna a fiction: "your package is 50% paid" is a number she didn't pay and can't act on.

**Instead: all money and all documents stay on the payer's booking.** Anna and Lena have zero payment rows, zero invoices, zero payment plan. Their `agreed_price` stays their real price (that's what keeps edition P&L honest); it is simply billed on Mathias's booking.

The cost of this choice, stated plainly: **per-*package* revenue attributes a group's money to the payer's package.** Per-*edition* P&L is unaffected (`src/app/api/admin/editions/[id]/pnl/route.ts:22-32` sums every booking in the edition). Edition P&L is the number Nico actually uses.

### 2.3 One column, not a group table

**Rejected: `exp_booking_groups` + `payer_contact_id` + `booking_group_id`.** A table needs CRUD, RLS, an archive entry, a lifecycle, and it stores two facts (who's in the group, who pays) in two places that can drift.

`exp_bookings.covered_by_booking_id` — a self-reference — encodes both. The group is `{lead} ∪ {rows pointing at lead}`. "Covered" is derived (`covered_by_booking_id IS NOT NULL`), never a flag. Same booking→booking shape as the shipped `exp_bookings.invite_id` (`supabase/migrations/20260623_050_trip_invites.sql:39`) and `exp_hotel_rooms.extra_booking_ids` (`20260721_114:14`).

The name is deliberate: `covered_by_booking_id` is one of the three names the jibe prompt already looks for, so that doc needs a rename, not a rewrite.

**Consequence I accept:** the payer must be a traveller. A parent booking two kids and staying home has no lead booking to hang money on. Admin handles it (make one child the lead, cover the other). Rare enough not to deserve a code path; the alternative is the group table.

### 2.4 Do not create accounts at signup — send a claim link

**Rejected: calling `ensureMemberAccount` for each participant during registration.**

`src/lib/members.ts:99-104` states the codebase's own safety rule: an account is provisioned as a side effect of *the address-holder asking*, because "email ownership is proven by receiving the link." Provisioning an auth user and pushing a live one-click session link to an address a third party typed at checkout inverts that. `anna@gmial.com` is a plausible real mailbox, and its owner would get a working login into an account carrying Anna's name, her trip, eventually her allergy disclosure and her signed waiver.

Instead: `claim_token` on the booking, welcome email points at `/trip/<token>`, and "This is me" routes through her own inbox via the existing `sendMemberMagicLink` (`src/lib/members.ts:99-118`), which already auto-provisions for anyone with a booking. Zero new auth code.

This buys three more things:
- `contacts.auth_user_id IS NULL` becomes a **meaningful "hasn't claimed yet" signal**, which is what the payer-delegation guard needs. (If you provision at signup, that guard is dead on arrival — it's false for every participant from second zero.)
- A forwarded WhatsApp link shows the trip without handing over an account.
- A typo costs one bounce instead of an account.

It also sidesteps the fact that a Supabase magic-link OTP expires (typically 1h) — a "logs her straight in" button in an email read the next morning lands on `/account/login?error=expired` (`src/app/account/auth/confirm/route.ts:18`).

### 2.5 One combined invoice, one reference — but it lives on the lead's booking

June's "ONE combined invoice to the payer, line per participant, single invoice_number as transfer reference" **holds**. What changes is where it lives: `documents.booking_id = <lead>`, `contact_id = <payer>`. No new document shape, no `document_lines` table, no nullable-booking documents.

The pro-forma reference generator is untouched — `generate.ts:338` already derives `PF-INV-2027-<6hex(leadId)>-DP` — so there is one reference per stage and **no new idempotency surface for jibe**.

### 2.6 The group secures all-or-nothing

€2,000 against a €3,125 request secures nobody, holds zero spots, and only the payer is chased. You cannot half-secure a couple sharing a double room. This falls out of `computePaymentPlan`'s cumulative thresholds (`src/lib/payments.ts:105,117-122`) with no new logic.

---

## 3. The model

### Migration 129 — slice 1 (one column + one guard)

```sql
alter table exp_bookings
  add column if not exists covered_by_booking_id uuid
    references exp_bookings(id) on delete set null;

create index if not exists idx_exp_bookings_covered_by
  on exp_bookings(covered_by_booking_id);

comment on column exp_bookings.covered_by_booking_id is
  'One payer, several participants. NULL = this booking pays for itself (the lead
   is always NULL). Set = this participant is billed on the referenced booking;
   this booking gets no invoice, no pro-forma, no payment rows, no money emails.
   Group = {lead} ∪ {rows pointing at lead}. Same edition only.
   Never infer a group from traveling_with.';
```

Ships in the **same commit** as the hard-delete guard (§5.7), not a slice later.

### Migration 130 — slice 2 (public flow, participants, consent)

```sql
alter table exp_bookings
  add column if not exists claim_token             text,
  add column if not exists claim_token_expires_at  timestamptz,
  add column if not exists participant_declined_at timestamptz,
  add column if not exists participant_kind        text not null default 'adult'
        check (participant_kind in ('adult','minor')),
  add column if not exists guardian_contact_id     uuid references contacts(id) on delete set null,
  add column if not exists group_consent_text      text,        -- verbatim sentence, on the LEAD
  add column if not exists group_consent_at        timestamptz,
  add column if not exists group_consent_ip        text;

create unique index if not exists exp_bookings_claim_token_uidx
  on exp_bookings(claim_token) where claim_token is not null;

alter table contacts
  add column if not exists created_by_contact_id uuid references contacts(id) on delete set null;
```

`created_by_contact_id` is the machine-readable answer to *"who gave you my email address?"* — an Art. 14 obligation, one column.

Consent is stored **verbatim with timestamp and IP**, not as an appended line in `notes`. Under audit, "here is the exact sentence they ticked at 23:04:11 from 88.x.x.x" is worth an order of magnitude more than "there was a checkbox", and `notes` is free text that admin edits.

### Migration 131 — slice 3 (guardian waivers)

```sql
alter table exp_waiver_signatures
  add column if not exists signed_by_contact_id  uuid references contacts(id) on delete set null,
  add column if not exists signed_as             text not null default 'self'
        check (signed_as in ('self','guardian')),
  add column if not exists guardian_relationship text,
  add column if not exists signature_source      text not null default 'portal'
        check (signature_source in ('portal','paper','onsite'));
```

`unique (booking_id)` stays. `contact_id` stays the **participant**; `signed_by_contact_id` is who put their name to it.

### What stays unchanged

| | |
|---|---|
| `computePaymentPlan` (`src/lib/payments.ts:97-167`) | **Zero change.** Pure, takes a scalar `total` — the group total is just a bigger scalar. Verified for 6,250 → 3,125/3,125 and 4,800 → 2,400/2,400. |
| `reconcileBooking` / `reconcileInvoice` / `suggestInvoices` (`src/lib/reconcile.ts:89-198`) | **Zero change** (one addition, §4.6). All money and all documents on the lead means the arrays they're handed are already complete. |
| `promoteProformaIfPaid` (`src/lib/invoices/promote.ts:30-132`) | **Zero change**, including its atomic claim-by-void that prevents duplicate tax numbers. It reads `agreed_price` and hands it to `bookingBillingTotals`, so it inherits group-awareness for free. |
| PF reference generation (`generate.ts:335-342`) | **Zero change.** One order, one reference per stage. |
| `documents` / `exp_payments` schema | **Zero change.** Both `booking_id` FKs stay populated with the lead. `documents.booking_id` is nullable already (`20260618_021_invoicing.sql:66`) — we simply never use that. |
| `exp_bookings.traveling_with` | Left exactly as-is. Admin free text, read by nothing, parsed by nothing, ever. Gets a UI hint: *"free text, notes only — use Link to a group for the real thing."* |
| Room assignment | `exp_hotel_rooms.booking_id` + `extra_booking_ids[]` + `partner_tag_along`. Unchanged. |
| `src/components/portal/payment-plan.tsx` | Untouched. A new sibling component renders instead of it for covered bookings. |

### The one function that becomes group-aware

`bookingBillingTotals(bookingId, agreedPrice)` — `src/lib/invoices/generate.ts:68-72`:

```ts
export async function bookingBillingTotals(bookingId, agreedPrice) {
  const db = getDb();
  const { data: self } = await db.from("exp_bookings")
    .select("covered_by_booking_id").eq("id", bookingId).maybeSingle();
  if (self?.covered_by_booking_id) return { total: 0, invoiced: 0, outstanding: 0 };

  const { data: sibs } = await db.from("exp_bookings")
    .select("id, agreed_price, status").eq("covered_by_booking_id", bookingId);
  const live = (sibs ?? []).filter(s => normalizeBookingStatus(s.status) !== "lost");
  // total = agreed + own addons + Σ(sibling agreed + sibling addons)
  // invoiced = issuedInvoiceTotal(bookingId)   ← unchanged, all docs live here
}
```

I verified this is the single funnel: it feeds `generate.ts:264` (pro-forma amount), `promote.ts:124` (balance PF after promotion) and `promote.ts:169` (add-on resync). One edit, three engines.

---

## 4. Money — the worked example

Mathias €2,850 · Anna €1,950 · Lena €1,450. **Trip total €6,250.** Deposit is the explicit `0` (migration `20260622_043`), downpayment 50%, so: **€3,125 due sign-up + 14 days, €3,125 due start − 90 days.**

### 4.1 At signup

| table | rows |
|---|---|
| `contacts` | 3 — Mathias, Anna, and **Lena with `email = NULL`** |
| `exp_bookings` | 3 — L(Mathias) `agreed_price 2850`, `covered_by NULL`; Anna `1950`, `covered_by = L`; Lena `1450`, `covered_by = L`, `participant_kind 'minor'`, `guardian_contact_id = Mathias` |
| `documents` | **1** — `booking_id = L`, `contact_id = Mathias`, `type proforma_invoice`, `amount 3125`, `invoice_number PF-INV-2027-A1B2C3-DP` |
| `exp_payments` | 0 |
| `email_log` | 1 to Mathias (`reservation_received` + PDF), 1 to Anna (`group_participant_welcome`), 0 to Lena |

### 4.2 The PDF

Buyer block from **Mathias's** `contacts.billing_*` (unchanged — `generate.ts:174`). Line block:

```
NP7 Experience Bonaire · 7–14 March 2027 — Down-Payment (secures your spots)
  Travellers:  Mathias Weber — Advanced Coaching Week            €2,850
               Anna Weber — Beginner Coaching Week, sharing      €1,950
               Lena Weber — Beginner Coaching Week, extra bed    €1,450
                                              Trip total          €6,250
                                              Amount due (50%)    €3,125
```

**Implementation note that overrides June's "line per participant":** 3 of the 4 line renderers (`ProformaLines:346-355`, `DepositInvoiceLines:404-411`, `DownpaymentInvoiceLines:471-478`) have **no subtotal row** — their single row's amount *is* the milestone and the only totals row is the grand total. Rendering three priced `tableRow`s there produces a table summing to €6,250 above "Amount due €3,125", with nothing reconciling them.

So slice 1 renders travellers as a **descriptive sub-block** in the existing `smallText` slot (`template.tsx:351`, where `packageIncludes` already goes), plus **one** new row above the grand total: `Trip total (3 travellers) €6,250`. That's a `tableRow`-shaped addition, correct arithmetic, and it reads properly. A full priced-line-item table with a three-tier totals block is a slice-4 template rework, not "~15 lines each."

### 4.3 €3,125 arrives

Admin records it on Mathias's booking. `suggestInvoices` matches on reference (`reconcile.ts:174-184`), `document_id` is set. Then:

1. `promoteProformaIfPaid(L)` — inflow 3,125 ≥ 0 + 3,125 → voids the PF, mints the gapless `NP7E-2027-0042`, emails it, re-points the payment row, issues a fresh `PF-INV-2027-A1B2C3-FIN` for €3,125.
2. `syncGroupPaymentFlags(L)` — recomputes the plan on the group total against the ledger, finds the securing milestone paid, and writes `downpayment_received = true` / `status = 'confirmed'` on **all three** bookings.

Step 2 is the highest-leverage function in the whole design. Because the codebase already keys off those booleans, one write fixes, with no further edits:
- `paidSpotsByEdition` (`src/lib/availability.ts:22-25`) → 3 spots, not 1
- edition `confirmed_count` (`src/app/api/admin/editions/[id]/route.ts:40-44`)
- the `depositPaid` gate at `src/app/api/cron/emails/route.ts:171`, which controls **8 of the 13 automations** — crew chat, packing list, excitement, arrival info, waiver reminder, post-trip, photos
- the "Experience participants" member segment (`src/app/api/admin/members/route.ts:73`)
- `needsDownpayment` / the portal status chip (`src/lib/portal-status.ts:11-25`)
- photo-reminder eligibility

**Two things it must get right, both of which the obvious implementation gets wrong:**

- **It must use `paymentInflow` (`reconcile.ts:73-79`), not `sumReceived`.** They disagree: `sumReceived` requires `status === 'paid'` (`src/lib/payment-totals.ts:34`) while `paymentInflow` counts anything not `cancelled`. If flags use one and `promoteProformaIfPaid` uses the other, a `pending` row mints a real gapless tax invoice and emails it while the whole group stays locked out of every trip email. Fix both ends: make `paymentInflow` return 0 for `status === 'pending'` (one line, fixes a live solo-booking hazard too), then both sides agree.
- **It must be two-way.** "Only ever set true" is a one-way latch that fans out to N bookings. `DELETE` and `PATCH` on `src/app/api/admin/bookings/[id]/payments/route.ts:96-193` mutate the ledger and call *nothing* — only `POST` promotes (`:82`). A mis-keyed €6,250 corrected the next day would otherwise leave three bookings permanently `confirmed`, three spots held, all dunning off, nothing in the bank. Recompute from the ledger in both directions, and call it from POST, PATCH **and** DELETE.

### 4.4 What each person sees

| | Mathias (payer) | Anna / Lena (covered) |
|---|---|---|
| `/account` home | normal | no "Action needed · secure your spot" card — `needsDownpayment` returns false when covered |
| chip | Spot secured | **"Covered by Mathias"** (blue) — a new branch in `bookingStatus`, `src/lib/portal-status.ts:8-18`. Without it a covered participant reads **"Spot not secured yet"** in amber, which is the exact anxiety the feature exists to remove |
| Payment tab | full plan · €6,250 total · per-person breakdown · balance €3,125 · reference | **CoveredSpot card**: "Covered by Mathias ✓" + their own package price. No plan, no due date, no CTA, no group total, no invoice |
| Documents | all group invoices | none |

Anna sees *her own* price (she may need it if she cancels, and it's public on the website anyway) and never Mathias's, never the total, never the invoice.

### 4.5 Partial payment — €3,100 arrives

`3100 + 0.01 >= 3125` is false. `promoteProformaIfPaid` breaks at `promote.ts:61`. No flags set, **zero spots held**, all three stay `lead`. Mathias sees "€25 more to secure all three spots." Anna and Lena see the covered card and receive **nothing**. Correct and internally consistent.

### 4.6 Overpayment — the one thing that is genuinely invisible today

Mathias pays €6,250 in full, then Lena cancels. Group total → €4,800.

`reconcileBooking` clamps: `balance = round2(Math.max(0, total - paidTotal))` (`reconcile.ts:121`) → 0, `fullyPaid: true`. `resyncBookingBilling` computes `outstanding = max(0, 4800 − 6250) = 0` and returns (`promote.ts:169-172`). No invoice is individually overpaid because each was exactly settled. **€1,450 owed back to Mathias appears on no screen anywhere.**

Fix: add `credit: round2(Math.max(0, paidTotal - Math.max(total, invoicedTotal)))` to `BookingRecon` (`reconcile.ts:131-141`) and render it on the admin Payments tab. ~6 lines, no schema.

### 4.7 Five money routes the naive implementation breaks

These are the ones that read `agreed_price` or `getBookingPaid` raw and never touch `bookingBillingTotals`. Every one of them is live today.

| Route | What breaks | Fix |
|---|---|---|
| `src/app/api/admin/bookings/[id]/settle/route.ts:35` — `accept_short` | `newAgreed = paid − addons` where `paid` is now the **whole group's** money. One click rewrites Mathias's `agreed_price` from €2,850 to €6,250, making the group total €9,650 and immediately re-invoicing him. Silent, unrecoverable without the original package price. | **Block `accept_short` when live siblings exist.** "Unlink or cancel the covered participants first." |
| `settle/route.ts:51-53` — `remind_shortfall` | `total = bk.agreed_price + addons` = €2,850 against `paid` €3,125 → `balance = 0` → **HTTP 400 "Nothing outstanding"**. The template can never be sent to a group payer. Note this template *is* on the soft-launch allowlist, so it reaches real customers today. | Replace the inline arithmetic with `bookingBillingTotals(id, bk.agreed_price)`. |
| `src/app/api/cron/emails/route.ts:151-158` | `payState.total = b.agreed_price ?? 0` and **no `paidAmount`** — so the plan falls back to the boolean branch and ignores the ledger. Mathias is emailed *"pay your down-payment of €1,425"* against a real obligation of €3,125, and later a balance derived from €2,850. | One batched sibling-sum query after the fetch; set `total` to the group total and `paidAmount` to the group's inflow. |
| `src/app/api/admin/bookings/[id]/addons/route.ts:122` and `:229` | Both call `resyncBookingBilling(id)` with the **add-on's own** booking. For Anna that returns `{0,0,0}` and no-ops — so her confirmed €180 extra nights enter the group total but **no document is ever re-issued** and nobody is asked for the money. | At the top of `resyncBookingBilling`, resolve `const target = booking.covered_by_booking_id ?? bookingId` and operate on the lead. Three lines; also covers the portal add-on path. |
| `src/app/api/portal/vouchers/redeem/route.ts:82-111` | **Member-triggerable.** Anna redeems a €200 voucher on her own trip; the route computes outstanding from *her* `agreed_price`, passes, and inserts a real payment row on a booking that has no invoice. It never reduces Mathias's balance, never promotes. €200 gone. | Redirect: compute against and insert on `covered_by_booking_id ?? bookingId`, then call promote + sync. Same guard on `POST /api/admin/payments` (`route.ts:38-58`), which has no group check either. |

Plus the admin's own money panel: `outstanding` (`src/app/admin/bookings/[id]/page.tsx:578`), `bookingTotal` (`:592`), `reconcileBooking` (`:609`) and `computePaymentPlan` (`:627`) are all computed **client-side** from the fetched row. On a €6,250 order with €3,125 received the header reads **"✓ Fully paid"**. `GET /api/admin/bookings/[id]` must return `siblings[]` and `groupTotal`.

---

## 5. Sharp edges

### 5.1 Minors ship with slice 2, not later

The design's natural instinct is "require an email for everyone in slice 2, add the no-email path in slice 3." **That is the one sequencing decision that must be overridden.** Parent + child is the archetypal group booking. Forced to type an email, the payer types his own — and `src/app/api/register/route.ts:100-107` reuses the contact by email, producing **one contact, two bookings**: the child has no name, no DOB, no diet, no shirt size of her own; both waiver rows write `contact_id = the parent` (`waiver/route.ts:66`); every cron mail arrives twice in one inbox with distinct dedupe keys so dedupe cannot collapse them; the trip shows twice in the portal.

That is precisely the failure the no-email path exists to prevent. Ship it together: nullable email + `participant_kind` + `guardian_contact_id` is a form field and one `if`.

Hard block: if the payer supplies neither an email nor a "my child" tick, refuse. Adults need their own address — it's how they sign their own waiver.

### 5.2 Waivers

| Case | Who signs | How |
|---|---|---|
| Payer | themselves | unchanged |
| Covered **adult** | **themselves only** | Unchanged and non-negotiable. The text is first-person — *"I confirm I am fit… I can swim… I have disclosed any medical condition"* (`src/lib/waiver.ts:35`), plus media consent (`:48`) and a liability release (`:41`). A signing it is void. This is the single strongest argument for giving every adult their own email; say so in the modal copy. |
| Covered **minor** | the guardian, from the guardian's account | New branch on `POST /api/portal/bookings/[id]/waiver`: allowed when `booking.guardian_contact_id = me`. Writes `contact_id = the minor`, `signed_by_contact_id = payer`, `signed_as = 'guardian'`. |
| Nobody ever claimed | staff | **New `POST /api/admin/bookings/[id]/waiver`**, `signature_source = 'onsite'|'paper'`. There is **no admin waiver write path anywhere today** — `/admin/waivers` is read-only (`src/app/admin/waivers/page.tsx:36-53`) — so an unclaimed participant is currently an unfixable legal dead end at the airport. |

Two traps in the guardian branch:
- §11 of the waiver ("If the Participant is under 18, this agreement must be read and signed by a parent or legal guardian") exists **only** in `DEFAULT_WAIVER` (`src/lib/waiver.ts:49-50`). `exp_experiences.waiver_text` is a full admin-editable override and `renderWaiver` only substitutes `{{tokens}}` (`:60-62`) — it cannot inject a section. A guardian signature on an experience with a custom waiver archives a document with no guardianship language at all. Prepend the guardian sentence to the *rendered* text, and refuse `signed_as='guardian'` if the resolved text lacks the clause.
- `waiver/route.ts:46` falls back to the *typed* name when the contact has none. In the guardian branch that puts the guardian's name in the archived text as "the Participant". Fall back to `""`, not `name`.

**Unresponsive participants.** Today a covered participant would receive exactly **one** waiver reminder in her life — `waiver_reminder:${b.id}` is a single dedupe key (`cron/emails/route.ts:259-261`) against a `unique` index, unlike the payment ladder which deliberately has `:d2`/`:d5`. And the window is `daysToStart <= 14 && > 2` gated on `depositPaid`, so if the payer transfers at T-1 (normal when one person is chasing three), **no waiver reminder is ever generated for anyone in the group**. Fix in slice 1, not slice 4:
- add `waiver_reminder:r2:${b.id}` at `daysToStart <= 5`, drop the `> 2` lower bound
- add a **payer** nudge from 14 days out: *"Anna hasn't signed her waiver — here's her link to forward"*, `dedupeKey: waiver_reminder_payer:<siblingId>`
- surface `2/3 waivers signed` per group in the admin readiness panel

### 5.3 The delegation rule

> **A payer may fill in a covered participant's details until that participant claims their account. After they claim it, it's theirs. A minor never claims, so the payer keeps it permanently.**

`PUT /api/portal/travellers/[bookingId]` — guard: the booking's `covered_by_booking_id` resolves to a booking whose `contact_id = user.contactId`, **and** (`participant.auth_user_id IS NULL` **or** `participant_kind = 'minor'`). Writes `name`, `date_of_birth`, `tshirt_size`, `diet_allergies`, `self_level`, plus `flight_info`/`fly_in`/`fly_out` — **and `email`, but only while `auth_user_id IS NULL`** (this is how a typo gets fixed).

This guard only works because of §2.4. If you provision accounts at signup, `auth_user_id` is never null and the whole "Your travellers" panel is inert.

Never delegable, ever: the waiver (adults), `coach_can_manage_level`, `photos_shared`, `wa_group`, reviews, progress logs. Diet/allergies is Art. 9 health data — the payer *may* supply it for a partner (safety data must be known before departure), but the participant's trip page shows it back with *"Mathias added this — please check it's right."*

### 5.4 A covered participant cancels

She **cannot** self-cancel — `POST /api/portal/bookings/[id]/cancel` refuses when `covered_by_booking_id` is set (*"Mathias booked this spot — ask him, or drop us a line"*). The refund is owed to whoever paid, per `src/app/terms/page.tsx:26-34`.

Payer or admin cancels → `status = 'lost'`. Then — and this does **not** happen today — the cancel route must call `resyncBookingBilling(lead)` and `syncGroupPaymentFlags(lead)`. `src/app/api/admin/bookings/[id]/cancel/route.ts:46` currently writes `{status, notes}` and nothing else; grep confirms `resyncBookingBilling` has exactly two callers, both add-ons routes. So "the re-pricing comes for free" is false until you add the call. With it, the open pro-forma re-prices **in place, keeping its reference** — that part genuinely is free.

Two more:
- **Cancelling after the refund window currently *reduces* what the payer owes**, which inverts NP7's own cancellation scale. Rule: on cancelling a covered participant, keep them in the sum and set their `agreed_price` to the retained fee. No code — one admin field, documented on the Group card.
- **The spot is never released.** `paidSpotsByEdition` (`availability.ts:22-25`) has no status filter, and cancel never clears the flags. Today that leaks one seat; after propagation a cancelled 3-person group leaks three. One line in slice 0: `if (isLostStatus(b.status)) continue;`
- `extra_booking_ids` has no FK — prune it on cancel or the occupancy badge keeps counting her.

### 5.5 The payer cancels but the others still want to go

**This is the case the design cannot express, and it needs an explicit escape hatch.** All money, all documents and the PF reference itself are bound to the lead's booking id (`generate.ts:338`). Unlinking Anna and Lena is actively destructive — `bookingBillingTotals` immediately returns their full price against zero invoiced, `resyncBookingBilling` issues them fresh pro-formas, and the cron starts dunning them for money already in the bank.

**Ship "Transfer payer" in slice 1, next to Link/Unlink.** In one transaction: repoint every sibling's `covered_by_booking_id` at the new lead, `UPDATE documents SET booking_id = <new> WHERE booking_id = <old>`, `UPDATE exp_payments SET booking_id = <new> WHERE booking_id = <old>`, then `resyncBookingBilling(new)` + `syncGroupPaymentFlags(new)`, then cancel the old lead. Both are plain FKs. **No schema change, ~40 lines.** Slice 1 is what Nico runs live for weeks, so this has to be in it.

### 5.6 Linking existing bookings — the retrofit trap

"Link to a group" (§7) is how phone bookings become groups and how the existing hand-split pair gets retrofitted. Two guards it must have:

- **Refuse to link a booking that has any `exp_payments` row or any issued invoice.** Otherwise `bookingBillingTotals` returns 0 while `issuedInvoiceTotal` still holds an immutable tax invoice, the lead is billed for money already received, and `promoteProformaIfPaid(sibling)` can never reconcile.
- **On a successful link, void any open pro-forma on the covered booking.** Blocking *new* `generateDocument` calls doesn't retract an existing PF — it stays visible in her portal Documents tab (`src/app/api/portal/bookings/[id]/documents/route.ts:52` is a plain `.eq("booking_id", id)`).
- **Retrofit order matters:** set the link, void the sibling PF, *then* delete the legacy `alloc#` pair (the DELETE route already removes both halves) so the money returns to the lead, *then* enable propagation. Doing it out of order double-counts.

### 5.7 Deletion

`exp_bookings` is **not** in `ARCHIVE_ENTITIES` (`src/lib/archive.ts:22-38`), `DELETE /api/admin/bookings/:id` is an unguarded `.delete()` (`route.ts:102`), and both `exp_payments.booking_id` (`001:122`) and `exp_waiver_signatures.booking_id` (`031:9`) are `ON DELETE CASCADE`. Deleting a lead destroys the entire order's ledger **and** the payer's signed waiver, while `covered_by_booking_id … on delete set null` promotes three now-unpaid strangers to independent bookings that immediately begin dunning.

Refuse hard-delete on any booking that is a lead or a sibling. **In the same migration as the column**, not a bullet in a slice.

### 5.8 The same person in two groups, or covered *and* self-registered

There is no `unique (contact_id, edition_id)` anywhere. The validation "no duplicate emails inside the order" only guards within one submission. The live failure is: **Anna registers herself, then Mathias covers her.** Her own booking has `covered_by_booking_id = null`, so every `&& !covered` guard passes and she gets `payment_pending_nudge` ×2 then **`spot_released`** for a trip her husband paid for — while the edition is over-counted by one and she shows twice in admin.

Fix, ~15 lines in `/api/register` and in Link-to-a-group: if the participant's contact already has a non-`lost` booking on this edition, **link that booking** (set `covered_by_booking_id`, void its open PF) instead of inserting a new one. This is also the only thing that makes Link idempotent.

### 5.9 Capacity and shared rooms

**No change to `src/lib/availability.ts` except the lost-status line.** One participant = one spot. Two people in a double still consume two spots — correct, coaching capacity is per head.

Room *sharing* needs **no new field**. It's expressed by package choice at signup — Anna buys the *sharing / no-hotel* package, exactly the shape `supabase/migrations/20260721_114_addon_payment_shared_rooms.sql` was written for and which `src/lib/portal-data.ts:857-870` already resolves for her portal. The group link tells admin *who* she shares with.

Two fixes:
- The admin booking Rooms tab queries `.eq("booking_id", id)` and ignores `extra_booking_ids` — so Anna's own portal correctly shows her hotel while the admin looking at her booking reads **"No hotel rooms assigned"** and might re-book her a room. Make the admin query match the portal's `contains` branch. **Slice 0** — this is not a group bug, it's live today.
- In the "Also in this room · sharing, no own room" picker (`src/app/admin/editions/[id]/page.tsx:1541-1556`), pre-suggest the main guest's group siblings whose package has no hotel.

`/api/register` also **checks capacity nowhere** today. A 3-person order makes that worth adding.

### 5.10 GDPR / consent — the actual wording

**Lawful basis:** Art. 6(1)(b) — Anna is a traveller under a package-travel contract concluded on her behalf. Not consent, because consent from Mathias on Anna's behalf would be invalid. Same reasoning as the existing account pattern in `legal-framework-booking.md`.

**At entry**, its own row, bundled with nothing, required to submit:

> ☐ I have their permission to give NP7 their details, and I'll let them know we'll be in touch.

Stored verbatim in `group_consent_text` with `group_consent_at` + `group_consent_ip`.

**At first contact** — the Art. 14 notice goes in the body of the welcome email, not a footer link:

> *Mathias gave us your name and email so we could set your spot up. That's all we hold about you, plus whatever you add yourself.* [How we handle your data] · **[This isn't for me →]**

**"This isn't for me"** — one click, no login, no form. Sets `participant_declined_at`, suppresses all mail to her, tells Mathias, raises an admin task. Deletes nothing (there's a live contract and money in play). This is the single cheapest thing that makes third-party contact defensible.

**Data minimisation is the compliance posture, not a preference.** At checkout we take name + email, and for a minor, nothing but a name. No DOB, no phone, no diet, no level. Every extra field Mathias types about Anna is a field NP7 controls without Anna's involvement.

**Marketing never inherits.** New contacts get `source: 'group-participant'` and `marketing_opt_in` untouched. If Anna's email already exists in the 13.5k `maillist` import, reuse the contact and **do not modify its consent state either way**. Mathias's opt-in checkbox applies to Mathias only. UWG §7 makes this expensive to get wrong.

**Resolve NP7's own inconsistency while you're here.** Gift vouchers store a recipient's email and never contact them (`src/app/api/voucher/route.ts`); trip invites do contact a third party, with **no authority statement at all** (`src/app/api/portal/invites/route.ts:55-58`, `src/components/portal/invite-panel.tsx`). The rule going forward: *we email a third party only when they have an obligation to us.* A trip participant does (waiver, flights). A voucher recipient doesn't. Retro-fit the same one-line authority sentence onto the invite panel — five minutes.

### 5.11 Emails — the routing rule, and two blockers

> **Money mails go to the payer, once. Trip mails go to every participant, individually.**

Mechanically: add `covered_by_booking_id` to the cron select (`route.ts:86`), `const covered = !!b.covered_by_booking_id`, then `&& !covered` on the five money branches (`:218-221`, `:228`, `:229`, `:235-238`, `:241-243`). Everything else — crew chat, packing list, excitement, arrival info, waiver reminder, post-trip, photos — becomes correct automatically once the flags propagate, because they all gate on `depositPaid` at `:171`.

Two things that will otherwise silently break the new template:

1. **`SOFT_LAUNCH_ALLOWED`** (`src/lib/email/send.ts:53-58`) is a hardcoded set of 9 keys; anything else returns `{status:"skipped"}` at `:75` **before any DB write** unless `EMAIL_LIFECYCLE_LIVE=true`. `group_participant_welcome` is not in it. Mathias would get his welcome (allowlisted) and Anna would get **nothing at all**, while already holding a booking.
2. **The template must be a function in `TEMPLATES`** (`src/lib/email/templates.ts:566`) — an unknown key *throws*. `default-bodies.ts` only supplies editor defaults; a DB `body` override still falls back to `TEMPLATES[key]?.(vars).subject` at `:558`. "A row in `email_templates` plus a default body" is **not** the machinery.

**Bounce handling.** `sendEmail` never checks `email_bounced_at` — its only guards are soft-launch, `enabled`, missing API key, and the dedupe insert. So after `anna@gmial.com` bounces, every subsequent mail is rendered, sent, and logged `status:"sent"`. And `email_bounced_at` is read in exactly two places in the repo (a badge on a contact pane, and the campaign filter). Add: a bounce check in `sendEmail` that returns `skipped` *before* the log insert (so the dedupe key stays unburned and it fires for real once corrected), and in `src/app/api/webhooks/resend/route.ts:49-59`, when the bounced template is `group_participant_welcome`, email **the payer**: *"We couldn't reach anna@gmial.com — check the address."* Also always pass `contactId` on that send, or the fallback at `:57` patches every contact on that address.

Add `addon_confirmed` copy to the payer when the participant is covered (it moves his balance), and `cancellation_confirmed` to the payer (the refund is his).

---

## 6. Build order

### Slice 0 — bugs that exist today and that a group would amplify (~2 days, ships alone)

No group schema. Every item is valuable with zero group code.

1. **`syncBookingPaymentFlags(bookingId)`** — derive the three payment booleans from the ledger + `computePaymentPlan`, and call it from every payment write path (`payments/route.ts` POST/PATCH/DELETE, `/api/admin/payments`, `allocate`, Stripe webhook, voucher redeem). This is the group design's spine, built solo-first. It immediately fixes: capacity miscounts, dunning that continues after an `alloc#` transfer, and the portal disagreeing with itself.
2. Make `paymentInflow` return 0 for `status === 'pending'` — one line; stops a staged payment minting a real gapless tax invoice.
3. `paidSpotsByEdition` skips `lost` bookings.
4. Deterministic contact lookup: replace `.eq("email", …).maybeSingle()` with `.ilike("email", …).order("created_at").limit(1)` at all six sites (`register/route.ts:101`, `portal/register/route.ts:33`, `auth.ts:111`, `voucher/route.ts:75`, `reserve/route.ts:115`, `event/checkout`). A duplicate email currently *errors* and breaks portal login outright. **Do not add a unique index yet** — it would fail against the imported maillist.
5. Check the update error at `src/lib/members.ts:47`.
6. Server-validate `lastName` (`register/route.ts:80` only checks `firstName`); add a capacity check to `/api/register`.
7. Pass `priorInvoiced` and `amountDue` from `generate.ts:362-371` into `InvoiceData` and use them in `template.tsx:526,533,572` instead of letting the PDF re-derive — today a final invoice after any add-on prints a different number from its own `documents.amount`.
8. `src/lib/member-activity.ts:51` selects `paid_at`, which does not exist on `exp_payments` — "Payment recorded" has **never** rendered in the member timeline. Change to `received_at`.
9. Admin Rooms tab honours `extra_booking_ids`; `alloc#` rows set `date` + `contact_id` and call promote; manual payment entry populates `exp_payments.contact_id`; cron booking fetch gets `.range()` (PostgREST truncates at 1000).
10. Add `exp_bookings` to `ARCHIVE_ENTITIES`.

### Slice 1 — admin-side groups, no public change (~1 week)

Migration 129 + hard-delete guard. Group-aware `bookingBillingTotals`; `resyncBookingBilling` resolves to the lead; `generateDocument` guard at the **top** of the function (a covered booking already throws on amount for invoices, but `booking_confirmation` sets `isInvoice = false` at `:283` and has no amount guard); traveller sub-block + "Trip total" row in the 4 templates; `src/lib/group.ts` with `syncGroupPaymentFlags` (two-way, on `paymentInflow`); `&& !covered` on the 5 cron money branches **plus** group-total feeding of the payer's own money mails; `accept_short` blocked and `remind_shortfall` fixed; voucher-redeem and `/api/admin/payments` guards; `credit` on `BookingRecon`; portal `CoveredSpot` card, `covered` branch in `bookingStatus`, `needsDownpayment` guard, and the three plumbing edits in `src/lib/portal-data.ts:34-52` so the column even reaches the portal; admin Group card, list chips, group-aware sort and search, **Link / Unlink / Transfer payer**; waiver reminder r2 + payer nudge; retrofit the existing hand-split pair and delete its `alloc#` rows; rewrite `docs/jibe-payments-sync-prompt.md`.

**This is the feature minus the public form**, and it makes every phone and email group booking correct end to end. Run it live for two weeks before opening the funnel.

### Slice 2 — the public flow, including minors (~1.5 weeks)

Migration 130. `ReserveContext.packages`; modal steps 2–4; `/api/register/quote` takes `packageIds[]`; `/api/register` accepts `participants[]` + the consent checkbox — **and fixes the logged-in override at `register/route.ts:64-80`, which currently discards submitted identity and would create a second booking for the payer instead of one for his partner**; the "I'm paying / they'll pay" radio; the "no email — my child" path with the ≥18 hard block; `group_participant_welcome` (in `TEMPLATES` **and** `SOFT_LAUNCH_ALLOWED`) with the from-A sender identity and the Art. 14 block; `/trip/<claim_token>` public preview with no auto-login; `/api/participant/decline`; bounce-to-payer; the WhatsApp share on the success screen; the **Your travellers** panel with per-person status chips, edit-while-unclaimed, fix-email, resend; the admin paper-waiver route so a minor has a legal path before slice 3; the payer nudge at day 3 and one participant nudge at day 7.

### Slice 3 — guardian waivers (~3 days)

Migration 131; guardian branch on the waiver route; the custom-`waiver_text` guard; `guardianFor` rendering in `src/lib/waiver.ts`. Needs a legal read of the guardian wording, which is why it's a clean seam behind slice 2's paper fallback.

### Slice 4 — polish

Priced per-participant line items with a proper three-tier totals block; `/admin/payments` booking picker + `unmatched` clear (today a combined transfer that lands unmatched can be resolved from **nowhere**); group readiness panel; room-sharing suggestion in the edition picker; add-a-person-after-booking from the portal; billing-address entry for the payer (`contacts.billing_*` is admin-only today and the invoice buyer block reads it).

---

## 7. What NOT to build

1. **No `booking_groups` table.** One self-referencing column carries both facts.
2. **No proportional payment split, no per-sibling payment rows.** §2.2.
3. **No `document_lines` table, no invoice spanning bookings.** `documents.booking_id` stays populated with the lead.
4. **No per-participant transfer reference.** One order, one reference per stage.
5. **No cross-edition or cross-experience groups.** Same edition only, enforced at creation and at Link. Two weeks = two normal bookings.
6. **No split payment between multiple payers.** Escape hatch: unlink one sibling; they get their own pro-forma and pay normally.
7. **No non-travelling payer in the public flow.** Admin only.
8. **No structured room-preference field.** Package choice expresses it.
9. **No room-aware add-on pricing.** Two people sharing a room who each extend 2 nights are billed 2× per-person extra nights. Admin re-prices. Known, small, visible.
10. **No single-supplement or occupancy pricing**, so no automatic re-pricing when one of a couple cancels. Admin task, human decision.
11. **No credit-note / Storno generator.** Still missing platform-wide. Consequence stated up front: a group whose real tax invoice is already issued can only be amended by hand.
12. **No booking-transfer / name-substitution UI.** PTD Art. 9 gives the traveller a statutory right to transfer, and there is no mechanism today, group or not. Admin repoints `contact_id` by hand. **Flag this as a known legal gap.**
13. **No new `alloc#` usage.** Keep the route as the manual escape hatch for cross-edition corrections; label it "manual correction" so it doesn't compete.
14. **No parsing of `traveling_with`, ever.**
15. **No `contacts(lower(email))` unique index in the group migrations.** Deterministic lookup first, dedupe report second, index later.
16. **No auto-login from a forwarded claim link.**

---

## 8. Already true today (don't rebuild it)

- **A contact created by someone else is already claimable with zero new code.** `sendMemberMagicLink` (`src/lib/members.ts:99-118`) auto-provisions an account for any email that has a booking, reasoning that receiving the link proves ownership. The design leans on this rather than replacing it.
- **`contacts.email` is already nullable** (`supabase/setup.sql:28-38`) — the minor path needs no schema change for that.
- **Shared rooms are already modelled**: `exp_hotel_rooms.extra_booking_ids uuid[]` + `partner_tag_along`, and `getBookingHotel` (`src/lib/portal-data.ts:857-870`) already resolves a sharer's hotel in the member portal.
- **`exp_payments.document_id` has no uniqueness** (`20260623_054:17`), so N payments can point at one invoice. We don't need it under this design, but it's there.
- **Third-party contact already ships twice**: trip invites email a stranger; gift vouchers store a stranger's email. The machinery exists; only the authority statement is missing.
- **A structured booking→booking link already exists as precedent**: `exp_bookings.invite_id` (`20260623_050:39`).
- **`computePaymentPlan` and the reconcile engine need no changes at all.** The expensive-sounding part of this feature is the cheapest part.
- **The stated precondition for group bookings is met.** June said "build after reconciliation Phase 2b" — tick redesign, send-invoice, accept-short + reminder, reference highlight, add-on charge choice. All five shipped. The blocker is gone.

---

## 9. Where June 2026 should be overridden

| June decision | Override | Why |
|---|---|---|
| "The received sum is split into per-booking payment rows sharing that reference" | **Rejected outright.** One transfer = one row on the payer's booking. | §2.2 — `document_id` matching, `promoteProformaIfPaid`'s booking scope, cascade-on-delete, and shares that silently re-attribute on cancel. This is the single biggest change from the prior decision. |
| "A covered partner's paid amount = group_paid × their_agreed / combined_agreed (proportional)" | **Rejected.** She sees a **state** ("Covered by Mathias"), never an amount she didn't pay. | It's a fiction she can't act on, and it's derived from a split that no longer exists. |
| "exp_bookings gains `payer_contact_id` + `booking_group_id`" | **Replaced** by one column, `covered_by_booking_id`. | Two columns storing one fact drift. Also: `covered_by_booking_id` is already one of the three names the jibe prompt looks for. |
| "ONE combined invoice … line per participant" | **Kept in substance, deferred in form.** Slice 1 renders travellers as a named sub-block plus a "Trip total" row; priced line items are slice 4. | 3 of 4 line renderers have no subtotal row (`template.tsx:346-478`) — priced lines there would sum to €6,250 above "Amount due €3,125". |
| "Model A: partner agreed €0" (considered in June) | **Rejected.** `agreed_price` always stays the participant's real price. | It's what keeps edition P&L and package attribution honest. Being covered is about *where it's billed*, not what it costs. |
| Implied: create the participant's account at signup | **Rejected.** Claim link through her own inbox. | §2.4 — inverts the codebase's own account-safety rule, and it also kills the delegation guard. |
| "Build after reconciliation Phase 2b" | **Override the sequencing** — the precondition is met, build now. | All five Phase 2b items shipped. |
| jibe: "find the group via `payer_contact_id` / `booking_group_id` / `covered_by_booking_id`" + the proportional-split section | **Rewrite.** One column; **delete the split rule**; a group payment is one row on the lead. Also fix the `alloc:` vs shipped `alloc#` prefix mismatch (`allocate/route.ts:68`) — a literal implementation of the current doc would overwrite the exact rows the team hand-makes. And jibe must **stop patching `downpayment_received` / `final_payment_received` directly** (it would mark the lead fully paid at 82% of the order) — it calls `syncBookingPaymentFlags` instead. | The doc predates the schema and is now actively wrong in three ways. |
| Implicit: minors are a later problem | **Override.** The minor participant record ships with the public flow, not after it. | §5.1 — forcing an email manufactures the exact duplicate-contact failure the minor path exists to prevent. |

---

## 10. What I could not confirm

- **`EMAIL_LIFECYCLE_LIVE` in production.** If it isn't `true`, the new participant email is silently dropped by `SOFT_LAUNCH_ALLOWED` regardless of correct implementation. Check the Vercel env before slice 2 ships, and add the key to the set either way.
- **Supabase's magic-link OTP expiry** for this project. The design routes around it (claim link, not a live session link), so it doesn't block anything — but "one click and she's in" is not a promise the copy should make.
- **How many duplicate rows exist in `contacts` by lower(email)** today. There is no unique index and the maillist import is 13.5k rows. Slice 0's deterministic lookup makes duplicates harmless; the actual count determines whether a unique index is ever worth attempting.
- **Whether the Mathias/Silvia pair is the only hand-split group** in production. The retrofit plan assumes a handful. Query `exp_payments` for `reference like 'alloc%'` before slice 1's retrofit step.
- **Legal review of the guardian waiver wording**, and whether NP7's insurer accepts a portal-recorded guardian signature at all. Slice 3 is deliberately behind a paper fallback for this reason.
- **jibe is an external prompt, not code in this repo.** Every claim about its behaviour comes from `docs/jibe-payments-sync-prompt.md`; I could not verify what the running implementation actually does.
- **Whether Nico wants per-person prices printed on the invoice at all.** Slice 1 shows them as text; the priced-line rework in slice 4 only makes sense if the answer is yes.