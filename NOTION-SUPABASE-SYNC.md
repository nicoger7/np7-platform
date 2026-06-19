# Notion ↔ Supabase: sync rules & divergence log

We're mid-migration: **Notion is still edited**, but the admin panel now writes to **Supabase**, and
some data has been fixed in Supabase that is **not** fixed in Notion. This file keeps the two from
clobbering each other.

## Golden rule for any future Notion → Supabase migration
A re-import must be **additive-only**:
- Match rows on **`notion_id`**.
- `insert … on conflict (notion_id) do nothing` — only bring in **new** Notion records.
- **Never** `update`/`upsert` existing rows, **never** `delete`/`truncate` a table.
- **Never** touch rows where `notion_id is null` — those are admin-created in Supabase
  (new package links, the Rockstar fin, coaches, invoices, destinations, company settings…).

> A destructive "wipe + re-seed" would undo every fix below and delete admin-only rows. Don't.

## Ownership after go-live (who is source of truth per area)
| Data | Source of truth now | Notes |
|---|---|---|
| Email rules (`pipeline_rules`) | **Supabase** | Deduped to 17; don't re-import the Notion 96. |
| Hotel-room status / assignment | **Supabase** | Admin manages status; Notion status is stale. |
| Package ↔ component links | **Supabase** | Built in admin; mostly no `notion_id`. |
| Bookings, contacts | Either (merge by `notion_id`) | New Notion bookings can still import additively. |
| Experiences/editions/packages (records) | Either (merge by `notion_id`) | New records OK; don't overwrite edited fields. |
| HW products, coaches, reviews, invoices, documents, destinations, company settings | **Supabase only** | Not in Notion at all. |

## Divergence log — fixed in Supabase, NOT in Notion
*(So these can be back-ported to Notion, or knowingly kept Supabase-only.)*
- **Email rules**: 96 → 17 (removed 67 exact duplicates + 12 redundant Malmo copies). Notion still has the 96.
- **Hotel rooms**: 3 rooms flipped `available` → `assigned` (Sibe Wassenaar / Thomas Jönsson / Thomas Cramer). Notion still shows available.
- **Package components**: +89 links on Bonaire Week II/III (from the Week I scheme). Notion scheme may differ. **Open:** Alacati packages still have 0 components (no Alacati components exist yet).
- **Components → experience**: BON-* assigned to Bonaire Winter, GAR-* to Lake Garda (earlier).
- **Bookings**: 8 duplicate bookings deleted earlier (Notion may still list them).

## When you do migrate again
- Write a new `supabase/migrations/NNN_*.sql` that only inserts new `notion_id`s (per the golden rule).
- Tell the agent applying it: "additive-only, never overwrite or delete" (see `APPLY_MIGRATIONS.md`).
- Update this divergence log when you fix something in one system but not the other.
