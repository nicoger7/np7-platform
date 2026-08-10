"use client";

import { useState } from "react";
import { mutate } from "@/lib/mutate";

/**
 * Member control: let the other participants on this trip see MY personal photos
 * in the shared gallery. Default on. Toggling is optimistic + persisted via
 * /api/portal/bookings/:id/photo-sharing (tolerant of migration 060).
 */
export function PhotoSharingToggle({ bookingId, initialShared }: { bookingId: string; initialShared: boolean }) {
  const [shared, setShared] = useState(initialShared);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const previous = shared;
    const next = !shared;
    setShared(next);
    setSaving(true);
    setError(null);
    // Only a NETWORK error used to revert. A 401/403/500 resolved, so the switch
    // stayed where the member put it and the label said the opposite of the truth:
    // "your photos appear in the other participants' galleries" while sharing was
    // still off (photos nobody gets), or the reverse — a member who just turned
    // sharing OFF walks away believing their personal shots are private to them
    // while the whole crew still sees them.
    const r = await mutate(`/api/portal/bookings/${bookingId}/photo-sharing`, {
      method: "PATCH",
      body: { shared: next },
    });
    if (!r.ok) {
      setShared(previous); // revert — the saved setting is still the old one
      setError(r.error);
    }
    setSaving(false);
  }

  return (
    <div>
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
      {error && <p className="mt-1.5 px-1 text-[12px] text-red-500" role="alert">Still {shared ? "shared" : "private"} — {error}</p>}
    </div>
  );
}
