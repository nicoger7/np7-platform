"use client";

import { useState } from "react";

/**
 * Member control: let the other participants on this trip see MY personal photos
 * in the shared gallery. Default on. Toggling is optimistic + persisted via
 * /api/portal/bookings/:id/photo-sharing (tolerant of migration 060).
 */
export function PhotoSharingToggle({ bookingId, initialShared }: { bookingId: string; initialShared: boolean }) {
  const [shared, setShared] = useState(initialShared);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !shared;
    setShared(next);
    setSaving(true);
    try {
      await fetch(`/api/portal/bookings/${bookingId}/photo-sharing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: next }),
      });
    } catch {
      setShared(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="flex items-center gap-3 w-full text-left rounded-xl px-3.5 py-3 transition-colors disabled:opacity-60"
      style={{ background: "#fff7ec", border: "1px solid #f0e6d6" }}
      aria-pressed={shared}
    >
      <span className="relative inline-block w-9 h-5 rounded-full shrink-0 transition-colors" style={{ backgroundColor: shared ? "#00afdb" : "#d9d2c6" }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: shared ? "18px" : "2px" }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold text-[#00374a]">Share my photos with the crew</span>
        <span className="block text-[12px] text-[#8a9aa0] mt-0.5">
          {shared
            ? "Your photos appear in the other participants' galleries. Yours always lead your own."
            : "Only you can see your personal photos. The week's shared shots stay visible to everyone."}
        </span>
      </span>
    </button>
  );
}
