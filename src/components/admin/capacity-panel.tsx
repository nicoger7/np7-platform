"use client";

/**
 * What is stopping us selling this week.
 *
 * The old version was three boxes — Max spots, Spots taken, Spots remaining —
 * and a subtraction. It could not be right, because a week is limited by two
 * things and it only knew about one: Alaçatı showed "Spots taken 4" while
 * sixteen people had paid, and nothing anywhere said the hotel had ten rooms.
 *
 * So this panel does not lead with a number. It leads with the LIMIT, because
 * "2 left" tells you nothing you can act on and "the hotel is what's stopping
 * you, 2 beds free at REF Carsi" tells you who to phone. The number the pools
 * agree on comes second.
 */

export type CapacityPools = {
  hotel_id: string | null; hotel_name: string | null; room_type: string | null;
  rooms: number; released: number; beds: number; beds_known: boolean;
  beds_used: number; beds_free: number; beds_over: number; unknown_rooms: string[];
};

export type CapacityPackage = {
  package_id: string; name: string; price: number | string | null; status: string | null;
  spots_left: number | null; binding: string[];
  allocation_cap: number | null; allocation_used: number; allocation_free: number | null;
  rooms: number | null; rooms_ever: number | null;
  beds_total: number | null; beds_used: number | null; beds_free: number | null; beds_over: number | null;
  beds_unknown: boolean; room_free: number | null;
  hotel_name: string | null; room_type: string | null; beds_per_booking: number;
  pool_undeclared: boolean;
};

export type CapacityLevel = {
  level: string; cap: number | null; used: number; free: number | null;
  over_cap: number; untagged_packages: number;
};

export type CapacityData = {
  capacity: { cap: number | null; used: number; free: number | null; over: number; fromLevels?: boolean; typed?: number | null };
  levels: CapacityLevel[];
  packages: CapacityPackage[];
  pools: CapacityPools[];
};

