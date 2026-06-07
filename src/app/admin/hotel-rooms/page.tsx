"use client";

import { useState, useEffect } from "react";

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
}

interface Experience {
  id: string;
  title: string;
}

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HotelRoomsPage() {
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHotel, setFilterHotel] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

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

  const filtered = rooms.filter((r) => {
    if (filterHotel && r.hotel !== filterHotel) return false;
    if (filterExperience && r.experience_id !== filterExperience) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // Group by hotel
  const groupedByHotel = filtered.reduce<Record<string, HotelRoom[]>>((acc, room) => {
    if (!acc[room.hotel]) acc[room.hotel] = [];
    acc[room.hotel].push(room);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hotel Rooms</h1>
          <p className="text-sm admin-muted">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} across {Object.keys(groupedByHotel).length} hotel{Object.keys(groupedByHotel).length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select
          value={filterHotel}
          onChange={(e) => setFilterHotel(e.target.value)}
          className="admin-input text-sm px-3 py-1.5 rounded-lg"
        >
          <option value="">All Hotels</option>
          {HOTELS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        <select
          value={filterExperience}
          onChange={(e) => setFilterExperience(e.target.value)}
          className="admin-input text-sm px-3 py-1.5 rounded-lg"
        >
          <option value="">All Experiences</option>
          {experiences.map((exp) => (
            <option key={exp.id} value={exp.id}>{exp.title}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="admin-input text-sm px-3 py-1.5 rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="assigned">Assigned</option>
          <option value="held">Held</option>
        </select>

        {(filterHotel || filterExperience || filterStatus) && (
          <button
            onClick={() => { setFilterHotel(""); setFilterExperience(""); setFilterStatus(""); }}
            className="text-xs admin-faint hover:admin-muted transition-colors"
          >
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
                <div className="grid grid-cols-[1fr_160px_80px_140px_140px_1fr] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Room</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Type</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Guest</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Dates</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Notes</span>
                </div>

                {hotelRooms.map((room) => (
                  <div
                    key={room.id}
                    className="grid grid-cols-[1fr_160px_80px_140px_140px_1fr] gap-3 px-5 py-3"
                    style={{ borderBottom: "1px solid var(--admin-border)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium admin-heading truncate">{room.name}</div>
                      {room.room_number && <div className="text-xs admin-faint">#{room.room_number}</div>}
                    </div>
                    <span className="text-xs admin-muted self-center truncate">{room.room_type}</span>
                    <span className="self-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        room.status === "assigned" ? "bg-blue-500/15 text-blue-400" :
                        room.status === "held" ? "bg-amber-500/15 text-amber-400" :
                        "bg-green-500/15 text-green-400"
                      }`}>
                        {room.status}
                      </span>
                    </span>
                    <div className="self-center min-w-0">
                      <span className="text-xs admin-muted truncate block">
                        {room.booking?.name?.split(" — ")[0] || room.booking?.name?.split(" - ")[0] || "—"}
                      </span>
                      {room.partner_tag_along && (
                        <span className="text-[10px] admin-faint truncate block">+ {room.partner_tag_along}</span>
                      )}
                    </div>
                    <span className="text-xs admin-muted self-center">
                      {room.check_in ? `${formatDate(room.check_in)} → ${formatDate(room.check_out)}` : "—"}
                    </span>
                    <span className="text-xs admin-faint self-center truncate">
                      {room.comments || "—"}
                    </span>
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
