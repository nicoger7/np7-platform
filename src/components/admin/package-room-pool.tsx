"use client";

/**
 * Which beds this package sells.
 *
 * A package with a hotel but no room type is limited by nothing but the week —
 * it will sell past the last bed, which is what has been happening. Picking the
 * room type is the deliberate act that switches the hotel on as a limit.
 *
 * The suggestion matters more than it looks. Every package is already named
 * after its room ("SOROBON Ocean Front Beach House"), so the right answer is
 * sitting in the name — offering it as one click beats a dropdown nobody
 * notices, without ever writing a guess to the database.
 */

type Pool = { hotel_id: string | null; room_type: string | null; rooms: number; beds: number; beds_known: boolean; beds_free: number };

/** Longest room type whose words all appear in the package name. */
function suggest(name: string, types: string[]): string | null {
  const n = name.toLowerCase();
  const hits = types.filter((t) => t && n.includes(t.toLowerCase()));
  if (!hits.length) return null;
  return hits.sort((a, b) => b.length - a.length)[0];
}

export function PackageRoomPool({
  pools, hotelId, roomType, bedsPerBooking, suggestFrom, onRoomType, labelClass, inputClass,
}: {
  pools: Pool[];
  hotelId: string | null;
  roomType: string;
  bedsPerBooking: string;
  suggestFrom: string;
  onRoomType: (v: string) => void;
  /** Still honoured, no longer asked — see the note in the body. */
  onBeds?: (v: string) => void;
  labelClass: string;
  inputClass: string;
}) {
  if (!hotelId) {
    return (
      <div className="mb-4 px-3 py-2.5 rounded-lg text-[11.5px] admin-faint" style={{ border: "1px solid var(--admin-border)" }}>
        No hotel on this package, so only the week&apos;s Max spots limits it. That&apos;s right for
        &ldquo;Experience Only&rdquo; and no-hotel packages.
      </div>
    );
  }

  const mine = pools.filter((p) => p.hotel_id === hotelId && p.room_type);
  const types = mine.map((p) => p.room_type as string);
  const picked = mine.find((p) => p.room_type === roomType);
  const hint = !roomType ? suggest(suggestFrom, types) : null;

  return (
    <div className="mb-4 p-3 rounded-lg space-y-3" style={{ border: "1px solid var(--admin-border)" }}>
      {/* One question, not two.
          "Beds per booking" was an implementation detail wearing a label — it
          asked the team to describe room-sharing in advance, per package, when
          sharing is something the GUESTS decide at booking time. It is still a
          column (and still honoured), but it defaults to one bed per person and
          is no longer put in front of anyone. */}
      <div>
        <label className={labelClass}>Which rooms does this package sell?</label>
        <select className={inputClass} value={roomType} onChange={(e) => onRoomType(e.target.value)}>
          <option value="">— not set (nothing stops it overselling) —</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
          {roomType && !types.includes(roomType) && <option value={roomType}>{roomType} (no rooms this week)</option>}
        </select>
      </div>

      {hint && (
        <button type="button" onClick={() => onRoomType(hint)}
          className="text-[11.5px] font-semibold text-[var(--admin-accent)] hover:underline">
          Looks like &ldquo;{hint}&rdquo; — use it
        </button>
      )}

      {/* What it MEANS, in people. "8 sellable" made you do the arithmetic
          back to a number of guests. */}
      <p className="text-[11.5px] admin-faint">
        {picked
          ? picked.beds_known
            ? `${picked.rooms} room${picked.rooms === 1 ? "" : "s"} this week, sleeping ${picked.beds} — room for ${Math.floor(picked.beds_free / (Number(bedsPerBooking) || 1))} more guest${Math.floor(picked.beds_free / (Number(bedsPerBooking) || 1)) === 1 ? "" : "s"} on this package.`
            : `${picked.rooms} room${picked.rooms === 1 ? "" : "s"} this week — but nobody has said how many people sleep in each, so nothing stops this selling past the last bed. Set it on the Hotel Rooms tab.`
          : types.length === 0
            ? "No rooms entered for this hotel this week, so nothing limits this package yet."
            : "Not set — nothing stops this package selling past the last bed."}
      </p>
    </div>
  );
}