const POOL_LABEL: Record<string, string> = {
  edition: "the week",
  rooms: "the hotel",
  level: "the level",
  allocation: "the package cap",
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The headline: what is binding, in words, before any arithmetic. */
function headline(d: CapacityData): { title: string; tone: "over" | "full" | "open" | "unset"; detail: string } {
  const { cap, used, free, over } = d.capacity;
  if (over > 0) {
    return {
      title: `${over} over the cap`,
      tone: "over",
      detail: d.capacity.fromLevels
        ? `${used} secured against ${cap} across the levels. Someone was let in over a level's cap — check the level rows below.`
        : `${used} secured against a cap of ${cap}. Either the cap is stale or these were deliberate — until it's right, "full" means nothing here.`,
    };
  }
  if (cap == null) {
    return { title: "No cap set", tone: "unset", detail: "Nothing limits this week. Set Max spots to how many people the trip actually is." };
  }
  // The week is bookable while any one package still has room.
  const best = d.packages.length
    ? d.packages.reduce<number | null>((m, p) => (p.spots_left === null || m === null ? null : Math.max(m, p.spots_left)), 0)
    : free;
  if (best === 0) {
    const why = [...new Set(d.packages.flatMap((p) => p.binding))].map((b) => POOL_LABEL[b] ?? b);
    return {
      title: "Full",
      tone: "full",
      detail: why.length ? `Limited by ${why.join(" and ")}.` : "Every package is out of room.",
    };
  }
  return {
    title: best === null ? "Open" : `${best} left`,
    tone: "open",
    detail: best === null
      ? `${used} secured. No package is capped by beds yet — set room types and bed counts to make the hotel count.`
      : `${used} of ${cap} secured. Best-selling package has ${best}.`,
  };
}

const TONE: Record<string, { fg: string; bg: string }> = {
  over: { fg: "#f87171", bg: "rgba(248,113,113,0.12)" },
  full: { fg: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  open: { fg: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  unset: { fg: "var(--admin-text-faint)", bg: "var(--admin-surface)" },
};

export function CapacityPanel({
  data, cap, onCap, onLevelCap, loading,
}: {
  data: CapacityData | null;
  /** The one editable number: how many people the trip is. */
  cap: number | null;
  onCap: (v: number | null) => void;
  /** Per-level ceilings — saved immediately, they are not part of the form. */
  onLevelCap?: (level: string, v: number | null) => void;
  loading?: boolean;
}) {
  const h = data ? headline(data) : null;
  const tone = h ? TONE[h.tone] : TONE.unset;
  const gaps = data?.pools.filter((p) => !p.beds_known) ?? [];
  const undeclared = data?.packages.filter((p) => p.pool_undeclared) ?? [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="flex items-start gap-4 px-4 py-3.5 flex-wrap" style={{ backgroundColor: tone.bg }}>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint mb-1">Capacity</p>
          <p className="text-[19px] font-bold leading-tight" style={{ color: tone.fg }}>
            {loading ? "…" : h?.title ?? "—"}
          </p>
          {h && <p className="text-[12px] admin-muted mt-1 max-w-xl">{h.detail}</p>}
        </div>
        <div className="shrink-0">
          <label className="block text-[10px] font-bold tracking-[0.12em] uppercase admin-faint mb-1">Max spots</label>
          {/* With levels set, the week cap IS their sum — so it is shown, not
              typed. A second editable number here is only something for the
              levels to disagree with, and that disagreement is what had Week II
              reading "fully booked" while two beginner places were free. */}
          {data?.capacity.fromLevels ? (
            <div className="w-24 rounded-lg px-2.5 py-2 text-[13px] admin-heading text-center"
              style={{ border: "1px dashed var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
              title="Added up from the level caps below. Clear those to type a week cap by hand.">
              {data.capacity.cap ?? "—"}
            </div>
          ) : (
            <input
              type="number"
              className="w-24 rounded-lg px-2.5 py-2 text-[13px] admin-heading"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}
              value={cap ?? ""}
              onChange={(e) => onCap(e.target.value ? Number(e.target.value) : null)}
            />
          )}
          {data?.capacity.fromLevels && <p className="text-[10px] admin-faint mt-1 text-center">from the levels</p>}
        </div>
      </div>

      {/* The pools, each one a line you can act on. */}
      <div className="divide-y" style={{ borderTop: "1px solid var(--admin-border)" }}>
        <PoolRow
          label="The week"
          value={data
            ? (data.capacity.cap == null ? "no cap"
               : `${data.capacity.used} of ${data.capacity.cap}${data.capacity.fromLevels ? " (levels added up)" : ""}`)
            : "—"}
          note={data && data.capacity.over > 0 ? `${data.capacity.over} over` : null}
          noteTone="bad"
        />
        {/* Levels. "Advanced 16, beginner 6" is how the weeks are really sold,
            and it is the one limit here a human types — beds are derived. */}
        {(data?.levels ?? []).map((l) => (
          <div key={l.level} className="flex items-baseline gap-3 px-4 py-2" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[12px] admin-heading font-semibold w-44 shrink-0 truncate">{titleCase(l.level)}</span>
            <span className="text-[12px] admin-muted flex-1 min-w-0 truncate">
              {l.cap == null ? `${l.used} booked · no cap` : `${l.used} of ${l.cap}`}
            </span>
            {l.over_cap > 0
              ? <span className="text-[11px] font-bold shrink-0 text-red-400">{l.over_cap} over</span>
              : l.free != null && <span className={`text-[11px] font-bold shrink-0 ${l.free > 0 ? "text-green-400" : "text-amber-500"}`}>{l.free} free</span>}
            {onLevelCap && (
              <input
                type="number" min={0}
                className="w-16 shrink-0 rounded-lg px-2 py-1 text-[12px] admin-heading text-right"
                style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" }}
                defaultValue={l.cap ?? ""}
                placeholder="—"
                title="Leave empty for no cap on this level. Don't retype a bed limit here — the rooms already do that."
                onBlur={(e) => {
                  const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                  if ((v ?? null) !== (l.cap ?? null)) onLevelCap(l.level, v);
                }}
              />
            )}
          </div>
        ))}
        {(data?.pools ?? []).map((p) => (
          <PoolRow
            key={`${p.hotel_id}-${p.room_type}`}
            label={[p.hotel_name ?? "Hotel", p.room_type].filter(Boolean).join(" · ")}
            value={
              !p.beds_known
                ? `${p.rooms} room${p.rooms === 1 ? "" : "s"} · beds not set`
                : `${p.beds_used} of ${p.beds} beds`
            }
            note={
              p.beds_over > 0 ? `${p.beds_over} over`
                : p.released > 0 ? `${p.released} released`
                : p.beds_known ? `${p.beds_free} free` : "set bed counts"
            }
            noteTone={p.beds_over > 0 ? "bad" : p.beds_known ? (p.beds_free > 0 ? "good" : "warn") : "warn"}
          />
        ))}
        {data && data.pools.length === 0 && (
          <PoolRow label="Hotel" value="no rooms entered for this week" note="not limiting" noteTone="muted" />
        )}
      </div>

      {/* Gaps: the reason a pool isn't counting yet. Named, not hinted at. */}
      {(gaps.length > 0 || undeclared.length > 0) && (
        <div className="px-4 py-3 text-[11.5px] admin-muted space-y-1" style={{ borderTop: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          {gaps.map((g) => (
            <p key={`${g.hotel_id}-${g.room_type}`}>
              <span className="text-amber-500 font-semibold">Beds not set</span> — {[g.hotel_name, g.room_type].filter(Boolean).join(" · ")}: {g.unknown_rooms.slice(0, 4).join(", ")}
              {g.unknown_rooms.length > 4 ? ` +${g.unknown_rooms.length - 4}` : ""}. Until someone says how many each sleeps, these rooms limit nothing.
            </p>
          ))}
          {(data?.levels ?? []).some((l) => l.cap != null) && (data?.levels?.[0]?.untagged_packages ?? 0) > 0 && (
            <p>
              <span className="text-amber-500 font-semibold">No level</span> — {data?.levels?.[0]?.untagged_packages} package{(data?.levels?.[0]?.untagged_packages ?? 0) === 1 ? "" : "s"} on this week have no coaching level, so no level cap applies to them and they sell past it.
            </p>
          )}
          {undeclared.length > 0 && (
            <p>
              <span className="text-amber-500 font-semibold">No room type</span> — {undeclared.length} package{undeclared.length === 1 ? "" : "s"} name a hotel but not which room they sell, so the hotel doesn&apos;t limit them: {undeclared.slice(0, 3).map((p) => p.name).join(", ")}
              {undeclared.length > 3 ? ` +${undeclared.length - 3}` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PoolRow({ label, value, note, noteTone }: { label: string; value: string; note: string | null; noteTone: "good" | "warn" | "bad" | "muted" }) {
  const c = noteTone === "bad" ? "text-red-400" : noteTone === "warn" ? "text-amber-500" : noteTone === "good" ? "text-green-400" : "admin-faint";
  return (
    <div className="flex items-baseline gap-3 px-4 py-2" style={{ borderBottom: "1px solid var(--admin-border)" }}>
      <span className="text-[12px] admin-heading font-semibold w-44 shrink-0 truncate">{label}</span>
      <span className="text-[12px] admin-muted flex-1 min-w-0 truncate">{value}</span>
      {note && <span className={`text-[11px] font-bold shrink-0 ${c}`}>{note}</span>}
    </div>
  );
}

/** The per-package "Left · why", used in the packages table. */
export function SpotsLeftCell({ a }: { a: CapacityPackage | undefined }) {
  if (!a) return <span className="text-xs admin-faint">—</span>;
  if (a.spots_left === null) {
    return <span className="text-xs admin-faint" title={a.pool_undeclared ? "No room type set, so the hotel doesn't limit this package" : "Nothing limits this package"}>no limit</span>;
  }
  const why = a.binding.map((b) => POOL_LABEL[b] ?? b).join(" + ");
  const tone = a.spots_left === 0 ? "text-amber-500" : a.spots_left <= 2 ? "text-amber-400" : "admin-heading";
  return (
    <span className="text-xs" title={detailTitle(a)}>
      <span className={`font-bold ${tone}`}>{a.spots_left === 0 ? "full" : a.spots_left}</span>
      {why && <span className="admin-faint"> · {why}</span>}
    </span>
  );
}

function detailTitle(a: CapacityPackage): string {
  const bits: string[] = [];
  if (a.room_free !== null) {
    bits.push(`${a.hotel_name ?? "Hotel"}${a.room_type ? ` · ${a.room_type}` : ""}: ${a.beds_free ?? 0} of ${a.beds_total ?? 0} beds free → ${a.room_free} sellable at ${a.beds_per_booking} bed${a.beds_per_booking === 1 ? "" : "s"} per booking`);
  } else if (a.pool_undeclared) {
    bits.push("No room type set — the hotel doesn't limit this package");
  }
  if (a.allocation_cap !== null) bits.push(`Package cap: ${a.allocation_used} of ${a.allocation_cap} sold`);
  return bits.join("\n") || "Limited by the week only";
}
