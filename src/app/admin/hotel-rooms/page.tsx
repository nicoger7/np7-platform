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

export default function HotelRoomsPage() {
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHotel, setFilterHotel] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/hotel-rooms").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([roomsData, expData]) => {
      setRooms(roomsData.rooms || []);
      setExperiences(expData.experiences || []);
      setLoading(false);
    });
  }, []);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hotel Rooms</h1>
          <p className="text-sm admin-muted">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} across {Object.keys(groupedByHotel).length} hotel{Object.keys(groupedByHotel).length !== 1 ? "s" : ""}
          </p>
        </div>
        <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select value={filterHotel} onChange={(e) => setFilterHotel(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Hotels</option>
          {HOTELS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>

        <select value={filterExperience} onChange={(e) => setFilterExperience(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {experiences.map((exp) => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
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

              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {/* Header */}
                <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
                  {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) => (
                    <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  ))}
                </div>

                {/* Rows */}
                {hotelRooms.map((room) => (
                  <div
                    key={room.id}
                    className="grid gap-3 px-5 py-3"
                    style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                  >
                    {/* name — required */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium admin-heading truncate">{room.name}</div>
                      {room.room_number && <div className="text-xs admin-faint">#{room.room_number}</div>}
                    </div>
                    {visibleColumns.has("room_number") && (
                      <span className="text-xs admin-muted self-center">{room.room_number || "—"}</span>
                    )}
                    {visibleColumns.has("room_type") && (
                      <span className="text-xs admin-muted self-center truncate">{room.room_type}</span>
                    )}
                    {visibleColumns.has("edition") && (
                      <span className="text-xs admin-muted self-center truncate">{room.edition ? (room.edition.label ? `${room.edition.label} · ${room.edition.year}` : room.edition.year) : "—"}</span>
                    )}
                    {visibleColumns.has("transfer_need") && (
                      <span className="self-center">
                        {room.transfer_need ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400">Yes</span>
                        ) : (
                          <span className="text-xs admin-faint">—</span>
                        )}
                      </span>
                    )}
                    {visibleColumns.has("status") && (
                      <span className="self-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                          room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                          "bg-green-500/15 text-green-400"
                        }`}>
                          {room.status}
                        </span>
                      </span>
                    )}
                    {visibleColumns.has("guest") && (
                      <div className="self-center min-w-0">
                        {room.booking ? (
                          <Link href={`/admin/bookings/${room.booking.id}`} className="text-xs text-[#0aa3c7] hover:underline truncate block" onClick={(e) => e.stopPropagation()}>
                            {room.booking.name?.split(" — ")[0]?.split(" - ")[0] || room.booking.name}
                          </Link>
                        ) : (
                          <span className="text-xs admin-faint">—</span>
                        )}
                        {room.partner_tag_along && (
                          <span className="text-[10px] admin-faint truncate block">+ {room.partner_tag_along}</span>
                        )}
                      </div>
                    )}
                    {visibleColumns.has("partner_tag_along") && (
                      <span className="text-xs admin-muted self-center truncate">{room.partner_tag_along || "—"}</span>
                    )}
                    {visibleColumns.has("check_in") && (
                      <span className="text-xs admin-muted self-center">
                        {room.check_in ? `${formatDate(room.check_in)} → ${formatDate(room.check_out)}` : "—"}
                      </span>
                    )}
                    {visibleColumns.has("comments") && (
                      <span className="text-xs admin-faint self-center truncate" title={room.comments || ""}>{room.comments || "—"}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
