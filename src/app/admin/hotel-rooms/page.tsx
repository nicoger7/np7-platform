"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface HotelRoom {
  id: string;
  name: string;
  hotel: string;
  room_type: string;
  room_number: string | null;
  status: string;
  experience_id: string | null;
  check_in: string | null;
  check_out: string | null;
  transfer_need: boolean;
  partner_tag_along: string | null;
  comments: string | null;
  booking: {
    id: string;
    name: string;
    status: string;
    contact: { id: string; name: string; email: string } | null;
  } | null;
  edition: { year: number; label: string | null } | null;
}

interface Experience {
  id: string;
  title: string;
  status?: string;
}

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];

type SortDir = "asc" | "desc" | null;

// Columns for table header/rows — actions at end is required but empty
const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Room", width: "1fr", required: true },
  { key: "room_number", label: "Room #", width: "70px", defaultHidden: true },
  { key: "room_type", label: "Type", width: "140px" },
  { key: "edition", label: "Edition", width: "100px", defaultHidden: true },
  { key: "transfer_need", label: "Transfer", width: "70px" },
  { key: "status", label: "Status", width: "80px" },
  { key: "guest", label: "Guest", width: "130px" },
  { key: "partner_tag_along", label: "Partner", width: "120px", defaultHidden: true },
  { key: "check_in", label: "Dates", width: "130px" },
  { key: "comments", label: "Notes", width: "120px", defaultHidden: true },
];

const STORAGE_KEY = "np7-hotel-rooms-columns";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

const STATUSES = ["available", "assigned", "held"];
const emptyRoom = { name: "", hotel: "", room_type: "", room_number: "", status: "available", experience_id: "", edition_id: "", booking_id: "", check_in: "", check_out: "", transfer_need: false, partner_tag_along: "", comments: "" };

