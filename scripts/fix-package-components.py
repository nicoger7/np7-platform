#!/usr/bin/env python3
"""
Fix Package ↔ Component Junction

For each component in Notion that has a Packages relation:
1. Resolves the component to its Supabase UUID via notion_id
2. Resolves each linked package to its Supabase UUID via notion_id
3. Upserts into exp_package_components (package_id, component_id, quantity=1)

Idempotent: uses upsert with ON CONFLICT DO NOTHING (or update).

Usage:
    export NOTION_TOKEN=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    python3 scripts/fix-package-components.py
"""

import os
import sys
import json
import time
import requests

# ─── Config ───────────────────────────────────────────────────────────────────
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qfdqigumjadvrocxjolx.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

COMPONENTS_DB = "3d4815f3-610c-4fc5-9531-82a006ede97b"
NOTION_VERSION = "2022-06-28"
RATE_LIMIT_DELAY = 0.35  # seconds between Notion API calls

if not NOTION_TOKEN or not SUPABASE_KEY:
    print("ERROR: NOTION_TOKEN and SUPABASE_SERVICE_ROLE_KEY are required")
    sys.exit(1)

# ─── Notion helpers ────────────────────────────────────────────────────────────
def notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_query_all(database_id):
    """Paginate through all pages in a Notion database."""
    pages = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        resp = requests.post(
            f"https://api.notion.com/v1/databases/{database_id}/query",
            headers=notion_headers(),
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
        pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
        time.sleep(RATE_LIMIT_DELAY)
    return pages


# ─── Supabase helpers ──────────────────────────────────────────────────────────
def supa_headers_upsert():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=representation",
    }


def supa_get(table, params):
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
        params=params,
    )
    resp.raise_for_status()
    return resp.json()


def supa_upsert(table, rows):
    """
    Upsert rows into table using ON CONFLICT DO NOTHING.
    Uses resolution=ignore-duplicates Prefer header.
    """
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=supa_headers_upsert(),
        json=rows,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Build caches ──────────────────────────────────────────────────────────────
def build_component_cache():
    """notion_id → supabase UUID for exp_components"""
    print("Building component cache...")
    cache = {}
    offset = 0
    limit = 1000
    while True:
        rows = supa_get("exp_components", {
            "select": "id,notion_id",
            "notion_id": "not.is.null",
            "limit": limit,
            "offset": offset,
        })
        if not rows:
            break
        for row in rows:
            cache[row["notion_id"]] = row["id"]
        if len(rows) < limit:
            break
        offset += limit
    print(f"  → {len(cache)} components with notion_id")
    return cache


def build_package_cache():
    """notion_id → supabase UUID for exp_packages"""
    print("Building package cache...")
    cache = {}
    offset = 0
    limit = 1000
    while True:
        rows = supa_get("exp_packages", {
            "select": "id,notion_id",
            "notion_id": "not.is.null",
            "limit": limit,
            "offset": offset,
        })
        if not rows:
            break
        for row in rows:
            cache[row["notion_id"]] = row["id"]
        if len(rows) < limit:
            break
        offset += limit
    print(f"  → {len(cache)} packages with notion_id")
    return cache


def build_existing_junctions():
    """(package_id, component_id) → True for already-existing junctions"""
    print("Loading existing junctions...")
    cache = set()
    offset = 0
    limit = 1000
    while True:
        rows = supa_get("exp_package_components", {
            "select": "package_id,component_id",
            "limit": limit,
            "offset": offset,
        })
        if not rows:
            break
        for row in rows:
            cache.add((row["package_id"], row["component_id"]))
        if len(rows) < limit:
            break
        offset += limit
    print(f"  → {len(cache)} existing junctions")
    return cache


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Fix Package ↔ Component Junction")
    print("=" * 60)

    component_cache = build_component_cache()
    package_cache = build_package_cache()
    existing_junctions = build_existing_junctions()

    print("\nFetching all components from Notion...")
    notion_components = notion_query_all(COMPONENTS_DB)
    print(f"  → {len(notion_components)} components in Notion")

    to_insert = []
    skipped_no_component = 0
    skipped_no_packages = 0
    skipped_package_missing = 0
    already_exists = 0

    for page in notion_components:
        notion_page_id = page["id"]
        props = page.get("properties", {})

        # Get component name for logging
        name_items = props.get("Component", {}).get("title", [])
        component_name = name_items[0].get("plain_text", "Untitled") if name_items else "Untitled"

        # Resolve component → Supabase UUID
        supa_component_id = component_cache.get(notion_page_id)
        if not supa_component_id:
            skipped_no_component += 1
            continue

        # Get Packages relation
        packages = props.get("Packages", {}).get("relation", [])
        if not packages:
            skipped_no_packages += 1
            continue

        for pkg_rel in packages:
            pkg_notion_id = pkg_rel["id"]
            supa_package_id = package_cache.get(pkg_notion_id)
            if not supa_package_id:
                skipped_package_missing += 1
                continue

            key = (supa_package_id, supa_component_id)
            if key in existing_junctions:
                already_exists += 1
                continue

            to_insert.append({
                "package_id": supa_package_id,
                "component_id": supa_component_id,
                "quantity": 1,
            })
            # Add to local set to avoid duplicates within this run
            existing_junctions.add(key)

    print(f"\nPrepared {len(to_insert)} new junction rows to insert")

    # Batch upsert in chunks
    BATCH_SIZE = 100
    inserted = 0
    errors = 0

    for i in range(0, len(to_insert), BATCH_SIZE):
        batch = to_insert[i : i + BATCH_SIZE]
        try:
            result = supa_upsert("exp_package_components", batch)
            # Count actually inserted (ignore-duplicates returns inserted rows)
            count = len(result) if isinstance(result, list) else len(batch)
            inserted += count
            print(f"  ✓ Batch {i // BATCH_SIZE + 1}: inserted {count} rows")
        except Exception as e:
            print(f"  ✗ Batch {i // BATCH_SIZE + 1} error: {e}")
            errors += 1

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"  Total Notion components      : {len(notion_components)}")
    print(f"  ✓ Junction rows inserted     : {inserted}")
    print(f"  ~ Already existed (skipped)  : {already_exists}")
    print(f"  ✗ Component not in Supabase  : {skipped_no_component}")
    print(f"  ✗ No packages relation       : {skipped_no_packages}")
    print(f"  ✗ Package not in Supabase    : {skipped_package_missing}")
    print(f"  ✗ Batch errors               : {errors}")


if __name__ == "__main__":
    main()
