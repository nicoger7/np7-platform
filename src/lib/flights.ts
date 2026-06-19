// Member-entered flight details. Stored in exp_bookings.flight_info (jsonb,
// migration 025); until that's applied we stash the same JSON in a notes sentinel
// line so the feature works pre- and post-migration. Arrival/departure dates are
// also mirrored to the existing fly_in / fly_out columns for the admin/Notion view.

export type FlightInfo = {
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  arrivalFlightNo?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  departureFlightNo?: string | null;
};

export const FLIGHT_NOTE_PREFIX = "[flights]";

export function hasFlights(info: FlightInfo | null | undefined): boolean {
  return !!info && Object.values(info).some((v) => v != null && String(v).trim() !== "");
}

export function serializeFlightNote(info: FlightInfo): string {
  return FLIGHT_NOTE_PREFIX + JSON.stringify(info);
}

export function parseFlightNote(notes?: string | null): FlightInfo | null {
  if (!notes) return null;
  for (const line of notes.split("\n")) {
    if (line.startsWith(FLIGHT_NOTE_PREFIX)) {
      try { return JSON.parse(line.slice(FLIGHT_NOTE_PREFIX.length)) as FlightInfo; } catch { return null; }
    }
  }
  return null;
}

/** Replace any existing [flights] line in notes with a fresh one (or strip it). */
export function upsertFlightNote(notes: string | null | undefined, info: FlightInfo | null): string {
  const lines = (notes ?? "").split("\n").filter((l) => l && !l.startsWith(FLIGHT_NOTE_PREFIX));
  if (info && hasFlights(info)) lines.push(serializeFlightNote(info));
  return lines.join("\n");
}

const FIELDS: (keyof FlightInfo)[] = ["arrivalDate", "arrivalTime", "arrivalFlightNo", "departureDate", "departureTime", "departureFlightNo"];

/** Keep only known fields, trimmed; empty strings → null. */
export function sanitizeFlightInfo(raw: Record<string, unknown>): FlightInfo {
  const out: FlightInfo = {};
  for (const f of FIELDS) {
    const v = raw[f];
    out[f] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }
  return out;
}
