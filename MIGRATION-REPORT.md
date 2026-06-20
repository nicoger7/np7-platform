# NP7 Notion → Supabase Migration Report

**Date:** 2026-06-08 17:30 UTC  
**Script:** `scripts/migrate-notion-to-supabase.py`  
**SQL Migration:** `supabase/migrations/20260608_010_notion_migration.sql`

---

## Migration Results (Notion-Sourced Rows)

| Table | Notion Pages | Migrated | Skipped | Notes |
|-------|-------------|---------|---------|-------|
| exp_experiences | 8 | 8 | 0 | All migrated; slugs auto-generated |
| team_members | 1 | 1 | 0 | Simona migrated; Nico is pre-existing system entry |
| vendors | 7 | 7 | 0 | ✓ |
| contacts | 917 | 916 | 1 | 1 skipped (invalid tshirt_size) |
| exp_components | 56 | 56 | 0 | ✓ |
| task_rules | 3 | 3 | 0 | ✓ |
| exp_packages | 76 | 76 | 0 | ✓ |
| exp_bookings | 111 | 111 | 0 | ✓ |
| exp_costs | 46 | 37 | 9 | 9 skipped: no Experience relation found |
| exp_payments | 102 | 99 | 3 | 3 skipped: no amount value |
| exp_hotel_rooms | 70 | 70 | 0 | ✓ |
| hours_log | 63 | 48 | 15 | 15 skipped: no Employee relation |
| todos | 43 | 43 | 0 | ✓ |
| scenario_planner | 10 | 10 | 0 | ✓ |
| email_templates | 2 | 2 | 0 | ✓ |
| pipeline_rules | 96 | 96 | 0 | ✓ |
| sync_log | 37 | 37 | 0 | ✓ |
| **TOTAL** | **1,652** | **1,630** | **28** | |

---

## Post-Migration Row Counts (All Rows)

| Table | Total Rows | notion_id Set | Pre-Existing |
|-------|-----------|--------------|-------------|
| exp_experiences | 16 | 8 | 8 (website entries) |
| team_members | 2 | 1 | 1 (Nico, system) |
| vendors | 7 | 7 | 0 |
| contacts | 955 | 916 | 39 |
| exp_components | 56 | 56 | 0 |
| exp_packages | 76 | 76 | 0 |
| exp_bookings | 152 | 111 | 41 |
| exp_costs | 37 | 37 | 0 |
| exp_payments | 103 | 99 | 4 |
| exp_hotel_rooms | 138 | 70 | 68 |
| hours_log | 48 | 48 | 0 |
| todos | 43 | 43 | 0 |
| scenario_planner | 10 | 10 | 0 |
| email_templates | 2 | 2 | 0 |
| task_rules | 3 | 3 | 0 |
| pipeline_rules | 96 | 96 | 0 |
| sync_log | 37 | 37 | 0 |

> "Pre-Existing" rows have `notion_id = NULL` — inserted before migration or by the admin panel.

---

## Schema Changes Made

### SQL Migration: `20260608_010_notion_migration.sql`

#### New Columns on Existing Tables
- `notion_id text` + unique index → added to all 11 migrated tables
- `exp_components.sell_price numeric` — Notion "Sell (€/unit)"
- `exp_components.addon_available boolean` — Notion "Add-on Available"
- `exp_components.notes text` — Notion "Notes"
- `exp_components.year text[]` — Notion "Year" (multi-select)

#### New Tables Created
| Table | Source Notion DB | Rows |
|-------|-----------------|------|
| `todos` | NP7 To-Dos | 43 |
| `scenario_planner` | NP7 Scenario Planner | 10 |
| `email_templates` | NP7 Email Templates | 2 |
| `task_rules` | NP7 Task Rules | 3 |
| `pipeline_rules` | NP7 Pipeline Rules | 96 |
| `sync_log` | NP7 Sync Log | 37 |

---

## Relation Mapping

The migration builds a `notion_page_id → supabase_uuid` map in memory:

```
exp_experiences → resolved for exp_packages, exp_bookings, exp_costs, exp_payments, exp_hotel_rooms, hours_log, todos, scenario_planner, email_templates, pipeline_rules
contacts → resolved for exp_bookings, exp_payments, sync_log
vendors → resolved for exp_payments
team_members → resolved for hours_log
task_rules → resolved for todos
exp_packages → resolved for exp_bookings
```

**Migration order:** experiences → team_members → vendors → contacts → components → task_rules → packages → bookings → costs → payments → hotel_rooms → hours_log → todos → scenario_planner → email_templates → pipeline_rules → sync_log

