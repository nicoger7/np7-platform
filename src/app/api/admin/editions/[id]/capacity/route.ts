import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * What is actually stopping us selling this week?
 *
 * Two pools, and a package sits under both: the week's own cap and the beds we
 * hold for the room type it sells. This returns both, per package and rolled up
 * per room pool, so the panel can say "the hotel is the limit — 2 beds free at
 * REF Carsi" instead of printing a number and leaving the operator to work out
 * which lever moves it.
 *
 * All the arithmetic is in SQL (migration 143). This route only joins names on.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const [{ data: pool }, { data: levels }, { data: avail }, { data: units }, { data: hotels }] = await Promise.all([
    db.from("exp_edition_pool").select("cap, used, free, over_cap").eq("edition_id", id).maybeSingle(),
    db.from("exp_edition_level_pool").select("*").eq("edition_id", id),
    db.from("exp_package_availability").select("*").eq("edition_id", id),
    db.from("exp_room_pool_units").select("*").eq("edition_id", id),
    db.from("hotels").select("id, name"),
  ]);

  type Row = Record<string, unknown>;
  const hotelName = new Map<string, string>();
  for (const h of (hotels ?? []) as { id: string; name: string }[]) hotelName.set(h.id, h.name);

  const pkgIds = ((avail ?? []) as Row[]).map((r) => r.package_id as string);
  const { data: pkgs } = pkgIds.length
    ? await db.from("exp_packages").select("id, name, price, status, website_visible").in("id", pkgIds)
    : { data: [] };
  const pkgById = new Map<string, Row>();
  for (const p of (pkgs ?? []) as Row[]) pkgById.set(p.id as string, p);

  const packages = ((avail ?? []) as Row[])
    .map((r) => {
      const p = pkgById.get(r.package_id as string);
      return {
        ...r,
        name: (p?.name as string) ?? "—",
        price: p?.price ?? null,
        status: p?.status ?? null,
        website_visible: p?.website_visible ?? null,
        hotel_name: r.hotel_id ? hotelName.get(r.hotel_id as string) ?? null : null,
      };
    })
    .sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));

  // Roll the rooms up per (hotel, room type) — that is the pool people share and
  // the unit the hotel talks to us in. Rooms with no type of their own still get
  // a row so nothing is invisible.
  const pools = new Map<string, {
    hotel_id: string | null; hotel_name: string | null; room_type: string | null;
    rooms: number; released: number; beds: number; beds_known: boolean;
    beds_used: number; beds_free: number; beds_over: number; unknown_rooms: string[];
  }>();
  for (const u of (units ?? []) as Row[]) {
    const key = `${u.hotel_id ?? "-"}::${u.room_type ?? "-"}`;
    const cur = pools.get(key) ?? {
      hotel_id: (u.hotel_id as string) ?? null,
      hotel_name: u.hotel_id ? hotelName.get(u.hotel_id as string) ?? null : null,
      room_type: (u.room_type as string) ?? null,
      rooms: 0, released: 0, beds: 0, beds_known: true,
      beds_used: 0, beds_free: 0, beds_over: 0, unknown_rooms: [],
    };
    if (u.released) cur.released += 1;
    else {
      cur.rooms += 1;
      cur.beds += Number(u.beds ?? 0);
      cur.beds_used += Number(u.beds_used ?? 0);
      cur.beds_free += Number(u.beds_free ?? 0);
      cur.beds_over += Number(u.beds_over ?? 0);
      if (u.beds_unknown) { cur.beds_known = false; cur.unknown_rooms.push((u.name as string) ?? "?"); }
    }
    pools.set(key, cur);
  }

  return NextResponse.json({
    capacity: {
      cap: pool?.cap ?? null,
      used: pool?.used ?? 0,
      free: pool?.free ?? null,
      over: pool?.over_cap ?? 0,
    },
    // Per coaching level. "Advanced 16, beginner 6" is how these weeks are
    // actually sold, and neither the week cap nor a package cap can say it.
    levels: (levels ?? []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a.level).localeCompare(String(b.level))),
    packages,
    pools: [...pools.values()].sort((a, b) =>
      `${a.hotel_name ?? ""}${a.room_type ?? ""}`.localeCompare(`${b.hotel_name ?? ""}${b.room_type ?? ""}`)
    ),
  });
}
