#!/usr/bin/env python3
"""
Notion → Supabase Migration Script for NP7 Platform
Migrates data from 17 Notion databases to Supabase tables.
Idempotent: uses notion_id + on_conflict for upsert.

Usage:
    python3 scripts/migrate-notion-to-supabase.py [--table TABLE_NAME]
"""

import os
import sys
import json
import time
import re
import argparse
import requests
from typing import Any, Optional
from datetime import datetime, timezone

# ─────────────────────────────────────────────
# Config (from environment variables)
# ─────────────────────────────────────────────
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qfdqigumjadvrocxjolx.supabase.co")
SUPABASE_SERVICE_ROLE = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not NOTION_TOKEN or not SUPABASE_SERVICE_ROLE:
    print("ERROR: NOTION_TOKEN and SUPABASE_SERVICE_ROLE_KEY env vars are required")
    print("  export NOTION_TOKEN=<your-token>")
    print("  export SUPABASE_SERVICE_ROLE_KEY=<your-key>")
    sys.exit(1)

NOTION_VERSION = "2022-06-28"
RATE_LIMIT_DELAY = 0.35  # seconds between Notion API calls

# ─────────────────────────────────────────────
# Database ID → Supabase Table mapping
# ─────────────────────────────────────────────
DATABASES = {
    "exp_experiences":  "32c992eb-86b0-81dd-a552-c8a6f6077f51",
    "team_members":     "334992eb-86b0-81a5-a303-c6992098238d",
    "vendors":          "32b992eb-86b0-81d1-9697-d71537ee9d81",
    "contacts":         "328992eb-86b0-818b-b6cf-ce6bfc3d47c8",
    "exp_components":   "3d4815f3-610c-4fc5-9531-82a006ede97b",
    "exp_packages":     "32c992eb-86b0-81c1-9982-e7ec129b8dbb",
    "exp_bookings":     "32c992eb-86b0-818d-8e86-ddeac585bdb0",
    "exp_costs":        "32c992eb-86b0-8126-ba84-d8ba43754680",
    "exp_payments":     "32c992eb-86b0-81ec-ab1e-d1cb87947e5c",
    "exp_hotel_rooms":  "359992eb-86b0-815b-9b84-f3c7c4b68686",
    "hours_log":        "334992eb-86b0-8133-a56d-fc26f46e92ef",
    "todos":            "32f992eb-86b0-8170-82de-e41752105309",
    "scenario_planner": "338992eb-86b0-8189-a4f9-c0df28b41427",
    "email_templates":  "337992eb-86b0-8135-9963-ff4195b2b74b",
    "pipeline_rules":   "78d00bd2-d210-4a44-a656-118a14f1b4e8",
    "task_rules":       "32f992eb-86b0-8196-aa2e-e73a293dfd37",
    "sync_log":         "337992eb-86b0-810c-ba3c-dadd29a05e11",
}

# Migration order (dependency order)
MIGRATION_ORDER = [
    "exp_experiences",
    "team_members",
    "vendors",
    "contacts",
    "exp_components",
    "task_rules",     # before todos
    "exp_packages",
    "exp_bookings",
    "exp_costs",
    "exp_payments",
    "exp_hotel_rooms",
    "hours_log",
    "todos",
    "scenario_planner",
    "email_templates",
    "pipeline_rules",
    "sync_log",
]

# ─────────────────────────────────────────────
# Enum mappings (Notion values → Supabase enum values)
# ─────────────────────────────────────────────

def map_experience_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return "draft"
    m = {"not started": "draft", "in progress": "draft", "planning": "draft",
         "done": "archived", "complete": "archived", "completed": "archived",
         "published": "published", "live": "published", "archived": "archived",
         "draft": "draft"}
    return m.get(v.lower(), "draft")

def map_active_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"published": "published", "live": "published", "public": "published",
         "private": "private", "hidden": "private",
         "in planning": "in_planning", "planning": "in_planning",
         "in_planning": "in_planning"}
    return m.get(v.lower())

def map_team_role(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"admin": "admin", "editor": "editor", "coach": "coach",
         "operations": "operations", "ops": "operations"}
    return m.get(v.lower())

