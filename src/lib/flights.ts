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
  /** Member has confirmed they've actually booked their flights. */
  booked?: boolean | null;
  /**
   * How they're getting there. "own" = driving, train, or already nearby — we
   * still want the arrival date and time (transfers and the first evening are
   * planned around it), just not a flight number.
   */
  arrivalMode?: "flying" | "own" | null;
};

export const FLIGHT_NOTE_PREFIX = "[flights]";

const DETAIL_FIELDS: (keyof FlightInfo)[] = ["arrivalDate", "arrivalTime", "arrivalFlightNo", "departureDate", "departureTime", "departureFlightNo"];

/** Any flight detail entered (ignores the booked flag). */
export function hasFlightDetails(info: FlightInfo | null | undefined): boolean {
  return !!info && DETAIL_FIELDS.some((f) => info[f] != null && String(info[f]).trim() !== "");
}

/** Anything at all set (details or booked) — used to decide whether to persist. */
export function hasFlights(info: FlightInfo | null | undefined): boolean {
  return !!info && (hasFlightDetails(info) || info.booked === true || !!info.arrivalMode);
}

/** Driving / train / already there — ask for times, not flight numbers. */
export function isSelfArriving(info: FlightInfo | null | undefined): boolean {
  return info?.arrivalMode === "own";
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
  const out: Record<string, string | boolean | null> = {};
  for (const f of FIELDS) {
    const v = raw[f as string];
    out[f as string] = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }
  if (typeof raw.booked === "boolean") out.booked = raw.booked;
  if (raw.arrivalMode === "flying" || raw.arrivalMode === "own") out.arrivalMode = raw.arrivalMode;
  return out as FlightInfo;
}
