// Shared add-on status logic. Add-on request state lives in exp_booking_addons.status
// (migration 024). Until that migration is applied the column doesn't exist, so we
// also stamp the state into `notes` as a "member:<status>" sentinel and read it back
// here — keeping the request → confirm flow working pre- and post-migration. The real
// status column always wins when present.

export type AddonStatus = "requested" | "confirmed" | "declined";

export const ADDON_NOTE_PREFIX = "member:";

export function noteForStatus(s: AddonStatus): string {
  return `${ADDON_NOTE_PREFIX}${s}`;
}

export function effectiveAddonStatus(row: { status?: string | null; notes?: string | null }): AddonStatus {
  if (row.status === "requested" || row.status === "confirmed" || row.status === "declined") return row.status;
  const n = row.notes ?? "";
  if (n.startsWith(ADDON_NOTE_PREFIX)) {
    const s = n.slice(ADDON_NOTE_PREFIX.length).trim();
    if (s === "requested" || s === "confirmed" || s === "declined") return s;
  }
  return "confirmed"; // legacy / admin-added rows with no marker
}
