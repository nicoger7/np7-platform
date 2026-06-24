# Prompt for jibe — pull payments from the accountant's Google Sheet into the NP7 admin

> Hand this whole file to jibe. It is self-contained. Nico supplies the Supabase
> secrets (see "Access").
>
> **⚠️ This is a TEMPORARY bridge.** We will replace it with our own system + a
> direct bank API later. Goal for now: get the current payment reality into the
> admin so member views and the pipeline are roughly right. Best-effort + flag the
> messy cases for a human; do **not** over-engineer.

## What you do

You (jibe) **read** the accountant's Google Sheet (you do NOT edit it — Henny &
Maite maintain it by hand) and **write** the payments into our Supabase admin.

- Source (read-only): Google Sheet **"Invoices Surfcenter Experience"**
  `https://docs.google.com/spreadsheets/d/1psQIbNR0bfExaJ9fOOWsqHgEx9NB_X1brnyOADfbApI/edit`
- Destination (write): Supabase table `exp_payments` (+ a couple of booking flags).

The sheet mixes **NP7** trips with **non-NP7** activities (Femke, Defi, Ladies Day,
admin) and mixes **income** with **costs**. You must pull only **NP7 income**.

## The sheet has 4 tabs

| Tab | What it is | You |
|---|---|---|
| `Clients (income) transfer` | bank/Wise invoices, one row per invoice (rich) | **pull** |
| `Client (income) Stripe` | Stripe card payments (simpler) | **pull** |
| `Suppliers (outcome)` | costs/expenses paid to suppliers | **ignore** |
| `PO numbers` | master list: PO code → trip + dates | **the lookup key** |

### `PO numbers` tab = your source of truth (read it FIRST, every run)

Build a map from it: `PO code → { trip, dates }`. **NP7 rows are the ones whose code
starts with `NP7`** (e.g. `NP7 TEN 001`, `NP7 TUR 001`, `NP7 GAR 001`, `NP7 MAD 001`,
`NP7 BON 001/002/003`). Everything else (`FEM*`, `DEFI*`/`DEF`, `LAD NL`, `GEN`) is
**non-NP7 → skip**. Do not hard-code this list — re-read the tab each run, because
codes get added. Use the dates column to resolve which **edition** a PO is (e.g. the
three `NP7 BON` codes map to the three Bonaire weeks by their date ranges; confirm
against our editions' `date_start`).

> Map each PO code to one of our experiences/editions in Supabase by matching the
> trip name + dates from the PO tab against `exp_experiences` / `exp_editions`. If a
> PO can't be mapped confidently, treat its rows as **unmatched** (below).

### `Clients (income) transfer` columns

`Invoice Name` · `Client Name` · **`Invoice Number`** (stable per-row id; `NNN/credit`
rows are credit notes = negative/refunds) · `Sending date` (invoice date) ·
`Coaching` (= destination) · `Amount` · **`Payment`** (type: `downpayment` /
`Final Payment` / `Additional Service` / `Downpayment`) · **`Paid/Betaald`** (paid
amount; green=paid, red=open) · `Not Paid/Open` · `How/Hoe` (bank / wise / Stripe /
`nvt`) · **`betaaldatum`** (payment date) · **`PO nr.`** · `Comments`.

### `Client (income) Stripe` columns

`Client Name` · **`betaaldatum`** (paid date) · **`PO nr.`** (abbreviated, e.g. `TEN`,
`BON 2`, `DEF`) · `Amount` · `Paid/Betaald` · `Total per month` · `Stripe fees` ·
`% fees`. **No invoice number** here, and no payment-type column.

## What to pull

A payment exists when money was actually received:
- Transfer tab: a row with a **`Paid/Betaald` amount > 0** (green) and a `betaaldatum`.
- Stripe tab: any row with a paid amount + `betaaldatum`.

Skip rows whose PO is non-NP7, and skip unpaid/open-only rows (no payment yet — they
just show a `Not Paid/Open` balance).

## Map each pulled row → a booking

1. Resolve the **experience/edition** from the row's **PO nr.** via the PO-tab map.
2. Find the booking: match **client name** to the booking's contact, scoped to that
   experience/edition (`exp_bookings` joined to `contacts`). Names in the sheet match
   our contact names.
3. No confident match → write the payment with `booking_id = null`, `unmatched = true`
   (set `contact_id` if the person is clear). A human resolves these at
   `/admin/payments` ("Unmatched payments" filter + dashboard counter).

Be conservative — a wrong match is worse than an unmatched row.

## Payment `type` mapping

- `downpayment` / `Downpayment` → `downpayment`
- `Final Payment` → `final`
- `Additional Service` → `partial` **and tag it as an extra** in `notes` (these are
  add-ons: extra nights, flights, etc.). ⚠️ Reality is messy: extras sometimes come as
  their *own* booking/invoice, sometimes get merged into the last invoice. If the extra
  clearly belongs to a participant you matched, attach it; if unsure, leave it
  `unmatched` for a human. Don't try to be clever.
- Stripe rows (no type): infer from the running total like the transfer rows, else
  `partial`.
- Credit note (`NNN/credit`, negative, struck-through, or a "refund …" note) → `type = refund`.

## Idempotency (so re-runs don't duplicate)

- **Transfer tab:** key on the **Invoice Number** (store it in `exp_payments.reference`).
  Before insert, look up `reference=eq.<invoiceNo>`; skip if unchanged, PATCH if changed.
- **Stripe tab (no invoice №):** build a deterministic key, e.g.
  `reference = "stripe:" + <name> + ":" + <paid date> + ":" + <amount>`, and dedupe on it.
- Never wipe-and-reload; never delete rows you didn't create.

## Write to `exp_payments`

| column | value |
|---|---|
| `booking_id` | matched booking, else `null` |
| `contact_id` | matched person if known |
| `experience_id` | the PO-mapped experience (optional but helpful) |
| `amount` | the paid amount (positive; refunds use `type=refund`) |
| `type` | per mapping above |
| `direction` | `revenue` |
| `status` | `paid` |
| `date` / `received_at` | the `betaaldatum` (parse Dutch dates too: "26 mei 2026"). If the row has **no date**, default `date` to the import/run date so it never lands as undated. |
| `method` | bank / wise / stripe / cash, from `How/Hoe` |
| `reference` | invoice № (transfer) or the composite stripe key |
| `notes` | the sheet `Comments` (+ "extra/additional service" tag where relevant) |
| `unmatched` | `true` when no confident booking match |

Then, for each matched booking, recompute `paid = Σ revenue payments − refunds` and
PATCH `exp_bookings`: `downpayment_received = paid ≥ 0.5×agreed_price`,
`final_payment_received = paid ≥ agreed_price`. **Do not change `exp_bookings.status`.**

## Covered partners / group payers — ALLOCATE proportionally

One person can pay for several participants (e.g. a partner on a "No Hotel"
package, or a group booker). Each participant is their **own booking** with their
**own agreed price (= their package)**. The payer's sheet payment covers the whole
**group**, so **split each such payment across the group's bookings in proportion to
their agreed prices** — every member ends at the **same % paid**.

> Example: Mathias (€5,750) + Silvia (€1,250) = €7,000 combined. Payer pays €3,500
> (50%) → Mathias €2,875 (50% of 5,750), Silvia €625 (50% of 1,250). Both 50%.
> If he's only 50% paid on the combined bill, **her package is 50% paid too.**

Rules:
- Find the group via the **structured link** (`payer_contact_id` /
  `booking_group_id` / `covered_by_booking_id`) — **never** infer it from free-text
  `traveling_with`. If a payer clearly covers others but has **no structured link
  yet**, do NOT guess and do NOT dump it all on the payer — **flag it** for the team.
- For each payment the sheet attributes to the payer, write **one payment row per
  group booking**, amount = `payment × (booking.agreed / combinedAgreed)`, all
  sharing the **source invoice reference** (idempotent + traceable).
- On re-run, keep it in sync: each booking's paid = (sum of the payer's sheet
  payments) × its share.