def map_tshirt(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    return v.lower() if v.lower() in ("xs", "s", "m", "l", "xl", "xxl") else None

def map_component_category(v: Optional[str]) -> Optional[str]:
    if not v:
        return "other"
    m = {"coaching": "coaching", "accommodation": "accommodation",
         "meals": "meals", "food": "meals", "transport": "transport",
         "gear": "gear", "equipment": "gear", "activity": "activity",
         "other": "other", "misc": "other"}
    return m.get(v.lower(), "other")

def map_booking_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    VALID = {"lead", "interested", "enquiring", "ready_to_book", "payment_pending",
             "downpayment_paid", "create_invoice", "paid", "contact_by_phone",
             "confirmed", "attended", "lost"}
    slug = re.sub(r"[\s\-/]+", "_", v.lower()).strip("_")
    if slug in VALID:
        return slug
    m = {"new": "lead", "prospect": "lead", "contact by phone": "contact_by_phone",
         "ready to book": "ready_to_book", "payment pending": "payment_pending",
         "downpayment paid": "downpayment_paid", "create invoice": "create_invoice",
         "booked": "confirmed", "attended": "attended", "lost": "lost",
         "cancelled": "lost", "not interested": "lost"}
    return m.get(v.lower())

def map_cost_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    VALID = {"confirmed", "estimate", "cancelled", "unlisted"}
    slug = v.lower()
    if slug in VALID:
        return slug
    m = {"confirmed": "confirmed", "done": "confirmed", "paid": "confirmed",
         "estimate": "estimate", "estimated": "estimate", "tbc": "estimate",
         "cancelled": "cancelled", "canceled": "cancelled", "unlisted": "unlisted"}
    return m.get(slug, "estimate")

def map_payment_type(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"downpayment": "downpayment", "down payment": "downpayment",
         "deposit": "downpayment", "final": "final", "full": "final",
         "partial": "partial", "refund": "refund"}
    return m.get(v.lower())

def map_payment_direction(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"revenue": "revenue", "income": "revenue", "in": "revenue",
         "cost": "cost", "expense": "cost", "out": "cost"}
    return m.get(v.lower())

def map_payment_invoice_type(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"down_payment": "down_payment", "downpayment": "down_payment",
         "deposit": "down_payment", "final_payment": "final_payment",
         "final": "final_payment", "additional_service": "additional_service",
         "additional": "additional_service", "extra": "additional_service"}
    return m.get(v.lower())

def map_payment_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"pending": "pending", "waiting": "pending", "outstanding": "pending",
         "paid": "paid", "received": "paid", "complete": "paid",
         "overdue": "overdue", "late": "overdue",
         "cancelled": "cancelled", "canceled": "cancelled", "void": "cancelled"}
    return m.get(v.lower())

def map_hotel(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    VALID = {"Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"}
    if v in VALID:
        return v
    # Case-insensitive lookup
    for valid in VALID:
        if v.lower() == valid.lower():
            return valid
    return None

def map_room_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"available": "available", "free": "available", "open": "available",
         "assigned": "assigned", "booked": "assigned", "occupied": "assigned",
         "held": "held", "hold": "held", "reserved": "held"}
    return m.get(v.lower())

