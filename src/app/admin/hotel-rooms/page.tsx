"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { editionLabel, editionOptionLabel } from "@/lib/edition-label";

/**
 * Hotel Rooms — physical room (exp_rooms) + per-week occupancy (exp_hotel_rooms).
 *
 * Each PHYSICAL room shows once; its weeks (one occupancy row per edition) are
 * managed inside it. Editing the room's name/type/etc. (exp_rooms) reflects on
 * every week at once. Tolerant of migration 060 not being applied yet: if there
 * are no exp_rooms, occupancy rows are grouped by experience|hotel|name instead.
 */

interface Occupancy {
  id: string;
  room_id: string | null;
  name: string;
  hotel: string | null;
  hotel_id?: string | null;
  room_type: string | null;
  room_number: string | null;
  status: string;
  experience_id: string | null;
  edition_id?: string | null;
  check_in: string | null;
  check_out: string | null;
  transfer_need: boolean;
  partner_tag_along: string | null;
  hotel_confirmed?: boolean;
  comments: string | null;
  booking: { id: string; name: string; status: string; contact: { id: string; name: string; email: string } | null } | null;
  edition: { year: number; label: string | null } | null;
}

interface RoomUnit {
  id: string;
  experience_id: string | null;
  experience_ids?: string[] | null;
  hotel: string | null;
  hotel_id?: string | null;
  name: string;
  room_type: string | null;
  room_number: string | null;
  comments: string | null;
}

interface Experience { id: string; title: string; status?: string }
type Edition = { id: string; label: string | null; year: number; experience_id: string; date_start?: string | null; date_end?: string | null };

/**
 * The room's hotel, from the hotels table.
 *
 * This was a hardcoded array of nicknames ("REF", "REF II", "Sorobon") that
 * matched no hotel record, so a room could never tell you which hotel it was
 * actually in — and "REF" was ambiguous across two REF hotels. Rooms now carry
 * hotel_id; the legacy `hotel` text is still written so the Notion sync and
 * older reads keep working.
 */
