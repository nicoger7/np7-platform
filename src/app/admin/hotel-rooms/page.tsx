"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
  room_type: string | null;
  room_number: string | null;
  status: string;
  experience_id: string | null;
  edition_id?: string | null;
  check_in: string | null;
  check_out: string | null;
  transfer_need: boolean;
  partner_tag_along: string | null;
  comments: string | null;
  booking: { id: string; name: string; status: string; contact: { id: string; name: string; email: string } | null } | null;
  edition: { year: number; label: string | null } | null;
}

interface RoomUnit {
  id: string;
  experience_id: string | null;
  experience_ids?: string[] | null;
  hotel: string | null;
  name: string;
  room_type: string | null;
  room_number: string | null;
  comments: string | null;
}

interface Experience { id: string; title: string; status?: string }
type Edition = { id: string; label: string | null; year: number; experience_id: string; date_start?: string | null; date_end?: string | null };

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];
const STATUSES = ["available", "assigned", "held"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const emptyUnit = { name: "", hotel: "", room_type: "", room_number: "", comments: "", experience_ids: [] as string[] };
const emptyWeek = { edition_id: "", booking_id: "", status: "available", check_in: "", check_out: "", transfer_need: false, partner_tag_along: "" };

export default function HotelRoomsPage() {
  const [occupancy, setOccupancy] = useState<Occupancy[]>([]);
  const [units, setUnits] = useState<RoomUnit[]>([]);
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
    const key = r.room_id ?? `name:${r.experience_id ?? ""}|${r.hotel ?? ""}|${r.name}`;
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
    if (id === "new") { setUnitForm({ ...emptyUnit, hotel: filterHotel || "", experience_ids: filterExperience ? [filterExperience] : [] }); return; }
    const g = groupMap[id];
    const u = g?.unit;
    if (u) setUnitForm({ name: u.name, hotel: u.hotel || "", room_type: u.room_type || "", room_number: u.room_number || "", comments: u.comments || "", experience_ids: (u.experience_ids?.length ? u.experience_ids : u.experience_id ? [u.experience_id] : []) });
  }
  function closeUnit() { setSelUnit(null); setUnitForm(emptyUnit); setWeekEditId(null); setWeekForm(emptyWeek); }

  async function saveUnit() {
    if (!unitForm.name) return;
    setSavingUnit(true);
    const body = { name: unitForm.name, hotel: unitForm.hotel || null, room_type: unitForm.room_type || null, room_number: unitForm.room_number || null, comments: unitForm.comments || null, experience_ids: unitForm.experience_ids };
    if (selUnit === "new") {
      const res = await fetch("/api/admin/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      await loadRooms();
      setSavingUnit(false);
      if (res?.room?.id) setSelUnit(res.room.id); else closeUnit();
    } else {
      await fetch(`/api/admin/rooms/${selUnit}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await loadRooms();
      setSavingUnit(false);
    }
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
    setWeekForm({ edition_id: w.edition_id || "", booking_id: w.booking?.id || "", status: w.status, check_in: w.check_in || "", check_out: w.check_out || "", transfer_need: !!w.transfer_need, partner_tag_along: w.partner_tag_along || "" });
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
    if (myStart && myEnd) {
      const clash = selUnitWeeks.filter((w) => {
        if (weekEditId !== "new" && w.id === weekEditId) return false;
        const r = rangeOf(w);
        return r && myStart < r.end && r.start < myEnd;
      });
      if (clash.length) {
        const who = clash.map((w) => `${w.edition ? (w.edition.label || w.edition.year) : "?"}${w.booking?.name ? ` (${w.booking.name.split(" — ")[0]})` : ""}`).join(", ");
        if (!confirm(`These dates overlap this room's ${who}. The slot can't host both.\n\nSave anyway?`)) return;
      }
    }
    setSavingWeek(true);
    const body = {
      room_id: u.id, experience_id: u.experience_id || null, name: u.name, hotel: u.hotel || null,
      room_type: u.room_type || null, room_number: u.room_number || null,
      edition_id: weekForm.edition_id || null, booking_id: weekForm.booking_id || null, status: weekForm.status,
      check_in: weekForm.check_in || null, check_out: weekForm.check_out || null,
      transfer_need: weekForm.transfer_need, partner_tag_along: weekForm.partner_tag_along || null,
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
    const map = new Map<string, string[]>();
    for (const a of selUnitWeeks) {
      const ra = rangeOf(a);
      if (!ra) continue;
      for (const b of selUnitWeeks) {
        if (b.id === a.id) continue;
        const rb = rangeOf(b);
        if (!rb) continue;
        if (ra.start < rb.end && rb.start < ra.end) {
          const lbl = b.edition ? String(b.edition.label || b.edition.year) : "another week";
          map.set(a.id, [...(map.get(a.id) ?? []), lbl]);
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
              <div className="mb-3"><label className={labelClass}>Name * <span className="normal-case font-normal admin-faint">— our numbering, e.g. “Double Deluxe Patio 1”</span></label><input className={inputClass} value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <div><label className={labelClass}>Hotel</label><select className={inputClass} value={unitForm.hotel} onChange={(e) => setUnitForm({ ...unitForm, hotel: e.target.value })}><option value="">—</option>{HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
                <div><label className={labelClass}>Room # <span className="normal-case font-normal admin-faint">— the hotel’s own number, if any</span></label><input className={inputClass} value={unitForm.room_number} onChange={(e) => setUnitForm({ ...unitForm, room_number: e.target.value })} /></div>
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
                <div><label className={labelClass}>Room type <span className="normal-case font-normal admin-faint">— internal; the website’s room label comes from the package name</span></label><input className={inputClass} value={unitForm.room_type} onChange={(e) => setUnitForm({ ...unitForm, room_type: e.target.value })} placeholder="e.g. Double Deluxe Balcony" /></div>
                <div><label className={labelClass}>Notes</label><input className={inputClass} value={unitForm.comments} onChange={(e) => setUnitForm({ ...unitForm, comments: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveUnit} disabled={!unitForm.name || savingUnit} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{savingUnit ? "Saving…" : selUnit === "new" ? "Create" : "Update"}</button>
                <button onClick={closeUnit} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                {selUnit !== "new" && <button onClick={removeUnit} className="ml-auto px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete room</button>}
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
                    const lbl = w.edition ? (w.edition.label || w.edition.year) : "—";
                    return (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(w.status)}`}>{w.status}</span>
                        <span className="text-sm admin-heading">{lbl}</span>
                        <span className="text-xs admin-muted truncate">{g ? (w.booking ? <Link href={`/admin/bookings/${w.booking.id}`} className="text-[#0aa3c7] hover:underline">{g}</Link> : g) : "free"}{w.partner_tag_along ? ` (+${w.partner_tag_along})` : ""}</span>
                        {w.check_in && <span className="text-[10px] admin-faint">{formatDate(w.check_in)} → {formatDate(w.check_out)}</span>}
                        {(weekConflicts.get(w.id)?.length ?? 0) > 0 && <span className="text-[10px] font-bold text-amber-400" title="The stays overlap — this allotment slot can't host both. Adjust check-in/out or move a guest to another slot.">⚠ overlaps {weekConflicts.get(w.id)!.join(", ")}</span>}
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
                            <div><label className={labelClass}>Edition (week)</label><select className={inputClass} value={weekForm.edition_id} onChange={(e) => setWeekForm({ ...weekForm, edition_id: e.target.value, booking_id: "" })}><option value="">—</option>{opts.map((ed) => <option key={ed.id} value={ed.id}>{selYear ? (ed.label || ed.year) : [ed.year, ed.label].filter(Boolean).join(" · ")}</option>)}</select></div>
                          </>
                        );
                      })()}
                      <div><label className={labelClass}>Guest (booking)</label><select className={inputClass} value={weekForm.booking_id} onChange={(e) => setWeekForm({ ...weekForm, booking_id: e.target.value })} disabled={!weekForm.edition_id}><option value="">Unassigned</option>{editionBookings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                      <div><label className={labelClass}>Status</label><select className={inputClass} value={weekForm.status} onChange={(e) => setWeekForm({ ...weekForm, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
                      <div><label className={labelClass}>Check-in</label><input type="date" key={`ci-${weekEditId}`} className={inputClass} defaultValue={weekForm.check_in} onChange={(e) => setWeekForm((f) => ({ ...f, check_in: e.target.value }))} onBlur={(e) => setWeekForm((f) => ({ ...f, check_in: e.target.value }))} /></div>
                      <div><label className={labelClass}>Check-out</label><input type="date" key={`co-${weekEditId}`} className={inputClass} defaultValue={weekForm.check_out} onChange={(e) => setWeekForm((f) => ({ ...f, check_out: e.target.value }))} onBlur={(e) => setWeekForm((f) => ({ ...f, check_out: e.target.value }))} /></div>
                      <div><label className={labelClass}>Partner tagging along</label><input className={inputClass} value={weekForm.partner_tag_along} onChange={(e) => setWeekForm({ ...weekForm, partner_tag_along: e.target.value })} /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer mb-3"><input type="checkbox" checked={weekForm.transfer_need} onChange={(e) => setWeekForm({ ...weekForm, transfer_need: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />Airport transfer needed</label>
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
            {HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}
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
            {filterEditions.map((ed) => <option key={ed.id} value={ed.id}>{filterYear ? (ed.label || ed.year) : [ed.year, ed.label].filter(Boolean).join(" · ")}</option>)}
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
                            {weeks.map((w) => {
                              const guest = w.booking?.name ? w.booking.name.split(" — ")[0].split(" - ")[0] : null;
                              const lbl = w.edition ? (w.edition.label || w.edition.year) : "—";
                              return (
                                <button key={w.id} onClick={(e) => { e.stopPropagation(); startUnit(g.unit.id); startWeek(w); }} title={`${lbl}: ${guest || "free"}${w.partner_tag_along ? " (+" + w.partner_tag_along + ")" : ""}`}
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${statusColor(w.status)} hover:opacity-80 transition-opacity`}>
                                  <b>{lbl}</b>: {guest || "free"}{w.partner_tag_along ? ` (+${w.partner_tag_along.split(" ")[0]})` : ""}
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
