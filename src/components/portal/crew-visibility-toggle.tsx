"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Visibility } from "@/lib/member-profile";

/**
 * On the crew roster: let the member show/hide themselves to the rest of the
 * trip. Crew sharing is ON by default; this writes an explicit crew on/off into
 * their profile_visibility (merging the rest), then refreshes the roster.
 */
export function CrewVisibilityToggle({ visibility }: { visibility: Visibility }) {
  const router = useRouter();
  const [shared, setShared] = useState(visibility.surfaces.crew !== false);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !shared;
    setShared(next);
    setSaving(true);
    try {
      await fetch("/api/portal/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_visibility: { surfaces: { ...visibility.surfaces, crew: next }, fields: visibility.fields } }),
      });
      router.refresh(); // re-render the server roster with the new state
    } catch {
      setShared(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="flex items-center gap-3 w-full sm:w-auto text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-60"
      style={{ background: "#fff", border: "1px solid #f0e6d6" }}
      aria-pressed={shared}
    >
      <span className="relative inline-block w-9 h-5 rounded-full shrink-0 transition-colors" style={{ backgroundColor: shared ? "#00afdb" : "#d9d2c6" }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: shared ? "18px" : "2px" }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold text-[#00374a]">Show me to my crew</span>
        <span className="block text-[12px] text-[#8a9aa0]">{shared ? "Your fellow riders can see your profile." : "You're hidden from the crew list. Only your name shows on bookings."}</span>
      </span>
    </button>
  );
}