export default function HotelRoomsPage() {
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<{ id: string; label: string | null; year: number; experience_id: string }[]>([]);
  const [editionBookings, setEditionBookings] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHotel, setFilterHotel] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  // CRUD / split state
  const [selId, setSelId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(emptyRoom);
  const [saving, setSaving] = useState(false);

  function load() {
    return fetch("/api/admin/hotel-rooms").then((r) => r.json()).then((d) => setRooms(d.rooms || []));
  }
  useEffect(() => {
    Promise.all([
      fetch("/api/admin/hotel-rooms").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()).catch(() => []),
    ]).then(([roomsData, expData, edData]) => {
      setRooms(roomsData.rooms || []);
      setExperiences(expData.experiences || []);
      setEditions(Array.isArray(edData) ? edData : (edData.editions || []));
      setLoading(false);
    });
  }, []);

  // Bookings for the picked edition (for guest assignment).
  useEffect(() => {
    if (!form.edition_id) { setEditionBookings([]); return; }
    fetch(`/api/admin/bookings?edition_id=${form.edition_id}`).then((r) => r.json())
      .then((d) => setEditionBookings((d.bookings || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }))))
      .catch(() => setEditionBookings([]));
  }, [form.edition_id]);

  function startNew() {
    setSelId("new");
    setForm({ ...emptyRoom, hotel: filterHotel || "", experience_id: filterExperience || "" });
  }
  function startEdit(r: HotelRoom) {
    setSelId(r.id);
    setForm({
      name: r.name, hotel: r.hotel || "", room_type: r.room_type || "", room_number: r.room_number || "",
      status: r.status, experience_id: r.experience_id || "", edition_id: r.edition?.year ? "" : "",
      booking_id: r.booking?.id || "", check_in: r.check_in || "", check_out: r.check_out || "",
      transfer_need: !!r.transfer_need, partner_tag_along: r.partner_tag_along || "", comments: r.comments || "",
    });
    // edition_id isn't on the list row; fetch the full room to fill it.
    fetch(`/api/admin/hotel-rooms/${r.id}`).then((x) => x.json()).then((full) => {
      if (full && full.id) setForm((f) => ({ ...f, edition_id: full.edition_id || "", experience_id: full.experience_id || f.experience_id, booking_id: full.booking_id || f.booking_id, check_in: full.check_in || f.check_in, check_out: full.check_out || f.check_out, partner_tag_along: full.partner_tag_along ?? f.partner_tag_along, comments: full.comments ?? f.comments, transfer_need: full.transfer_need ?? f.transfer_need }));
    }).catch(() => {});
  }
  function closeEditor() { setSelId(null); setForm(emptyRoom); }
  async function save() {
    if (!form.name) return;
    setSaving(true);
    const body = {
      name: form.name, hotel: form.hotel || null, room_type: form.room_type || null, room_number: form.room_number || null,
      status: form.status, experience_id: form.experience_id || null, edition_id: form.edition_id || null,
      booking_id: form.booking_id || null, check_in: form.check_in || null, check_out: form.check_out || null,
      transfer_need: form.transfer_need, partner_tag_along: form.partner_tag_along || null, comments: form.comments || null,
    };
    if (selId === "new") await fetch("/api/admin/hotel-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    else await fetch(`/api/admin/hotel-rooms/${selId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false); closeEditor(); load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this room?")) return;
    await fetch(`/api/admin/hotel-rooms/${id}`, { method: "DELETE" });
    closeEditor(); load();
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = rooms.filter((r) => {
    if (filterHotel && r.hotel !== filterHotel) return false;
    if (filterExperience && r.experience_id !== filterExperience) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // Scope the experience filter to ones that actually have rooms or are live —
  // not every experience that ever existed.
  const roomExpIds = new Set(rooms.map((r) => r.experience_id).filter(Boolean));
  const pickerExperiences = experiences.filter(
    (e) => roomExpIds.has(e.id) || e.status === "published"
  );

  const sorted = sortKey && sortDir
    ? [...filtered].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "guest") { aVal = a.booking?.name; bVal = b.booking?.name; }
        else { aVal = a[sortKey as keyof HotelRoom]; bVal = b[sortKey as keyof HotelRoom]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : filtered;

  // Group by hotel
  const groupedByHotel = sorted.reduce<Record<string, HotelRoom[]>>((acc, room) => {
    if (!acc[room.hotel]) acc[room.hotel] = [];
    acc[room.hotel].push(room);
    return acc;
  }, {});

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);
  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const formEditions = editions.filter((e) => !form.experience_id || e.experience_id === form.experience_id);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hotel Rooms</h1>
          <p className="text-sm admin-muted">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} across {Object.keys(groupedByHotel).length} hotel{Object.keys(groupedByHotel).length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!selId && <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />}
          <button onClick={startNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Room</button>
        </div>
      </div>

      {selId ? (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* rail */}
          <div className="lg:w-60 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
            <button onClick={closeEditor} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              All rooms
            </button>
            {sorted.map((r) => {
              const active = r.id === selId;
              return (
                <button key={r.id} onClick={() => startEdit(r)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                  <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{r.name}</span>
                  <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{r.hotel} · {r.status}{r.booking?.name ? ` · ${r.booking.name.split(" — ")[0]}` : ""}</span>
                </button>
              );
            })}
          </div>
          {/* editor */}
          <div className="flex-1 min-w-0">
            <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <h3 className="text-base font-bold admin-heading mb-4">{selId === "new" ? "New room" : "Edit room"}</h3>
              <div className="mb-3"><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div><label className={labelClass}>Hotel</label><select className={inputClass} value={form.hotel} onChange={(e) => setForm({ ...form, hotel: e.target.value })}><option value="">—</option>{HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
                <div><label className={labelClass}>Room #</label><input className={inputClass} value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} /></div>
                <div><label className={labelClass}>Status</label><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
                <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm admin-muted cursor-pointer"><input type="checkbox" checked={form.transfer_need} onChange={(e) => setForm({ ...form, transfer_need: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />Transfer</label></div>
              </div>
              <div className="mb-3"><label className={labelClass}>Room type</label><input className={inputClass} value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value })} placeholder="e.g. Double Deluxe Balcony" /></div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelClass}>Experience</label><select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value, edition_id: "", booking_id: "" })}><option value="">—</option>{experiences.map((ex) => <option key={ex.id} value={ex.id}>{ex.title}</option>)}</select></div>
                <div><label className={labelClass}>Edition</label><select className={inputClass} value={form.edition_id} onChange={(e) => setForm({ ...form, edition_id: e.target.value, booking_id: "" })} disabled={!form.experience_id}><option value="">All / none</option>{formEditions.map((ed) => <option key={ed.id} value={ed.id}>{ed.label || ed.year}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div><label className={labelClass}>Guest (booking)</label><select className={inputClass} value={form.booking_id} onChange={(e) => setForm({ ...form, booking_id: e.target.value })} disabled={!form.edition_id}><option value="">Unassigned</option>{editionBookings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <div><label className={labelClass}>Check-in</label><input type="date" className={inputClass} value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></div>
                <div><label className={labelClass}>Check-out</label><input type="date" className={inputClass} value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div><label className={labelClass}>Partner tagging along</label><input className={inputClass} value={form.partner_tag_along} onChange={(e) => setForm({ ...form, partner_tag_along: e.target.value })} /></div>
                <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={save} disabled={!form.name || saving} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{saving ? "Saving…" : selId === "new" ? "Create" : "Update"}</button>
                <button onClick={closeEditor} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
                {selId !== "new" && <button onClick={() => remove(selId)} className="ml-auto px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Delete</button>}
              </div>
            </div>
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

        <select value={filterExperience} onChange={(e) => setFilterExperience(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {pickerExperiences.map((exp) => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="held">Held</option>
        </select>

        {(filterHotel || filterExperience || filterStatus) && (
          <button onClick={() => { setFilterHotel(""); setFilterExperience(""); setFilterStatus(""); }} className="text-xs admin-faint hover:admin-muted transition-colors">
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : rooms.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No hotel rooms yet</p>
          <p className="text-xs admin-faint mt-1">Run the migration first, then rooms will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByHotel).map(([hotel, hotelRooms]) => (
            <div key={hotel}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold admin-heading">{hotel}</h2>
                <span className="text-xs admin-faint">({hotelRooms.length})</span>
              </div>

              <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                {/* Header */}
                <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
                  {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) => (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  ))}
                </div>

                {/* Rows — ONE per physical room (grouped by name); each week is a
                    chip showing who's in it that edition. The DB still has a row
                    per room×week; this only collapses the display. */}
                {Object.values(
                  hotelRooms.reduce<Record<string, HotelRoom[]>>((acc, r) => { (acc[r.name] = acc[r.name] || []).push(r); return acc; }, {})
                ).map((instances) => {
                  const rep = instances[0];
                  const weeks = [...instances].sort((a, b) => (a.edition?.year ?? 0) - (b.edition?.year ?? 0) || String(a.edition?.label ?? "").localeCompare(String(b.edition?.label ?? "")));
                  const booked = weeks.filter((w) => w.booking).length;
                  return (
                    <div
                      key={rep.hotel + rep.name}
                      className="grid gap-3 px-5 py-3 transition-colors"
                      style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                    >
                      {/* name + a chip per week (who's in it) */}
                      <div className="min-w-0">
                        <div className="text-sm font-medium admin-heading truncate">{rep.name}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {weeks.map((w) => {
                            const g = w.booking?.name ? (w.booking.name.split(" — ")[0].split(" - ")[0]) : null;
                            const lbl = w.edition ? (w.edition.label || w.edition.year) : "—";
                            const color = w.status === "assigned" ? "bg-blue-500/15 text-blue-400" : w.status === "held" ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400";
                            return (
                              <button key={w.id} onClick={() => startEdit(w)} title={`${lbl}: ${g || "free"}${w.partner_tag_along ? " (+" + w.partner_tag_along + ")" : ""}`}
                                className={`px-1.5 py-0.5 rounded text-[10px] ${color} hover:opacity-80 transition-opacity`}>
                                <b>{lbl}</b>: {g || "free"}{w.partner_tag_along ? ` (+${w.partner_tag_along.split(" ")[0]})` : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {visibleColumns.has("room_number") && <span className="text-xs admin-muted self-center">{rep.room_number || "—"}</span>}
                      {visibleColumns.has("room_type") && <span className="text-xs admin-muted self-center truncate">{rep.room_type}</span>}
                      {visibleColumns.has("edition") && <span className="text-xs admin-muted self-center">{weeks.length} week{weeks.length !== 1 ? "s" : ""}</span>}
                      {visibleColumns.has("transfer_need") && (
                        <span className="self-center">{weeks.some((w) => w.transfer_need) ? <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400">Yes</span> : <span className="text-xs admin-faint">—</span>}</span>
                      )}
                      {visibleColumns.has("status") && <span className="self-center text-xs admin-muted">{booked}/{weeks.length} booked</span>}
                      {visibleColumns.has("guest") && <span className="self-center text-xs admin-faint">see weeks ↑</span>}
                      {visibleColumns.has("partner_tag_along") && <span className="text-xs admin-muted self-center truncate">{weeks.map((w) => w.partner_tag_along).filter(Boolean).join(", ") || "—"}</span>}
                      {visibleColumns.has("check_in") && <span className="text-xs admin-muted self-center">—</span>}
                      {visibleColumns.has("comments") && <span className="text-xs admin-faint self-center truncate" title={rep.comments || ""}>{rep.comments || "—"}</span>}
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
