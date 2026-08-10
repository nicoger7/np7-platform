"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "@/lib/mutate";
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
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const previous = shared; // revert target if the write doesn't land
    const next = !shared;
    setShared(next);
    setSaving(true);
    setError(null);
    // Silent failure here is a privacy lie: a member who switched themselves OFF
    // saw the toggle go grey and believed they were hidden, while an expired
    // session (401) left profile_visibility untouched — so their profile stayed
    // visible to the whole trip's crew list. router.refresh() then re-rendered
    // the roster from the unchanged server state, quietly making it true again.
    const r = await mutate("/api/portal/profile", {
      method: "PUT",
      body: { profile_visibility: { surfaces: { ...visibility.surfaces, crew: next }, fields: visibility.fields } },
    });
    if (!r.ok) {
      setShared(previous);
      setError(r.error);
      setSaving(false);
      return;
    }
    router.refresh(); // re-render the server roster with the new state
    setSaving(false);
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        onClick={toggle}
        disabled={saving}
        className="flex items-center gap-3 w-full text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-60"
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
      {error && (
        <p className="mt-2 text-[13px] font-semibold text-[#c4621a]" role="alert">
          {error} Your crew visibility is unchanged.
        </p>
      )}
    </div>
  );
}
