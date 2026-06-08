#!/usr/bin/env python3
"""
Fix Hotel Room → Booking Links

In Notion, hotel rooms have a "Guest(s)" relation that actually points to
booking pages (not contact pages). Each booking already has contact_id &
experience_id.

For each hotel room in Notion:
1. Gets the Guest(s) relation → these are booking page IDs
2. Looks up the booking's Supabase UUID via notion_id on exp_bookings
3. Finds the matching hotel room in Supabase via notion_id
4. Updates exp_hotel_rooms.booking_id with the booking UUID

Usage:
    export NOTION_TOKEN=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    python3 scripts/fix-hotel-booking-links.py
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

HOTEL_ROOMS_DB = "359992eb-86b0-815b-9b84-f3c7c4b68686"
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
def supa_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
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


def supa_patch(table, match_col, match_val, data):
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=supa_headers(),
        params={match_col: f"eq.{match_val}"},
        json=data,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Build caches ──────────────────────────────────────────────────────────────
def build_booking_cache():
    """notion_id → supabase UUID for exp_bookings"""
    print("Building booking cache...")
    cache = {}
    offset = 0
    limit = 1000
    while True:
        rows = supa_get("exp_bookings", {
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
    print(f"  → {len(cache)} bookings with notion_id")
    return cache


def build_room_cache():
    """notion_id → supabase row for exp_hotel_rooms"""
    print("Building hotel room cache...")
    cache = {}
    offset = 0
    limit = 1000
    while True:
        rows = supa_get("exp_hotel_rooms", {
            "select": "id,name,notion_id,booking_id",
            "notion_id": "not.is.null",
            "limit": limit,
            "offset": offset,
        })
        if not rows:
            break
        for row in rows:
            cache[row["notion_id"]] = row
        if len(rows) < limit:
            break
        offset += limit
    print(f"  → {len(cache)} hotel rooms with notion_id in Supabase")
    return cache


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Fix Hotel Room → Booking Links")
    print("=" * 60)
    print()
    print("NOTE: Notion 'Guest(s)' relation points to BOOKING pages,")
    print("      not contact pages. We match rooms → bookings directly.")
    print()

    booking_cache = build_booking_cache()
    room_cache = build_room_cache()

    print("\nFetching all hotel rooms from Notion...")
    notion_rooms = notion_query_all(HOTEL_ROOMS_DB)
    print(f"  → {len(notion_rooms)} rooms in Notion")

    linked = 0
    skipped_already_linked = 0
    skipped_no_room_in_supa = 0
    skipped_no_guest = 0
    skipped_booking_not_in_supa = 0
    errors = 0

    for page in notion_rooms:
        notion_page_id = page["id"]
        props = page.get("properties", {})

        # Get room name for logging
        name_items = props.get("Name", {}).get("title", [])
        room_name = name_items[0].get("plain_text", "Untitled") if name_items else "Untitled"

        # Get Guest(s) relation → these are booking page IDs
        guests = props.get("Guest(s)", {}).get("relation", [])
        if not guests:
            skipped_no_guest += 1
            continue

        # Find this room in Supabase by notion_id
        supa_room = room_cache.get(notion_page_id)
        if not supa_room:
            skipped_no_room_in_supa += 1
            continue

        supa_room_id = supa_room["id"]
        existing_booking_id = supa_room["booking_id"]

        # Resolve first guest (booking) to Supabase UUID
        found_booking_id = None
        for guest in guests:
            booking_notion_id = guest["id"]
            supa_booking_id = booking_cache.get(booking_notion_id)
            if supa_booking_id:
                found_booking_id = supa_booking_id
                break

        if not found_booking_id:
            skipped_booking_not_in_supa += 1
            print(f"  ? Room '{room_name}' - booking notion IDs not in Supabase: "
                  f"{[g['id'] for g in guests]}")
            continue

        if existing_booking_id == found_booking_id:
            skipped_already_linked += 1
            continue

        # Update the room
        try:
            supa_patch("exp_hotel_rooms", "id", supa_room_id, {"booking_id": found_booking_id})
            status = "UPDATED" if existing_booking_id else "LINKED"
            print(f"  ✓ [{status}] '{room_name}' → booking {found_booking_id[:8]}…")
            linked += 1
        except Exception as e:
            print(f"  ✗ Error updating room {supa_room_id}: {e}")
            errors += 1

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"  Total Notion rooms processed : {len(notion_rooms)}")
    print(f"  ✓ booking_id linked/updated  : {linked}")
    print(f"  ~ Already correct (skipped)  : {skipped_already_linked}")
    print(f"  ✗ No Supabase room record    : {skipped_no_room_in_supa}")
    print(f"  ✗ No guest relation          : {skipped_no_guest}")
    print(f"  ✗ Booking not in Supabase    : {skipped_booking_not_in_supa}")
    print(f"  ✗ Update errors              : {errors}")


if __name__ == "__main__":
    main()