function useHotelOptions() {
  const [hotels, setHotels] = useState<{ id: string; name: string; location: string | null }[]>([]);
  useEffect(() => {
    fetch("/api/admin/hotels").then((r) => r.json())
      .then((d) => setHotels((d.hotels ?? d ?? []).filter((h: { archived_at?: string | null }) => !h.archived_at)))
      .catch(() => {});
  }, []);
  return hotels;
}
const STATUSES = ["available", "assigned", "held"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const emptyUnit = { name: "", hotel_id: "", hotel: "", room_type: "", room_number: "", comments: "", experience_ids: [] as string[] };
const emptyWeek = { edition_id: "", booking_id: "", status: "available", check_in: "", check_out: "", transfer_need: false, partner_tag_along: "", hotel_confirmed: false };

export default function HotelRoomsPage() {
  const [occupancy, setOccupancy] = useState<Occupancy[]>([]);
  const [units, setUnits] = useState<RoomUnit[]>([]);
  /** The name follows type + number until someone writes their own. */
  const [roomNameTouched, setRoomNameTouched] = useState(false);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [editionBookings, setEditionBookings] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHotel, setFilterHotel] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterEdition, setFilterEdition] = useState("");

  // physical-room editor
  const [selUnit, setSelUnit] = useState<string | "new" | null>(null);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const hotelOptions = useHotelOptions();
  const [savingUnit, setSavingUnit] = useState(false);
  const [expPickerOpen, setExpPickerOpen] = useState(false);
  // per-week editor (inside a selected room)
  const [weekEditId, setWeekEditId] = useState<string | "new" | null>(null);
  const [weekForm, setWeekForm] = useState(emptyWeek);
  const [weekYear, setWeekYear] = useState("");
  const [savingWeek, setSavingWeek] = useState(false);

  const loadRooms = useCallback(() => {
    return Promise.all([
      fetch("/api/admin/hotel-rooms").then((r) => r.json()),
      fetch("/api/admin/rooms").then((r) => r.json()).catch(() => ({ rooms: [] })),
    ]).then(([occ, un]) => {
      setOccupancy(occ.rooms || []);
      setUnits(un.rooms || []);
    });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/hotel-rooms").then((r) => r.json()),
      fetch("/api/admin/rooms").then((r) => r.json()).catch(() => ({ rooms: [] })),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()).catch(() => []),
    ]).then(([occ, un, expData, edData]) => {
      setOccupancy(occ.rooms || []);
      setUnits(un.rooms || []);
      setExperiences(Array.isArray(expData) ? expData : expData.experiences || []);
      setEditions(Array.isArray(edData) ? edData : (edData.editions || []));
      setLoading(false);
    });
  }, []);

  // bookings for the edition picked in the week editor (for guest assignment).
  // No edition → skip (the guest select is disabled, so stale data never shows).
  useEffect(() => {
    if (!weekForm.edition_id) return;
    fetch(`/api/admin/bookings?edition_id=${weekForm.edition_id}`).then((r) => r.json())
      .then((d) => setEditionBookings((d.bookings || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))))
      .catch(() => {});
  }, [weekForm.edition_id]);

  // ── group occupancy under its physical room ──────────────────────────────────
  const filteredOcc = occupancy.filter((r) => {
    if (filterHotel && r.hotel !== filterHotel) return false;
    if (filterExperience && r.experience_id !== filterExperience) return false;
    if (filterEdition && r.edition_id !== filterEdition) return false;
    if (filterYear && String(r.edition?.year ?? "") !== filterYear) return false;
    return true;
  });
  const filteredUnits = units.filter((u) => {
    if (filterHotel && u.hotel !== filterHotel) return false;
    if (filterExperience && u.experience_id !== filterExperience && !(u.experience_ids ?? []).includes(filterExperience)) return false;
    return true;
  });

  const groupMap: Record<string, { unit: RoomUnit; weeks: Occupancy[] }> = {};
  for (const u of filteredUnits) groupMap[u.id] = { unit: u, weeks: [] };
  for (const r of filteredOcc) {
    // A row with a room_id belongs to a real room: if that room isn't in the
    // list (deleted, or filtered out), the row must not resurrect it as a
    // synthetic card — that made "Delete room" look like it did nothing.
    if (r.room_id) { groupMap[r.room_id]?.weeks.push(r); continue; }
    const key = `name:${r.experience_id ?? ""}|${r.hotel ?? ""}|${r.name}`;
    if (!groupMap[key]) {
      groupMap[key] = { unit: { id: key, experience_id: r.experience_id, hotel: r.hotel, name: r.name, room_type: r.room_type, room_number: r.room_number, comments: r.comments }, weeks: [] };
    }
    groupMap[key].weeks.push(r);
  }
  // with a year/edition filter on, a room only shows if it has a matching week —
  // the list becomes "this edition's (or year's) allotment"
  const groupList = Object.values(groupMap)
    .filter((g) => (!filterYear && !filterEdition) || g.weeks.length > 0)
    .sort((a, b) => (a.unit.name || "").localeCompare(b.unit.name || ""));
  // hotel → physical rooms
  const byHotel = groupList.reduce<Record<string, { unit: RoomUnit; weeks: Occupancy[] }[]>>((acc, g) => {
    const h = g.unit.hotel || "—";
    (acc[h] = acc[h] || []).push(g);
    return acc;
  }, {});

  const roomExpIds = new Set([...occupancy.map((r) => r.experience_id), ...units.map((u) => u.experience_id)].filter(Boolean));
  const pickerExperiences = experiences.filter((e) => roomExpIds.has(e.id) || e.status === "published");

  // year → edition cascade for the list filter (years that actually have week rows)
  const filterYears = [...new Set(occupancy
    .filter((r) => !filterExperience || r.experience_id === filterExperience)
    .map((r) => r.edition?.year).filter((y): y is number => y != null))].sort((a, b) => b - a);
  const usedEditionIds = new Set(occupancy.map((r) => r.edition_id).filter(Boolean));
  const filterEditions = editions
    .filter((e) => usedEditionIds.has(e.id)
      && (!filterExperience || e.experience_id === filterExperience)
      && (!filterYear || String(e.year) === filterYear))
    .sort((a, b) => a.year - b.year || String(a.label ?? "").localeCompare(String(b.label ?? "")));

  // ── actions ──────────────────────────────────────────────────────────────────
  function startUnit(id: string | "new") {
    setWeekEditId(null); setWeekForm(emptyWeek);
    setSelUnit(id);
    if (id === "new") { setRoomNameTouched(false); setUnitForm({ ...emptyUnit, hotel: filterHotel || "", experience_ids: filterExperience ? [filterExperience] : [] }); return; }
    const g = groupMap[id];
    const u = g?.unit;
    // An existing room whose name is already "type + number" keeps following;
    // anything hand-written is left alone.
    if (u) setRoomNameTouched(u.name.trim() !== roomName(u.room_type || "", u.room_number || ""));
    if (u) setUnitForm({ name: u.name, hotel_id: u.hotel_id || "", hotel: u.hotel || "", room_type: u.room_type || "", room_number: u.room_number || "", comments: u.comments || "", experience_ids: (u.experience_ids?.length ? u.experience_ids : u.experience_id ? [u.experience_id] : []) });
  }
  function closeUnit() { setSelUnit(null); setUnitForm(emptyUnit); setWeekEditId(null); setWeekForm(emptyWeek); }

  async function saveUnit() {
    if (!unitForm.name) return;
    setSavingUnit(true);
    const body = { name: unitForm.name, hotel_id: unitForm.hotel_id || null, hotel: unitForm.hotel || null, room_type: unitForm.room_type || null, room_number: unitForm.room_number || null, comments: unitForm.comments || null, experience_ids: unitForm.experience_ids };
    // A room built from legacy occupancy rows has a synthetic "name:…" key — no
    // exp_rooms row exists, so a PATCH can never land (it used to be sent anyway
    // and failed without a word: the "rooms don't save" bug). Saving one now
    // CREATES the real room and adopts its week rows.
    const isSynthetic = selUnit !== "new" && selUnit != null && !/^[0-9a-f-]{36}$/i.test(selUnit);
    if (selUnit === "new" || isSynthetic) {
      const res = await fetch("/api/admin/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({} as { room?: { id: string }; error?: string }));
      if (!res.ok) { setSavingUnit(false); alert(j.error || "Couldn't save this room — please try again."); return; }
      if (isSynthetic && j?.room?.id) {
        // link the orphan weeks to the room we just materialised
        const weeks = groupMap[selUnit!]?.weeks ?? [];
        await Promise.all(weeks.map((w) => fetch(`/api/admin/hotel-rooms/${w.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: j.room.id }),
        }).catch(() => {})));
      }
      await loadRooms();
      setSavingUnit(false);
      if (j?.room?.id) setSelUnit(j.room.id); else closeUnit();
    } else {
      const res = await fetch(`/api/admin/rooms/${selUnit}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        setSavingUnit(false);
        alert(j.error || "Couldn't save this room — please try again.");
        return; // keep the form open so nothing typed is lost
      }
      await loadRooms();
      setSavingUnit(false);
    }
  }

  /** Duplicate a room N times — the "we have 6 of these doubles" case. Copies the
      physical room (auto-numbered) and its week rows as AVAILABLE slots (same
      editions and dates, no guest — an allotment is capacity, not people). */
  async function duplicateUnit() {
    if (!selUnit || selUnit === "new") return;
    const g = groupMap[selUnit];
    if (!g) return;
    const nRaw = prompt("How many copies? Each becomes its own room with the same weeks (available, no guest).", "1");
    if (nRaw == null) return;
    const n = Math.min(20, Math.max(1, parseInt(nRaw, 10) || 1));
    setSavingUnit(true);
    const baseName = g.unit.name.replace(/\s+\d+$/, "");
    const taken = new Set(units.filter((u) => (u.hotel_id || u.hotel) === (g.unit.hotel_id || g.unit.hotel)).map((u) => u.name));
    let made = 0, num = 1;
    for (let i = 0; i < n; i++) {
      let name = `${baseName} ${++num}`;
      while (taken.has(name)) name = `${baseName} ${++num}`;
      taken.add(name);
      const res = await fetch("/api/admin/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name, hotel_id: g.unit.hotel_id || null, hotel: g.unit.hotel || null, room_type: g.unit.room_type || null,
        comments: g.unit.comments || null, experience_ids: g.unit.experience_ids?.length ? g.unit.experience_ids : (g.unit.experience_id ? [g.unit.experience_id] : []),
      }) });
      const j = await res.json().catch(() => ({} as { room?: { id: string }; error?: string }));
      if (!res.ok || !j?.room?.id) { alert(j?.error || `Copy ${i + 1} failed — ${made} made so far.`); break; }
      for (const w of g.weeks) {
        await fetch("/api/admin/hotel-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          room_id: j.room.id, experience_id: w.experience_id || g.unit.experience_id || null, name,
          hotel_id: g.unit.hotel_id || null, hotel: g.unit.hotel || null, room_type: g.unit.room_type || null,
          edition_id: w.edition_id || null, status: "available",
          check_in: w.check_in || null, check_out: w.check_out || null,
        }) }).catch(() => {});
      }
      made++;
    }
    setSavingUnit(false);
    await loadRooms();
    if (made) alert(`${made} ${made === 1 ? "copy" : "copies"} created.`);
  }
  async function removeUnit() {
    if (selUnit === "new" || !selUnit) return;
    if (!confirm("Delete this room? Its weekly bookings stay attached to their editions/guests.")) return;
    await fetch(`/api/admin/rooms/${selUnit}`, { method: "DELETE" });
    closeUnit(); loadRooms();
  }

  function startWeek(w: Occupancy | "new") {
    setWeekYear("");
    if (w === "new") {
      // filtering by a year/edition? that's almost certainly the week being added
      const ed = filterEdition ? editionById.get(filterEdition) : undefined;
      const edOk = ed && (!selUnitObj?.experience_id || ed.experience_id === selUnitObj.experience_id);
      setWeekYear(filterYear);
      setWeekEditId("new"); setWeekForm({ ...emptyWeek, edition_id: edOk ? filterEdition : "" });
      return;
    }
    setWeekEditId(w.id);
    setWeekForm({ edition_id: w.edition_id || "", booking_id: w.booking?.id || "", status: w.status, check_in: w.check_in || "", check_out: w.check_out || "", transfer_need: !!w.transfer_need, partner_tag_along: w.partner_tag_along || "", hotel_confirmed: !!w.hotel_confirmed });
    // edition_id isn't always on the list row → fetch the full occupancy row
    fetch(`/api/admin/hotel-rooms/${w.id}`).then((x) => x.json()).then((full) => {
      if (full?.id) setWeekForm((f) => ({ ...f, edition_id: full.edition_id || f.edition_id, booking_id: full.booking_id || f.booking_id }));
    }).catch(() => {});
  }
  async function saveWeek() {
    if (selUnit === "new" || !selUnit) return;
    const u = groupMap[selUnit]?.unit;
    if (!u) return;
    // date-aware collision check: warn when this stay overlaps another week row
    // of the same room (e.g. a Week II guest extending into Week III)
    const ed = weekForm.edition_id ? editionById.get(weekForm.edition_id) : null;
    const myStart = weekForm.check_in || ed?.date_start || null;
    const myEnd = weekForm.check_out || ed?.date_end || null;
    if (myStart && myEnd && !weekForm.hotel_confirmed) {
      // hotel-confirmed overlaps are fine (the hotel covers the clash) — only
      // warn about counterpart stays the hotel hasn't OK'd either
      const clash = selUnitWeeks.filter((w) => {
        if (weekEditId !== "new" && w.id === weekEditId) return false;
        if (w.hotel_confirmed) return false;
        const r = rangeOf(w);
        return r && myStart < r.end && r.start < myEnd;
      });
      if (clash.length) {
        const who = clash.map((w) => `${w.edition ? (w.edition.label || w.edition.year) : "?"}${w.booking?.name ? ` (${w.booking.name.split(" — ")[0]})` : ""}`).join(", ");
        if (!confirm(`These dates overlap this room's ${who}. The slot can't host both — unless the hotel covers it (then tick "Hotel confirmed").\n\nSave anyway?`)) return;
      }
    }
    setSavingWeek(true);
    const body = {
      room_id: u.id, experience_id: u.experience_id || null, name: u.name, hotel_id: u.hotel_id || null, hotel: u.hotel || null,
      room_type: u.room_type || null, room_number: u.room_number || null,
      edition_id: weekForm.edition_id || null, booking_id: weekForm.booking_id || null, status: weekForm.status,
      check_in: weekForm.check_in || null, check_out: weekForm.check_out || null,
      transfer_need: weekForm.transfer_need, partner_tag_along: weekForm.partner_tag_along || null,
      hotel_confirmed: weekForm.hotel_confirmed,
    };
    const res = weekEditId === "new"
      ? await fetch("/api/admin/hotel-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/admin/hotel-rooms/${weekEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSavingWeek(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }));
      alert(j.error || "Couldn't save this week — please try again.");
      return; // keep the form open so nothing typed is lost
    }
    setWeekEditId(null); setWeekForm(emptyWeek); loadRooms();
  }
  async function removeWeek(id: string) {
    if (!confirm("Remove this week's booking from the room?")) return;
    await fetch(`/api/admin/hotel-rooms/${id}`, { method: "DELETE" });
    setWeekEditId(null); setWeekForm(emptyWeek); loadRooms();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  /** "Standard Room" + "3" → "Standard Room 3". One fact, written once. */
function roomName(type: string, number: string): string {
  const t = (type ?? "").trim();
  const n = (number ?? "").trim();
  return [t, n].filter(Boolean).join(" ");
}

const labelClass = "block text-xs font-medium admin-muted mb-1";
  const selUnitWeeks = (selUnit && selUnit !== "new" ? groupMap[selUnit]?.weeks : []) || [];
  const editionById = new Map(editions.map((e) => [e.id, e]));
  // Effective stay range of a week row: explicit check-in/out, else the edition's
  // window. This is what makes cross-edition overlaps (extra nights!) detectable.
  const rangeOf = (w: { check_in?: string | null; check_out?: string | null; edition_id?: string | null }) => {
    const ed = w.edition_id ? editionById.get(w.edition_id) : null;
    const start = w.check_in || ed?.date_start || null;
    const end = w.check_out || ed?.date_end || null;
    return start && end ? { start, end } : null;
  };
  const weekConflicts = (() => {
    // ok = the hotel confirmed either side of the overlap → it's a managed
    // overlap (they cover it from outside our allotment), not an error
    const map = new Map<string, { lbl: string; ok: boolean }[]>();
    for (const a of selUnitWeeks) {
      const ra = rangeOf(a);
      if (!ra) continue;
      for (const b of selUnitWeeks) {
        if (b.id === a.id) continue;
        const rb = rangeOf(b);
        if (!rb) continue;
        if (ra.start < rb.end && rb.start < ra.end) {
          const lbl = b.edition ? editionLabel(b.edition) : "another week";
          map.set(a.id, [...(map.get(a.id) ?? []), { lbl, ok: !!a.hotel_confirmed || !!b.hotel_confirmed }]);
        }
      }
    }
    return map;
  })();
  const selUnitObj = selUnit && selUnit !== "new" ? groupMap[selUnit]?.unit : null;
  const weekEditions = editions.filter((e) => !selUnitObj?.experience_id || e.experience_id === selUnitObj.experience_id);
  const statusColor = (s: string) => s === "assigned" ? "bg-blue-500/15 text-blue-400" : s === "held" ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hotel Rooms</h1>
          <p className="text-sm admin-muted">
            {groupList.length} room{groupList.length !== 1 ? "s" : ""} across {Object.keys(byHotel).length} hotel{Object.keys(byHotel).length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => startUnit("new")} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Room</button>
      </div>

      {selUnit ? (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* rail */}
          <div className="lg:w-60 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
            <button onClick={closeUnit} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All rooms
            </button>
            {groupList.map((g) => {
              const active = g.unit.id === selUnit;
              return (
                <button key={g.unit.id} onClick={() => startUnit(g.unit.id)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                  <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{g.unit.name}</span>
                  <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{g.unit.hotel || "—"} · {g.weeks.length} week{g.weeks.length !== 1 ? "s" : ""}</span>
                </button>
              );
            })}
          </div>

          {/* editor */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* physical room */}
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-base font-bold admin-heading mb-1">{selUnit === "new" ? "New room" : "Edit room"}</h3>
              <p className="text-xs admin-faint mb-4">The physical room — name &amp; type apply to every week.</p>
              {/* Name and Room type were two fields for one fact, typed twice
                  and drifting apart — which is how "Standard Room" and
                  "Standard Room " (trailing space) became two different types
                  in the same hotel, and why packages matched no rooms at all.
                  The type is the answer; the name is the type plus a number. */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3 mb-3">
                <div>
                  <label className={labelClass}>Room type * <span className="normal-case font-normal admin-faint">— what the hotel calls it, e.g. “Double Deluxe Balcony”</span></label>
                  <input className={inputClass} list="np7-room-types" value={unitForm.room_type}
                    onChange={(e) => {
                      const room_type = e.target.value;
                      setUnitForm((f) => ({ ...f, room_type, name: roomNameTouched ? f.name : roomName(room_type, f.room_number) }));
                    }}
                    placeholder="e.g. Double Deluxe Balcony" />
                  <datalist id="np7-room-types">
                    {[...new Set(units.map((u) => (u.room_type ?? "").trim()).filter(Boolean))].sort().map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className={labelClass}>No. <span className="normal-case font-normal admin-faint">— ours</span></label>
                  <input className={inputClass} value={unitForm.room_number}
                    onChange={(e) => {
                      const room_number = e.target.value;
                      setUnitForm((f) => ({ ...f, room_number, name: roomNameTouched ? f.name : roomName(f.room_type, room_number) }));
                    }} />
                </div>
              </div>
              <div className="mb-3">
                <label className={labelClass}>Name <span className="normal-case font-normal admin-faint">— written for you; edit only if you need something else</span></label>
                <input className={inputClass} value={unitForm.name}
                  onChange={(e) => { setRoomNameTouched(true); setUnitForm({ ...unitForm, name: e.target.value }); }} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div><label className={labelClass}>Hotel</label><select className={inputClass} value={unitForm.hotel_id} onChange={(e) => setUnitForm({ ...unitForm, hotel_id: e.target.value, hotel: hotelOptions.find((x) => x.id === e.target.value)?.name ?? "" })}><option value="">—</option>{hotelOptions.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
                <div className="relative"><label className={labelClass}>Experiences <span className="normal-case font-normal admin-faint">— all that use this room</span></label>
                  <button type="button" onClick={() => setExpPickerOpen((v) => !v)}
                    className={`${inputClass} text-left flex items-center justify-between gap-2`}>
                    <span className="truncate">
                      {unitForm.experience_ids.length === 0 ? "—"
                        : unitForm.experience_ids.length <= 2
                          ? unitForm.experience_ids.map((id) => experiences.find((e) => e.id === id)?.title?.replace(/^NP7 (Experience )?/, "") ?? "?").join(", ")
                          : `${unitForm.experience_ids.length} experiences`}
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {expPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setExpPickerOpen(false)} />
                      <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-[260px] overflow-y-auto rounded-xl py-1" style={{ border: "1px solid var(--admin-border)", background: "var(--admin-bg)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                        {experiences.map((ex) => {
                          const on = unitForm.experience_ids.includes(ex.id);
                          return (
                            <button key={ex.id} type="button"
                              onClick={() => setUnitForm({ ...unitForm, experience_ids: on ? unitForm.experience_ids.filter((x) => x !== ex.id) : [...unitForm.experience_ids, ex.id] })}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--admin-surface-hover)] transition-colors">
                              <span className={`w-4 h-4 shrink-0 grid place-items-center rounded border ${on ? "bg-[#0aa3c7] border-[#0aa3c7] text-white" : ""}`} style={on ? undefined : { borderColor: "var(--admin-border)" }}>{on ? "✓" : ""}</span>
                              <span className={on ? "admin-heading font-semibold" : "admin-muted"}>{ex.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div><label className={labelClass}>Notes</label><input className={inputClass} value={unitForm.comments} onChange={(e) => setUnitForm({ ...unitForm, comments: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveUnit} disabled={!unitForm.name || savingUnit} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{savingUnit ? "Saving…" : selUnit === "new" ? "Create" : "Update"}</button>
                <button onClick={closeUnit} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                {selUnit !== "new" && <button onClick={duplicateUnit} disabled={savingUnit} className="ml-auto px-3 py-2 text-sm admin-muted hover:bg-[var(--admin-surface-hover)] rounded-lg transition-colors">Duplicate…</button>}
                {selUnit !== "new" && <button onClick={removeUnit} className="px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete room</button>}
              </div>
            </div>

            {/* weeks */}
            {selUnit !== "new" && (
              <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold admin-heading">Weeks &amp; guests</h3>
                  <button onClick={() => startWeek("new")} className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">Add week</button>
                </div>

                <div className="space-y-1.5">
                  {selUnitWeeks.length === 0 && <p className="text-xs admin-faint">No weeks yet — add one to book a guest into this room.</p>}
                  {selUnitWeeks.length > 0 && <p className="text-[11px] admin-faint">Rooms are <b>allotment slots</b>, not real hotel room numbers. A week&apos;s stay defaults to the edition&apos;s dates — set check-in/out when a guest extends, and overlapping stays (even across editions) get flagged ⚠.</p>}
                  {[...selUnitWeeks].sort((a, b) => (a.edition?.year ?? 0) - (b.edition?.year ?? 0) || String(a.edition?.label ?? "").localeCompare(String(b.edition?.label ?? ""))).map((w) => {
                    const g = w.booking?.name ? w.booking.name.split(" — ")[0].split(" - ")[0] : null;
                    const mates = companionsOf(w.booking, g);
                    const lbl = w.edition ? editionLabel(w.edition) : "—";
                    return (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(w.status)}`}>{w.status}</span>
                        <span className="text-sm admin-heading">{lbl}</span>
                        <span className="text-xs admin-muted truncate">{g ? (w.booking ? <Link href={`/admin/bookings/${w.booking.id}`} className="text-[#0aa3c7] hover:underline">{g}</Link> : g) : "free"}{w.partner_tag_along ? ` (+${w.partner_tag_along})` : ""}{mates.length ? <span className="admin-faint"> · with {mates.join(", ")}</span> : null}</span>
                        {w.check_in && <span className="text-[10px] admin-faint">{formatDate(w.check_in)} → {formatDate(w.check_out)}</span>}
                        {(() => {
                          const cf = weekConflicts.get(w.id) ?? [];
                          if (!cf.length) return null;
                          const names = cf.map((c) => c.lbl).join(", ");
                          return cf.every((c) => c.ok)
                            ? <span className="text-[10px] font-bold text-green-500" title="Overlap OK — the hotel confirmed it can host both stays.">✓ overlaps {names} — hotel confirmed</span>
                            : <span className="text-[10px] font-bold text-amber-400" title="The stays overlap — adjust check-in/out, move a guest, or tick 'Hotel confirmed' once the hotel OKs covering it.">⚠ overlaps {names}</span>;
                        })()}
                        {w.hotel_confirmed && !(weekConflicts.get(w.id)?.length) && <span className="text-[10px] text-green-500/80" title="The hotel confirmed this stay with us (internal).">hotel ✓</span>}
                        <span className="ml-auto flex gap-1">
                          <button onClick={() => startWeek(w)} className="px-2 py-1 text-xs admin-muted hover:text-[var(--admin-accent)] transition-colors">Edit</button>
                          <button onClick={() => removeWeek(w.id)} className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors">✕</button>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {weekEditId && (
                  <div className="mt-4 p-4 rounded-lg" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface-hover)" }}>
                    <h4 className="text-sm font-bold admin-heading mb-3">{weekEditId === "new" ? "Add week" : "Edit week"}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                      {(() => {
                        const selYear = weekYear || (weekForm.edition_id ? String(editionById.get(weekForm.edition_id)?.year ?? "") : "");
                        const years = [...new Set(weekEditions.map((e) => e.year).filter((y) => y != null))].sort((a, b) => b - a);
                        const opts = weekEditions.filter((ed) => !selYear || String(ed.year ?? "") === selYear);
                        return (
                          <>
                            <div><label className={labelClass}>Year</label><select className={inputClass} value={selYear} onChange={(e) => { const y = e.target.value; setWeekYear(y); const cur = editionById.get(weekForm.edition_id); if (cur && String(cur.year ?? "") !== y && y !== "") setWeekForm({ ...weekForm, edition_id: "", booking_id: "" }); }}>
                              <option value="">All</option>
                              {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                            </select></div>
                            <div><label className={labelClass}>Edition (week)</label><select className={inputClass} value={weekForm.edition_id} onChange={(e) => setWeekForm({ ...weekForm, edition_id: e.target.value, booking_id: "" })}><option value="">—</option>{opts.map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed)}</option>)}</select></div>
                          </>
                        );
                      })()}
                      <div><label className={labelClass}>Guest (booking)</label><select className={inputClass} value={weekForm.booking_id} onChange={(e) => setWeekForm({ ...weekForm, booking_id: e.target.value })} disabled={!weekForm.edition_id}><option value="">Unassigned</option>{editionBookings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                      <div><label className={labelClass}>Status</label><select className={inputClass} value={weekForm.status} onChange={(e) => setWeekForm({ ...weekForm, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
                      <div><label className={labelClass}>Check-in</label><input type="date" key={`ci-${weekEditId}`} className={inputClass} defaultValue={weekForm.check_in} onChange={(e) => setWeekForm((f) => ({ ...f, check_in: e.target.value }))} onBlur={(e) => setWeekForm((f) => ({ ...f, check_in: e.target.value }))} /></div>
                      <div><label className={labelClass}>Check-out</label><input type="date" key={`co-${weekEditId}`} className={inputClass} defaultValue={weekForm.check_out} onChange={(e) => setWeekForm((f) => ({ ...f, check_out: e.target.value }))} onBlur={(e) => setWeekForm((f) => ({ ...f, check_out: e.target.value }))} /></div>
                      <div><label className={labelClass}>Partner tagging along</label><input className={inputClass} value={weekForm.partner_tag_along} onChange={(e) => setWeekForm({ ...weekForm, partner_tag_along: e.target.value })} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer mb-2"><input type="checkbox" checked={weekForm.transfer_need} onChange={(e) => setWeekForm({ ...weekForm, transfer_need: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />Airport transfer needed</label>
                    <label className="flex items-start gap-2 text-sm admin-muted cursor-pointer mb-3"><input type="checkbox" checked={weekForm.hotel_confirmed} onChange={(e) => setWeekForm({ ...weekForm, hotel_confirmed: e.target.checked })} className="w-4 h-4 mt-0.5 accent-[#22c55e]" /><span>Hotel confirmed this stay <span className="admin-faint">— the hotel OK&apos;d these dates with us (e.g. an overlap they&apos;ll cover). Internal only; overlap warnings relax. Confirming extra nights to the guest sets this automatically.</span></span></label>
                    <div className="flex gap-2">
                      <button onClick={saveWeek} disabled={savingWeek} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{savingWeek ? "Saving…" : weekEditId === "new" ? "Add" : "Update"}</button>
                      <button onClick={() => { setWeekEditId(null); setWeekForm(emptyWeek); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <select value={filterHotel} onChange={(e) => setFilterHotel(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All Hotels</option>
            {hotelOptions.map((h) => <option key={h.id} value={h.name}>{h.name}</option>)}
          </select>
          <select value={filterExperience} onChange={(e) => { setFilterExperience(e.target.value); setFilterEdition(""); }} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All Experiences</option>
            {pickerExperiences.map((exp) => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => { const y = e.target.value; setFilterYear(y); const cur = editionById.get(filterEdition); if (y && cur && String(cur.year) !== y) setFilterEdition(""); }} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All years</option>
            {filterYears.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={filterEdition} onChange={(e) => setFilterEdition(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All weeks</option>
            {filterEditions.map((ed) => <option key={ed.id} value={ed.id}>{editionLabel(ed)}</option>)}
          </select>
          {(filterHotel || filterExperience || filterYear || filterEdition) && (
            <button onClick={() => { setFilterHotel(""); setFilterExperience(""); setFilterYear(""); setFilterEdition(""); }} className="text-xs admin-faint hover:admin-muted transition-colors">Clear filters</button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm admin-faint">Loading...</div>
        ) : groupList.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm admin-faint">No hotel rooms yet</p>
            <p className="text-xs admin-faint mt-1">Add a room, or run migration 060 to import existing ones</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byHotel).map(([hotel, rooms]) => (
              <div key={hotel}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold admin-heading">{hotel}</h2>
                  <span className="text-xs admin-faint">({rooms.length})</span>
                </div>
                <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                  {rooms.map((g) => {
                    const weeks = [...g.weeks].sort((a, b) => (a.edition?.year ?? 0) - (b.edition?.year ?? 0) || String(a.edition?.label ?? "").localeCompare(String(b.edition?.label ?? "")));
                    const booked = weeks.filter((w) => w.booking).length;
                    return (
                      <div key={g.unit.id} className="flex items-start justify-between gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-[var(--admin-surface-hover)]" style={{ borderBottom: "1px solid var(--admin-border)" }} onClick={() => startUnit(g.unit.id)}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium admin-heading truncate">{g.unit.name}{g.unit.room_type ? <span className="admin-faint font-normal"> · {g.unit.room_type}</span> : ""}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {weeks.length === 0 && <span className="text-[10px] admin-faint">no weeks yet</span>}
                            {Object.values(weeks.reduce<Record<string, Occupancy[]>>((acc, w) => {
                              const k = w.edition_id || w.id;
                              (acc[k] = acc[k] || []).push(w);
                              return acc;
                            }, {})).map((rows) => {
                              // one chip per WEEK — a shared double is two rows,
                              // and "who is in the room" means everyone in it
                              const w = rows[0];
                              const names = rows.flatMap((r) => {
                                const guest = r.booking?.name ? r.booking.name.split(" — ")[0].split(" - ")[0] : null;
                                return [
                                  guest,
                                  ...companionsOf(r.booking, guest).map((m) => `+${m.split(" ")[0]}`),
                                  r.partner_tag_along ? `+${r.partner_tag_along.split(" ")[0]}` : null,
                                ];
                              }).filter(Boolean);
                              const lbl = w.edition ? editionLabel(w.edition) : "—";
                              const tone = rows.find((r) => r.booking) ?? w;
                              return (
                                <button key={w.id} onClick={(e) => { e.stopPropagation(); startUnit(g.unit.id); startWeek(w); }} title={`${lbl}: ${names.join(", ") || "free"}`}
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${statusColor(tone.status)} hover:opacity-80 transition-opacity`}>
                                  <b>{lbl}</b>: {names.length ? names.join(" · ") : "free"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs admin-faint self-center">{booked}/{weeks.length} booked</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
      )}
    </div>
  );
}


/** Companion names from a booking's free-text traveling_with — "Lukas Prien
    (traveling together), Lukas :-)" → ["Lukas Prien"]. The room shows everyone
    sleeping in it, not just whoever holds the allotment slot. */
function companionsOf(booking: { traveling_with?: string | null } | null | undefined, guest: string | null): string[] {
  const raw = booking?.traveling_with ?? "";
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const name = part.replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{M}' .-]/gu, "").replace(/\s+/g, " ").trim();
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (guest && (key === guest.toLowerCase() || guest.toLowerCase().startsWith(key))) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