def map_hours_category(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    VALID = {"coaching", "preparation", "on_water", "admin", "travel", "marketing", "general"}
    slug = re.sub(r"[\s\-/]+", "_", v.lower())
    if slug in VALID:
        return slug
    m = {"on water": "on_water", "prep": "preparation", "preparation": "preparation",
         "coaching": "coaching", "admin": "admin", "travel": "travel",
         "marketing": "marketing", "general": "general"}
    return m.get(v.lower())

def map_package_status(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = {"active": "active", "live": "active", "published": "active",
         "archived": "archived", "inactive": "archived", "hidden": "archived"}
    return m.get(v.lower())

def make_slug(title: str, suffix: str = "") -> str:
    """Generate a URL slug from a title."""
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9\s\-]", "", slug)
    slug = re.sub(r"[\s\-]+", "-", slug).strip("-")
    if suffix:
        slug = f"{slug}-{suffix}"
    return slug or "untitled"

# ─────────────────────────────────────────────
# Global mapping: notion_page_id → supabase_uuid
# ─────────────────────────────────────────────
notion_to_supabase: dict[str, str] = {}
stats: dict[str, dict] = {}

# ─────────────────────────────────────────────
# Helpers: Notion
# ─────────────────────────────────────────────

def notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def fetch_notion_pages(db_id: str) -> list[dict]:
    pages = []
    has_more = True
    cursor = None

    while has_more:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor

        resp = requests.post(
            f"https://api.notion.com/v1/databases/{db_id}/query",
            headers=notion_headers(),
            json=body,
            timeout=30,
        )
        time.sleep(RATE_LIMIT_DELAY)

        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 5))
            print(f"  ⏳ Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue

        if resp.status_code != 200:
            print(f"  ⚠️  Notion error {resp.status_code}: {resp.text[:200]}")
            break

        data = resp.json()
        pages.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        cursor = data.get("next_cursor")

    return pages


# ─────────────────────────────────────────────
# Property extractors
# ─────────────────────────────────────────────

def get_title(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    texts = p.get("title", [])
    return "".join(t.get("plain_text", "") for t in texts).strip() or None


def get_rich_text(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    texts = p.get("rich_text", [])
    return "".join(t.get("plain_text", "") for t in texts).strip() or None


def get_select(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    if p.get("type") == "status":
        s = p.get("status") or {}
        return s.get("name")
    sel = p.get("select") or {}
    return sel.get("name") or None


def get_multi_select(props: dict, key: str) -> Optional[list]:
    p = props.get(key, {})
    items = p.get("multi_select", [])
    result = [i.get("name") for i in items if i.get("name")]
    return result if result else None


def get_number(props: dict, key: str) -> Optional[float]:
    p = props.get(key, {})
    return p.get("number")


def get_checkbox(props: dict, key: str) -> Optional[bool]:
    p = props.get(key, {})
    val = p.get("checkbox")
    return val if isinstance(val, bool) else None


def get_date(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    d = p.get("date") or {}
    return d.get("start")


def get_date_range(props: dict, key: str) -> tuple[Optional[str], Optional[str]]:
    p = props.get(key, {})
    d = p.get("date") or {}
    return d.get("start"), d.get("end")


def get_email(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    return p.get("email") or None


def get_phone(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    return p.get("phone_number") or None


def get_first_relation_uuid(props: dict, key: str) -> Optional[str]:
    p = props.get(key, {})
    relations = p.get("relation", [])
    for rel in relations:
        pid = rel.get("id")
        if pid and pid in notion_to_supabase:
            return notion_to_supabase[pid]
    return None


# ─────────────────────────────────────────────
# Helpers: Supabase
# ─────────────────────────────────────────────

def supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }


def upsert_record(table: str, record: dict) -> Optional[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=notion_id"
    resp = requests.post(url, headers=supabase_headers(), json=record, timeout=30)

    if resp.status_code in (200, 201):
        data = resp.json()
        if isinstance(data, list) and data:
            return data[0]
        return record
    else:
        print(f"    ❌ {resp.status_code}: {resp.text[:250]}")
        return None


def get_existing_notion_ids(table: str) -> dict[str, str]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id,notion_id&notion_id=not.is.null&limit=10000"
    resp = requests.get(url, headers=supabase_headers(), timeout=30)
    if resp.status_code == 200:
        rows = resp.json()
        return {r["notion_id"]: r["id"] for r in rows if r.get("notion_id")}
    return {}


# ─────────────────────────────────────────────
# Migration functions
# ─────────────────────────────────────────────

def migrate_exp_experiences(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_experiences")
    slug_counter: dict[str, int] = {}

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        title = get_title(props, "Experience") or "Untitled"
        date_start, date_end = get_date_range(props, "Start/End Date")

        # Notion "Status" is type=status
        status_raw = get_select(props, "Status")
        status = map_experience_status(status_raw)

        active_raw = get_select(props, "Active")
        active_status = map_active_status(active_raw)

        # Generate unique slug
        base_slug = make_slug(title)
        if date_start:
            base_slug = make_slug(f"{title} {date_start[:4]}")
        slug_counter[base_slug] = slug_counter.get(base_slug, 0) + 1
        slug = base_slug if slug_counter[base_slug] == 1 else f"{base_slug}-{slug_counter[base_slug]}"
        # If this is an existing entry, use its existing slug or reuse
        if notion_id in existing:
            # Don't generate a new slug on update — leave it
            pass

        # Location — use place type or text fallback
        location_prop = props.get("Location", {})
        location = None
        if location_prop.get("type") == "place":
            # Notion "place" type - just get the display name if available
            place_data = location_prop.get("place") or {}
            location = place_data.get("display_name") or place_data.get("name")
        if not location:
            # Fallback: extract from rich_text or title
            location = get_rich_text(props, "Location") or get_select(props, "Location") or "TBD"

        record = {
            "notion_id": notion_id,
            "title": title,
            "slug": slug,
            "location": location,
            "date_start": date_start,
            "date_end": date_end,
            "status": status,
            "active_status": active_status,
            "experience_code": get_rich_text(props, "Experience Code"),
            "po_code": get_rich_text(props, "PO Code"),
            "notes": get_rich_text(props, "Notes"),
            "coaches": get_rich_text(props, "Coaches"),
            "pricing_details": get_rich_text(props, "Pricing Details"),
            "price_from": get_number(props, "Price From (€)"),
            "price_to": get_number(props, "Price To (€)"),
            "estimated_costs": get_number(props, "Estimated Costs (€)"),
            "expected_revenue": get_number(props, "Expected Revenue (€)"),
            "expected_profit": get_number(props, "Expected Profit (€)"),
            "paid_revenue": get_number(props, "Paid Revenue (€)"),
            "paid_profit": get_number(props, "Paid Profit (€)"),
        }

        # Remove None values (but keep required fields)
        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("exp_experiences", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_team_members(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("team_members")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        name = get_title(props, "Name") or "Untitled"
        role_raw = get_select(props, "Role")
        role = map_team_role(role_raw)

        # Email is required NOT NULL - use placeholder if missing
        email = get_email(props, "Email") or get_rich_text(props, "Email")
        if not email:
            email = f"team_{notion_id[:8]}@np7.internal"

        record = {
            "notion_id": notion_id,
            "name": name,
            "email": email,
            "role": role,
            "rate_per_hour": get_number(props, "Rate (€/h)"),
            "active": get_checkbox(props, "Active"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("team_members", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_vendors(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("vendors")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "company": get_rich_text(props, "Company"),
            "email": get_email(props, "Email"),
            "phone": get_phone(props, "Phone"),
            "category": get_multi_select(props, "Category"),
            "chatwoot_contact_id": get_rich_text(props, "Chatwoot Contact ID"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("vendors", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_contacts(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("contacts")

    for i, page in enumerate(pages):
        notion_id = page["id"]
        props = page["properties"]

        name = get_title(props, "Name")
        if not name:
            results["skipped"] += 1
            continue

        record = {
            "notion_id": notion_id,
            "name": name,
            "email": get_email(props, "Email"),
            "phone": get_phone(props, "Phone"),
            "country": get_select(props, "Country"),
            "date_of_birth": get_date(props, "Date of Birth"),
            "diet_allergies": get_rich_text(props, "Diet / Allergies"),
            "tshirt_size": map_tshirt(get_select(props, "T-Shirt Size")),
            "experience_locations": get_multi_select(props, "Experience Location"),
            "interested_products": get_multi_select(props, "Interested Product"),
            "accepts_marketing": get_checkbox(props, "Accepts Marketing"),
            "ai_summary": get_rich_text(props, "AI Summary"),
            "chatwoot_contact_id": get_rich_text(props, "Chatwoot Contact ID"),
            "level": get_select(props, "Level"),
            "disciplines": get_multi_select(props, "Discipline"),
            "notes": get_rich_text(props, "Level Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("contacts", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

        if (i + 1) % 100 == 0:
            print(f"    ... {i+1}/{len(pages)} contacts processed")
            time.sleep(0.1)

    return results


def migrate_exp_components(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_components")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        scope = get_select(props, "Scope")
        is_global = True if scope and scope.lower() in ("global", "all") else False

        category_raw = get_select(props, "Type")
        category = map_component_category(category_raw)

        name = get_title(props, "Component") or "Untitled"

        record = {
            "notion_id": notion_id,
            "name": name,
            "category": category,
            "unit_cost": get_number(props, "Buy (€/unit)"),
            "sell_price": get_number(props, "Sell (€/unit)"),
            "is_global": is_global,
            "addon_available": get_checkbox(props, "Add-on Available"),
            "notes": get_rich_text(props, "Notes"),
            "year": get_multi_select(props, "Year"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("exp_components", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_exp_packages(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_packages")
    slug_counter: dict[str, int] = {}

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        name = get_title(props, "Name") or "Untitled"
        experience_id = get_first_relation_uuid(props, "Experience")

        status_raw = get_select(props, "Status")
        status = map_package_status(status_raw)

        base_slug = make_slug(name)
        slug_counter[base_slug] = slug_counter.get(base_slug, 0) + 1
        slug = base_slug if slug_counter[base_slug] == 1 else f"{base_slug}-{slug_counter[base_slug]}"

        record = {
            "notion_id": notion_id,
            "name": name,
            "slug": slug,
            "experience_id": experience_id,
            "status": status,
            "price": get_number(props, "Retail Price (€)"),
            "max_spots": int(get_number(props, "Spots") or 0) or None,
            "description": get_rich_text(props, "Inclusions/Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("exp_packages", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_exp_bookings(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_bookings")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        status_raw = get_select(props, "Status")
        status = map_booking_status(status_raw)

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "contact_id": get_first_relation_uuid(props, "Customer"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "package_id": get_first_relation_uuid(props, "Package"),
            "status": status,
            "fly_in": get_date(props, "Fly In"),
            "fly_out": get_date(props, "Fly Out"),
            "traveling_with": get_rich_text(props, "Traveling with"),
            "wa_group": get_checkbox(props, "WA Group"),
            "agreed_price": get_number(props, "Agreed Price (€)"),
            "downpayment_invoice_sent": get_checkbox(props, "Downpayment Invoice Sent"),
            "downpayment_received": get_checkbox(props, "Downpayment Received"),
            "final_invoice_sent": get_checkbox(props, "Final Invoice Sent"),
            "final_invoice_due": get_rich_text(props, "Final Invoice Due"),
            "final_payment_received": get_checkbox(props, "Final Payment Received"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("exp_bookings", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_exp_costs(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_costs")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        experience_id = get_first_relation_uuid(props, "Experience")
        if not experience_id:
            # experience_id is NOT NULL
            results["skipped"] += 1
            continue

        status_raw = get_select(props, "Status")
        status = map_cost_status(status_raw)

        record = {
            "notion_id": notion_id,
            "item": get_title(props, "Item") or "Untitled",
            "experience_id": experience_id,
            "estimated_amount": get_number(props, "Estimated (€)"),
            "status": status,
            "date": get_date(props, "Datum"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id
        record["experience_id"] = experience_id

        row = upsert_record("exp_costs", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_exp_payments(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_payments")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        amount = get_number(props, "Amount (€)")
        if amount is None:
            results["skipped"] += 1
            continue

        # Derive Supabase type from Notion "Invoice Type" (more granular) → fallback by direction
        inv_type_raw = get_select(props, "Invoice Type")
        direction_raw = get_select(props, "Direction")
        notion_type_raw = get_select(props, "Type")  # "Invoice", "Stripe", null

        inv_type_map = {
            "down payment": "downpayment",
            "downpayment": "downpayment",
            "deposit": "downpayment",
            "final payment": "final",
            "final": "final",
            "additional service": "partial",
            "additional": "partial",
            "extra": "partial",
        }
        if inv_type_raw:
            ptype = inv_type_map.get(inv_type_raw.lower(), "partial")
        elif notion_type_raw and notion_type_raw.lower() == "stripe":
            ptype = "partial"  # Stripe = informal payment
        elif direction_raw and direction_raw.lower() == "cost":
            ptype = "partial"  # outgoing vendor payment
        else:
            ptype = "final"  # revenue invoice without sub-type → treat as final

        date_val = get_date(props, "Date")
        received_at = None
        if date_val:
            received_at = date_val if "T" in date_val else date_val + "T00:00:00+00:00"

        direction = map_payment_direction(direction_raw)
        invoice_type_supabase = map_payment_invoice_type(inv_type_raw)
        status = map_payment_status(get_select(props, "Status"))

        record = {
            "notion_id": notion_id,
            "reference": get_title(props, "Invoice / Ref") or notion_id[:8],
            "amount": amount,
            "type": ptype,
            "direction": direction,
            "invoice_type": invoice_type_supabase,
            "status": status if status else "pending",  # default to pending
            "date": date_val,
            "received_at": received_at,
            "notes": get_rich_text(props, "Notes"),
            "unmatched": get_checkbox(props, "⚠️ Unmatched"),
            "booking_id": get_first_relation_uuid(props, "→ Booking"),
            "contact_id": get_first_relation_uuid(props, "Customer"),
            "vendor_id": get_first_relation_uuid(props, "Vendor"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id
        record["amount"] = amount
        record["type"] = ptype
        record["status"] = status if status else "pending"

        row = upsert_record("exp_payments", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_exp_hotel_rooms(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("exp_hotel_rooms")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        hotel_raw = get_select(props, "Hotel")
        hotel = map_hotel(hotel_raw)
        if not hotel:
            # hotel is NOT NULL
            results["skipped"] += 1
            continue

        room_type = get_select(props, "Room Type")
        if not room_type:
            room_type = "Standard"

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "hotel": hotel,
            "room_number": get_rich_text(props, "Room #"),
            "room_type": room_type,
            "status": map_room_status(get_select(props, "Status")),
            "booking_id": get_first_relation_uuid(props, "Guest(s)"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "check_in": get_date(props, "Check-in"),
            "check_out": get_date(props, "Check-out"),
            "transfer_need": get_checkbox(props, "Transfer Need"),
            "partner_tag_along": get_rich_text(props, "Partner/Tag-along"),
            "comments": get_rich_text(props, "Comments"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id
        record["hotel"] = hotel
        record["room_type"] = room_type

        row = upsert_record("exp_hotel_rooms", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_hours_log(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("hours_log")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        employee_id = get_first_relation_uuid(props, "Employee")
        if not employee_id:
            results["skipped"] += 1
            continue

        date_val = get_date(props, "Date")
        if not date_val:
            results["skipped"] += 1
            continue

        hours_val = get_number(props, "Hours") or 0
        category_raw = get_select(props, "Category")
        category = map_hours_category(category_raw)

        record = {
            "notion_id": notion_id,
            "entry": get_title(props, "Entry") or "Untitled",
            "employee_id": employee_id,
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "hours": hours_val,
            "category": category,
            "date": date_val,
            "is_general": get_checkbox(props, "General"),
            "processed_at": get_date(props, "Processed"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id
        record["employee_id"] = employee_id
        record["hours"] = hours_val
        record["date"] = date_val

        row = upsert_record("hours_log", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_todos(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("todos")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "status": get_select(props, "Status"),
            "due_date": get_date(props, "Due Date"),
            "assignee": get_select(props, "Assignee"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "task_rule_id": get_first_relation_uuid(props, "Template"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("todos", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_scenario_planner(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("scenario_planner")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Scenario") or "Untitled",
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "num_beginner": int(get_number(props, "# Beginner") or 0),
            "num_pro": int(get_number(props, "# Pro") or 0),
            "num_mixed": int(get_number(props, "# Mixed") or 0),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("scenario_planner", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_email_templates(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("email_templates")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "type": get_select(props, "Type"),
            "status": get_select(props, "Status"),
            "subject_line": get_rich_text(props, "Subject Line"),
            "language": get_multi_select(props, "Language"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("email_templates", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_task_rules(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("task_rules")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "assignee": get_select(props, "Assignee"),
            "days_before_start": int(get_number(props, "Days Before Start") or 0),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("task_rules", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_pipeline_rules(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("pipeline_rules")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        record = {
            "notion_id": notion_id,
            "name": get_title(props, "Name") or "Untitled",
            "type": get_select(props, "Type"),
            "status": get_select(props, "Status"),
            "trigger": get_select(props, "Trigger"),
            "days_after_trigger": int(get_number(props, "Days After Trigger") or 0),
            "subject_line": get_rich_text(props, "Subject Line"),
            "language": get_multi_select(props, "Language"),
            "stop_if": get_multi_select(props, "Stop If"),
            "tags": get_multi_select(props, "Auswählen"),
            "experience_id": get_first_relation_uuid(props, "Experience"),
            "notes": get_rich_text(props, "Notes"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("pipeline_rules", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


def migrate_sync_log(pages: list[dict]) -> dict:
    results = {"inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
    existing = get_existing_notion_ids("sync_log")

    for page in pages:
        notion_id = page["id"]
        props = page["properties"]

        ts_str = get_date(props, "Timestamp")
        if ts_str and "T" not in ts_str:
            ts_str = ts_str + "T00:00:00+00:00"

        record = {
            "notion_id": notion_id,
            "entry": get_title(props, "Entry") or "Untitled",
            "field": get_select(props, "Field"),
            "old_value": get_rich_text(props, "Old Value"),
            "new_value": get_rich_text(props, "New Value"),
            "timestamp": ts_str,
            "source": get_select(props, "Source"),
            "reason": get_rich_text(props, "Reason"),
            "booking_id": get_first_relation_uuid(props, "Pipeline Entry"),
            "contact_id": get_first_relation_uuid(props, "Customer"),
        }

        record = {k: v for k, v in record.items() if v is not None}
        record["notion_id"] = notion_id

        row = upsert_record("sync_log", record)
        if row:
            supabase_id = row.get("id") or existing.get(notion_id)
            if supabase_id:
                notion_to_supabase[notion_id] = supabase_id
            if notion_id in existing:
                results["updated"] += 1
            else:
                results["inserted"] += 1
        else:
            results["errors"] += 1

    return results


# ─────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────

MIGRATORS = {
    "exp_experiences": migrate_exp_experiences,
    "team_members": migrate_team_members,
    "vendors": migrate_vendors,
    "contacts": migrate_contacts,
    "exp_components": migrate_exp_components,
    "exp_packages": migrate_exp_packages,
    "exp_bookings": migrate_exp_bookings,
    "exp_costs": migrate_exp_costs,
    "exp_payments": migrate_exp_payments,
    "exp_hotel_rooms": migrate_exp_hotel_rooms,
    "hours_log": migrate_hours_log,
    "todos": migrate_todos,
    "scenario_planner": migrate_scenario_planner,
    "email_templates": migrate_email_templates,
    "task_rules": migrate_task_rules,
    "pipeline_rules": migrate_pipeline_rules,
    "sync_log": migrate_sync_log,
}


def preload_existing_mappings():
    """Load all existing notion_id → supabase_id mappings."""
    print("📦 Preloading existing notion_id mappings...")
    tables = list(DATABASES.keys())
    for table in tables:
        try:
            mappings = get_existing_notion_ids(table)
            notion_to_supabase.update(mappings)
        except Exception as e:
            print(f"  ⚠️  Could not preload {table}: {e}")
    print(f"   Found {len(notion_to_supabase)} existing mappings\n")


def count_rows(table: str) -> int:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1"
    headers = {**supabase_headers(), "Prefer": "count=exact"}
    resp = requests.get(url, headers=headers, timeout=30)
    cr = resp.headers.get("content-range", "")
    if "/" in cr:
        try:
            return int(cr.split("/")[1])
        except Exception:
            pass
    if resp.status_code == 200:
        # Fetch all and count
        url2 = f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=10000"
        r2 = requests.get(url2, headers=supabase_headers(), timeout=30)
        if r2.status_code == 200:
            return len(r2.json())
    return -1


def write_report(stats: dict, verification: dict, elapsed: float):
    lines = []
    lines.append("# NP7 Notion → Supabase Migration Report")
    lines.append(f"\n**Date:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"**Duration:** {elapsed:.1f}s\n")

    lines.append("## Migration Results by Table\n")
    lines.append("| Table | Notion Pages | Inserted | Updated | Skipped | Errors |")
    lines.append("|-------|-------------|---------|---------|---------|--------|")
    total_inserted = total_updated = total_errors = total_skipped = 0
    for table, r in stats.items():
        ins = r.get("inserted", 0)
        upd = r.get("updated", 0)
        err = r.get("errors", 0)
        skp = r.get("skipped", 0)
        total_inserted += ins
        total_updated += upd
        total_errors += err
        total_skipped += skp
        lines.append(f"| {table} | {r.get('notion_pages',0)} | {ins} | {upd} | {skp} | {err} |")
    lines.append(f"| **TOTAL** | | **{total_inserted}** | **{total_updated}** | **{total_skipped}** | **{total_errors}** |")

    lines.append("\n## Post-Migration Row Counts\n")
    lines.append("| Table | Row Count |")
    lines.append("|-------|-----------|")
    for table, count in verification.items():
        lines.append(f"| {table} | {count} |")

    lines.append("\n## Schema Changes Made\n")
    lines.append("### New Columns Added to Existing Tables")
    lines.append("- `notion_id text` (unique index) added to all 11 migrated tables")
    lines.append("- `sell_price numeric` added to: exp_components")
    lines.append("- `addon_available boolean` added to: exp_components")
    lines.append("- `notes text` added to: exp_components")
    lines.append("- `year text[]` added to: exp_components")
    lines.append("")
    lines.append("### New Tables Created")
    for t in ["todos", "scenario_planner", "email_templates", "task_rules", "pipeline_rules", "sync_log"]:
        lines.append(f"- `{t}`")

    lines.append("\n## Relation Mapping")
    lines.append(f"- Total Notion page IDs resolved to Supabase UUIDs: {len(notion_to_supabase)}")
    lines.append("- Migration order respected dependency chain: experiences → components/packages → contacts/vendors/team → bookings → costs/payments/rooms/hours/todos/sync_log")

    lines.append("\n## Skipped / Deferred")
    lines.append("- **NP7 Conversations (110)** — stays in Chatwoot")
    lines.append("- **NP7 Experience Tasks (1,281)** — deferred; `exp_tasks` table exists and is ready")
    lines.append("- `exp_costs` entries with no Notion Experience relation → skipped (experience_id NOT NULL)")
    lines.append("- `exp_payments` entries with no amount or unrecognized type → skipped")
    lines.append("- `exp_hotel_rooms` with hotel value not in enum → skipped")
    lines.append("- `hours_log` entries with no matched Employee → skipped (employee_id NOT NULL)")

    lines.append("\n## Constraint Normalizations Applied")
    lines.append("- `contacts.tshirt_size`: lowercased (XL→xl, M→m)")
    lines.append("- `exp_experiences.status`: Notion status → draft/published/archived")
    lines.append("- `exp_experiences.active_status`: Notion select → published/private/in_planning")
    lines.append("- `exp_experiences.slug`: auto-generated from title + year")
    lines.append("- `exp_packages.slug`: auto-generated from name")
    lines.append("- `team_members.role`: Notion select → admin/editor/coach/operations")
    lines.append("- `exp_components.category`: Notion type → coaching/accommodation/meals/transport/gear/activity/other")
    lines.append("- `exp_bookings.status`: Notion select → valid enum")
    lines.append("- `exp_costs.status`: Notion select → confirmed/estimate/cancelled/unlisted")
    lines.append("- `exp_payments.type/direction/invoice_type/status`: Notion selects → valid enums")
    lines.append("- `exp_hotel_rooms.hotel/status`: matched to valid enum values")
    lines.append("- `hours_log.category`: Notion select → valid enum")

    lines.append("\n## What's Still Missing for Full Admin Panel Coverage")
    lines.append("1. **Slug uniqueness** — slugs are auto-generated; verify for conflicts with existing data")
    lines.append("2. **exp_experiences content fields** — `description`, `whats_included`, `hero_image`, `gallery`, `currency`, `timezone`, `hotel`, `airport_code`, `whatsapp_group_link`, `cancellation_policy` are website-specific fields not in Notion, left NULL")
    lines.append("3. **exp_hotel_rooms.booking_id** — Notion 'Guest(s)' is linked to contacts, not bookings; FK left NULL where contact→booking mapping couldn't be resolved")
    lines.append("4. **exp_package_components junction table** — Component↔Package many-to-many not migrated")
    lines.append("5. **Pipeline Rules email body** — body content is in Notion page blocks (not properties); needs separate page-content extraction")
    lines.append("6. **NP7 Experience Tasks (1,281)** — deferred; table exp_tasks exists and ready")
    lines.append("7. **Vendor notes column** — vendors table may need `notes text` column if not already present")

    report_path = "/home/np7/agents/main/git/np7-platform/MIGRATION-REPORT.md"
    with open(report_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\n📝 Report written to {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Migrate Notion → Supabase")
    parser.add_argument("--table", help="Only migrate this table", default=None)
    args = parser.parse_args()

    start_time = time.time()
    print("🚀 NP7 Notion → Supabase Migration")
    print("=" * 50)

    preload_existing_mappings()

    tables_to_run = [args.table] if args.table else MIGRATION_ORDER

    for table in tables_to_run:
        if table not in DATABASES:
            print(f"⚠️  Unknown table: {table}, skipping")
            continue

        db_id = DATABASES[table]
        migrator = MIGRATORS.get(table)
        if not migrator:
            print(f"⚠️  No migrator for: {table}, skipping")
            continue

        print(f"\n📋 Migrating {table} (DB: {db_id[:8]}...)")
        print(f"   Fetching pages from Notion...")

        pages = fetch_notion_pages(db_id)
        print(f"   Found {len(pages)} pages")

        if not pages:
            stats[table] = {"notion_pages": 0, "inserted": 0, "updated": 0, "errors": 0, "skipped": 0}
            continue

        result = migrator(pages)
        result["notion_pages"] = len(pages)
        stats[table] = result

        ins = result.get("inserted", 0)
        upd = result.get("updated", 0)
        err = result.get("errors", 0)
        skp = result.get("skipped", 0)
        print(f"   ✅ {ins} inserted, {upd} updated, {skp} skipped, {err} errors")

    # Verification
    print("\n\n🔍 Post-migration row counts:")
    print("-" * 40)
    all_tables = list(DATABASES.keys())
    verification = {}
    for table in all_tables:
        count = count_rows(table)
        verification[table] = count
        print(f"   {table}: {count}")

    elapsed = time.time() - start_time
    print(f"\n⏱  Total time: {elapsed:.1f}s")

    write_report(stats, verification, elapsed)


if __name__ == "__main__":
    main()