*Interim (before the structured link exists):* the team hand-splits via
`alloc:`-reference rows. **Never** overwrite/delete a payment whose `reference`
starts `alloc:`, and don't "correct" a payer's deliberately-reduced total back to
the sheet amount.

## Naming — do NOT rewrite it

Never rename packages, components, or trips. The sheet's names/PO codes are human
keys — match against them, don't normalize or "tidy" them.

## Watch out for (this sheet is hand-maintained)

- **Dutch dates** ("26 mei 2026", "23 juni 2026") and the occasional typo'd year
  ("22/08/2028"). Parse defensively; if a date is unparseable, still import the
  payment but flag it.
- The transfer tab is maintained by **Henny**, the Stripe tab by **Maite** — different
  formats, as above.
- Stripe rows are mostly **Defi (non-NP7)** — the PO filter removes them.
- `nvt` = not applicable (Dutch). Test/credit rows ("Mistake - was a test").

## Run safely

1. First run **dry-run**: log every intended insert/update/skip + match decision +
   confidence; write nothing. Send Nico the counts (would-insert / update / unmatched)
   and the unmatched list.
2. After Nico approves, run for real. Subsequent runs apply only diffs (idempotent).

## Acceptance

- Re-running twice produces **zero** new rows the second time.
- Only NP7 income is imported; FEM/DEFI/LAD/GEN and all supplier costs are absent.
- Every imported NP7 paid row is either matched to a booking or present with
  `unmatched=true`; the admin "Unmatched payments" count equals exactly those.
- No supplier/cost rows, no booking `status` changes, no deletions.

## Confirm with Nico before the first real run

- Is "NP7-prefixed PO code" the right NP7 filter, and do `NP7 BON 001/002/003` map to
  Bonaire Weeks I/II/III? (He wasn't 100% sure — verify against the PO-tab dates.)
- For Stripe rows with no invoice №, is name+date+amount an acceptable dedupe key, or
  is there a Stripe payment id available somewhere?
