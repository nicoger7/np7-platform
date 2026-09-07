"use client";

import { useState } from "react";
import { mutate } from "@/lib/mutate";
import { MARKETING_CONSENT_TEXT } from "@/lib/marketing-consent";

/**
 * Member control: may NP7 show this guest's face in public.
 *
 * Deliberately unlike the sharing toggle above it. That one defaults ON and
 * concerns the twelve people who were already on the beach. This one defaults
 * OFF and concerns everyone else, so it follows consent rules rather than
 * preference rules:
 *   · off until the guest says otherwise, never pre-ticked,
 *   · the full wording sits under the switch instead of behind a link, because
 *     consent only covers what was actually put in front of the person,
 *   · a failed save reverts the switch AND says so. A consent control that keeps
 *     a position the server rejected is the one failure mode that matters here.
 */
export function MarketingConsentToggle({ bookingId, initialAllowed }: { bookingId: string; initialAllowed: boolean }) {
  const [allowed, setAllowed] = useState(initialAllowed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const previous = allowed;
    const next = !allowed;
    setAllowed(next);
    setSaving(true);
    setError(null);
    const r = await mutate(`/api/portal/bookings/${bookingId}/marketing-consent`, {
      method: "PATCH",
      body: { allowed: next },
    });
    if (!r.ok) {
      setAllowed(previous);
      setError(r.error);
    }
    setSaving(false);
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={saving}
        className="flex items-start gap-3 w-full text-left rounded-xl px-3.5 py-3 transition-colors disabled:opacity-60"
        style={{ background: "#fff7ec", border: "1px solid #f0e6d6" }}
        aria-pressed={allowed}
      >
        <span
          className="relative inline-block w-9 h-5 rounded-full shrink-0 transition-colors mt-0.5"
          style={{ backgroundColor: allowed ? "#00afdb" : "#d9d2c6" }}
        >
          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: allowed ? "18px" : "2px" }} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-bold text-[#00374a]">NP7 may use my photos publicly</span>
          <span className="block text-[12px] text-[#8a9aa0] mt-0.5">{MARKETING_CONSENT_TEXT}</span>
          {!allowed && (
            <span className="block text-[12px] text-[#8a9aa0] mt-1.5">
              Off. Your photos stay between you and your crew.
            </span>
          )}
        </span>
      </button>
      {error && (
        <p className="mt-1.5 px-1 text-[12px] text-red-500" role="alert">
          Not saved, still {allowed ? "on" : "off"} &middot; {error}
        </p>
      )}
    </div>
  );
}
