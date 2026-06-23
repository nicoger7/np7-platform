# Prompt for jibe — retarget the payments sync from Notion to the NP7 admin (Supabase)

> Hand this whole file to jibe. It is self-contained: jibe does **not** need any
> prior context from this chat. Nico will supply the two secrets in the
> "Access" section.

## Background

You (jibe) already run a sync that reads our **Excel accounting sheet** and writes
payment rows into **Notion**. We have replaced Notion with our own admin panel,
backed by a **Supabase** database. Your job: keep reading the same Excel sheet, but
write the payments into **Supabase** instead of (or in addition to) Notion.

Everything about how you read/parse the Excel sheet stays the same. Only the
**destination** changes. This document fully specifies the new destination.

## Objective

For every payment line in the accounting sheet:
1. Insert/update a row in the Supabase table `exp_payments`.
2. Match it to the right **booking** (a customer's trip) when you confidently can;
   otherwise mark it **unmatched** so a human resolves it in the admin UI.
3. Keep each booking's payment-milestone flags in sync.
4. Be **idempotent** — re-running the sync must never create duplicates.

## Access

Server-to-server via the Supabase REST API (PostgREST). Nico will give you:

- `SUPABASE_URL` — e.g. `https://<project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — the **service role** key (bypasses row-level security; keep it secret, server-side only)

Call pattern (every request needs both headers):

```
GET/POST/PATCH  {SUPABASE_URL}/rest/v1/<table>...
  apikey: {SUPABASE_SERVICE_ROLE_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type: application/json
```

(Alternatively use any Supabase client library with the service role key.)

## Target table: `exp_payments`

| column          | type         | what to write                                                                 |
|-----------------|--------------|-------------------------------------------------------------------------------|
| `id`            | uuid         | leave unset on insert (DB generates)                                           |
| `booking_id`    | uuid \| null | the matched booking (see Matching). `null` when unmatched.                     |
| `contact_id`    | uuid \| null | the matched person, even if the booking is uncertain (helps later matching).   |
| `experience_id` | uuid \| null | optional; the experience the payment is for, if known.                         |
| `amount`        | numeric      | payment amount, **positive**. Use a `refund` type for money paid back.         |
| `type`          | text         | one of `downpayment` \| `final` \| `partial` \| `refund` (`deposit` is unused). |
| `direction`     | text         | `revenue` for money in; `expense` for money out (refunds use type=refund, direction=revenue with negative effect handled by type). Default `revenue`. |
| `status`        | text         | `paid` (these are real, received transactions).                               |
| `date`          | date         | the value/booking date from the sheet (`YYYY-MM-DD`).                          |
| `received_at`   | timestamptz  | same date as a timestamp, if you have time-of-day; otherwise midnight UTC.     |
| `method`        | text \| null | `bank_transfer`, `stripe`, `cash`, etc., if the sheet says.                    |
| `reference`     | text         | **the stable accounting-line identifier** (bank tx id / sheet row id). This is your idempotency key — see below. |
| `notes`         | text \| null | free text from the sheet (e.g. `"Bonaire 14-20 /12"`).                         |
| `unmatched`     | boolean      | `true` when you could NOT confidently match a booking; else `false`.           |
| `notion_id`     | text \| null | if you still also write to Notion, store the Notion page id here for back-reference (optional). |

## Idempotency (critical)

Use `reference` as the natural key. Before inserting, check if a row with that
`reference` already exists:

```
GET {SUPABASE_URL}/rest/v1/exp_payments?reference=eq.<REF>&select=id,amount,date
```

- If it exists and the amount/date are unchanged → skip.
- If it exists but values changed → `PATCH` that row.
- If it does not exist → `POST` a new row.

If the accounting sheet has no stable per-line id, construct a deterministic one,
e.g. `reference = "<sheet_name>:<row_number>"` or a hash of
`(date, amount, payer, bank_ref)`, and use that consistently every run.

**Never** delete rows you didn't create, and never wipe-and-reload the table.

## Matching a payment to a booking

Bookings live in `exp_bookings`. Fetch candidates and match:

```
GET {SUPABASE_URL}/rest/v1/exp_bookings?select=id,name,contact_id,experience_id,edition_id,agreed_price,status&order=created_at.desc
```

Booking `name` usually looks like `"Firstname Lastname — <Place> 2026 - Week II"`.
Contacts (`contacts` table: `id,name,email`) can also help:

```
GET {SUPABASE_URL}/rest/v1/contacts?select=id,name,email&name=ilike.*<lastname>*
```

Matching rules, in order of confidence:
1. **Exact contact + single booking** for that contact → match.
2. **Name match + experience/week** in the payment note (e.g. note says "Week II")
   → match the booking whose edition/label matches.
3. **Name match + amount plausibility** — the cumulative payments for that booking
   should not exceed its `agreed_price` by a wild margin. Use this to disambiguate
   when a contact has multiple bookings.
4. **No confident match** → insert with `booking_id = null`, `unmatched = true`
   (still set `contact_id` if the person is clear). A human resolves these at
   `/admin/payments` (there is an "Unmatched payments" filter and a dashboard counter).

Be conservative: a wrong match is worse than an unmatched row. When in doubt, leave
it unmatched.

## Classifying the payment `type`

If the sheet already labels the payment, map it. Otherwise infer from the running
total for that booking (sum existing `exp_payments.amount` where `status='paid'`
and `direction='revenue'`, minus refunds):

- Brings cumulative to **≈50%** of `agreed_price` (and it's the first payment) → `downpayment`
- Brings cumulative to **≈100%** (settles the balance) → `final`
- Anything else (instalment, top-up) → `partial`
- Money returned to the customer → `type='refund'`

Exact percentages don't have to be perfect — the admin can reclassify. Default to
`partial` if genuinely unsure.

## Keep booking milestone flags in sync

After upserting payments for a booking, recompute and `PATCH` the booking
(`exp_bookings`) so the pipeline + member view reflect reality:

```
paid = sum of exp_payments.amount for this booking where status='paid' and direction='revenue' (minus refunds)
```

- `downpayment_received` = `paid >= 0.5 * agreed_price`
- `final_payment_received` = `paid >= agreed_price` (and agreed_price > 0)

PATCH example:
```
PATCH {SUPABASE_URL}/rest/v1/exp_bookings?id=eq.<BOOKING_ID>
  body: {"downpayment_received": true, "final_payment_received": false}
```

**Do NOT change `exp_bookings.status`** (the lead→reserved→confirmed→paid→attended/lost
pipeline). That's curated by the team; you only touch the two payment flags above.
(If Nico later wants auto-advance to `paid` on full payment, that's a separate ask.)

## Run safely

1. First run in **dry-run** mode: log every intended insert/update/skip + the match
   decision and confidence, but write nothing. Send Nico the summary
   (counts: would-insert / would-update / unmatched, plus the unmatched list).
2. After Nico approves, run for real.
3. On every subsequent run, only diffs are applied (idempotent).

## Acceptance criteria

- Re-running the sync twice in a row produces **zero** new rows the second time.
- Every sheet line is either matched to a booking or present with `unmatched=true`.
- For each matched booking, `paid` total equals the sum on the sheet, and the two
  milestone flags are correct.
- No existing rows are deleted; no booking `status` is changed.
- The "Unmatched payments" count in the admin reflects exactly the lines you
  couldn't match.

## Questions to confirm with Nico before the first real run

- Which column in the Excel sheet is the **stable line id** to use as `reference`?
- Does the sheet distinguish payment **type** (downpayment/final), or should you infer it?
- Should you **also** keep writing to Notion during a transition period, or cut over fully to Supabase?