---

## Constraint Normalizations Applied

| Table | Notion Value | Supabase Value |
|-------|-------------|---------------|
| `contacts.tshirt_size` | "XL", "M" etc. | "xl", "m" (lowercased) |
| `exp_experiences.status` | "Not started", "Done" | "draft", "archived" |
| `exp_experiences.active_status` | "Published", "Private" | "published", "private", "in_planning" |
| `exp_experiences.slug` | — | Auto-generated from title |
| `exp_packages.slug` | — | Auto-generated from name |
| `team_members.role` | "Admin" | "admin" etc. |
| `exp_components.category` | "Coaching", "Meals" | "coaching", "meals" etc. |
| `exp_bookings.status` | "Ready to Book" | "ready_to_book" etc. |
| `exp_costs.status` | "Confirmed", "Estimate" | "confirmed", "estimate" etc. |
| `exp_payments.type` | Invoice Type → Supabase type | "Down Payment" → "downpayment" etc. |
| `exp_payments.direction` | "Revenue", "Cost" | "revenue", "cost" |
| `exp_payments.status` | "Paid", "Pending" | "paid", "pending" |
| `exp_hotel_rooms.hotel` | "REF II", "Sorobon" | matched to valid enum |
| `exp_hotel_rooms.status` | "Assigned" | "assigned" |
| `hours_log.category` | "On Water" | "on_water" etc. |

---

## Key Mapping Decisions

### exp_payments
Notion's `Type` field ("Invoice", "Stripe") does NOT map to Supabase's type enum.  
**Solution:** Map Notion `Invoice Type` → Supabase `type`:
- "Down Payment" → `downpayment`
- "Final Payment" → `final`
- "Additional Service" → `partial`
- Null (direction=cost) → `partial`
- Null (direction=revenue) → `final`
- "Stripe" → `partial`

### exp_hotel_rooms.booking_id
Notion "Guest(s)" is a relation to **contacts** (not bookings).  
This field was LEFT NULL — hotel_rooms need manual FK wiring to exp_bookings.

### exp_experiences.location
Notion uses `place` type (structured location). Since PostgREST/Supabase can't interpret Notion place objects, the `display_name` or `"TBD"` was used as fallback.

---

## Skipped / Deferred

- **NP7 Conversations (110)** — stays in Chatwoot, not migrated
- **NP7 Experience Tasks (1,281)** — deferred; `exp_tasks` table exists and ready
- `exp_costs` (9 skipped) — Experience relation pointed to unmapped pages
- `exp_payments` (3 skipped) — Amount was null
- `hours_log` (15 skipped) — No Employee relation
- `contacts` (1 skipped) — Invalid tshirt_size value

---

## What's Still Needed for Full Admin Panel Coverage

1. **exp_experiences content fields** — `description`, `whats_included`, `hero_image`, `gallery`, `currency`, `timezone`, `hotel`, `airport_code`, `whatsapp_group_link`, `cancellation_policy` are website-specific and left NULL. These need to be authored or synced from a CMS.

2. **exp_hotel_rooms → booking_id** — Notion "Guest(s)" links to contacts, not bookings. ~60 rooms need `booking_id` wired to the correct `exp_bookings` row. Can be done via a follow-up query joining contacts ↔ bookings.

3. **exp_package_components junction** — The many-to-many between packages and components (Notion "Packages" relation on components) was NOT migrated to `exp_package_components`. Requires a second pass iterating component relations.

4. **slug uniqueness** — Slugs were auto-generated. Verify no collisions with admin-panel-created entries.

5. **Nico's hours_log** — Nico's team_member row has no `notion_id`. If future hours are logged in Notion under "Nico", they won't resolve unless `notion_id` is set on Nico's team_member row.

6. **Pipeline Rules email body** — Rule body/content is in Notion page blocks (not database properties). Only metadata was migrated; actual email templates need a block-content extraction pass.

7. **NP7 Experience Tasks (1,281 entries)** — Deferred. Table `exp_tasks` exists with correct schema.

8. **Idempotent re-runs** — Migration is idempotent: re-running will update existing records (via `notion_id` ON CONFLICT upsert) without creating duplicates. Safe to re-run after adding content to Notion.

---

## Files Created

- `supabase/migrations/20260608_010_notion_migration.sql` — Schema changes
- `scripts/migrate-notion-to-supabase.py` — Migration script (idempotent, re-runnable)
- `MIGRATION-REPORT.md` — This file
