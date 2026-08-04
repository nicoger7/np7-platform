"use client";

import { type FlightInfo } from "@/lib/flights";

/**
 * Travel details, one editor, used everywhere.
 *
 * Guests tell us their flights in the member area — and by WhatsApp, by email,
 * and in the group chat. Only the first of those had anywhere to go, so the
 * arrivals list showed blanks for people who had already told us twice.
 *
 * Both this and the member's own form write the same `flight_info`, so there is
 * nothing to keep in sync: whoever edits last is what both sides read. The two
 * `fly_in` / `fly_out` date columns are mirrored from the arrival/departure
 * dates by the API, never edited on their own — a lone `fly_in` edit used to
 * leave the member looking at a date we no longer believed.
 */

const label = "block text-[10px] font-bold tracking-[0.12em] uppercase admin-faint mb-1";

export function FlightEditor({
  value,
  onChange,
  hint,
  compact,
}: {
  value: FlightInfo;
  onChange: (next: FlightInfo) => void;
  /** Trip dates, offered as the placeholder so the usual answer is one click. */
  hint?: { start?: string | null; end?: string | null };
  compact?: boolean;
}) {
  const set = (k: keyof FlightInfo, v: string | boolean | null) => onChange({ ...value, [k]: v === "" ? null : v });
  const self = value.arrivalMode === "own";
  const input = `w-full rounded-lg px-2.5 ${compact ? "py-1.5 text-[12.5px]" : "py-2 text-[13px]"} admin-heading bg-transparent`;
  const inputStyle = { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-bg)" };

  return (
    <div className="space-y-3">
      {/* How they get there decides whether a flight number is even a question. */}
      <div className="flex items-center gap-1.5">
        {([["flying", "Flying"], ["own", "Own way"]] as const).map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => set("arrivalMode", k)}
            className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-colors ${
              (value.arrivalMode ?? "flying") === k
                ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
                : "admin-muted hover:admin-heading"
            }`}
            style={(value.arrivalMode ?? "flying") === k ? undefined : { border: "1px solid var(--admin-border)" }}
          >
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11.5px] admin-muted cursor-pointer">
          <input
            type="checkbox"
            checked={value.booked === true}
            onChange={(e) => set("booked", e.target.checked)}
            className="accent-[var(--admin-accent)]"
          />
          {self ? "Travel confirmed" : "Flights booked"}
        </label>
      </div>

      {([
        ["Arrival", "arrivalDate", "arrivalTime", "arrivalFlightNo", hint?.start],
        ["Departure", "departureDate", "departureTime", "departureFlightNo", hint?.end],
      ] as const).map(([leg, dateKey, timeKey, noKey, dayHint]) => (
        <div key={leg} className={`grid gap-2 ${self ? "grid-cols-2" : "grid-cols-[1fr_84px_100px]"}`}>
          <div>
            <span className={label}>{leg === "Arrival" ? (self ? "Arrives" : "Arrival") : self ? "Leaves" : "Departure"}</span>
            <input
              type="date"
              className={input}
              style={inputStyle}
              value={(value[dateKey] as string) || ""}
              onChange={(e) => set(dateKey, e.target.value)}
            />
            {/* The trip's own dates are the answer nine times out of ten — one
                click beats typing a date you can already see on the page. */}
            {dayHint && !value[dateKey] && (
              <button type="button" onClick={() => set(dateKey, dayHint)}
                className="mt-1 text-[10.5px] font-semibold admin-faint hover:text-[var(--admin-accent)] transition-colors">
                use trip {leg === "Arrival" ? "start" : "end"}
              </button>
            )}
          </div>
          <div>
            <span className={label}>Time</span>
            <input
              type="time"
              className={input}
              style={inputStyle}
              value={(value[timeKey] as string) || ""}
              onChange={(e) => set(timeKey, e.target.value)}
            />
          </div>
          {!self && (
            <div>
              <span className={label}>Flight</span>
              <input
                className={`${input} font-mono uppercase`}
                style={inputStyle}
                placeholder="—"
                value={(value[noKey] as string) || ""}
                onChange={(e) => set(noKey, e.target.value.toUpperCase())}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
